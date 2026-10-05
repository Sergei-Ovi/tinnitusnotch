import {Button} from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import {
	Slider,
	SliderFill,
	SliderLabel,
	SliderThumb,
	SliderTrack,
	SliderValueLabel,
} from '@/components/ui/slider';
import {
	AudioGenerator,
	type PlayState,
} from '@/lib/audio';
import {NOISE_COLORS, type NoiseColor} from '@/lib/audio/noise-spectrum';
import {
	clamp,
	FREQUENCY_STEPS,
	frequencyToPosition,
	MAX_FREQUENCY,
	MIN_FREQUENCY,
	notchBand,
	positionToFrequency,
	positionToFrequencyExact,
	shiftOctaves,
} from '@/lib/audio/scale';
import createRAF from '@solid-primitives/raf';
import {makePersisted} from '@solid-primitives/storage';
import {
	batch,
	createEffect,
	createResource,
	createSignal,
	For,
	onCleanup,
	onMount,
	Show,
} from 'solid-js';

const AXIS_FREQUENCIES = [125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const DEFAULT_VOLUME = 30;
/** Spectrum view: band power in dBFS mapped to the canvas height. */
const SPECTRUM_FLOOR_DB = -100;
const SPECTRUM_RANGE_DB = 80;

function formatFrequency(frequency: number) {
	return frequency >= 1000 ? `${+(frequency / 1000).toFixed(2)} kHz` : `${frequency} Hz`;
}

export function IndexPage() {
	const [frequency, setFrequencyRaw] = makePersisted(createSignal(4000), {name: 'frequency'});
	const setFrequency = (value: number) =>
		setFrequencyRaw(Math.round(clamp(value, MIN_FREQUENCY, MAX_FREQUENCY)));
	// Stored under a new key: the old `volume` value meant a raw gain and is not compatible.
	const [volume, setVolume] = makePersisted(createSignal(DEFAULT_VOLUME), {name: 'volume-level'});
	const [notchWidth, setNotchWidth] = makePersisted(createSignal(1), {name: 'notch-width'});
	const [noiseColor, setNoiseColor] = makePersisted(createSignal<NoiseColor>('pink'), {name: 'noise-color'});

	const [state, setState] = createSignal<PlayState>('idle');

	const [audio] = createResource(() => new AudioGenerator({
		volume: volume(),
		frequency: frequency(),
		notchWidth: notchWidth(),
		noiseColor: noiseColor(),
	}));

	createEffect(() => audio()?.setVolume(volume()));
	createEffect(() => audio()?.setFrequency(frequency()));
	createEffect(() => audio()?.setNotchWidth(notchWidth()));
	createEffect(() => audio()?.setNoiseColor(noiseColor()));
	createEffect(() => audio()?.setState(state()));

	const toggle = (target: PlayState) => setState(current => current === target ? 'idle' : target);

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

	const [, start] = createRAF(() => {
		const a = audio();
		if (!canvasContext || !a) return;

		const {width, height} = canvas;
		canvasContext.clearRect(0, 0, width, height);
		canvasContext.fillStyle = getComputedStyle(canvas).getPropertyValue('--primary');

		// Spectrum on the same logarithmic axis as the frequency slider. Each bar sums the power of the
		// analyser bins under it, so pink noise (equal power per octave) draws flat, as it sounds.
		const data = a.getFrequencyData();
		const binWidth = a.sampleRate / 2 / data.length;
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

	function onPointer(e: PointerEvent) {
		const target = e.currentTarget as HTMLElement;
		if (e.type === 'pointerdown') {
			e.preventDefault();
			target.setPointerCapture(e.pointerId);
		}
		if (!target.hasPointerCapture(e.pointerId)) return;

		const rect = canvas.getBoundingClientRect();
		batch(() => {
			setFrequency(positionToFrequency((e.clientX - rect.left) / rect.width));
			setVolume(Math.round(clamp(100 - (e.clientY - rect.top) / rect.height * 100, 0, 100)));
		});
	}

	const xOf = (f: number) => frequencyToPosition(f) * canvasWidth();
	const band = () => notchBand(frequency(), notchWidth());

	return (
		<div class="w-full space-y-6">
			<Card class="gap-2 border-amber-500/40 bg-amber-500/5 py-4">
				<CardContent class="space-y-2 px-4 text-sm text-muted-foreground">
					<p>
						<strong class="text-foreground">Not a medical treatment.</strong>{' '}
						Notched sound therapy may reduce tinnitus loudness for some people; evidence is limited.
						Use headphones and start quiet: therapy noise should be no louder than your tinnitus,
						which should stay audible. Stop if you feel discomfort or ear fullness.
					</p>
					<p>
						See a doctor first if your tinnitus is pulsing in time with your heartbeat, appeared suddenly
						in one ear, or comes with hearing loss or dizziness.
					</p>
				</CardContent>
			</Card>

			<div class="relative h-[300px] touch-none select-none"
			     onPointerDown={onPointer} onPointerMove={onPointer}>
				<canvas class="h-full w-full rounded-xl border" ref={canvas}/>
				<Show when={state() === 'noise'}>
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
				<div class="pointer-events-none absolute size-4 -translate-1/2 rounded-full border-2 border-primary bg-background"
				     style={{
					     left: `${xOf(frequency())}px`,
					     top: `${canvasHeight() * (1 - volume() / 100)}px`,
				     }}/>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Find your frequency</CardTitle>
					<CardDescription>
						Play the tone and move it until it matches the pitch of your tinnitus.
						Check one octave up and down too: octave mistakes are very common.
					</CardDescription>
				</CardHeader>
				<CardContent class="space-y-4">
					<Slider class="space-y-3" minValue={0} maxValue={FREQUENCY_STEPS}
					        value={[Math.round(frequencyToPosition(frequency()) * FREQUENCY_STEPS)]}
					        getValueLabel={() => formatFrequency(frequency())}
					        onChange={([value]) => setFrequency(positionToFrequency(value / FREQUENCY_STEPS))}>
						<div class="flex w-full items-center justify-between">
							<SliderLabel>Frequency</SliderLabel>
							<label class="flex items-center gap-1 text-sm font-medium">
								<input type="number" min={MIN_FREQUENCY} max={MAX_FREQUENCY}
								       class="w-20 rounded-md border bg-transparent px-2 py-0.5 text-right"
								       value={frequency()}
								       onChange={e => {
									       const value = e.currentTarget.valueAsNumber;
									       if (Number.isFinite(value)) setFrequency(value);
									       e.currentTarget.value = String(frequency());
								       }}/>
								Hz
							</label>
						</div>
						<SliderTrack>
							<SliderFill/>
							<SliderThumb/>
						</SliderTrack>
					</Slider>
					<div class="grid grid-cols-4 gap-2">
						<Button variant="outline" size="sm" onClick={() => setFrequency(shiftOctaves(frequency(), -1))}>
							−1 octave
						</Button>
						<Button variant="outline" size="sm" onClick={() => setFrequency(shiftOctaves(frequency(), -1 / 12))}>
							−semitone
						</Button>
						<Button variant="outline" size="sm" onClick={() => setFrequency(shiftOctaves(frequency(), 1 / 12))}>
							+semitone
						</Button>
						<Button variant="outline" size="sm" onClick={() => setFrequency(shiftOctaves(frequency(), 1))}>
							+1 octave
						</Button>
					</div>
				</CardContent>
				<CardFooter>
					<Button variant="secondary" class="w-full" onClick={() => toggle('sound')}>
						<Show when={state() !== 'sound'} fallback="Stop Tone">
							Play Tone
						</Show>
					</Button>
				</CardFooter>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Listen</CardTitle>
					<CardDescription>
						Noise with a band around your frequency removed. Listen at a comfortable level,
						no louder than your tinnitus.
					</CardDescription>
				</CardHeader>
				<CardContent class="space-y-6">
					<div class="space-y-3">
						<span class="text-sm font-medium">Noise</span>
						<div class="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Noise colour">
							<For each={NOISE_COLORS}>{color =>
								<Button size="sm" role="radio" aria-checked={noiseColor() === color}
								        variant={noiseColor() === color ? 'default' : 'outline'}
								        class="capitalize"
								        onClick={() => setNoiseColor(color)}>
									{color}
								</Button>
							}</For>
						</div>
					</div>
					<Slider class="space-y-3" minValue={0.25} maxValue={1} step={0.05} value={[notchWidth()]}
					        getValueLabel={({values}) => `${values[0].toFixed(2)} oct`}
					        onChange={([value]) => setNotchWidth(value)}>
						<div class="flex w-full justify-between">
							<SliderLabel>Notch width</SliderLabel>
							<SliderValueLabel/>
						</div>
						<SliderTrack>
							<SliderFill/>
							<SliderThumb/>
						</SliderTrack>
					</Slider>
					<Slider class="space-y-3" minValue={0} maxValue={100} value={[volume()]}
					        getValueLabel={({values}) => `${values[0]}%`}
					        onChange={([value]) => setVolume(value)}>
						<div class="flex w-full justify-between">
							<SliderLabel>Volume</SliderLabel>
							<SliderValueLabel/>
						</div>
						<SliderTrack>
							<SliderFill/>
							<SliderThumb/>
						</SliderTrack>
					</Slider>
				</CardContent>
				<CardFooter>
					<Button class="w-full" onClick={() => toggle('noise')}>
						<Show when={state() !== 'noise'} fallback="Stop Notched Noise">
							Play Notched Noise
						</Show>
					</Button>
				</CardFooter>
			</Card>
		</div>
	);
}

