import type {NoiseColor} from '@/lib/audio/noise-spectrum';

export const SESSION_PRESETS = [15, 30, 45, 60];
export const DEFAULT_SESSION_MINUTES = 30;
/** Shorter sessions are dropped: they are false starts, not therapy. */
export const MIN_SAVED_SECONDS = 60;

/** Tinnitus loudness 0–10; null when the user skipped the question. */
export type Rating = number | null;

export type TherapySettings = {
	frequency: number;
	notchWidth: number;
	noiseColor: NoiseColor;
	volume: number;
};

export type Session = TherapySettings & {
	id: string;
	/** ISO timestamp. */
	startedAt: string;
	plannedSeconds: number;
	listenedSeconds: number;
	/** Played to the end of the timer, not stopped early. */
	completed: boolean;
	ratingBefore: Rating;
	ratingAfter: Rating;
};

/**
 * Listening time that survives pauses: time banked so far plus the running stretch since `resumedAt`.
 * Built from timestamps, so throttled timers in a background tab don't lose time.
 */
export type SessionClock = {
	plannedMs: number;
	bankedMs: number;
	/** Epoch ms when playback last resumed; null while paused. */
	resumedAt: number | null;
};

export function startClock(plannedMinutes: number, now: number): SessionClock {
	return {plannedMs: plannedMinutes * 60_000, bankedMs: 0, resumedAt: now};
}

export function listenedMs(clock: SessionClock, now: number) {
	const running = clock.resumedAt === null ? 0 : Math.max(0, now - clock.resumedAt);
	return Math.min(clock.plannedMs, clock.bankedMs + running);
}

export function remainingMs(clock: SessionClock, now: number) {
	return clock.plannedMs - listenedMs(clock, now);
}

export function pauseClock(clock: SessionClock, now: number): SessionClock {
	if (clock.resumedAt === null) return clock;
	return {...clock, bankedMs: listenedMs(clock, now), resumedAt: null};
}

export function resumeClock(clock: SessionClock, now: number): SessionClock {
	if (clock.resumedAt !== null) return clock;
	return {...clock, resumedAt: now};
}

/** A session in progress, persisted so that closing the tab doesn't lose it. */
export type SessionDraft = {
	id: string;
	startedAt: string;
	ratingBefore: Rating;
	/** Paused clock as of the last checkpoint; the source of truth after a reload. */
	clock: SessionClock;
	settings: TherapySettings;
	completed: boolean;
};

/** Turns a draft into a saved session, or null if it is too short to keep. */
export function finishSession(draft: SessionDraft, ratingAfter: Rating): Session | null {
	const listenedSeconds = Math.round(listenedMs(draft.clock, 0) / 1000);
	if (listenedSeconds < MIN_SAVED_SECONDS) return null;
	return {
		id: draft.id,
		startedAt: draft.startedAt,
		plannedSeconds: Math.round(draft.clock.plannedMs / 1000),
		listenedSeconds,
		completed: draft.completed,
		...draft.settings,
		ratingBefore: draft.ratingBefore,
		ratingAfter,
	};
}

/** Newest first, one entry per id; `incoming` wins on conflicts. */
export function mergeSessions(existing: Session[], incoming: Session[]) {
	const byId = new Map(existing.map(s => [s.id, s]));
	for (const s of incoming) byId.set(s.id, s);
	return [...byId.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export type SessionStats = {
	todayMinutes: number;
	weekMinutes: number;
	weekSessions: number;
	/** Mean of (after − before) over sessions rated both times; negative means quieter. */
	meanRatingChange: number | null;
	ratedSessions: number;
};

/** "Today" and "the last 7 days" in the user's local time, today included. */
export function sessionStats(sessions: Session[], now: Date): SessionStats {
	const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).getTime();

	let todaySeconds = 0;
	let weekSeconds = 0;
	let weekSessions = 0;
	let changeSum = 0;
	let ratedSessions = 0;
	for (const s of sessions) {
		const started = Date.parse(s.startedAt);
		if (started >= todayStart) todaySeconds += s.listenedSeconds;
		if (started >= weekStart) {
			weekSeconds += s.listenedSeconds;
			weekSessions++;
		}
		if (s.ratingBefore !== null && s.ratingAfter !== null) {
			changeSum += s.ratingAfter - s.ratingBefore;
			ratedSessions++;
		}
	}
	return {
		todayMinutes: Math.round(todaySeconds / 60),
		weekMinutes: Math.round(weekSeconds / 60),
		weekSessions,
		meanRatingChange: ratedSessions ? changeSum / ratedSessions : null,
		ratedSessions,
	};
}
