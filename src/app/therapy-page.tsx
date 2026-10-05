import {session} from '@/app/session-controller';
import {MAX_NOTCH_WIDTH, MIN_NOTCH_WIDTH, store} from '@/app/store';
import {RatingPrompt} from '@/components/rating-prompt';
import {Spectrum} from '@/components/spectrum';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from '@/components/ui/card';
import {Slider, SliderFill, SliderLabel, SliderThumb, SliderTrack, SliderValueLabel} from '@/components/ui/slider';
import {VolumeSlider} from '@/components/volume-slider';
import {NOISE_COLORS} from '@/lib/audio/noise-spectrum';
import {formatClock, formatFrequency} from '@/lib/format';
import {SESSION_PRESETS} from '@/lib/therapy/session';
import {For, Match, Show, Switch} from 'solid-js';

const NOTICES = {
	'saved': 'Session saved.',
	'too-short': 'The session was shorter than a minute and was not saved.',
	'recovered': 'An unfinished session from last time was saved with the time you listened.',
	'other-tab': 'A session is already running in another tab. Finish it there, or close that tab.',
};

export function TherapyPage(props: {onOpenSetup: () => void}) {
	return (
		<div class="w-full space-y-6">
			<Spectrum class="h-[160px]"/>

			<Switch>
				<Match when={session.phase() === 'idle'}>
					<IdleCard onOpenSetup={props.onOpenSetup}/>
				</Match>
				<Match when={session.phase() === 'rating-before'}>
					<RatingPrompt title="How loud is your tinnitus right now?"
					              description="Rate it before the session; the noise starts after you answer."
					              onAnswer={session.start}
					              onCancel={session.cancel}/>
				</Match>
				<Match when={session.phase() === 'running' || session.phase() === 'paused'}>
					<RunningCard/>
				</Match>
				<Match when={session.phase() === 'rating-after'}>
					<RatingPrompt title={session.completed() ? 'Session complete' : 'Session ended'}
					              description="How loud is your tinnitus now?"
					              onAnswer={session.finish}/>
				</Match>
			</Switch>

			<Card>
				<CardHeader>
					<CardTitle>Sound</CardTitle>
					<CardDescription>
						Listen at a comfortable level, no louder than your tinnitus: it should stay audible.
					</CardDescription>
				</CardHeader>
				<CardContent class="space-y-6">
					<div class="space-y-3">
						<span class="text-sm font-medium">Noise</span>
						<div class="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Noise colour">
							<For each={NOISE_COLORS}>{color =>
								<Button size="sm" role="radio" aria-checked={store.noiseColor() === color}
								        variant={store.noiseColor() === color ? 'default' : 'outline'}
								        class="capitalize"
								        onClick={() => store.setNoiseColor(color)}>
									{color}
								</Button>
							}</For>
						</div>
					</div>
					<Slider class="space-y-3" minValue={MIN_NOTCH_WIDTH} maxValue={MAX_NOTCH_WIDTH} step={0.05}
					        value={[store.notchWidth()]}
					        getValueLabel={({values}) => `${values[0].toFixed(2)} oct`}
					        onChange={([value]) => store.setNotchWidth(value)}>
						<div class="flex w-full justify-between">
							<SliderLabel>Notch width</SliderLabel>
							<SliderValueLabel/>
						</div>
						<SliderTrack>
							<SliderFill/>
							<SliderThumb/>
						</SliderTrack>
					</Slider>
					<VolumeSlider/>
				</CardContent>
			</Card>
		</div>
	);
}

function IdleCard(props: {onOpenSetup: () => void}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Therapy session</CardTitle>
				<CardDescription>
					Noise with a band around <strong class="text-foreground">{formatFrequency(store.frequency())}</strong> removed.{' '}
					<button class="underline underline-offset-2 hover:text-foreground" onClick={() => props.onOpenSetup()}>
						Change frequency
					</button>
				</CardDescription>
			</CardHeader>
			<CardContent class="space-y-3">
				<span class="text-sm font-medium">Duration</span>
				<div class="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Session duration">
					<For each={SESSION_PRESETS}>{minutes =>
						<Button size="sm" role="radio" aria-checked={store.sessionMinutes() === minutes}
						        variant={store.sessionMinutes() === minutes ? 'default' : 'outline'}
						        onClick={() => store.setSessionMinutes(minutes)}>
							{minutes} min
						</Button>
					}</For>
				</div>
				<Show when={session.notice()}>{notice =>
					<p class="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{NOTICES[notice()]}</p>
				}</Show>
			</CardContent>
			<CardFooter>
				<Button class="w-full" onClick={session.begin}>Start session</Button>
			</CardFooter>
		</Card>
	);
}

function RunningCard() {
	const paused = () => session.phase() === 'paused';
	const progress = () => session.listenedMs() / session.plannedMs();

	return (
		<Card>
			<CardHeader>
				<CardTitle>{paused() ? 'Paused' : 'Session in progress'}</CardTitle>
				<CardDescription>Notched noise at {formatFrequency(store.frequency())}.</CardDescription>
			</CardHeader>
			<CardContent class="space-y-3">
				<div class="text-center text-5xl font-semibold tabular-nums" aria-live="off">
					{formatClock(session.remainingMs())}
				</div>
				<div class="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar"
				     aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress() * 100)}>
					<div class="h-full bg-primary transition-[width]" style={{width: `${progress() * 100}%`}}/>
				</div>
			</CardContent>
			<CardFooter class="gap-2">
				<Button variant="secondary" class="flex-1" onClick={() => paused() ? session.resume() : session.pause()}>
					{paused() ? 'Resume' : 'Pause'}
				</Button>
				<Button variant="outline" class="flex-1" onClick={() => session.end(false)}>End session</Button>
			</CardFooter>
		</Card>
	);
}
