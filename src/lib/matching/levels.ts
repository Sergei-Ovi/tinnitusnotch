import {clamp} from '@/lib/audio/scale';

/**
 * Levels are in dB relative to the hard output ceiling, so always ≤ 0.
 * The calibration tone sits at {@link REFERENCE_DB}; the user sets the system volume around it.
 */
export const REFERENCE_DB = -30;
export const MIN_LEVEL_DB = -90;
export const MAX_LEVEL_DB = 0;

export function clampLevel(db: number) {
	return clamp(db, MIN_LEVEL_DB, MAX_LEVEL_DB);
}
