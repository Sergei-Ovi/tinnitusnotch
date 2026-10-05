import {MAX_FREQUENCY, MIN_FREQUENCY} from '@/lib/audio/scale';
import {formatClock} from '@/lib/format';
import {clampLevel} from './levels';

/**
 * Residual inhibition: after a minute of noise at the tinnitus pitch, tinnitus is often quieter or gone
 * for a while. Seeing that is a sign the pitch is right; no effect at all hints the match may be off.
 */
export const INHIBITION_SECONDS = 60;
/** Width of the noise band, in octaves. */
export const INHIBITION_BANDWIDTH = 0.5;
/** The noise plays this far above the tinnitus loudness match. */
const ABOVE_LOUDNESS_DB = 10;
/** Without a loudness match, this far above the level the comparisons were heard at. */
const ABOVE_COMPARISON_DB = 5;
/** Timing the after-effect stops here; longer is recorded as this. */
export const MAX_TIMED_SECONDS = 300;
/** Alternatives offered when there is no effect, in octaves either way. */
const ALTERNATIVE_OCTAVES = 0.5;

export type InhibitionEffect = 'gone' | 'quieter' | 'none' | 'louder';
export const INHIBITION_EFFECTS: InhibitionEffect[] = ['gone', 'quieter', 'none', 'louder'];

export type InhibitionTrial = {
	frequency: number;
	effect: InhibitionEffect;
	/** How long the tinnitus stayed quieter, in seconds; null if there was no effect or it wasn't timed. */
	seconds: number | null;
};

export function hasEffect(trial: Pick<InhibitionTrial, 'effect'>) {
	return trial.effect === 'gone' || trial.effect === 'quieter';
}

/** Where the noise level starts: above the loudness match if there is one, else above the comparisons. */
export function inhibitionLevel(loudnessDb: number | null, comparisonDb: number) {
	return clampLevel(loudnessDb === null ? comparisonDb + ABOVE_COMPARISON_DB : loudnessDb + ABOVE_LOUDNESS_DB);
}

export function inhibitionTrial(frequency: number, effect: InhibitionEffect, seconds: number | null = null): InhibitionTrial {
	return {
		frequency,
		effect,
		seconds: hasEffect({effect}) && seconds !== null ? Math.min(Math.round(seconds), MAX_TIMED_SECONDS) : null,
	};
}

/** Half an octave below and above, for a second try when the match showed no effect. */
export function alternativeFrequencies(frequency: number) {
	return [-ALTERNATIVE_OCTAVES, ALTERNATIVE_OCTAVES]
		.map(octaves => Math.round(frequency * 2 ** octaves))
		.filter(f => f >= MIN_FREQUENCY && f <= MAX_FREQUENCY);
}

/** "quieter for 40 s", "gone for 2:05", "no change". */
export function describeInhibition(t: InhibitionTrial) {
	const effect = {gone: 'gone', quieter: 'quieter', none: 'no change', louder: 'louder'}[t.effect];
	if (t.seconds === null) return effect;
	const time = t.seconds < 60 ? `${t.seconds} s` : formatClock(t.seconds * 1000);
	return `${effect} for ${t.seconds >= MAX_TIMED_SECONDS ? `${time} or more` : time}`;
}
