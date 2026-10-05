import {store} from '@/app/store';
import {
	clamp,
	frequencyToPosition,
	notchBand,
	positionToFrequency,
	positionToFrequencyExact,
} from '@/lib/audio/scale';
import createRAF from '@solid-primitives/raf';
import {batch, createSignal, For, onCleanup, onMount, Show} from 'solid-js';

const AXIS_FREQUENCIES = [125, 250, 500, 1000, 2000, 4000, 8000, 16000];
/** Band power in dBFS mapped to the canvas height. */
const SPECTRUM_FLOOR_DB = -100;
const SPECTRUM_RANGE_DB = 80;

/**
 * Live output spectrum on the same logarithmic axis as the frequency slider, with the notch band.
 * When `interactive`, dragging sets frequency (x) and volume (y).
 */
export function Spectrum(props: {interactive?: boolean; class?: string}) {
	let canvas!: HTMLCanvasElement;
	let canvasContext: CanvasRenderingContext2D;
	const [canvasWidth, setCanvasWidth] = createSignal(0);
	const [canvasHeight, setCanvasHeight] = createSignal(0);

	onMount(() => {
		canvasContext = canvas.getContext('2d')!;
		const observer = new ResizeObserver(() => {
			const ratio = window.devicePixelRatio;
			canvas.width = canvas.clientWidth * ratio;
			canvas.height = canvas.clientHeight * ratio;
			setCanvasWidth(canvas.clientWidth);
			setCanvasHeight(canvas.clientHeight);
		});
		observer.observe(canvas);
		onCleanup(() => observer.disconnect());
	});

	const [, start, stop] = createRAF(() => {
		if (!canvasContext) return;
		const {audio} = store;

		const {width, height} = canvas;
		canvasContext.clearRect(0, 0, width, height);
		canvasContext.fillStyle = getComputedStyle(canvas).getPropertyValue('--primary');

		// Each bar sums the power of the analyser bins under it, so pink noise (equal power per octave)
		// draws flat, as it sounds.
		const data = audio.getFrequencyData();
		const binWidth = audio.sampleRate / 2 / data.length;
		const barWidth = 3 * window.devicePixelRatio;
		for (let x = 0; x < width; x += barWidth) {
			const from = Math.round(positionToFrequencyExact(x / width) / binWidth);
			const to = Math.max(from, Math.round(positionToFrequencyExact((x + barWidth) / width) / binWidth) - 1);
			let power = 0;
			for (let bin = from; bin <= to && bin < data.length; bin++) power += 10 ** (data[bin] / 10);

			const level = (10 * Math.log10(power) - SPECTRUM_FLOOR_DB) / SPECTRUM_RANGE_DB;
			const barHeight = clamp(level, 0, 1) * height;
			canvasContext.fillRect(x, height - barHeight, barWidth - 1, barHeight);
		}
	});
	start();
	onCleanup(stop);

	function onPointer(e: PointerEvent) {
		if (!props.interactive) return;
		const target = e.currentTarget as HTMLElement;
		if (e.type === 'pointerdown') {
			e.preventDefault();
			target.setPointerCapture(e.pointerId);
		}
		if (!target.hasPointerCapture(e.pointerId)) return;

		const rect = canvas.getBoundingClientRect();
		batch(() => {
			store.setFrequency(positionToFrequency((e.clientX - rect.left) / rect.width));
			store.setVolume(100 - (e.clientY - rect.top) / rect.height * 100);
		});
	}

	const xOf = (f: number) => frequencyToPosition(f) * canvasWidth();
	const band = () => notchBand(store.frequency(), store.notchWidth());

	return (
		<div class={`relative touch-none select-none ${props.class ?? ''}`}
		     onPointerDown={onPointer} onPointerMove={onPointer}>
			<canvas class="h-full w-full rounded-xl border" ref={canvas}/>
			<Show when={store.playState() === 'noise'}>
				<div class="pointer-events-none absolute inset-y-0 bg-primary/10"
				     style={{
					     left: `${xOf(band().low)}px`,
					     width: `${xOf(band().high) - xOf(band().low)}px`,
				     }}/>
			</Show>
			<For each={AXIS_FREQUENCIES}>{f =>
				<span class="pointer-events-none absolute bottom-1 -translate-x-1/2 text-[10px] text-muted-foreground"
				      style={{left: `${xOf(f)}px`}}>
					{f >= 1000 ? `${f / 1000}k` : f}
				</span>
			}</For>
			<Show when={props.interactive}>
				<div class="pointer-events-none absolute size-4 -translate-1/2 rounded-full border-2 border-primary bg-background"
				     style={{
					     left: `${xOf(store.frequency())}px`,
					     top: `${canvasHeight() * (1 - store.volume() / 100)}px`,
				     }}/>
			</Show>
		</div>
	);
}
