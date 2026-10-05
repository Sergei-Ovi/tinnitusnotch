import {matching} from '@/app/matching-controller';
import {MatchingWizard} from '@/app/matching-wizard';
import {session} from '@/app/session-controller';
import {store} from '@/app/store';
import {Spectrum} from '@/components/spectrum';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from '@/components/ui/card';
import {Slider, SliderFill, SliderLabel, SliderThumb, SliderTrack} from '@/components/ui/slider';
import {VolumeSlider} from '@/components/volume-slider';
import {formatDate, formatFrequency, t} from '@/i18n';
import {
	FREQUENCY_STEPS,
	frequencyToPosition,
	MAX_FREQUENCY,
	MIN_FREQUENCY,
	positionToFrequency,
	shiftOctaves,
} from '@/lib/audio/scale';
import {sensationLevel} from '@/lib/matching/wizard';
import {createSignal, onCleanup, Show} from 'solid-js';

const DATE: Intl.DateTimeFormatOptions = {day: 'numeric', month: 'short', year: 'numeric'};

/**
 * Finding the tinnitus frequency: the guided matching, or the manual tone.
 * On first run only the guided matching is offered, with a way out for those who know their frequency.
 */
export function SetupPage(props: {onOpenTherapy: () => void}) {
	const [manual, setManual] = createSignal(false);
	const firstRun = () => !store.matches().length && !store.sessions().length;

	return (
		<Show when={matching.state()} fallback={
			<div class="w-full space-y-6">
				<MatchCard firstRun={firstRun() && !manual()} onManual={() => setManual(true)}/>
				<Show when={!firstRun() || manual()}>
					<ManualMatching/>
				</Show>
			</div>
		}>
			<Show when={!session.active()} fallback={
				<Card>
					<CardHeader>
						<CardTitle>{t().setup.paused}</CardTitle>
						<CardDescription>{t().setup.pausedText}</CardDescription>
					</CardHeader>
				</Card>
			}>
				<MatchingWizard onOpenTherapy={props.onOpenTherapy}/>
			</Show>
		</Show>
	);
}

function MatchCard(props: {firstRun: boolean; onManual: () => void}) {
	const m = () => t().setup;
	const last = () => store.matches()[0];
	const loudness = () => sensationLevel(last());

	return (
		<Card>
			<Show when={last()} fallback={
				<CardHeader>
					<CardTitle>{m().findTitle}</CardTitle>
					<CardDescription>{m().findText}</CardDescription>
				</CardHeader>
			}>
				<CardHeader>
					<CardTitle>{m().yourMatch(formatFrequency(last().frequency))}</CardTitle>
					<CardDescription class="space-y-1">
						<p>{m().matchedOn(last().type === 'tonal', formatDate(new Date(last().date), DATE))}</p>
						<Show when={!last().reliable}>
							<p>{m().unreliable}</p>
						</Show>
						<Show when={loudness() !== null}>
							<p>{m().loudness(loudness()!)}</p>
						</Show>
						<Show when={last().inhibition?.length}>
							<p>
								{m().afterEffect(last().inhibition!
									.map(trial => `${formatFrequency(trial.frequency)} ${t().format.inhibition(trial)}`).join(', '))}
							</p>
						</Show>
						<Show when={store.frequency() !== last().frequency}>
							<p>{m().manualInUse(formatFrequency(store.frequency()))}</p>
						</Show>
					</CardDescription>
				</CardHeader>
			</Show>
			<CardFooter class="flex-col gap-2">
				<Button class="w-full" disabled={session.active()} onClick={matching.start}>
					{last() ? m().matchAgain : m().startMatching}
				</Button>
				<Show when={session.active()}>
					<p class="text-xs text-muted-foreground">{m().busyMatching}</p>
				</Show>
				<Show when={props.firstRun}>
					<Button variant="ghost" class="w-full" onClick={() => props.onManual()}>{m().knowFrequency}</Button>
				</Show>
			</CardFooter>
		</Card>
	);
}

/** Manual frequency matching with a pure tone. */
function ManualMatching() {
	const m = () => t().setup;
	const {frequency, setFrequency} = store;
	const playing = () => store.playState() === 'sound';

	// The tone is only for matching: don't leave it playing on other tabs.
	onCleanup(() => {
		if (playing()) store.setPlayState('idle');
	});

	return (
		<div class="w-full space-y-6">
			<Spectrum interactive class="h-[300px]"/>

			<Card>
				<CardHeader>
					<CardTitle>{m().manualTitle}</CardTitle>
					<CardDescription>{m().manualText}</CardDescription>
				</CardHeader>
				<CardContent class="space-y-6">
					<div class="space-y-4">
						<Slider class="space-y-3" minValue={0} maxValue={FREQUENCY_STEPS}
						        value={[Math.round(frequencyToPosition(frequency()) * FREQUENCY_STEPS)]}
						        getValueLabel={() => formatFrequency(frequency())}
						        onChange={([value]) => setFrequency(positionToFrequency(value / FREQUENCY_STEPS))}>
							<div class="flex w-full items-center justify-between">
								<SliderLabel>{m().frequency}</SliderLabel>
								<label class="flex items-center gap-1 text-sm font-medium">
									<input type="number" min={MIN_FREQUENCY} max={MAX_FREQUENCY}
									       class="w-20 rounded-md border bg-transparent px-2 py-0.5 text-right"
									       value={frequency()}
									       onChange={e => {
										       const value = e.currentTarget.valueAsNumber;
										       if (Number.isFinite(value)) setFrequency(value);
										       e.currentTarget.value = String(frequency());
									       }}/>
									{m().hz}
								</label>
							</div>
							<SliderTrack>
								<SliderFill/>
								<SliderThumb/>
							</SliderTrack>
						</Slider>
						<div class="grid grid-cols-4 gap-2">
							<Button variant="outline" size="sm" onClick={() => setFrequency(shiftOctaves(frequency(), -1))}>
								{m().octaveDown}
							</Button>
							<Button variant="outline" size="sm" onClick={() => setFrequency(shiftOctaves(frequency(), -1 / 12))}>
								{m().semitoneDown}
							</Button>
							<Button variant="outline" size="sm" onClick={() => setFrequency(shiftOctaves(frequency(), 1 / 12))}>
								{m().semitoneUp}
							</Button>
							<Button variant="outline" size="sm" onClick={() => setFrequency(shiftOctaves(frequency(), 1))}>
								{m().octaveUp}
							</Button>
						</div>
					</div>
					<VolumeSlider/>
				</CardContent>
				<CardFooter class="flex-col gap-2">
					<Button variant="secondary" class="w-full" disabled={session.active()}
					        onClick={() => store.setPlayState(playing() ? 'idle' : 'sound')}>
						{playing() ? m().stopTone : m().playTone}
					</Button>
					<Show when={session.active()}>
						<p class="text-xs text-muted-foreground">{m().busyTone}</p>
					</Show>
				</CardFooter>
			</Card>
		</div>
	);
}
