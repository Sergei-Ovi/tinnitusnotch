import {matching} from '@/app/matching-controller';
import {MatchingWizard} from '@/app/matching-wizard';
import {session} from '@/app/session-controller';
import {store} from '@/app/store';
import {Spectrum} from '@/components/spectrum';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from '@/components/ui/card';
import {Slider, SliderFill, SliderLabel, SliderThumb, SliderTrack} from '@/components/ui/slider';
import {VolumeSlider} from '@/components/volume-slider';
import {
	FREQUENCY_STEPS,
	frequencyToPosition,
	MAX_FREQUENCY,
	MIN_FREQUENCY,
	positionToFrequency,
	shiftOctaves,
} from '@/lib/audio/scale';
import {formatFrequency} from '@/lib/format';
import {describeInhibition} from '@/lib/matching/inhibition';
import {sensationLevel} from '@/lib/matching/wizard';
import {createSignal, onCleanup, Show} from 'solid-js';

const dateFormat = new Intl.DateTimeFormat(undefined, {day: 'numeric', month: 'short', year: 'numeric'});

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
						<CardTitle>Matching paused</CardTitle>
						<CardDescription>A therapy session is in progress. End it to continue matching.</CardDescription>
					</CardHeader>
				</Card>
			}>
				<MatchingWizard onOpenTherapy={props.onOpenTherapy}/>
			</Show>
		</Show>
	);
}

function MatchCard(props: {firstRun: boolean; onManual: () => void}) {
	const last = () => store.matches()[0];
	const loudness = () => sensationLevel(last());

	return (
		<Card>
			<Show when={last()} fallback={
				<CardHeader>
					<CardTitle>Find your frequency</CardTitle>
					<CardDescription>
						A guided test: you compare pairs of sounds with your tinnitus, check the octave and fine-tune
						the result. It takes about 10 minutes; you need headphones and a quiet room.
					</CardDescription>
				</CardHeader>
			}>
				<CardHeader>
					<CardTitle>Your match: {formatFrequency(last().frequency)}</CardTitle>
					<CardDescription class="space-y-1">
						<p>
							{last().type === 'tonal' ? 'Tonal' : 'Hissing'} tinnitus · matched {dateFormat.format(new Date(last().date))}
						</p>
						<Show when={!last().reliable}>
							<p>The comparison rounds disagreed, so this match may be inaccurate.</p>
						</Show>
						<Show when={loudness() !== null}>
							<p>Loudness: {loudness()} dB above your hearing threshold.</p>
						</Show>
						<Show when={last().inhibition?.length}>
							<p>
								After-effect: {last().inhibition!.map(t => `${formatFrequency(t.frequency)} ${describeInhibition(t)}`).join(', ')}.
							</p>
						</Show>
						<Show when={store.frequency() !== last().frequency}>
							<p>Therapy currently uses {formatFrequency(store.frequency())}, set manually.</p>
						</Show>
					</CardDescription>
				</CardHeader>
			</Show>
			<CardFooter class="flex-col gap-2">
				<Button class="w-full" disabled={session.active()} onClick={matching.start}>
					{last() ? 'Match again' : 'Start matching'}
				</Button>
				<Show when={session.active()}>
					<p class="text-xs text-muted-foreground">A therapy session is in progress. End it to start matching.</p>
				</Show>
				<Show when={props.firstRun}>
					<Button variant="ghost" class="w-full" onClick={() => props.onManual()}>I know my frequency</Button>
				</Show>
			</CardFooter>
		</Card>
	);
}

/** Manual frequency matching with a pure tone. */
function ManualMatching() {
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
					<CardTitle>Set the frequency manually</CardTitle>
					<CardDescription>
						Play the tone and move it until it matches the pitch of your tinnitus.
						Check one octave up and down too: octave mistakes are very common.
					</CardDescription>
				</CardHeader>
				<CardContent class="space-y-6">
					<div class="space-y-4">
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
					</div>
					<VolumeSlider/>
				</CardContent>
				<CardFooter class="flex-col gap-2">
					<Button variant="secondary" class="w-full" disabled={session.active()}
					        onClick={() => store.setPlayState(playing() ? 'idle' : 'sound')}>
						<Show when={!playing()} fallback="Stop Tone">Play Tone</Show>
					</Button>
					<Show when={session.active()}>
						<p class="text-xs text-muted-foreground">A therapy session is in progress. End it to play the tone.</p>
					</Show>
				</CardFooter>
			</Card>
		</div>
	);
}
