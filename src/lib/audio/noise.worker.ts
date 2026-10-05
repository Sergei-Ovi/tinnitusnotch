import {synthesizeNoise, type NoiseOptions} from './noise-spectrum';

export type NoiseRequest = {id: number; options: Omit<NoiseOptions, 'random'>};
export type NoiseResponse = {id: number; samples: Float32Array};

self.onmessage = (event: MessageEvent<NoiseRequest>) => {
	const {id, options} = event.data;
	const samples = synthesizeNoise(options);
	(self as unknown as Worker).postMessage({id, samples} satisfies NoiseResponse, [samples.buffer]);
};
