import {loopLength, synthesizeBandNoise, type NoiseColor} from './noise-spectrum';
import type {NoiseRequest, NoiseResponse} from './noise.worker';
import NoiseWorker from './noise.worker?worker';
import {MAX_NOISE_RMS, MAX_SINE_AMPLITUDE, volumeToGain} from './scale';

export type PlayState = 'idle' | 'sound' | 'noise';

/**
 * A matching stimulus: a pure tone, or narrowband noise for hissing tinnitus.
 * Played outside the therapy volume, at `levelDb` relative to the output ceiling (never above it).
 */
export type Probe = {kind: 'tone' | 'noise'; frequency: number; levelDb: number; bandwidth: number};

export type AudioSettings = {
	/** 0–100 slider value, see {@link volumeToGain}. */
	volume: number;
	frequency: number;
	notchWidth: number;
	noiseColor: NoiseColor;
};

/** Seconds of noise before the loop repeats. Long enough that the repetition is not noticeable. */
const LOOP_SECONDS = 20;
/** Time constant for volume and pitch changes; short enough to feel immediate, long enough not to click. */
const SMOOTHING = 0.03;
const FADE_IN = 0.3;
const FADE_OUT = 0.15;
/** Crossfade between noise buffers when the notch or colour changes. */
const CROSSFADE = 0.4;
/** Narrowband noise loops are short: probes last seconds, and short buffers synthesise instantly. */
const PROBE_NOISE_LENGTH = 2 ** 16;
/** Fade of each probe in a sequence: short, so a one-second sound keeps its pitch, but without clicks. */
const PROBE_RAMP = 0.03;
/** Delay before a sequence starts, so it isn't cut by the context resuming. */
const SEQUENCE_LEAD = 0.1;
const PROBE_NOISE_CACHE = 16;

type Voice = {source: AudioScheduledSourceNode; envelope: GainNode};

export class AudioGenerator {
	state: PlayState = 'idle';
	settings: AudioSettings;

	readonly ctx = new AudioContext();
	private readonly masterGain: GainNode;
	private readonly analyzerNode: AnalyserNode;
	private readonly frequencyData: Float32Array<ArrayBuffer>;

	private voice: Voice | null = null;

	private probe: Probe | null = null;
	private probeVoice: (Voice & {level: GainNode}) | null = null;
	/** Bumped by every stop, so a start still waiting for the context to resume is dropped. */
	private probeToken = 0;
	/** Context time when the scheduled probe sequence ends. */
	private sequenceEnd = 0;
	private sequenceVoices: Voice[] = [];
	private readonly probeNoise = new Map<string, AudioBuffer>();

	private readonly worker = new NoiseWorker();
	private requestId = 0;
	private requestInFlight = false;
	private requestPending = false;

	constructor(settings: AudioSettings) {
		this.settings = {...settings};

		this.analyzerNode = new AnalyserNode(this.ctx, {fftSize: 8192, smoothingTimeConstant: 0.85});
		this.frequencyData = new Float32Array(this.analyzerNode.frequencyBinCount);
		this.analyzerNode.connect(this.ctx.destination);

		this.masterGain = new GainNode(this.ctx, {gain: volumeToGain(settings.volume)});
		this.masterGain.connect(this.analyzerNode);

		this.worker.onmessage = (event: MessageEvent<NoiseResponse>) => this.onNoiseReady(event.data);
	}

	get sampleRate() {
		return this.ctx.sampleRate;
	}

	setVolume(volume: number) {
		this.settings.volume = volume;
		this.masterGain.gain.setTargetAtTime(volumeToGain(volume), this.ctx.currentTime, SMOOTHING);
	}

	setFrequency(frequency: number) {
		if (this.settings.frequency === frequency) return;
		this.settings.frequency = frequency;

		if (this.voice?.source instanceof OscillatorNode) {
			this.voice.source.frequency.setTargetAtTime(frequency, this.ctx.currentTime, SMOOTHING);
		}
		this.refreshNoise();
	}

	setNotchWidth(octaves: number) {
		if (this.settings.notchWidth === octaves) return;
		this.settings.notchWidth = octaves;
		this.refreshNoise();
	}

	setNoiseColor(color: NoiseColor) {
		if (this.settings.noiseColor === color) return;
		this.settings.noiseColor = color;
		this.refreshNoise();
	}

