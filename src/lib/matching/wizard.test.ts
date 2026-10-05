import {describe, expect, it} from 'vitest';
import {currentPresentation} from './audiometry';
import {inhibitionTrial} from './inhibition';
import {MIN_LEVEL_DB, REFERENCE_DB} from './levels';
import {firstSplit, RUNS, trialPair, TRIALS_PER_RUN} from './procedure';
import {
	addInhibitionTrial,
	adoptFrequency,
	answer,
	calibrated,
	chooseOctave,
	chooseType,
	confirmFrequency,
	finishInhibition,
	fineTune,
	hearingResponse,
	loudnessStartDb,
	sensationLevel,
	setLoudness,
	setThreshold,
	skipHearing,
	skipLoudness,
	startHearing,
	startWizard,
	toResult,
	type WizardState,
} from './wizard';

const random = () => 0.3;
const typeChosen = (type: 'tonal' | 'hissing') => chooseType(startWizard(), type, random);

/** Runs the hearing test as a listener with these thresholds (dB re ceiling) would answer. */
function hearAll(state: WizardState, threshold: (frequency: number) => number) {
	while (state.step === 'hearing' && state.audiometry) {
		const {frequency, levelDb} = currentPresentation(state.audiometry);
		state = hearingResponse(state, levelDb >= threshold(frequency), random);
	}
	return state;
}

/** Answers every comparison as a listener with tinnitus at `target` would. */
function matchAll(state: WizardState, target: number) {
	let trials = 0;
	while (state.step === 'match' && state.run) {
		const {a, b} = trialPair(state.run);
		const choice = Math.abs(Math.log2(a / target)) < Math.abs(Math.log2(b / target)) ? 'a' : 'b';
		state = answer(state, choice, random);
		trials++;
	}
	return {state, trials};
}

