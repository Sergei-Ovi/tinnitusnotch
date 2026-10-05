import {NOISE_COLORS} from '@/lib/audio/noise-spectrum';
import type {Rating, Session, TherapySettings} from './session';

export const BACKUP_APP = 'tinnitusnotch';
export const BACKUP_VERSION = 1;

export type Backup = {
	app: typeof BACKUP_APP;
	version: typeof BACKUP_VERSION;
	exportedAt: string;
	settings: TherapySettings;
	sessions: Session[];
};

export function createBackup(settings: TherapySettings, sessions: Session[], now: Date): Backup {
	return {app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), settings, sessions};
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
	return {
		ok: true,
		backup: {
			app: BACKUP_APP,
			version: BACKUP_VERSION,
			exportedAt: String(data.exportedAt ?? ''),
			settings: data.settings,
			sessions: data.sessions,
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
