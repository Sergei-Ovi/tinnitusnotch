import {describe, expect, it} from 'vitest';
import {
	type Audiogram,
	AUDIOGRAM_FREQUENCIES,
	audiogramReliable,
	audiometryDone,
	NORMAL_AUDIOGRAM,
	currentPresentation,
	type Ear,
	equalizingOffset,
	hearingEdge,
	PRESENTATION_COUNT,
	respond,
	respondTrack,
	startAudiometry,
	startTrack,
	type ThresholdTrack,
} from './audiometry';
import {MAX_LEVEL_DB, MIN_LEVEL_DB} from './levels';

/** No catch trials. */
const never = () => 1;

/** Follows one threshold search, answering as a listener who hears everything at or above `threshold`. */
function search(start: number, threshold: number, answer = (level: number) => level >= threshold) {
	let track: ThresholdTrack = startTrack(start);
	const levels: number[] = [];
	for (; ;) {
		levels.push(track.levelDb);
		const step = respondTrack(track, answer(track.levelDb));
		if ('thresholdDb' in step) return {thresholdDb: step.thresholdDb, levels};
		track = step.track;
	}
}

function audiogram(right: (number | null)[], left = right): Audiogram {
	return {frequencies: AUDIOGRAM_FREQUENCIES, left, right};
}

describe('threshold search', () => {
	it('goes down 10 after a response and up 5 after a miss', () => {
		const {thresholdDb, levels} = search(-30, -47);
		expect(levels).toEqual([-30, -40, -50, -45, -55, -50, -45]);
		expect(thresholdDb).toBe(-45);
	});

	it('finds the threshold within one step from either side', () => {
		for (const threshold of [-86, -72, -61, -40, -12, -3]) {
			const {thresholdDb} = search(-30, threshold);
			expect(thresholdDb! - threshold).toBeGreaterThanOrEqual(0);
			expect(thresholdDb! - threshold).toBeLessThan(5);
		}
	});

	it('rises faster until the first response', () => {
		expect(search(-30, -12).levels.slice(0, 3)).toEqual([-30, -20, -10]);
	});

	it('reports no response when nothing is heard at the loudest level', () => {
		const {thresholdDb, levels} = search(-30, 5);
		expect(thresholdDb).toBeNull();
		expect(levels.at(-1)).toBe(MAX_LEVEL_DB);
	});

	it('stops at the quietest playable level', () => {
		expect(search(-30, -200).thresholdDb).toBe(MIN_LEVEL_DB);
	});

	it('takes the best estimate when answers never settle', () => {
		let flip = false;
		const {thresholdDb, levels} = search(-30, 0, () => (flip = !flip));
		expect(levels.length).toBeLessThanOrEqual(14);
		expect(thresholdDb).not.toBeNull();
	});
});

