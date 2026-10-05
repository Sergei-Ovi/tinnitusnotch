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
import {onCleanup, Show} from 'solid-js';

/** Manual frequency matching with a pure tone. The guided wizard will live here too. */
export function SetupPage() {
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
					<CardTitle>Find your frequency</CardTitle>
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
