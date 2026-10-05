import {NOISE_COLORS} from '@/lib/audio/noise-spectrum';
import type {Audiogram} from '@/lib/matching/audiometry';
import {INHIBITION_EFFECTS, type InhibitionTrial} from '@/lib/matching/inhibition';
import {type MatchResult, TINNITUS_TYPES} from '@/lib/matching/wizard';
import type {Rating, Session, TherapySettings} from './session';

export const BACKUP_APP = 'tinnitusnotch';
export const BACKUP_VERSION = 1;

export type Backup = {
	app: typeof BACKUP_APP;
	version: typeof BACKUP_VERSION;
	exportedAt: string;
	settings: TherapySettings;
	sessions: Session[];
	/** Frequency matchings; absent in backups made before the matching wizard. */
	matches: MatchResult[];
};

export function createBackup(settings: TherapySettings, sessions: Session[], matches: MatchResult[], now: Date): Backup {
	return {app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), settings, sessions, matches};
}

export type ParseResult = {ok: true; backup: Backup} | {ok: false; error: string};

/** Validates an exported file; rejects it whole rather than importing part of a damaged file. */
export function parseBackup(text: string): ParseResult {
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		return {ok: false, error: 'The file is not valid JSON.'};
	}
	if (!isRecord(data) || data.app !== BACKUP_APP) {
		return {ok: false, error: 'This is not a Tinnitus Notch backup.'};
	}
	if (data.version !== BACKUP_VERSION) {
		return {ok: false, error: `Unsupported backup version: ${String(data.version)}.`};
	}
	if (!isSettings(data.settings)) {
		return {ok: false, error: 'The backup has invalid settings.'};
	}
	if (!Array.isArray(data.sessions)) {
		return {ok: false, error: 'The backup has no session list.'};
	}
	const bad = data.sessions.findIndex(s => !isSession(s));
	if (bad >= 0) {
		return {ok: false, error: `Session #${bad + 1} in the backup is invalid.`};
	}
	const matches = data.matches ?? [];
	if (!Array.isArray(matches)) {
		return {ok: false, error: 'The backup has an invalid match list.'};
	}
	const badMatch = matches.findIndex(m => !isMatch(m));
	if (badMatch >= 0) {
		return {ok: false, error: `Frequency match #${badMatch + 1} in the backup is invalid.`};
	}
	return {
		ok: true,
		backup: {
			app: BACKUP_APP,
			version: BACKUP_VERSION,
			exportedAt: String(data.exportedAt ?? ''),
			settings: data.settings,
			sessions: data.sessions,
			matches,
		},
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function isRating(value: unknown): value is Rating {
	return value === null || (Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 10);
}

function isSettings(value: unknown): value is TherapySettings {
	return isRecord(value)
		&& isNumber(value.frequency) && value.frequency > 0
		&& isNumber(value.notchWidth) && value.notchWidth > 0
		&& NOISE_COLORS.includes(value.noiseColor as never)
		&& isNumber(value.volume);
}

function isSession(value: unknown): value is Session {
	return isRecord(value)
		&& typeof value.id === 'string' && value.id.length > 0
		&& typeof value.startedAt === 'string' && !Number.isNaN(Date.parse(value.startedAt))
		&& isNumber(value.plannedSeconds) && value.plannedSeconds >= 0
		&& isNumber(value.listenedSeconds) && value.listenedSeconds >= 0
		&& typeof value.completed === 'boolean'
		&& isRating(value.ratingBefore)
		&& isRating(value.ratingAfter)
		&& isSettings(value);
}

function isLevel(value: unknown) {
	return value === null || (isNumber(value) && value <= 0);
}

function isMatch(value: unknown): value is MatchResult {
	return isRecord(value)
		&& typeof value.id === 'string' && value.id.length > 0
		&& typeof value.date === 'string' && !Number.isNaN(Date.parse(value.date))
		&& TINNITUS_TYPES.includes(value.type as never)
		&& isNumber(value.frequency) && value.frequency > 0
		&& Array.isArray(value.estimates) && value.estimates.every(e => isNumber(e) && e > 0)
		&& isNumber(value.spreadOctaves) && value.spreadOctaves >= 0
		&& typeof value.reliable === 'boolean'
		&& isLevel(value.thresholdDb)
		&& isLevel(value.loudnessDb)
		&& (value.audiogram === undefined || value.audiogram === null || isAudiogram(value.audiogram))
		&& (value.inhibition === undefined || (Array.isArray(value.inhibition) && value.inhibition.every(isInhibitionTrial)));
}

function isInhibitionTrial(value: unknown): value is InhibitionTrial {
	return isRecord(value)
		&& isNumber(value.frequency) && value.frequency > 0
		&& INHIBITION_EFFECTS.includes(value.effect as never)
		&& (value.seconds === null || (isNumber(value.seconds) && value.seconds >= 0));
}

function isAudiogram(value: unknown): value is Audiogram {
	if (!isRecord(value) || !Array.isArray(value.frequencies) || !value.frequencies.length) return false;
	const {frequencies, left, right, catchTrials} = value;
	return frequencies.every((f, i) => isNumber(f) && f > 0 && (i === 0 || f > frequencies[i - 1]))
		&& [left, right].every(t => Array.isArray(t) && t.length === frequencies.length && t.every(isLevel))
		&& (catchTrials === undefined || isCatchTrials(catchTrials));
}

function isCatchTrials(value: unknown) {
	const isCount = (n: unknown) => Number.isInteger(n) && (n as number) >= 0;
	return isRecord(value) && isCount(value.presented) && isCount(value.falseAlarms)
		&& (value.falseAlarms as number) <= (value.presented as number);
}
