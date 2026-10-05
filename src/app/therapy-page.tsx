import {session} from '@/app/session-controller';
import {MAX_NOTCH_WIDTH, MIN_NOTCH_WIDTH, store} from '@/app/store';
import {RatingPrompt} from '@/components/rating-prompt';
import {Spectrum} from '@/components/spectrum';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from '@/components/ui/card';
import {Slider, SliderFill, SliderLabel, SliderThumb, SliderTrack, SliderValueLabel} from '@/components/ui/slider';
import {VolumeSlider} from '@/components/volume-slider';
import {formatFrequency, formatMinutes, t} from '@/i18n';
import {NOISE_COLORS} from '@/lib/audio/noise-spectrum';
import {formatClock} from '@/lib/format';
import {SESSION_PRESETS} from '@/lib/therapy/session';
import {For, Match, Show, Switch} from 'solid-js';

export function TherapyPage(props: {onOpenSetup: () => void}) {
	const m = () => t().therapy;
	return (
		<div class="w-full space-y-6">
			<Spectrum class="h-[160px]"/>

			<Switch>
				<Match when={session.phase() === 'idle'}>
					<IdleCard onOpenSetup={props.onOpenSetup}/>
				</Match>
				<Match when={session.phase() === 'rating-before'}>
					<RatingPrompt title={m().before.title}
					              description={m().before.description}
					              onAnswer={session.start}
					              onCancel={session.cancel}/>
				</Match>
				<Match when={session.phase() === 'running' || session.phase() === 'paused'}>
					<RunningCard/>
				</Match>
				<Match when={session.phase() === 'rating-after'}>
					<RatingPrompt title={session.completed() ? m().after.complete : m().after.ended}
					              description={m().after.description}
					              onAnswer={session.finish}/>
				</Match>
			</Switch>

			<Card>
				<CardHeader>
					<CardTitle>{m().sound}</CardTitle>
					<CardDescription>{m().soundHint}</CardDescription>
				</CardHeader>
				<CardContent class="space-y-6">
					<div class="space-y-3">
						<span class="text-sm font-medium">{m().noise}</span>
						<div class="grid grid-cols-3 gap-2" role="radiogroup" aria-label={m().noiseColor}>
							<For each={NOISE_COLORS}>{color =>
								<Button size="sm" role="radio" aria-checked={store.noiseColor() === color}
								        variant={store.noiseColor() === color ? 'default' : 'outline'}
								        onClick={() => store.setNoiseColor(color)}>
									{t().noiseColors[color]}
								</Button>
							}</For>
						</div>
					</div>
					<Slider class="space-y-3" minValue={MIN_NOTCH_WIDTH} maxValue={MAX_NOTCH_WIDTH} step={0.05}
					        value={[store.notchWidth()]}
					        getValueLabel={({values}) => t().format.octaves(values[0])}
					        onChange={([value]) => store.setNotchWidth(value)}>
						<div class="flex w-full justify-between">
							<SliderLabel>{m().notchWidth}</SliderLabel>
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
	const m = () => t().therapy;
	return (
		<Card>
			<CardHeader>
				<CardTitle>{m().idleTitle}</CardTitle>
				<CardDescription>
					{m().idleBefore}<strong class="text-foreground">{formatFrequency(store.frequency())}</strong>{m().idleAfter}{' '}
					<button class="underline underline-offset-2 hover:text-foreground" onClick={() => props.onOpenSetup()}>
						{m().changeFrequency}
					</button>
				</CardDescription>
			</CardHeader>
			<CardContent class="space-y-3">
				<span class="text-sm font-medium">{m().duration}</span>
				<div class="grid grid-cols-4 gap-2" role="radiogroup" aria-label={m().sessionDuration}>
					<For each={SESSION_PRESETS}>{minutes =>
						<Button size="sm" role="radio" aria-checked={store.sessionMinutes() === minutes}
						        variant={store.sessionMinutes() === minutes ? 'default' : 'outline'}
						        onClick={() => store.setSessionMinutes(minutes)}>
							{formatMinutes(minutes)}
						</Button>
					}</For>
				</div>
				<Show when={session.notice()}>{notice =>
					<p class="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{m().notices[notice()]}</p>
				}</Show>
			</CardContent>
			<CardFooter>
				<Button class="w-full" onClick={session.begin}>{m().startSession}</Button>
			</CardFooter>
		</Card>
	);
}

function RunningCard() {
	const m = () => t().therapy;
	const paused = () => session.phase() === 'paused';
	const progress = () => session.listenedMs() / session.plannedMs();

	return (
		<Card>
			<CardHeader>
				<CardTitle>{paused() ? m().paused : m().running}</CardTitle>
				<CardDescription>{m().notchedAt(formatFrequency(store.frequency()))}</CardDescription>
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
					{paused() ? m().resume : m().pause}
				</Button>
				<Button variant="outline" class="flex-1" onClick={() => session.end(false)}>{m().endSession}</Button>
			</CardFooter>
		</Card>
	);
}
