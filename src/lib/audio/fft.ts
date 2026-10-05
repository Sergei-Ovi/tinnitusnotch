/**
 * In-place iterative radix-2 FFT. `re` and `im` must have the same power-of-two length.
 * With `inverse`, computes the inverse transform including the 1/N scaling.
 */
export function fft(re: Float64Array, im: Float64Array, inverse = false) {
	const n = re.length;
	if (n !== im.length || (n & (n - 1)) !== 0) {
		throw new Error('FFT length must be a power of two and equal for re/im');
	}

	for (let i = 1, j = 0; i < n; i++) {
		let bit = n >> 1;
		for (; j & bit; bit >>= 1) j ^= bit;
		j ^= bit;
		if (i < j) {
			[re[i], re[j]] = [re[j], re[i]];
			[im[i], im[j]] = [im[j], im[i]];
		}
	}

	const sign = inverse ? 1 : -1;
	for (let size = 2; size <= n; size <<= 1) {
		const half = size >> 1;
		const angle = sign * 2 * Math.PI / size;
		const wRe = Math.cos(angle);
		const wIm = Math.sin(angle);
		for (let start = 0; start < n; start += size) {
			let curRe = 1;
			let curIm = 0;
			for (let k = 0; k < half; k++) {
				const a = start + k;
				const b = a + half;
				const tRe = re[b] * curRe - im[b] * curIm;
				const tIm = re[b] * curIm + im[b] * curRe;
				re[b] = re[a] - tRe;
				im[b] = im[a] - tIm;
				re[a] += tRe;
				im[a] += tIm;
				const nextRe = curRe * wRe - curIm * wIm;
				curIm = curRe * wIm + curIm * wRe;
				curRe = nextRe;
			}
		}
	}

	if (inverse) {
		for (let i = 0; i < n; i++) {
			re[i] /= n;
			im[i] /= n;
		}
	}
}