	async setState(state: PlayState) {
		if (state === this.state) return;
		this.state = state;

		this.fadeOutVoice(FADE_OUT);

		if (state === 'sound') {
			await this.ctx.resume();
			const oscillator = new OscillatorNode(this.ctx, {frequency: this.settings.frequency});
			this.startVoice(oscillator, MAX_SINE_AMPLITUDE, FADE_IN);
		} else if (state === 'noise') {
			await this.ctx.resume();
			// Sound starts once the worker returns the first buffer.
			this.refreshNoise();
		} else {
			this.suspendWhenSilent();
		}
	}

	/**
	 * Plays a probe continuously until {@link stopProbe}; calling it again while playing changes the
	 * sound in place: level and tone pitch glide, a new noise band crossfades.
	 */
	async playProbe(probe: Probe) {
		this.stopSequence();
		const token = ++this.probeToken;
		await this.ctx.resume();
		if (token !== this.probeToken) return;

		const current = this.probe;
		const voice = this.probeVoice;
		this.probe = probe;
		const now = this.ctx.currentTime;

		const sameSound = current?.kind === probe.kind && (probe.kind === 'tone'
			|| (current.frequency === probe.frequency && current.bandwidth === probe.bandwidth));
		if (voice && sameSound) {
			voice.level.gain.setTargetAtTime(probeGain(probe), now, SMOOTHING);
			if (voice.source instanceof OscillatorNode) {
				voice.source.frequency.setTargetAtTime(probe.frequency, now, SMOOTHING);
			}
			return;
		}

		this.fadeOut(voice, voice ? CROSSFADE / 2 : FADE_OUT);
		const source = this.probeSource(probe);
		this.probeVoice = this.probeVoiceAt(source, probe, now, voice ? CROSSFADE / 2 : FADE_IN);
		source.start(now);
	}

	/**
	 * Plays probes one after another, `duration` seconds each with `gap` seconds of silence between.
	 * Resolves to when each one starts, in seconds from now, for highlighting what is playing.
	 */
	async playSequence(probes: Probe[], duration: number, gap: number) {
		this.stopProbe();
		const token = this.probeToken;
		await this.ctx.resume();
		if (token !== this.probeToken) return [];

		const now = this.ctx.currentTime;
		const starts = probes.map((probe, i) => {
			const at = now + SEQUENCE_LEAD + i * (duration + gap);
			const source = this.probeSource(probe);
			const voice = this.probeVoiceAt(source, probe, at, PROBE_RAMP);
			voice.envelope.gain.setValueAtTime(1, at + duration - PROBE_RAMP);
			voice.envelope.gain.linearRampToValueAtTime(0, at + duration);
			source.start(at);
			source.stop(at + duration);
			source.onended = () => {
				voice.envelope.disconnect();
				this.sequenceVoices = this.sequenceVoices.filter(v => v !== voice);
			};
			this.sequenceVoices.push(voice);
			return at - now;
		});
		this.sequenceEnd = now + SEQUENCE_LEAD + probes.length * (duration + gap);
		this.suspendWhenSilent((this.sequenceEnd - now) * 1000 + FADE_OUT * 5000);
		return starts;
	}

	/** Stops the continuous probe and any sequence. */
	stopProbe() {
		this.probeToken++;
		this.fadeOut(this.probeVoice, FADE_OUT);
		this.probeVoice = null;
		this.probe = null;
		this.stopSequence();
		this.suspendWhenSilent();
	}

	private stopSequence() {
		for (const voice of this.sequenceVoices) this.fadeOut(voice, PROBE_RAMP);
		this.sequenceVoices = [];
		this.sequenceEnd = 0;
	}

	private probeSource(probe: Probe): AudioScheduledSourceNode {
		if (probe.kind === 'tone') return new OscillatorNode(this.ctx, {frequency: probe.frequency});

		const key = `${probe.frequency}/${probe.bandwidth}`;
		let buffer = this.probeNoise.get(key);
		if (!buffer) {
			const samples = synthesizeBandNoise({
				length: PROBE_NOISE_LENGTH,
				sampleRate: this.ctx.sampleRate,
				center: probe.frequency,
				widthOctaves: probe.bandwidth,
				rms: MAX_NOISE_RMS,
			});
			buffer = new AudioBuffer({length: samples.length, sampleRate: this.ctx.sampleRate});
			buffer.copyToChannel(samples, 0);
			// Fine-tuning visits many frequencies; keep only the recent ones.
			if (this.probeNoise.size >= PROBE_NOISE_CACHE) this.probeNoise.clear();
			this.probeNoise.set(key, buffer);
		}
		return new AudioBufferSourceNode(this.ctx, {buffer, loop: true});
	}

