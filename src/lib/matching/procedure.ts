import {MAX_FREQUENCY, MIN_FREQUENCY} from '@/lib/audio/scale';

/** Range searched by the comparisons; tinnitus pitch is almost always inside it. */
export const SEARCH_LOW = 500;
export const SEARCH_HIGH = 12000;
export const RUNS = 3;
export const TRIALS_PER_RUN = 8;
/** Spread between the runs above which the match is flagged as unreliable, in octaves. */
export const MAX_RELIABLE_SPREAD = 0.5;

/** Part of the interval kept past the split, so an answer for a target near the boundary doesn't lose it. */
const OVERLAP = 0.1;
/** Where each run makes its first split: the same search, started from different comparisons. */
const FIRST_SPLITS = [0.5, 0.35, 0.65];
/** Later splits wander around the middle, so runs don't repeat each other's comparisons. */
const SPLIT_JITTER = 0.1;

/** Answer to "which of A and B is closer to your tinnitus?". */
export type Choice = 'a' | 'b' | 'same';

/** One bisection run on a log-frequency interval. */
export type Run = {
	index: number;
	/** Interval edges in octaves (log2 Hz). */
	low: number;
	high: number;
	trial: number;
	/** Fraction of the interval below the split in the current trial. */
	split: number;
	/** Whether the lower candidate is presented as A; random, so A/B order bias averages out. */
	lowerFirst: boolean;
};

const toHz = (octaves: number) => Math.round(2 ** octaves);

export function startRun(index: number, random = Math.random): Run {
	return {
		index,
		low: Math.log2(SEARCH_LOW),
		high: Math.log2(SEARCH_HIGH),
		trial: 0,
		split: FIRST_SPLITS[index % FIRST_SPLITS.length],
		lowerFirst: random() < 0.5,
	};
}

/** Candidates are the centres of the two parts of the interval. */
function candidates(run: Run) {
	const width = run.high - run.low;
	const split = run.low + run.split * width;
	return {width, split, lower: (run.low + split) / 2, upper: (split + run.high) / 2};
}

export function trialPair(run: Run): {a: number; b: number} {
	const {lower, upper} = candidates(run);
	return run.lowerFirst ? {a: toHz(lower), b: toHz(upper)} : {a: toHz(upper), b: toHz(lower)};
}

/** Keeps the part of the interval with the chosen candidate; "same" keeps the stretch between the two. */
export function answerTrial(run: Run, choice: Choice, random = Math.random): Run {
	const {width, split, lower, upper} = candidates(run);
	let low = lower;
	let high = upper;
	if (choice !== 'same') {
		const pickedLower = (choice === 'a') === run.lowerFirst;
		low = pickedLower ? run.low : Math.max(run.low, split - OVERLAP * width);
		high = pickedLower ? Math.min(run.high, split + OVERLAP * width) : run.high;
	}
	return {
		...run,
		low,
		high,
		trial: run.trial + 1,
		split: 0.5 + (random() * 2 - 1) * SPLIT_JITTER,
		lowerFirst: random() < 0.5,
	};
}

export function runDone(run: Run) {
	return run.trial >= TRIALS_PER_RUN;
}

export function runEstimate(run: Run) {
	return toHz((run.low + run.high) / 2);
}

export type Combined = {
	/** Median of the runs. */
	frequency: number;
	/** Distance between the lowest and highest run, in octaves. */
	spreadOctaves: number;
	reliable: boolean;
};

export function combineRuns(estimates: number[]): Combined {
	const octaves = estimates.map(Math.log2).sort((a, b) => a - b);
	const middle = octaves.length / 2;
	const median = octaves.length % 2
		? octaves[Math.floor(middle)]
		: (octaves[middle - 1] + octaves[middle]) / 2;
	const spreadOctaves = octaves[octaves.length - 1] - octaves[0];
	return {frequency: toHz(median), spreadOctaves, reliable: spreadOctaves <= MAX_RELIABLE_SPREAD};
}

/** f/2, f and 2f in random order, leaving out what falls outside the playable range. */
export function octaveOptions(frequency: number, random = Math.random) {
	const options = [frequency / 2, frequency, frequency * 2]
		.map(Math.round)
		.filter(f => f >= MIN_FREQUENCY && f <= MAX_FREQUENCY);
	for (let i = options.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[options[i], options[j]] = [options[j], options[i]];
	}
	return options;
}
