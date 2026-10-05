import {describe, expect, it} from 'vitest';
import {createBackup, parseBackup} from './backup';
import type {Session} from './session';
import type {MatchResult} from '@/lib/matching/wizard';

const settings = {frequency: 4000, notchWidth: 1, noiseColor: 'pink' as const, volume: 30};
const session: Session = {
	id: 'a',
	startedAt: '2026-10-05T10:00:00.000Z',
	plannedSeconds: 1800,
	listenedSeconds: 1800,
	completed: true,
	...settings,
	ratingBefore: 6,
	ratingAfter: null,
};

const match: MatchResult = {
	id: 'm',
	date: '2026-10-05T09:00:00.000Z',
	type: 'tonal',
	frequency: 6200,
	estimates: [6000, 6400, 6100],
	spreadOctaves: 0.09,
	reliable: true,
	thresholdDb: -60,
	loudnessDb: null,
};

const exported = () => JSON.parse(JSON.stringify(createBackup(settings, [session], [match], new Date('2026-10-05T12:00:00Z'))));

describe('backup', () => {
	it('round-trips through JSON', () => {
		const backup = createBackup(settings, [session], [match], new Date('2026-10-05T12:00:00Z'));
		expect(parseBackup(JSON.stringify(backup))).toEqual({ok: true, backup});
	});

	it('rejects non-JSON and foreign files', () => {
		expect(parseBackup('not json').ok).toBe(false);
		expect(parseBackup('[]').ok).toBe(false);
		expect(parseBackup(JSON.stringify({app: 'other', version: 1})).ok).toBe(false);
	});

	it('rejects unknown versions', () => {
		expect(parseBackup(JSON.stringify({...exported(), version: 2}))).toEqual({
			ok: false,
			error: 'Unsupported backup version: 2.',
		});
	});

	it('rejects the whole file if one session is damaged', () => {
		const data = exported();
		data.sessions.push({...session, id: 'b', ratingAfter: 11});
		expect(parseBackup(JSON.stringify(data))).toEqual({ok: false, error: 'Session #2 in the backup is invalid.'});
	});

	it('reads backups made before frequency matches existed', () => {
		const {matches, ...old} = exported();
		const result = parseBackup(JSON.stringify(old));
		expect(result.ok && result.backup.matches).toEqual([]);
	});

	it('rejects the whole file if one match is damaged', () => {
		const data = exported();
		data.matches.push({...match, id: 'n', type: 'buzzing'});
		expect(parseBackup(JSON.stringify(data))).toEqual({
			ok: false,
			error: 'Frequency match #2 in the backup is invalid.',
		});
	});

	it('keeps the hearing test with a match, and reads matches made without one', () => {
		const audiogram = {frequencies: [500, 1000], left: [-60, null], right: [-55, -50]};
		const backup = createBackup(settings, [], [{...match, audiogram}, {...match, id: 'old'}], new Date());
		const result = parseBackup(JSON.stringify(backup));
		expect(result.ok && result.backup.matches.map(m => m.audiogram)).toEqual([audiogram, undefined]);
	});

	it('rejects a damaged hearing test', () => {
		const data = exported();
		data.matches[0].audiogram = {frequencies: [1000, 500], left: [-60, -60], right: [-60, -60]};
		expect(parseBackup(JSON.stringify(data)).ok).toBe(false);
		data.matches[0].audiogram = {frequencies: [500, 1000], left: [-60], right: [-60, -60]};
		expect(parseBackup(JSON.stringify(data)).ok).toBe(false);
	});

	it('keeps residual inhibition checks and rejects damaged ones', () => {
		const inhibition = [{frequency: 6200, effect: 'quieter' as const, seconds: 40}, {frequency: 8768, effect: 'none' as const, seconds: null}];
		const backup = createBackup(settings, [], [{...match, inhibition}], new Date());
		const result = parseBackup(JSON.stringify(backup));
		expect(result.ok && result.backup.matches[0].inhibition).toEqual(inhibition);
		const data = exported();
		data.matches[0].inhibition = [{frequency: 6200, effect: 'better', seconds: null}];
		expect(parseBackup(JSON.stringify(data)).ok).toBe(false);
	});

	it('rejects invalid settings', () => {
		expect(parseBackup(JSON.stringify({...exported(), settings: {...settings, noiseColor: 'blue'}})).ok).toBe(false);
	});
});
