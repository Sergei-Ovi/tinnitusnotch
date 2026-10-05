import {session} from '@/app/session-controller';
import {store} from '@/app/store';
import {track} from '@/lib/analytics';
import type {Probe} from '@/lib/audio';
import {currentPresentation, equalizingOffset, NORMAL_AUDIOGRAM} from '@/lib/matching/audiometry';
import {
	hasEffect,
	INHIBITION_BANDWIDTH,
	INHIBITION_SECONDS,
	type InhibitionEffect,
	inhibitionLevel,
	inhibitionTrial,
	MAX_TIMED_SECONDS,
} from '@/lib/matching/inhibition';
import {clampLevel, REFERENCE_DB} from '@/lib/matching/levels';
import type {Choice} from '@/lib/matching/procedure';
import {trialPair} from '@/lib/matching/procedure';
import {
	addInhibitionTrial,
	adoptFrequency,
	answer as answerTrial,
	calibrated,
	chooseOctave,
	chooseType,
	confirmFrequency,
	finishInhibition,
	fineTune,
	hearingResponse,
	HISS_BANDWIDTH,
	loudnessStartDb,
	mergeMatches,
	setLoudness,
	setThreshold,
	skipHearing,
	skipLoudness,
	startHearing,
	startWizard,
	type TinnitusType,
	toResult,
	type WizardState,
	type WizardStep,
} from '@/lib/matching/wizard';
import {batch, createEffect, createRoot, createSignal, onCleanup} from 'solid-js';

export const REFERENCE_FREQUENCY = 1000;
/** Length of each sound in a comparison, and the silence between them, in seconds. */
const COMPARE_DURATION = 1.2;
const COMPARE_GAP = 0.5;
/** The hearing test plays a few short beeps: pulsed tones are easier to tell apart from tinnitus. */
const BEEPS = 3;
const BEEP_DURATION = 0.25;
const BEEP_GAP = 0.2;
/** Steps where sounds of different pitch are compared, so their levels are equalised by the audiogram. */
const EQUALIZED_STEPS: WizardStep[] = ['match', 'octave', 'fine-tune'];

/**
 * Residual inhibition check: `intro` → noise `playing` → `ask` whether tinnitus got quieter →
 * `timing` how long until it's back (only after an effect) → `result`.
 */
export type InhibitionPhase = 'intro' | 'playing' | 'ask' | 'timing' | 'result';

/**
 * The guided frequency matching: procedure state from `lib/matching`, plus the sounds for each step.
 * Lives outside the Setup tab, so switching tabs pauses the sound but keeps the progress.
 */
