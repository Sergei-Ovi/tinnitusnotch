import {describe, expect, it} from 'vitest';
import {
	frequencyToPosition,
	MAX_FREQUENCY,
	MIN_FREQUENCY,
	notchBand,
	positionToFrequency,
	shiftOctaves,
	volumeToGain,
} from './scale';

describe('frequency scale', () => {
	it('maps the ends of the range', () => {
		expect(frequencyToPosition(MIN_FREQUENCY)).toBe(0);
		expect(frequencyToPosition(MAX_FREQUENCY)).toBe(1);
		expect(positionToFrequency(0)).toBe(MIN_FREQUENCY);
		expect(positionToFrequency(1)).toBe(MAX_FREQUENCY);
	});

	it('gives every octave the same slider distance', () => {
		const octave = frequencyToPosition(2000) - frequencyToPosition(1000);
		expect(frequencyToPosition(8000) - frequencyToPosition(4000)).toBeCloseTo(octave, 12);
	});

	it('round-trips frequencies', () => {
		for (const f of [100, 440, 3000, 6000, 12345, 16000]) {
			expect(positionToFrequency(frequencyToPosition(f))).toBe(f);
		}
	});

	it('clamps out-of-range values', () => {
		expect(frequencyToPosition(10)).toBe(0);
		expect(positionToFrequency(2)).toBe(MAX_FREQUENCY);
	});

	it('shifts by octaves and semitones', () => {
		expect(shiftOctaves(4000, 1)).toBe(8000);
		expect(shiftOctaves(4000, -1)).toBe(2000);
		expect(shiftOctaves(440, 1 / 12)).toBe(466);
		expect(shiftOctaves(12000, 1)).toBe(MAX_FREQUENCY);
	});
});

describe('volumeToGain', () => {
	it('is silent at 0 and at the ceiling at 100', () => {
		expect(volumeToGain(0)).toBe(0);
		expect(volumeToGain(100)).toBe(1);
		expect(volumeToGain(150)).toBe(1);
	});

	it('is logarithmic: 60 dB over the slider', () => {
		expect(20 * Math.log10(volumeToGain(50))).toBeCloseTo(-30, 10);
		expect(20 * Math.log10(volumeToGain(1))).toBeCloseTo(-59.4, 10);
	});
});

describe('notchBand', () => {
	it('is centred geometrically', () => {
		const {low, high} = notchBand(4000, 1);
		expect(high / low).toBeCloseTo(2, 12);
		expect(Math.sqrt(low * high)).toBeCloseTo(4000, 9);
	});
});
