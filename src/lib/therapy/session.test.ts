import {describe, expect, it} from 'vitest';
import {
	finishSession,
	listenedMs,
	mergeSessions,
	pauseClock,
	remainingMs,
	resumeClock,
	type Session,
	type SessionDraft,
	sessionStats,
	startClock,
} from './session';

const settings = {frequency: 4000, notchWidth: 1, noiseColor: 'pink' as const, volume: 30};

function session(overrides: Partial<Session>): Session {
	return {
		id: 'x',
		startedAt: new Date(2026, 9, 5, 12).toISOString(),
		plannedSeconds: 1800,
		listenedSeconds: 1800,
		completed: true,
		...settings,
		ratingBefore: null,
		ratingAfter: null,
		...overrides,
	};
}

describe('session clock', () => {
	it('counts down while running', () => {
		const clock = startClock(30, 1000);
		expect(listenedMs(clock, 1000)).toBe(0);
		expect(remainingMs(clock, 61_000)).toBe(29 * 60_000);
	});

	it('does not count paused time', () => {
		let clock = startClock(15, 0);
		clock = pauseClock(clock, 10_000);
		expect(listenedMs(clock, 500_000)).toBe(10_000);
		clock = resumeClock(clock, 500_000);
		expect(listenedMs(clock, 505_000)).toBe(15_000);
	});

	it('ignores repeated pause and resume', () => {
		const paused = pauseClock(startClock(15, 0), 10_000);
		expect(pauseClock(paused, 20_000)).toBe(paused);
		const running = resumeClock(paused, 30_000);
		expect(resumeClock(running, 40_000)).toBe(running);
	});

	it('stops at the planned length', () => {
		const clock = startClock(15, 0);
		expect(listenedMs(clock, 99 * 60_000)).toBe(15 * 60_000);
		expect(remainingMs(clock, 99 * 60_000)).toBe(0);
	});
});

describe('finishing a session', () => {
	const draft = (listened: number): SessionDraft => ({
		id: 'a',
		startedAt: '2026-10-05T10:00:00.000Z',
		ratingBefore: 6,
		clock: {plannedMs: 30 * 60_000, bankedMs: listened, resumedAt: null},
		settings,
		completed: false,
	});

	it('keeps settings, ratings and listening time', () => {
		expect(finishSession(draft(20 * 60_000), 4)).toEqual({
			id: 'a',
			startedAt: '2026-10-05T10:00:00.000Z',
			plannedSeconds: 1800,
			listenedSeconds: 1200,
			completed: false,
			...settings,
			ratingBefore: 6,
			ratingAfter: 4,
		});
	});

	it('drops sessions shorter than a minute', () => {
		expect(finishSession(draft(59_000), null)).toBeNull();
		expect(finishSession(draft(60_000), null)).not.toBeNull();
	});
});

describe('merging sessions', () => {
	it('deduplicates by id and sorts newest first', () => {
		const a = session({id: 'a', startedAt: '2026-10-01T10:00:00.000Z'});
		const b = session({id: 'b', startedAt: '2026-10-03T10:00:00.000Z'});
		const bImported = {...b, ratingAfter: 3};
		const c = session({id: 'c', startedAt: '2026-10-02T10:00:00.000Z'});
		expect(mergeSessions([a, b], [bImported, c])).toEqual([bImported, c, a]);
	});
});

describe('session stats', () => {
	const now = new Date(2026, 9, 5, 18);

	it('sums listening time for today and the last 7 days', () => {
		const stats = sessionStats([
			session({id: '1', startedAt: new Date(2026, 9, 5, 9).toISOString(), listenedSeconds: 1800}),
			session({id: '2', startedAt: new Date(2026, 9, 4, 23).toISOString(), listenedSeconds: 900}),
			session({id: '3', startedAt: new Date(2026, 8, 29, 0, 30).toISOString(), listenedSeconds: 600}),
			session({id: '4', startedAt: new Date(2026, 8, 28, 23).toISOString(), listenedSeconds: 3600}),
		], now);
		expect(stats.todayMinutes).toBe(30);
		expect(stats.weekMinutes).toBe(55);
		expect(stats.weekSessions).toBe(3);
	});

	it('averages the rating change only over sessions rated twice', () => {
		const stats = sessionStats([
			session({id: '1', ratingBefore: 6, ratingAfter: 4}),
			session({id: '2', ratingBefore: 5, ratingAfter: 5}),
			session({id: '3', ratingBefore: 7, ratingAfter: null}),
		], now);
		expect(stats.meanRatingChange).toBe(-1);
		expect(stats.ratedSessions).toBe(2);
	});

	it('has no rating change without rated sessions', () => {
		expect(sessionStats([], now).meanRatingChange).toBeNull();
	});
});