	/** source → level → envelope → output; disconnecting the envelope releases the whole chain. */
	private probeVoiceAt(source: AudioScheduledSourceNode, probe: Probe, at: number, fade: number) {
		const level = new GainNode(this.ctx, {gain: probeGain(probe)});
		const envelope = new GainNode(this.ctx, {gain: 0});
		envelope.gain.setValueAtTime(0, at);
		envelope.gain.linearRampToValueAtTime(1, at + fade);
		source.connect(level).connect(envelope).connect(this.analyzerNode);
		return {source, envelope, level};
	}

	/** Suspends the context once nothing has played for a while, unless playback was restarted meanwhile. */
	private suspendWhenSilent(delayMs = FADE_OUT * 5000) {
		setTimeout(() => {
			const silent = this.state === 'idle' && !this.probeVoice && this.ctx.currentTime >= this.sequenceEnd;
			if (silent) this.ctx.suspend();
		}, delayMs);
	}

	/** Output spectrum in dB per analyser bin; bin `k` is centred on `k * sampleRate / fftSize`. */
	getFrequencyData() {
		this.analyzerNode.getFloatFrequencyData(this.frequencyData);
		return this.frequencyData;
	}

	/** Requests a new noise buffer; while one is being generated, only the latest settings are kept. */
	private refreshNoise() {
		if (this.state !== 'noise') return;
		if (this.requestInFlight) {
			this.requestPending = true;
			return;
		}

		this.requestInFlight = true;
		const request: NoiseRequest = {
			id: ++this.requestId,
			options: {
				length: loopLength(this.ctx.sampleRate, LOOP_SECONDS),
				sampleRate: this.ctx.sampleRate,
				color: this.settings.noiseColor,
				rms: MAX_NOISE_RMS,
				notch: {center: this.settings.frequency, widthOctaves: this.settings.notchWidth},
			},
		};
		this.worker.postMessage(request);
	}

	private onNoiseReady({id, samples}: NoiseResponse) {
		this.requestInFlight = false;
		if (this.requestPending) {
			this.requestPending = false;
			this.refreshNoise();
			return;
		}
		if (id !== this.requestId || this.state !== 'noise') return;

		const buffer = new AudioBuffer({length: samples.length, sampleRate: this.ctx.sampleRate});
		buffer.copyToChannel(samples, 0);

		const previous = this.voice;
		const source = new AudioBufferSourceNode(this.ctx, {buffer, loop: true});
		// Start the new loop at a random point so successive buffers don't restart audibly in sync.
		const offset = Math.random() * buffer.duration;
		this.fadeOutVoice(previous ? CROSSFADE : FADE_OUT);
		this.startVoice(source, 1, previous ? CROSSFADE : FADE_IN, offset);
	}

	private startVoice(source: AudioScheduledSourceNode, level: number, fade: number, offset = 0) {
		const now = this.ctx.currentTime;
		const envelope = new GainNode(this.ctx, {gain: 0});
		envelope.gain.setValueAtTime(0, now);
		envelope.gain.linearRampToValueAtTime(level, now + fade);
		source.connect(envelope).connect(this.masterGain);

		if (source instanceof AudioBufferSourceNode) source.start(now, offset);
		else source.start(now);

		this.voice = {source, envelope};
	}

	private fadeOutVoice(fade: number) {
		this.fadeOut(this.voice, fade);
		this.voice = null;
	}

	private fadeOut(voice: Voice | null, fade: number) {
		if (!voice) return;
		const now = this.ctx.currentTime;
		voice.envelope.gain.cancelScheduledValues(now);
		voice.envelope.gain.setValueAtTime(voice.envelope.gain.value, now);
		voice.envelope.gain.linearRampToValueAtTime(0, now + fade);
		voice.source.stop(now + fade);
		voice.source.onended = () => voice.envelope.disconnect();
	}
}

/** Linear gain for a probe; noise buffers are already at the RMS of a full-scale sine. */
function probeGain(probe: Probe) {
	const gain = 10 ** (Math.min(probe.levelDb, 0) / 20);
	return probe.kind === 'tone' ? gain * MAX_SINE_AMPLITUDE : gain;
}
