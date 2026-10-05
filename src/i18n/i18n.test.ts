import {inhibitionTrial} from '@/lib/matching/inhibition';
import {describe, expect, it} from 'vitest';
import {en} from './en';
import {ru} from './ru';

const check = (effect: Parameters<typeof inhibitionTrial>[1], seconds?: number) => inhibitionTrial(4000, effect, seconds ?? null);

describe('messages', () => {
	it('describe an after-effect check with how long it lasted', () => {
		expect(en.format.inhibition(check('quieter', 40))).toBe('quieter for 40 s');
		expect(en.format.inhibition(check('gone', 125))).toBe('gone for 2:05');
		expect(en.format.inhibition(check('gone', 900))).toBe('gone for 5:00 or more');
		expect(en.format.inhibition(check('none'))).toBe('no change');
		expect(ru.format.inhibition(check('quieter', 40))).toBe('тише на 40 с');
		expect(ru.format.inhibition(check('gone', 900))).toBe('пропал на 5:00 и дольше');
	});

	it('format frequencies with the local decimal separator', () => {
		expect(en.format.frequency(1500)).toBe('1.5 kHz');
		expect(en.format.frequency(440)).toBe('440 Hz');
		expect(ru.format.frequency(1500)).toBe('1,5 кГц');
	});

	it('use Russian plural forms', () => {
		expect([1, 2, 5, 21].map(ru.trend.sessions)).toEqual(['1 сеанс', '2 сеанса', '5 сеансов', '21 сеанс']);
		expect(ru.format.semitones(1.5)).toBe('+1,5 полутона');
		expect(ru.format.semitones(-5)).toBe('−5 полутонов');
		expect(en.format.semitones(1)).toBe('+1 semitone');
	});

	it('word backup errors', () => {
		expect(en.backupErrors.session({index: 1})).toBe('Session #2 in the backup is invalid.');
		expect(ru.backupErrors.version({version: '2'})).toBe('Неподдерживаемая версия резервной копии: 2.');
	});
});
