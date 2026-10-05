import {fft} from './fft';
import {notchBand} from './scale';

export type NoiseColor = 'white' | 'pink' | 'brown';

export const NOISE_COLORS: NoiseColor[] = ['white', 'pink', 'brown'];

export type NoiseOptions = {
	/** Buffer length in samples, power of two. The buffer loops seamlessly. */
	length: number;
	sampleRate: number;
	color: NoiseColor;
	/** Target RMS of the full-band noise, before the notch removes energy. */
	rms: number;
	notch?: {center: number; widthOctaves: number} | null;
	random?: () => number;
};

/** Content below this frequency is dropped: inaudible on headphones, only wastes headroom. */
export const LOW_CUTOFF = 20;

/** Amplitude of a spectral bin relative to white noise; power falls as 1/f (pink) or 1/f² (brown). */
function colorAmplitude(color: NoiseColor, frequency: number) {
	switch (color) {
		case 'white':
			return 1;
		case 'pink':
			return 1 / Math.sqrt(frequency);
		case 'brown':
			return 1 / frequency;
	}
}

/**
 * Synthesises looped noise in the frequency domain: random phases, magnitudes shaped by colour,
 * bins inside the notch band set to exactly zero, then an inverse FFT.
 * The result is periodic, so it loops without a seam, and the notch is infinitely deep with
 * vertical edges, which a cascade of IIR filters cannot achieve over an octave.
 */
export function synthesizeNoise(options: NoiseOptions): Float32Array {
	const {length: n, sampleRate, color, rms, notch, random = Math.random} = options;
	const re = new Float64Array(n);
	const im = new Float64Array(n);
	const binWidth = sampleRate / n;
	const band = notch ? notchBand(notch.center, notch.widthOctaves) : null;

	let fullPower = 0;
	for (let k = 1; k < n / 2; k++) {
		const frequency = k * binWidth;
		if (frequency < LOW_CUTOFF) continue;

		const amplitude = colorAmplitude(color, frequency);
		fullPower += amplitude * amplitude;
		// Draw the phase even for removed bins, so changing the notch keeps the rest of the noise identical.
		const phase = random() * 2 * Math.PI;
		if (band && frequency >= band.low && frequency <= band.high) continue;

		re[k] = amplitude * Math.cos(phase);
		im[k] = amplitude * Math.sin(phase);
		// Hermitian symmetry keeps the time signal real.
		re[n - k] = re[k];
		im[n - k] = -im[k];
	}

	fft(re, im, true);

	// Parseval: mean square of the time signal = 2 * Σ|X_k|² / n² over positive bins.
	const fullRms = Math.sqrt(2 * fullPower) / n;
	const scale = fullRms > 0 ? rms / fullRms : 0;

	const out = new Float32Array(n);
	for (let i = 0; i < n; i++) out[i] = re[i] * scale;
	return out;
}

/** Smallest power of two holding at least `seconds` of audio. */
export function loopLength(sampleRate: number, seconds: number) {
	return 2 ** Math.ceil(Math.log2(sampleRate * seconds));
}
