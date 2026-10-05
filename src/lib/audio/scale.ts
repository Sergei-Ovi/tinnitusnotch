export const MIN_FREQUENCY = 100;
export const MAX_FREQUENCY = 16000;

/** Slider positions for the logarithmic frequency scale. */
export const FREQUENCY_STEPS = 1000;

/**
 * Peak amplitude of the output signal at 100% volume.
 * Noise is normalised to the same RMS as a sine of this peak, so both sources are equally loud.
 */
export const MAX_SINE_AMPLITUDE = 0.25;
export const MAX_NOISE_RMS = MAX_SINE_AMPLITUDE / Math.SQRT2;

/** Volume range covered by the 1–100 slider, in dB below the ceiling. */
export const VOLUME_RANGE_DB = 60;

export function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max);
}

export function frequencyToPosition(frequency: number) {
	const f = clamp(frequency, MIN_FREQUENCY, MAX_FREQUENCY);
	return Math.log(f / MIN_FREQUENCY) / Math.log(MAX_FREQUENCY / MIN_FREQUENCY);
}

export function positionToFrequency(position: number) {
	return Math.round(positionToFrequencyExact(clamp(position, 0, 1)));
}

/** Unrounded, unclamped inverse of {@link frequencyToPosition}, for drawing. */
export function positionToFrequencyExact(position: number) {
	return MIN_FREQUENCY * (MAX_FREQUENCY / MIN_FREQUENCY) ** position;
}

/** Shifts a frequency by a number of octaves (1/12 = one semitone), staying in range. */
export function shiftOctaves(frequency: number, octaves: number) {
	return Math.round(clamp(frequency * 2 ** octaves, MIN_FREQUENCY, MAX_FREQUENCY));
}

/** Maps the 0–100 volume slider to a linear gain in [0, 1]; 0 is silence, 100 is the ceiling. */
export function volumeToGain(volume: number) {
	const v = clamp(volume, 0, 100);
	if (v === 0) return 0;
	return 10 ** ((v - 100) / 100 * VOLUME_RANGE_DB / 20);
}

/** Edges of a band `widthOctaves` wide, centred (geometrically) on `center`. */
export function notchBand(center: number, widthOctaves: number) {
	return {
		low: center * 2 ** (-widthOctaves / 2),
		high: center * 2 ** (widthOctaves / 2),
	};
}