export const matching = createRoot(() => {
	const [state, setState] = createSignal<WizardState | null>(null);
	/** Probe level: the comparison level, then the threshold and loudness being adjusted. */
	const [levelDb, setLevelDbRaw] = createSignal(REFERENCE_DB);
	/** Which sound is playing, for highlighting: 'reference', 'beep', 'a', 'b', an option frequency, 'probe'. */
	const [playing, setPlaying] = createSignal<string | null>(null);

	const [inhibitionPhase, setInhibitionPhase] = createSignal<InhibitionPhase>('intro');
	/** Frequency of the inhibition check in progress: the match, or an alternative. */
	const [testFrequency, setTestFrequency] = createSignal<number | null>(null);
	/** When the current inhibition phase started, and a clock for its countdown or stopwatch. */
	const [phaseStartedAt, setPhaseStartedAt] = createSignal(0);
	const [now, setNow] = createSignal(Date.now());
	/** Effect being timed: gone or quieter. */
	let timedEffect: InhibitionEffect = 'quieter';

	let continuous: {id: string; probe: Probe} | null = null;
	let timers: ReturnType<typeof setTimeout>[] = [];

	const probeKind = (type: TinnitusType | null = state()?.type ?? null) => type === 'hissing' ? 'noise' : 'tone';

	/**
	 * Sounds being compared are set equally far above threshold (the slider means 1 kHz): by the hearing
	 * test, or by normal hearing when it was skipped.
	 */
	function probe(frequency: number, type?: TinnitusType, level = levelDb()): Probe {
		const s = state();
		const offset = s && EQUALIZED_STEPS.includes(s.step) ? equalizingOffset(s.audiogram ?? NORMAL_AUDIOGRAM, frequency) : 0;
		return {kind: probeKind(type), frequency, levelDb: clampLevel(level + offset), bandwidth: HISS_BANDWIDTH};
	}

	function stopSound() {
		for (const t of timers) clearTimeout(t);
		timers = [];
		continuous = null;
		store.audio.stopProbe();
		setPlaying(null);
		// Noise cut short (tab switched, session started): the minute has to start over.
		if (inhibitionPhase() === 'playing') setInhibitionPhase('intro');
	}

	/** Plays sounds one after another, highlighting each while it plays. */
	async function playSequence(items: {id: string; probe: Probe}[], duration = COMPARE_DURATION, gap = COMPARE_GAP) {
		if (session.active()) return;
		stopSound();
		const starts = await store.audio.playSequence(items.map(i => i.probe), duration, gap);
		starts.forEach((start, i) => {
			timers.push(setTimeout(() => setPlaying(items[i].id), start * 1000));
			// Stays highlighted through the gap when the next item is the same sound.
			if (items[i + 1]?.id === items[i].id) return;
			timers.push(setTimeout(() => setPlaying(p => p === items[i].id ? null : p), (start + duration) * 1000));
		});
	}

	function playContinuous(id: string, p: Probe) {
		if (session.active()) return;
		if (!continuous) stopSound();
		continuous = {id, probe: p};
		setPlaying(id);
		void store.audio.playProbe(p);
	}

	function toggleContinuous(id: string, p: Probe) {
		if (continuous?.id === id) stopSound();
		else playContinuous(id, p);
	}

	/** Keeps a continuous sound in step with the level and frequency being adjusted. */
	function updateContinuous(frequency?: number) {
		if (!continuous) return;
		const f = frequency ?? continuous.probe.frequency;
		playContinuous(continuous.id, {...continuous.probe, frequency: f, levelDb: probe(f).levelDb});
	}

	function setLevelDb(db: number) {
		setLevelDbRaw(clampLevel(db));
		updateContinuous();
	}

	function playBeeps() {
		const audiometry = state()?.audiometry;
		if (!audiometry) return;
		const {ear, frequency, levelDb} = currentPresentation(audiometry);
		const beep: Probe = {kind: 'tone', frequency, levelDb, bandwidth: 0, ear};
		void playSequence(Array.from({length: BEEPS}, () => ({id: 'beep', probe: beep})), BEEP_DURATION, BEEP_GAP);
	}

	function setPhase(phase: InhibitionPhase) {
		batch(() => {
			setInhibitionPhase(phase);
			setPhaseStartedAt(Date.now());
			setNow(Date.now());
		});
	}

	const elapsedSeconds = () => Math.max(0, (now() - phaseStartedAt()) / 1000);

	/** The countdown and stopwatch tick only while they are on screen. */
	createEffect(() => {
		const phase = inhibitionPhase();
		if (phase !== 'playing' && phase !== 'timing') return;
		const interval = setInterval(() => {
			setNow(Date.now());
			if (phase === 'timing' && elapsedSeconds() >= MAX_TIMED_SECONDS) inhibitionBack();
		}, 250);
		onCleanup(() => clearInterval(interval));
	});

	/** A minute of narrowband noise at `frequency`, then silence. */
	function startInhibition(frequency: number) {
		const s = state();
		if (s?.step !== 'inhibition' || session.active()) return;
		setTestFrequency(frequency);
		// The level is set once; later checks keep whatever the user adjusted it to.
		if (!s.inhibition.length) setLevelDbRaw(inhibitionLevel(s.loudnessDb, levelDb()));
		playContinuous('masker', {kind: 'noise', frequency, levelDb: levelDb(), bandwidth: INHIBITION_BANDWIDTH});
		setPhase('playing');
		timers.push(setTimeout(() => {
			setPhase('ask');
			stopSound();
		}, INHIBITION_SECONDS * 1000));
	}

	function recordInhibition(effect: InhibitionEffect, seconds: number | null = null) {
		const f = testFrequency();
		if (f === null) return;
		go(addInhibitionTrial(state()!, inhibitionTrial(f, effect, seconds)));
		setPhase('result');
	}

	function inhibitionEffect(effect: InhibitionEffect) {
		if (!hasEffect({effect})) return recordInhibition(effect);
		// The after-effect began when the noise stopped, so the stopwatch keeps that start.
		timedEffect = effect;
		setInhibitionPhase('timing');
	}

	function inhibitionBack() {
		if (inhibitionPhase() === 'timing') recordInhibition(timedEffect, elapsedSeconds());
	}

	function playPair() {
		const run = state()?.run;
		if (!run) return;
		const {a, b} = trialPair(run);
		void playSequence([{id: 'a', probe: probe(a)}, {id: 'b', probe: probe(b)}]);
	}

	function playOptions() {
		const s = state();
		if (!s) return;
		void playSequence(s.octaveOptions.map(f => ({id: String(f), probe: probe(f)})));
	}

	/** Moves to the next state; on a new step, silences the old one and starts what the new one needs. */
	function go(next: WizardState) {
		const previous = state();
		const stepChanged = previous?.step !== next.step;
		batch(() => {
			if (stepChanged) stopSound();
			setState(next);
		});
		if (!stepChanged) return;

		track('wizard-step', {step: next.step});
		switch (next.step) {
			case 'match':
				playPair();
				break;
			case 'octave':
				playOptions();
				break;
			case 'loudness':
				setLevelDbRaw(loudnessStartDb(next));
				break;
			case 'inhibition':
				setInhibitionPhase('intro');
				setTestFrequency(next.frequency);
				break;
			case 'done':
				save(next);
				break;
		}
	}

	function save(s: WizardState) {
		const result = toResult(s, crypto.randomUUID(), new Date());
		if (!result) return;
		batch(() => {
			store.setMatches(current => mergeMatches(current, [result]));
			store.setFrequency(result.frequency);
		});
		track('wizard-finish', {
			type: result.type,
			reliable: result.reliable,
			loudness: result.loudnessDb !== null,
			audiogram: result.audiogram !== null,
		});
	}

	function abandon() {
		const s = state();
		if (s && s.step !== 'done') track('wizard-abandon', {step: s.step});
	}

	window.addEventListener('pagehide', abandon);

	return {
		state,
		levelDb,
		setLevelDb,
		playing,
		stopSound,

		start() {
			if (store.playState() === 'sound') store.setPlayState('idle');
			setLevelDbRaw(REFERENCE_DB);
			go(startWizard());
		},
		/** Leaves the wizard; past the last step this just closes the summary. */
		close() {
			stopSound();
			abandon();
			setState(null);
		},

		toggleReference() {
			toggleContinuous('reference', {kind: 'tone', frequency: REFERENCE_FREQUENCY, levelDb: REFERENCE_DB, bandwidth: 0});
		},
		calibrated: () => go(calibrated(state()!)),

		playBeeps,
		startHearing() {
			go(startHearing(state()!));
			playBeeps();
		},
		hearingResponse(heard: boolean) {
			const next = hearingResponse(state()!, heard);
			go(next);
			if (next.step === 'hearing') playBeeps();
			else track('hearing-finish', {edge: next.hypothesis !== null});
		},
		skipHearing: () => go(skipHearing(state()!)),

		playExample(type: TinnitusType) {
			void playSequence([{id: type, probe: probe(4000, type, REFERENCE_DB)}]);
		},
		chooseType(type: TinnitusType) {
			setLevelDbRaw(REFERENCE_DB);
			go(chooseType(state()!, type));
		},

		playPair,
		playOne(id: 'a' | 'b') {
			const run = state()?.run;
			if (run) void playSequence([{id, probe: probe(trialPair(run)[id])}]);
		},
		answer(choice: Choice) {
			const s = state();
			if (!s) return;
			const next = answerTrial(s, choice);
			go(next);
			if (next.step === 'match') playPair();
		},

		playOptions,
		playOption(frequency: number) {
			void playSequence([{id: String(frequency), probe: probe(frequency)}]);
		},
		chooseOctave: (frequency: number) => go(chooseOctave(state()!, frequency)),

		/** Plays the current best match continuously, for fine-tuning and the loudness match. */
		toggleProbe() {
			const f = state()?.frequency;
			if (f) toggleContinuous('probe', probe(f));
		},
		fineTune(frequency: number) {
			go(fineTune(state()!, frequency));
			updateContinuous(frequency);
		},
		confirmFrequency: () => go(confirmFrequency(state()!)),
		/** Starts over from the comparisons, keeping the tinnitus type. */
		repeatMatching() {
			const s = state();
			if (s?.type) go(chooseType(s, s.type));
		},

		setThreshold: () => go(setThreshold(state()!, levelDb())),
		setLoudness: () => go(setLoudness(state()!, levelDb())),
		skipLoudness: () => go(skipLoudness(state()!)),

		inhibitionPhase,
		testFrequency,
		elapsedSeconds,
		startInhibition,
		/** Stops the noise early; the check starts over. */
		stopInhibition: stopSound,
		inhibitionEffect,
		inhibitionBack,
		adoptFrequency: (frequency: number) => go(adoptFrequency(state()!, frequency)),
		finishInhibition: () => go(finishInhibition(state()!)),
	};
});
