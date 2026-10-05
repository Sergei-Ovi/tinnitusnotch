import {clamp, MAX_FREQUENCY, MIN_FREQUENCY} from '@/lib/audio/scale';
import {
	type Audiogram,
	type AudiometryState,
	audiogramReliable,
	audiometryDone,
	hearingEdge,
	respond,
	startAudiometry,
} from './audiometry';
import {hasEffect, type InhibitionTrial} from './inhibition';
import {clampLevel, REFERENCE_DB} from './levels';
import {
	answerTrial,
	type Choice,
	type Combined,
	combineRuns,
	octaveOptions,
	type Run,
	runDone,
	runEstimate,
	RUNS,
	startRun,
} from './procedure';

/** Tonal tinnitus is matched with pure tones, hissing tinnitus with narrowband noise. */
export type TinnitusType = 'tonal' | 'hissing';
export const TINNITUS_TYPES: TinnitusType[] = ['tonal', 'hissing'];

/** Width of the narrowband noise used for hissing tinnitus, in octaves. */
export const HISS_BANDWIDTH = 1 / 3;

/** Where the loudness match starts, above the threshold just found. */
const LOUDNESS_START_ABOVE_THRESHOLD = 10;

export type WizardStep = 'calibrate' | 'hearing' | 'type' | 'match' | 'octave' | 'fine-tune' | 'threshold' | 'loudness' | 'inhibition'
	| 'done';

export type WizardState = {
	step: WizardStep;
	/** Hearing test in progress, during the `hearing` step; null before it starts. */
	audiometry: AudiometryState | null;
	/** Result of the hearing test; null if it was skipped. */
	audiogram: Audiogram | null;
	/** Starting hypothesis for the comparisons: the steep edge of hearing loss, if there is one. */
	hypothesis: number | null;
	type: TinnitusType | null;
	/** Bisection run in progress, during the `match` step. */
	run: Run | null;
	/** Results of finished runs. */
	estimates: number[];
	combined: Combined | null;
	octaveOptions: number[];
	/** Current best frequency: the median, then the octave choice, then the fine-tuned value. */
	frequency: number | null;
	thresholdDb: number | null;
	loudnessDb: number | null;
	/** Residual inhibition checks, in the order they were made. */
	inhibition: InhibitionTrial[];
};

/** A finished matching, kept for the history of matches. */
export type MatchResult = {
	id: string;
	/** ISO timestamp. */
	date: string;
	type: TinnitusType;
	/** Final frequency, after the octave check and fine-tuning. */
	frequency: number;
	/** Per-run results and how far apart they were. */
	estimates: number[];
	spreadOctaves: number;
	reliable: boolean;
	/** Hearing threshold and tinnitus loudness match at `frequency`, dB re ceiling; null if skipped. */
	thresholdDb: number | null;
	loudnessDb: number | null;
	/** Hearing test made with this match; absent in matches made before the test existed. */
	audiogram?: Audiogram | null;
	/** Residual inhibition checks; absent in matches made before the check existed. */
	inhibition?: InhibitionTrial[];
};

export function startWizard(): WizardState {
	return {
		step: 'calibrate',
		audiometry: null,
		audiogram: null,
		hypothesis: null,
		type: null,
		run: null,
		estimates: [],
		combined: null,
		octaveOptions: [],
		frequency: null,
		thresholdDb: null,
		loudnessDb: null,
		inhibition: [],
	};
}

export function calibrated(state: WizardState): WizardState {
	if (state.step !== 'calibrate') return state;
	return {...state, step: 'hearing'};
}

export function startHearing(state: WizardState): WizardState {
	if (state.step !== 'hearing') return state;
	return {...state, audiometry: startAudiometry()};
}

/**
 * Answer to "did you hear the beeps?"; after the last one, moves on with the audiogram and its edge.
 * An unreliable audiogram is kept, but its edge doesn't steer the comparisons.
 */
export function hearingResponse(state: WizardState, heard: boolean, random = Math.random): WizardState {
	if (state.step !== 'hearing' || !state.audiometry) return state;
	const audiometry = respond(state.audiometry, heard, random);
	if (!audiometryDone(audiometry)) return {...state, audiometry};
	const {audiogram} = audiometry;
	return {
		...state,
		step: 'type',
		audiometry: null,
		audiogram,
		hypothesis: audiogramReliable(audiogram) ? hearingEdge(audiogram)?.frequency ?? null : null,
	};
}

/** The hearing test is optional; skipping it part-way drops what was measured. */
export function skipHearing(state: WizardState): WizardState {
	if (state.step !== 'hearing') return state;
	return {...state, step: 'type', audiometry: null, audiogram: null, hypothesis: null};
}

