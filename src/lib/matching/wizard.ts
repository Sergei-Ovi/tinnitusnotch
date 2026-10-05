import {clamp, MAX_FREQUENCY, MIN_FREQUENCY} from '@/lib/audio/scale';
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

/**
 * Levels are in dB relative to the hard output ceiling, so always ≤ 0.
 * The calibration tone sits at {@link REFERENCE_DB}; the user sets the system volume around it.
 */
export const REFERENCE_DB = -30;
export const MIN_LEVEL_DB = -90;
export const MAX_LEVEL_DB = 0;
/** Where the loudness match starts, above the threshold just found. */
const LOUDNESS_START_ABOVE_THRESHOLD = 10;

export type WizardStep = 'calibrate' | 'type' | 'match' | 'octave' | 'fine-tune' | 'threshold' | 'loudness' | 'done';

export type WizardState = {
	step: WizardStep;
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
};

export function startWizard(): WizardState {
	return {
		step: 'calibrate',
		type: null,
		run: null,
		estimates: [],
		combined: null,
		octaveOptions: [],
		frequency: null,
		thresholdDb: null,
		loudnessDb: null,
	};
}

export function calibrated(state: WizardState): WizardState {
	return {...state, step: 'type'};
}

/** Starts (or restarts) the comparisons from the first run, dropping any earlier results. */
export function chooseType(type: TinnitusType, random = Math.random): WizardState {
	return {
		...startWizard(),
		step: 'match',
		type,
		run: startRun(0, random),
	};
}

export function answer(state: WizardState, choice: Choice, random = Math.random): WizardState {
	if (state.step !== 'match' || !state.run) return state;
	const run = answerTrial(state.run, choice, random);
	if (!runDone(run)) return {...state, run};

	const estimates = [...state.estimates, runEstimate(run)];
	if (estimates.length < RUNS) return {...state, run: startRun(estimates.length, random), estimates};

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
	return {...state, step: 'done', loudnessDb: clampLevel(levelDb)};
}

/** The loudness match is optional; skipping it at either part drops both values. */
export function skipLoudness(state: WizardState): WizardState {
	if (state.step !== 'threshold' && state.step !== 'loudness') return state;
	return {...state, step: 'done', thresholdDb: null, loudnessDb: null};
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
	};
}

/** Tinnitus loudness as dB above the hearing threshold at the same frequency (sensation level). */
export function sensationLevel(result: Pick<MatchResult, 'thresholdDb' | 'loudnessDb'>) {
	const {thresholdDb, loudnessDb} = result;
	return thresholdDb === null || loudnessDb === null ? null : loudnessDb - thresholdDb;
}

export function clampLevel(db: number) {
	return clamp(db, MIN_LEVEL_DB, MAX_LEVEL_DB);
}

/** Newest first, one entry per id; `incoming` wins on conflicts. */
export function mergeMatches(existing: MatchResult[], incoming: MatchResult[]) {
	const byId = new Map(existing.map(m => [m.id, m]));
	for (const m of incoming) byId.set(m.id, m);
	return [...byId.values()].sort((a, b) => b.date.localeCompare(a.date));
}
