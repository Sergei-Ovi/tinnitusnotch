import {describe, expect, it} from 'vitest';
import {
	answerTrial,
	type Choice,
	combineRuns,
	firstSplit,
	octaveOptions,
	type Run,
	runDone,
	runEstimate,
	RUNS,
	SEARCH_HIGH,
	SEARCH_LOW,
	startRun,
	trialPair,
	TRIALS_PER_RUN,
} from './procedure';

/** Deterministic PRNG (mulberry32). */
function seeded(seed: number) {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const octavesBetween = (a: number, b: number) => Math.abs(Math.log2(a / b));

/** A listener who picks whichever candidate is closer in log frequency to their tinnitus. */
function idealListener(target: number) {
	return (a: number, b: number): Choice => octavesBetween(a, target) < octavesBetween(b, target) ? 'a' : 'b';
}

function runToEnd(run: Run, listen: (a: number, b: number) => Choice, random: () => number) {
	while (!runDone(run)) {
		const {a, b} = trialPair(run);
		run = answerTrial(run, listen(a, b), random);
	}
	return run;
}

describe('bisection run', () => {
	it('presents two candidates inside the search range, in random order', () => {
		const random = seeded(1);
		let lowerFirst = 0;
		for (let i = 0; i < 40; i++) {
			const run = startRun(0, random);
			const {a, b} = trialPair(run);
			for (const f of [a, b]) {
				expect(f).toBeGreaterThan(SEARCH_LOW);
				expect(f).toBeLessThan(SEARCH_HIGH);
			}
			if (a < b) lowerFirst++;
		}
		expect(lowerFirst).toBeGreaterThan(10);
		expect(lowerFirst).toBeLessThan(30);
	});

	it('splits on the starting hypothesis first, then around it', () => {
		const at = (f: number) => Math.log2(f / SEARCH_LOW) / Math.log2(SEARCH_HIGH / SEARCH_LOW);
		expect(firstSplit(0, 3000)).toBeCloseTo(at(3000));
		expect(firstSplit(1, 3000)).toBeCloseTo(at(3000) - 0.15);
		expect(firstSplit(2, 3000)).toBeCloseTo(at(3000) + 0.15);
		expect(firstSplit(0, 11000)).toBe(0.8);
		expect(firstSplit(1, 600)).toBe(0.2);
	});

	it('still converges on a target away from a wrong hypothesis', () => {
		const random = seeded(3);
		for (const target of [700, 1500, 9000]) {
			const run = runToEnd(startRun(0, random, 4000), idealListener(target), random);
			expect(octavesBetween(runEstimate(run), target)).toBeLessThan(1 / 3);
		}
	});

	it('starts each run with a different comparison', () => {
		const pairs = Array.from({length: RUNS}, (_, i) => {
			const {a, b} = trialPair(startRun(i, () => 0));
			return [Math.min(a, b), Math.max(a, b)].join('-');
		});
		expect(new Set(pairs).size).toBe(RUNS);
	});

	it('ends after the planned number of trials', () => {
		const random = seeded(2);
		let run = startRun(0, random);
		for (let i = 0; i < TRIALS_PER_RUN; i++) {
			expect(runDone(run)).toBe(false);
			run = answerTrial(run, 'a', random);
		}
		expect(runDone(run)).toBe(true);
	});

	it.each([600, 1500, 4000, 6300, 8000, 11000])('converges within a third of an octave of %d Hz', target => {
		const random = seeded(target);
		for (let index = 0; index < RUNS; index++) {
			const run = runToEnd(startRun(index, random), idealListener(target), random);
			expect(octavesBetween(runEstimate(run), target)).toBeLessThan(1 / 3);
		}
	});

	it('narrows to the stretch between the candidates on "same"', () => {
		const run = startRun(0, () => 0);
		const {a, b} = trialPair(run);
		const next = answerTrial(run, 'same', () => 0);
		expect(2 ** next.low).toBeCloseTo(Math.min(a, b), -1);
		expect(2 ** next.high).toBeCloseTo(Math.max(a, b), -1);
	});

	it('maps A and B to the right half whatever the presentation order', () => {
		for (const lowerFirst of [true, false]) {
			const run = {...startRun(0, () => 0), lowerFirst};
			const {a, b} = trialPair(run);
			const next = answerTrial(run, 'a', () => 0.5);
			const kept = a < b ? 'lower' : 'upper';
			const mid = (next.low + next.high) / 2;
			const runMid = (run.low + run.high) / 2;
			expect(kept === 'lower' ? mid < runMid : mid > runMid).toBe(true);
		}
	});
});

describe('combining runs', () => {
	it('takes the median and measures the spread in octaves', () => {
		const combined = combineRuns([4000, 4500, 3800]);
		expect(combined.frequency).toBe(4000);
		expect(combined.spreadOctaves).toBeCloseTo(Math.log2(4500 / 3800), 10);
		expect(combined.reliable).toBe(true);
	});

	it('flags runs more than half an octave apart as unreliable', () => {
		const combined = combineRuns([3000, 4000, 6000]);
		expect(combined.frequency).toBe(4000);
		expect(combined.spreadOctaves).toBeCloseTo(1, 10);
		expect(combined.reliable).toBe(false);
	});

	it('uses the geometric middle for an even count', () => {
		expect(combineRuns([2000, 8000]).frequency).toBe(4000);
	});
});

describe('octave check', () => {
	it('offers f/2, f and 2f', () => {
		expect(octaveOptions(4000, seeded(3)).sort((x, y) => x - y)).toEqual([2000, 4000, 8000]);
	});

	it('leaves out octaves outside the playable range', () => {
		expect(octaveOptions(10000, seeded(4)).sort((x, y) => x - y)).toEqual([5000, 10000]);
	});

	it('shuffles the order', () => {
		const orders = new Set(Array.from({length: 30}, (_, i) => octaveOptions(4000, seeded(i)).join()));
		expect(orders.size).toBeGreaterThan(1);
	});
});