describe('audiometry', () => {
	it('tests every frequency in both ears and records the thresholds', () => {
		const thresholds: Record<Ear, (f: number) => number> = {
			right: f => f >= 8000 ? -25 : -65,
			left: () => -55,
		};
		let state = startAudiometry();
		const seen = new Set<string>();
		while (!audiometryDone(state)) {
			const {ear, frequency, levelDb} = currentPresentation(state);
			seen.add(`${ear}/${frequency}`);
			state = respond(state, levelDb >= thresholds[ear](frequency), never);
		}
		expect(seen.size).toBe(PRESENTATION_COUNT);
		expect(state.audiogram.right).toEqual([-65, -65, -65, -65, -65, -65, -25, -25, -25]);
		expect(state.audiogram.left).toEqual(AUDIOGRAM_FREQUENCIES.map(() => -55));
	});

	it('starts each frequency a little above the last threshold in that ear', () => {
		let state = startAudiometry();
		while (state.index === 0) state = respond(state, currentPresentation(state).levelDb >= -70, never);
		expect(currentPresentation(state).levelDb).toBe(-55);
	});

	it('slips in silent presentations that leave the threshold search alone', () => {
		let state = respond(startAudiometry(), true, () => 0);
		const {track} = state;
		expect(state.silent).toBe(true);
		expect(currentPresentation(state).levelDb).toBe(-Infinity);

		// "Yes" to silence is a false alarm; the next presentation is a tone at the same level.
		state = respond(state, true, () => 0);
		expect(state).toMatchObject({silent: false, falseAlarm: true, track});
		expect(state.audiogram.catchTrials).toEqual({presented: 1, falseAlarms: 1});

		state = respond(state, false, never);
		expect(state.falseAlarm).toBe(false);
		state = respond(state, false, () => 0);
		state = respond(state, false, never);
		expect(state.audiogram.catchTrials).toEqual({presented: 2, falseAlarms: 1});
	});

	it('gives roughly one silent presentation in ten, and none after the last tone', () => {
		let seed = 1;
		const random = () => (seed = seed * 16807 % 2147483647) / 2147483647;
		let state = startAudiometry();
		let tones = 0;
		while (!audiometryDone(state)) {
			if (!state.silent) tones++;
			const {frequency, levelDb} = currentPresentation(state);
			state = respond(state, levelDb >= (frequency > 6000 ? -40 : -60), random);
		}
		const {presented, falseAlarms} = state.audiogram.catchTrials;
		expect(falseAlarms).toBe(0);
		expect(presented).toBeGreaterThan(tones * 0.05);
		expect(presented).toBeLessThan(tones * 0.2);
		expect(state.silent).toBe(false);
	});

	it('calls the audiogram unreliable after more than one false alarm', () => {
		const base = audiogram(AUDIOGRAM_FREQUENCIES.map(() => -60));
		expect(audiogramReliable(base)).toBe(true);
		expect(audiogramReliable({...base, catchTrials: {presented: 10, falseAlarms: 1}})).toBe(true);
		expect(audiogramReliable({...base, catchTrials: {presented: 10, falseAlarms: 2}})).toBe(false);
	});
});

describe('hearing edge', () => {
	it('finds a steep drop between neighbouring frequencies', () => {
		const edge = hearingEdge(audiogram([-70, -70, -70, -70, -70, -40, -35, -30, -30], AUDIOGRAM_FREQUENCIES.map(() => -70)));
		expect(edge).toMatchObject({frequency: 4899, ear: 'right'});
	});

	it('ignores flat hearing, gentle slopes and the normal rise at the top', () => {
		expect(hearingEdge(audiogram(AUDIOGRAM_FREQUENCIES.map(() => -60)))).toBeNull();
		expect(hearingEdge(audiogram([-70, -65, -60, -55, -50, -45, -40, -35, -30]))).toBeNull();
		expect(hearingEdge(audiogram([-66, -70, -72, -74, -73, -67, -62, -58, -54]))).toBeNull();
	});

	it('treats no response as a drop past the loudest level', () => {
		const edge = hearingEdge(audiogram([-60, -60, -60, -60, -60, -60, -60, -15, null]));
		expect(edge?.frequency).toBe(8944);
	});
});

describe('equalizing offset', () => {
	const flat = audiogram(AUDIOGRAM_FREQUENCIES.map(() => -60));

	it('is zero for flat hearing', () => {
		expect(equalizingOffset(flat, 6000)).toBe(0);
	});

	it('follows the better ear and interpolates between test frequencies', () => {
		const right = [-60, -60, -60, -60, -60, -50, -40, -40, -40];
		const left = [-60, -60, -60, -60, -60, -60, -30, -30, -30];
		const g = audiogram(right, left);
		expect(equalizingOffset(g, 6000)).toBe(0);
		expect(equalizingOffset(g, 8000)).toBe(20);
		expect(equalizingOffset(g, Math.sqrt(6000 * 8000))).toBeCloseTo(10);
		expect(equalizingOffset(g, 16000)).toBe(20);
	});

	it('follows the normal hearing curve without a hearing test', () => {
		expect(equalizingOffset(NORMAL_AUDIOGRAM, 1000)).toBe(0);
		expect(equalizingOffset(NORMAL_AUDIOGRAM, 3000)).toBe(-4);
		expect(equalizingOffset(NORMAL_AUDIOGRAM, 12000)).toBe(16);
	});

	it('is limited both ways', () => {
		expect(equalizingOffset(audiogram([-60, -60, -60, -60, -60, -60, -60, null, null]), 12000)).toBe(30);
		expect(equalizingOffset(audiogram([-90, -40, -40, -40, -40, -40, -40, -40, -40]), 500)).toBe(-15);
	});
});