describe('matching wizard', () => {
	it('goes from calibration through all runs to the octave check', () => {
		let state = calibrated(startWizard());
		expect(state.step).toBe('hearing');
		state = skipHearing(state);
		expect(state.step).toBe('type');
		state = chooseType(state, 'tonal', random);
		expect(state.step).toBe('match');

		const {state: matched, trials} = matchAll(state, 6000);
		expect(trials).toBe(RUNS * TRIALS_PER_RUN);
		expect(matched.step).toBe('octave');
		expect(matched.estimates).toHaveLength(RUNS);
		expect(matched.combined?.reliable).toBe(true);
		expect(Math.abs(Math.log2(matched.frequency! / 6000))).toBeLessThan(1 / 3);
		expect(matched.octaveOptions).toContain(matched.frequency);
	});

	it('produces a result with the octave choice, fine-tuning and loudness', () => {
		let state = matchAll(typeChosen('hissing'), 3000).state;
		state = chooseOctave(state, 6000);
		state = fineTune(state, 6200);
		state = confirmFrequency(state);
		expect(state.step).toBe('threshold');
		state = setThreshold(state, -60);
		expect(loudnessStartDb(state)).toBe(-50);
		state = setLoudness(state, -48);
		expect(state.step).toBe('inhibition');
		state = addInhibitionTrial(state, inhibitionTrial(6200, 'quieter', 42));
		state = finishInhibition(state);
		expect(state.step).toBe('done');

		const result = toResult(state, 'id-1', new Date('2026-10-05T10:00:00Z'));
		expect(result).toMatchObject({
			id: 'id-1',
			date: '2026-10-05T10:00:00.000Z',
			type: 'hissing',
			frequency: 6200,
			thresholdDb: -60,
			loudnessDb: -48,
			inhibition: [{frequency: 6200, effect: 'quieter', seconds: 42}],
		});
		expect(sensationLevel(result!)).toBe(12);
	});

	it('allows skipping the loudness match', () => {
		let state = matchAll(typeChosen('tonal'), 4000).state;
		state = confirmFrequency(chooseOctave(state, state.frequency!));
		state = skipLoudness(setThreshold(state, -55));
		expect(state.step).toBe('inhibition');
		state = finishInhibition(state);
		expect(state.step).toBe('done');
		const result = toResult(state, 'id', new Date());
		expect(result?.thresholdDb).toBeNull();
		expect(sensationLevel(result!)).toBeNull();
	});

	it('clamps levels to the playable range', () => {
		let state = matchAll(typeChosen('tonal'), 4000).state;
		state = confirmFrequency(chooseOctave(state, 4000));
		state = setThreshold(state, -200);
		expect(state.thresholdDb).toBe(MIN_LEVEL_DB);
		state = setLoudness(state, 20);
		expect(state.loudnessDb).toBe(0);
	});

	it('ignores actions out of order', () => {
		const state = typeChosen('tonal');
		expect(chooseOctave(state, 4000)).toBe(state);
		expect(setThreshold(state, -40)).toBe(state);
		expect(toResult(state, 'id', new Date())).toBeNull();
	});

	it('takes the hearing edge as the starting hypothesis and keeps the audiogram', () => {
		let state = startHearing(calibrated(startWizard()));
		expect(state.audiometry).not.toBeNull();
		// Normal hearing up to 4 kHz, a steep drop above it.
		state = hearAll(state, f => f <= 4000 ? -70 : -35);
		expect(state.step).toBe('type');
		expect(state.audiogram?.right[4]).toBe(-70);
		expect(state.hypothesis).toBe(4899);

		state = chooseType(state, 'tonal', random);
		expect(state.run?.split).toBe(firstSplit(0, 4899));
		state = matchAll(state, 6000).state;
		state = finishInhibition(skipLoudness(confirmFrequency(chooseOctave(state, state.frequency!))));
		expect(toResult(state, 'id', new Date())?.audiogram).toEqual(state.audiogram);
	});

	it('keeps an unreliable hearing test, but not its edge', () => {
		let state = startHearing(calibrated(startWizard()));
		let silent = 0;
		// Every other presentation is silent, and the listener says "yes" to it: tinnitus taken for beeps.
		while (state.step === 'hearing' && state.audiometry) {
			const {frequency, levelDb} = currentPresentation(state.audiometry);
			if (levelDb === -Infinity) silent++;
			state = hearingResponse(state, levelDb === -Infinity || levelDb >= (frequency <= 4000 ? -70 : -35), () => 0);
		}
		expect(silent).toBeGreaterThan(1);
		expect(state.audiogram?.catchTrials).toEqual({presented: silent, falseAlarms: silent});
		expect(state.audiogram?.right[4]).toBe(-70);
		expect(state.hypothesis).toBeNull();
	});

	it('keeps the hearing test when the comparisons are repeated', () => {
		let state = hearAll(startHearing(calibrated(startWizard())), () => -60);
		expect(state.hypothesis).toBeNull();
		state = chooseType(matchAll(chooseType(state, 'tonal', random), 3000).state, 'tonal', random);
		expect(state.step).toBe('match');
		expect(state.estimates).toEqual([]);
		expect(state.audiogram).not.toBeNull();
	});

	it('drops a partial hearing test when it is skipped', () => {
		let state = startHearing(calibrated(startWizard()));
		state = hearingResponse(state, true, random);
		state = skipHearing(state);
		expect(state).toMatchObject({step: 'type', audiometry: null, audiogram: null, hypothesis: null});
	});

	it('switches to a frequency only if it showed residual inhibition', () => {
		let state = matchAll(typeChosen('tonal'), 4000).state;
		state = skipLoudness(confirmFrequency(chooseOctave(state, 4000)));
		state = addInhibitionTrial(state, inhibitionTrial(4000, 'none'));
		state = addInhibitionTrial(state, inhibitionTrial(2828, 'none'));
		state = addInhibitionTrial(state, inhibitionTrial(5657, 'gone', 30));
		expect(adoptFrequency(state, 2828).frequency).toBe(4000);
		expect(adoptFrequency(state, 7000).frequency).toBe(4000);
		state = finishInhibition(adoptFrequency(state, 5657));
		const result = toResult(state, 'id', new Date())!;
		expect(result.frequency).toBe(5657);
		expect(result.inhibition).toHaveLength(3);
	});

	it('starts the loudness slider at the reference without a threshold', () => {
		expect(loudnessStartDb(startWizard())).toBe(REFERENCE_DB + 10);
	});
});
