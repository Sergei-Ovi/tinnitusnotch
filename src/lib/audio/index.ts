import {loopLength, type NoiseColor} from './noise-spectrum';
import type {NoiseRequest, NoiseResponse} from './noise.worker';
import NoiseWorker from './noise.worker?worker';
import {MAX_NOISE_RMS, MAX_SINE_AMPLITUDE, volumeToGain} from './scale';

export type PlayState = 'idle' | 'sound' | 'noise';

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

type Voice = {source: AudioScheduledSourceNode; envelope: GainNode};

export class AudioGenerator {
	state: PlayState = 'idle';
	settings: AudioSettings;

	readonly ctx = new AudioContext();
	private readonly masterGain: GainNode;
	private readonly analyzerNode: AnalyserNode;
	private readonly frequencyData: Float32Array<ArrayBuffer>;

	private voice: Voice | null = null;

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
			// Suspend after the fade-out has finished, unless playback was restarted meanwhile.
			setTimeout(() => {
				if (this.state === 'idle') this.ctx.suspend();
			}, FADE_OUT * 5000);
		}
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
		const voice = this.voice;
		if (!voice) return;
		this.voice = null;

		const now = this.ctx.currentTime;
		voice.envelope.gain.cancelScheduledValues(now);
		voice.envelope.gain.setValueAtTime(voice.envelope.gain.value, now);
		voice.envelope.gain.linearRampToValueAtTime(0, now + fade);
		voice.source.stop(now + fade);
		voice.source.onended = () => voice.envelope.disconnect();
	}
}
