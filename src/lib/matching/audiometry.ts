import {clamp} from '@/lib/audio/scale';
import {clampLevel, MAX_LEVEL_DB, MIN_LEVEL_DB, REFERENCE_DB} from './levels';

export type Ear = 'left' | 'right';
/** Test order: the right ear, then the left. */
export const EARS: Ear[] = ['right', 'left'];

export const AUDIOGRAM_FREQUENCIES = [500, 1000, 2000, 3000, 4000, 6000, 8000, 10000, 12000];
/** Order within an ear: 1 kHz first, as the easiest to hear, then upwards; 500 Hz last. */
const TEST_ORDER = [1000, 2000, 3000, 4000, 6000, 8000, 10000, 12000, 500];
const SEQUENCE = EARS.flatMap(ear => TEST_ORDER.map(frequency => ({ear, frequency})));
export const PRESENTATION_COUNT = SEQUENCE.length;

/** Simplified Hughson–Westlake: down after a response, up after a miss. */
const STEP_DOWN_DB = 10;
const STEP_UP_DB = 5;
/** Until the first response the level rises faster. */
const SEARCH_UP_DB = 10;
/** Responses at one level, each on the way up, that make it the threshold. */
const ASCENDING_HITS = 2;
/** After this many presentations at one frequency the best estimate so far is taken. */
const MAX_PRESENTATIONS = 14;
/** The next frequency starts this far above the previous threshold, but no louder than the reference. */
const START_ABOVE_PREVIOUS_DB = 15;

/**
 * Hearing thresholds in dB re ceiling, one per frequency (ascending);
 * null where nothing was heard at the loudest level.
 */
export type Audiogram = {frequencies: number[]; left: (number | null)[]; right: (number | null)[]};

/** Threshold search at one frequency in one ear. */
export type ThresholdTrack = {
	levelDb: number;
	presentations: number;
	/** The current presentation follows a miss after something was already heard: a step on the way up. */
	ascending: boolean;
	heardAny: boolean;
	/** Levels heard on the way up, one entry per response. */
	ascendingHits: number[];
	lowestHeard: number | null;
};

export function startTrack(levelDb: number): ThresholdTrack {
	return {levelDb: clampLevel(levelDb), presentations: 0, ascending: false, heardAny: false, ascendingHits: [], lowestHeard: null};
}

export type TrackStep = {track: ThresholdTrack} | {thresholdDb: number | null};

export function respondTrack(track: ThresholdTrack, heard: boolean): TrackStep {
	const {levelDb} = track;
	const presentations = track.presentations + 1;

	if (heard) {
		const ascendingHits = track.ascending ? [...track.ascendingHits, levelDb] : track.ascendingHits;
		const lowestHeard = Math.min(levelDb, track.lowestHeard ?? levelDb);
		if (ascendingHits.filter(l => l === levelDb).length >= ASCENDING_HITS) return {thresholdDb: levelDb};
		// Heard at the quietest level we can play: that's as low as it goes.
		if (levelDb <= MIN_LEVEL_DB) return {thresholdDb: MIN_LEVEL_DB};
		const next = {
			levelDb: clampLevel(levelDb - STEP_DOWN_DB),
			presentations, ascending: false, heardAny: true, ascendingHits, lowestHeard,
		};
		return presentations >= MAX_PRESENTATIONS ? {thresholdDb: bestEstimate(next)} : {track: next};
	}

	if (levelDb >= MAX_LEVEL_DB) return {thresholdDb: bestEstimate(track)};
	const next = {
		...track,
		levelDb: clampLevel(levelDb + (track.heardAny ? STEP_UP_DB : SEARCH_UP_DB)),
		presentations,
		ascending: track.heardAny,
	};
	return presentations >= MAX_PRESENTATIONS ? {thresholdDb: bestEstimate(next)} : {track: next};
}

/** When the search runs out: the lowest level heard on the way up, else the lowest heard at all. */
function bestEstimate(track: ThresholdTrack) {
	return track.ascendingHits.length ? Math.min(...track.ascendingHits) : track.lowestHeard;
}

export type AudiometryState = {
	/** Position in the test sequence: each frequency in the right ear, then in the left. */
	index: number;
	track: ThresholdTrack;
	audiogram: Audiogram;
};

export function startAudiometry(): AudiometryState {
	const empty = () => AUDIOGRAM_FREQUENCIES.map(() => null);
	return {
		index: 0,
		track: startTrack(REFERENCE_DB),
		audiogram: {frequencies: AUDIOGRAM_FREQUENCIES, left: empty(), right: empty()},
	};
}