/** Starts (or restarts) the comparisons from the first run, keeping only the hearing test. */
export function chooseType(state: WizardState, type: TinnitusType, random = Math.random): WizardState {
	return {
		...startWizard(),
		audiogram: state.audiogram,
		hypothesis: state.hypothesis,
		step: 'match',
		type,
		run: startRun(0, random, state.hypothesis),
	};
}

export function answer(state: WizardState, choice: Choice, random = Math.random): WizardState {
	if (state.step !== 'match' || !state.run) return state;
	const run = answerTrial(state.run, choice, random);
	if (!runDone(run)) return {...state, run};

	const estimates = [...state.estimates, runEstimate(run)];
	if (estimates.length < RUNS) return {...state, run: startRun(estimates.length, random, state.hypothesis), estimates};

	const combined = combineRuns(estimates);
	return {
		...state,
		step: 'octave',
		run: null,
		estimates,
		combined,
		frequency: combined.frequency,
		octaveOptions: octaveOptions(combined.frequency, random),
	};
}

export function chooseOctave(state: WizardState, frequency: number): WizardState {
	if (state.step !== 'octave') return state;
	return {...state, step: 'fine-tune', frequency};
}

export function fineTune(state: WizardState, frequency: number): WizardState {
	if (state.step !== 'fine-tune') return state;
	return {...state, frequency: Math.round(clamp(frequency, MIN_FREQUENCY, MAX_FREQUENCY))};
}

export function confirmFrequency(state: WizardState): WizardState {
	if (state.step !== 'fine-tune') return state;
	return {...state, step: 'threshold'};
}

export function setThreshold(state: WizardState, levelDb: number): WizardState {
	if (state.step !== 'threshold') return state;
	return {...state, step: 'loudness', thresholdDb: clampLevel(levelDb)};
}

export function setLoudness(state: WizardState, levelDb: number): WizardState {
	if (state.step !== 'loudness') return state;
	return {...state, step: 'inhibition', loudnessDb: clampLevel(levelDb)};
}

/** The loudness match is optional; skipping it at either part drops both values. */
export function skipLoudness(state: WizardState): WizardState {
	if (state.step !== 'threshold' && state.step !== 'loudness') return state;
	return {...state, step: 'inhibition', thresholdDb: null, loudnessDb: null};
}

export function addInhibitionTrial(state: WizardState, trial: InhibitionTrial): WizardState {
	if (state.step !== 'inhibition') return state;
	return {...state, inhibition: [...state.inhibition, trial]};
}

/** Switches to a frequency that showed an effect when the match didn't; ignored for any other. */
export function adoptFrequency(state: WizardState, frequency: number): WizardState {
	if (state.step !== 'inhibition') return state;
	if (!state.inhibition.some(t => t.frequency === frequency && hasEffect(t))) return state;
	return {...state, frequency};
}

/** Ends the optional residual inhibition step, with or without checks. */
export function finishInhibition(state: WizardState): WizardState {
	if (state.step !== 'inhibition') return state;
	return {...state, step: 'done'};
}

/** Level the loudness slider starts from, once the threshold is known. */
export function loudnessStartDb(state: WizardState) {
	return clampLevel((state.thresholdDb ?? REFERENCE_DB) + LOUDNESS_START_ABOVE_THRESHOLD);
}

export function toResult(state: WizardState, id: string, date: Date): MatchResult | null {
	const {step, type, frequency, combined} = state;
	if (step !== 'done' || !type || frequency === null || !combined) return null;
	return {
		id,
		date: date.toISOString(),
		type,
		frequency,
		estimates: state.estimates,
		spreadOctaves: combined.spreadOctaves,
		reliable: combined.reliable,
		thresholdDb: state.thresholdDb,
		loudnessDb: state.loudnessDb,
		audiogram: state.audiogram,
		inhibition: state.inhibition,
	};
}

/** Tinnitus loudness as dB above the hearing threshold at the same frequency (sensation level). */
export function sensationLevel(result: Pick<MatchResult, 'thresholdDb' | 'loudnessDb'>) {
	const {thresholdDb, loudnessDb} = result;
	return thresholdDb === null || loudnessDb === null ? null : loudnessDb - thresholdDb;
}

/** Newest first, one entry per id; `incoming` wins on conflicts. */
export function mergeMatches(existing: MatchResult[], incoming: MatchResult[]) {
	const byId = new Map(existing.map(m => [m.id, m]));
	for (const m of incoming) byId.set(m.id, m);
	return [...byId.values()].sort((a, b) => b.date.localeCompare(a.date));
}
