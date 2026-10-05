import {describe, expect, it} from 'vitest';
import {alternativeFrequencies, hasEffect, inhibitionLevel, inhibitionTrial, MAX_TIMED_SECONDS} from './inhibition';

describe('residual inhibition', () => {
	it('plays above the loudness match, or above the comparisons without one, never past the ceiling', () => {
		expect(inhibitionLevel(-50, -30)).toBe(-40);
		expect(inhibitionLevel(null, -30)).toBe(-25);
		expect(inhibitionLevel(-5, -30)).toBe(0);
	});

	it('times only an effect, rounded and capped', () => {
		expect(inhibitionTrial(4000, 'quieter', 41.6)).toEqual({frequency: 4000, effect: 'quieter', seconds: 42});
		expect(inhibitionTrial(4000, 'gone', 1000).seconds).toBe(MAX_TIMED_SECONDS);
		expect(inhibitionTrial(4000, 'none', 30).seconds).toBeNull();
		expect(inhibitionTrial(4000, 'gone').seconds).toBeNull();
		expect(hasEffect({effect: 'louder'})).toBe(false);
	});

	it('offers half an octave either way, inside the playable range', () => {
		expect(alternativeFrequencies(4000)).toEqual([2828, 5657]);
		expect(alternativeFrequencies(15000)).toEqual([10607]);
	});
});
