import {describe, expect, it} from 'vitest';
import {fft} from './fft';
import {loopLength, synthesizeNoise, type NoiseColor} from './noise-spectrum';

const SAMPLE_RATE = 48000;
const N = 2 ** 15;

/** Deterministic PRNG (mulberry32) so spectra are reproducible. */
function seeded(seed: number) {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function rms(signal: Float32Array) {
	let sum = 0;
	for (const v of signal) sum += v * v;
	return Math.sqrt(sum / signal.length);
}

/** Power of `signal` between `low` and `high` Hz. */
function bandPower(signal: Float32Array, low: number, high: number) {
	const re = Float64Array.from(signal);
	const im = new Float64Array(signal.length);
	fft(re, im);
	const binWidth = SAMPLE_RATE / signal.length;
	let sum = 0;
	for (let k = Math.ceil(low / binWidth); k <= Math.floor(high / binWidth); k++) {
		sum += re[k] ** 2 + im[k] ** 2;
	}
	return sum;
}

function noise(color: NoiseColor, notch?: {center: number; widthOctaves: number}) {
	return synthesizeNoise({
		length: N,
		sampleRate: SAMPLE_RATE,
		color,
		rms: 0.1,
		notch,
		random: seeded(42),
	});
}

const db = (ratio: number) => 10 * Math.log10(ratio);

describe('fft', () => {
	it('round-trips a signal', () => {
		const original = Float64Array.from({length: 64}, (_, i) => Math.sin(i * 0.3) + (i % 5));
		const re = original.slice();
		const im = new Float64Array(64);
		fft(re, im);
		fft(re, im, true);
		for (let i = 0; i < 64; i++) {
			expect(re[i]).toBeCloseTo(original[i], 10);
			expect(im[i]).toBeCloseTo(0, 10);
		}
	});

	it('puts a cosine into its bin', () => {
		const re = Float64Array.from({length: 32}, (_, i) => Math.cos(2 * Math.PI * 4 * i / 32));
		const im = new Float64Array(32);
		fft(re, im);
		expect(re[4]).toBeCloseTo(16, 10);
		expect(re[28]).toBeCloseTo(16, 10);
		expect(Math.abs(re[5])).toBeLessThan(1e-9);
	});

	it('rejects non power-of-two lengths', () => {
		expect(() => fft(new Float64Array(6), new Float64Array(6))).toThrow();
	});
});

describe('synthesizeNoise', () => {
	it.each<NoiseColor>(['white', 'pink', 'brown'])('normalises %s noise to the target RMS', color => {
		expect(rms(noise(color))).toBeCloseTo(0.1, 6);
	});

	it('removes the notch band at least 40 dB, with full level right outside it', () => {
		const signal = noise('pink', {center: 4000, widthOctaves: 1});
		const reference = noise('pink');
		// Band is 2828–5657 Hz.
		const inside = bandPower(signal, 2900, 5500);
		const insideReference = bandPower(reference, 2900, 5500);
		expect(db(inside / insideReference)).toBeLessThan(-40);

		const below = bandPower(signal, 2000, 2800) / bandPower(reference, 2000, 2800);
		const above = bandPower(signal, 5700, 8000) / bandPower(reference, 5700, 8000);
		expect(db(below)).toBeCloseTo(0, 6);
		expect(db(above)).toBeCloseTo(0, 6);
	});

	it('keeps the level outside the notch independent of its width', () => {
		const narrow = noise('pink', {center: 4000, widthOctaves: 0.25});
		const wide = noise('pink', {center: 4000, widthOctaves: 1});
		expect(db(bandPower(narrow, 500, 1000) / bandPower(wide, 500, 1000))).toBeCloseTo(0, 6);
	});

	it.each<[NoiseColor, number]>([
		['white', 3],
		['pink', 0],
		['brown', -3],
	])('%s noise changes by %d dB per octave', (color, slope) => {
		const signal = noise(color);
		const low = bandPower(signal, 1000, 2000);
		const high = bandPower(signal, 2000, 4000);
		expect(db(high / low)).toBeCloseTo(slope, 0);
	});

	// Float32 rounding leaves a residue around -190 dB.
	it('has no content below 20 Hz', () => {
		const signal = noise('brown');
		expect(bandPower(signal, 1, 19) / bandPower(signal, 20, 20000)).toBeLessThan(1e-15);
	});
});

describe('loopLength', () => {
	it('returns the next power of two', () => {
		expect(loopLength(48000, 20)).toBe(2 ** 20);
		expect(loopLength(44100, 20)).toBe(2 ** 20);
	});
});