export function audiometryDone(state: AudiometryState) {
	return state.index >= SEQUENCE.length;
}

/** The sound to play now: a tone in one ear. */
export function currentPresentation(state: AudiometryState) {
	const {ear, frequency} = SEQUENCE[state.index];
	return {ear, frequency, levelDb: state.track.levelDb};
}

export function respond(state: AudiometryState, heard: boolean): AudiometryState {
	if (audiometryDone(state)) return state;
	const step = respondTrack(state.track, heard);
	if ('track' in step) return {...state, track: step.track};

	const {ear, frequency} = SEQUENCE[state.index];
	const thresholds = [...state.audiogram[ear]];
	thresholds[AUDIOGRAM_FREQUENCIES.indexOf(frequency)] = step.thresholdDb;
	const audiogram = {...state.audiogram, [ear]: thresholds};

	const index = state.index + 1;
	const sameEar = index < SEQUENCE.length && SEQUENCE[index].ear === ear;
	const previous = sameEar ? step.thresholdDb : null;
	const start = previous === null ? REFERENCE_DB : Math.min(REFERENCE_DB, previous + START_ABOVE_PREVIOUS_DB);
	return {index, track: startTrack(start), audiogram};
}

/**
 * Rough shape of normal hearing thresholds over headphones, relative to 1 kHz (after ISO 226 and the
 * extended high-frequency norms). Headphones aren't calibrated, so this only keeps the usual rise at the
 * top of the range from looking like hearing loss.
 */
const NORMAL_SHAPE_DB: Record<number, number> = {
	500: 4, 1000: 0, 2000: -2, 3000: -4, 4000: -3, 6000: 3, 8000: 8, 10000: 12, 12000: 16,
};
/** Stand-in for "not heard at the loudest level": somewhere above it. */
const NO_RESPONSE_DB = MAX_LEVEL_DB + 10;
/** Rise in threshold between neighbouring test frequencies that counts as a steep edge of hearing loss. */
export const STEEP_RISE_DB = 15;

export type HearingEdge = {
	/** Between the two test frequencies with the steepest rise (geometric mean). */
	frequency: number;
	ear: Ear;
	riseDb: number;
};

/**
 * Where hearing drops off most steeply, in either ear. Tinnitus pitch tends to lie near such an edge,
 * so it is the starting hypothesis for the comparisons. Null when there is no steep drop.
 */
export function hearingEdge(audiogram: Audiogram): HearingEdge | null {
	const {frequencies} = audiogram;
	const loss = (ear: Ear, i: number) => (audiogram[ear][i] ?? NO_RESPONSE_DB) - (NORMAL_SHAPE_DB[frequencies[i]] ?? 0);
	let edge: HearingEdge | null = null;
	for (const ear of EARS) {
		for (let i = 0; i + 1 < frequencies.length; i++) {
			const riseDb = loss(ear, i + 1) - loss(ear, i);
			if (riseDb >= STEEP_RISE_DB && (!edge || riseDb > edge.riseDb)) {
				edge = {frequency: Math.round(Math.sqrt(frequencies[i] * frequencies[i + 1])), ear, riseDb};
			}
		}
	}
	return edge;
}

/** Limits of the level correction, so a gap in the audiogram can't make a sound very loud or inaudible. */
const MAX_BOOST_DB = 30;
const MAX_CUT_DB = 15;
const EQUALIZE_REFERENCE = 1000;

/**
 * Level correction that makes a sound at `frequency` as far above threshold as one at 1 kHz,
 * using the better ear at each frequency (sounds play in both). Interpolated on a log scale between
 * test frequencies, flat beyond them.
 */
export function equalizingOffset(audiogram: Audiogram, frequency: number) {
	const better = audiogram.frequencies.map((_, i) =>
		Math.min(audiogram.left[i] ?? NO_RESPONSE_DB, audiogram.right[i] ?? NO_RESPONSE_DB));
	const at = (f: number) => interpolate(audiogram.frequencies, better, f);
	return clamp(at(frequency) - at(EQUALIZE_REFERENCE), -MAX_CUT_DB, MAX_BOOST_DB);
}

function interpolate(frequencies: number[], values: number[], f: number) {
	if (f <= frequencies[0]) return values[0];
	const last = frequencies.length - 1;
	if (f >= frequencies[last]) return values[last];
	const i = frequencies.findIndex(x => x > f) - 1;
	const t = Math.log2(f / frequencies[i]) / Math.log2(frequencies[i + 1] / frequencies[i]);
	return values[i] + t * (values[i + 1] - values[i]);
}
