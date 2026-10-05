import {describe, expect, it} from 'vitest';
import {RUNS, trialPair, TRIALS_PER_RUN} from './procedure';
import {
	answer,
	calibrated,
	chooseOctave,
	chooseType,
	confirmFrequency,
	fineTune,
	loudnessStartDb,
	MIN_LEVEL_DB,
	REFERENCE_DB,
	sensationLevel,
	setLoudness,
	setThreshold,
	skipLoudness,
	startWizard,
	toResult,
	type WizardState,
} from './wizard';

const random = () => 0.3;

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
		expect(state.step).toBe('type');
		state = chooseType('tonal', random);
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
		let state = matchAll(chooseType('hissing', random), 3000).state;
		state = chooseOctave(state, 6000);
		state = fineTune(state, 6200);
		state = confirmFrequency(state);
		expect(state.step).toBe('threshold');
		state = setThreshold(state, -60);
		expect(loudnessStartDb(state)).toBe(-50);
		state = setLoudness(state, -48);
		expect(state.step).toBe('done');

		const result = toResult(state, 'id-1', new Date('2026-10-05T10:00:00Z'));
		expect(result).toMatchObject({
			id: 'id-1',
			date: '2026-10-05T10:00:00.000Z',
			type: 'hissing',
			frequency: 6200,
			thresholdDb: -60,
			loudnessDb: -48,
		});
		expect(sensationLevel(result!)).toBe(12);
	});

	it('allows skipping the loudness match', () => {
		let state = matchAll(chooseType('tonal', random), 4000).state;
		state = confirmFrequency(chooseOctave(state, state.frequency!));
		state = skipLoudness(setThreshold(state, -55));
		expect(state.step).toBe('done');
		const result = toResult(state, 'id', new Date());
		expect(result?.thresholdDb).toBeNull();
		expect(sensationLevel(result!)).toBeNull();
	});

	it('clamps levels to the playable range', () => {
		let state = matchAll(chooseType('tonal', random), 4000).state;
		state = confirmFrequency(chooseOctave(state, 4000));
		state = setThreshold(state, -200);
		expect(state.thresholdDb).toBe(MIN_LEVEL_DB);
		state = setLoudness(state, 20);
		expect(state.loudnessDb).toBe(0);
	});

	it('ignores actions out of order', () => {
		const state = chooseType('tonal', random);
		expect(chooseOctave(state, 4000)).toBe(state);
		expect(setThreshold(state, -40)).toBe(state);
		expect(toResult(state, 'id', new Date())).toBeNull();
	});

	it('starts the loudness slider at the reference without a threshold', () => {
		expect(loudnessStartDb(startWizard())).toBe(REFERENCE_DB + 10);
	});
});
