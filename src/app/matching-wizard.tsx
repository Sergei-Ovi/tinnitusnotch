import {matching} from '@/app/matching-controller';
import {AudiogramChart} from '@/components/audiogram-chart';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from '@/components/ui/card';
import {Slider, SliderFill, SliderLabel, SliderThumb, SliderTrack, SliderValueLabel} from '@/components/ui/slider';
import {shiftOctaves} from '@/lib/audio/scale';
import {formatClock, formatFrequency} from '@/lib/format';
import {currentPresentation, PRESENTATION_COUNT} from '@/lib/matching/audiometry';
import {
	alternativeFrequencies,
	describeInhibition,
	hasEffect,
	INHIBITION_SECONDS,
	MAX_TIMED_SECONDS,
} from '@/lib/matching/inhibition';
import {MAX_LEVEL_DB, MIN_LEVEL_DB, REFERENCE_DB} from '@/lib/matching/levels';
import {RUNS, TRIALS_PER_RUN} from '@/lib/matching/procedure';
import {sensationLevel, type WizardState, type WizardStep} from '@/lib/matching/wizard';
import {cn} from '@/lib/utils';
import {For, type JSX, Match, onCleanup, Show, Switch} from 'solid-js';

const STEPS: {steps: WizardStep[]; label: string}[] = [
	{steps: ['calibrate'], label: 'Calibrate'},
	{steps: ['hearing'], label: 'Hearing'},
	{steps: ['type'], label: 'Sound type'},
	{steps: ['match'], label: 'Compare'},
	{steps: ['octave'], label: 'Octave'},
	{steps: ['fine-tune'], label: 'Fine-tune'},
	{steps: ['threshold', 'loudness'], label: 'Loudness'},
	{steps: ['inhibition'], label: 'After-effect'},
];

/** Fine-tuning range around the octave choice, in semitones either way. */
const FINE_TUNE_SEMITONES = 6;

/** The guided matching, one card per step. Sound stops when the tab is left; progress is kept. */
export function MatchingWizard(props: {onOpenTherapy: () => void}) {
	onCleanup(matching.stopSound);
	const state = () => matching.state()!;

	return (
		<div class="w-full space-y-4">
			<Show when={state().step !== 'done'}>
				<StepIndicator step={state().step}/>
			</Show>
			<Switch>
				<Match when={state().step === 'calibrate'}><CalibrateStep/></Match>
				<Match when={state().step === 'hearing'}><HearingStep state={state()}/></Match>
				<Match when={state().step === 'type'}><TypeStep state={state()}/></Match>
				<Match when={state().step === 'match'}><CompareStep state={state()}/></Match>
				<Match when={state().step === 'octave'}><OctaveStep state={state()}/></Match>
				<Match when={state().step === 'fine-tune'}><FineTuneStep state={state()}/></Match>
				<Match when={state().step === 'threshold'}><ThresholdStep/></Match>
				<Match when={state().step === 'loudness'}><LoudnessStep/></Match>
				<Match when={state().step === 'inhibition'}><InhibitionStep state={state()}/></Match>
				<Match when={state().step === 'done'}>
					<DoneStep state={state()} onOpenTherapy={props.onOpenTherapy}/>
				</Match>
			</Switch>
		</div>
	);
}

function StepIndicator(props: {step: WizardStep}) {
	const current = () => STEPS.findIndex(s => s.steps.includes(props.step));
	return (
		<ol class="flex gap-1" aria-label="Matching steps">
			<For each={STEPS}>{(s, i) =>
				<li class="flex-1 space-y-1" aria-current={i() === current() ? 'step' : undefined}>
					<div class={cn('h-1 rounded-full', i() <= current() ? 'bg-primary' : 'bg-muted')}/>
					<div class={cn('hidden text-xs sm:block', i() === current() ? 'font-medium' : 'text-muted-foreground')}>
						{s.label}
					</div>
				</li>
			}</For>
		</ol>
	);
}

function StepCard(props: {title: string; description: JSX.Element; children?: JSX.Element; footer: JSX.Element}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>{props.title}</CardTitle>
				<CardDescription class="space-y-2">{props.description}</CardDescription>
			</CardHeader>
			<Show when={props.children}>
				<CardContent class="space-y-4">{props.children}</CardContent>
			</Show>
			<CardFooter class="flex-wrap gap-2">
				<Button variant="ghost" onClick={matching.close}>Cancel</Button>
				<div class="ml-auto flex flex-wrap gap-2">{props.footer}</div>
			</CardFooter>
		</Card>
	);
}

/** Toggles a sound; shows whether it is the one playing. */
function PlayButton(props: {id: string; onClick: () => void; children: JSX.Element; class?: string}) {
	const active = () => matching.playing() === props.id;
	return (
		<Button variant={active() ? 'default' : 'outline'} class={props.class} aria-pressed={active()}
		        onClick={() => props.onClick()}>
			<Show when={active()} fallback={
				<svg class="size-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
					<path d="M4 2.5v11l9.5-5.5z"/>
				</svg>
			}>
				<svg class="size-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
					<rect x="3" y="3" width="10" height="10" rx="1"/>
				</svg>
			</Show>
			{props.children}
		</Button>
	);
}

function LevelSlider(props: {label: string}) {
	return (
		<Slider class="space-y-3" minValue={MIN_LEVEL_DB} maxValue={MAX_LEVEL_DB} step={1}
		        value={[matching.levelDb()]}
		        getValueLabel={({values}) => formatLevel(values[0])}
		        onChange={([value]) => matching.setLevelDb(value)}>
			<div class="flex w-full justify-between">
				<SliderLabel>{props.label}</SliderLabel>
				<SliderValueLabel/>
			</div>
			<SliderTrack>
				<SliderFill/>
				<SliderThumb/>
			</SliderTrack>
		</Slider>
	);
}

function CalibrateStep() {
	return (
		<StepCard title="Calibrate the volume"
		          description={<>
			          <p>Put on headphones and sit somewhere quiet. Matching takes about 10 minutes.</p>
			          <p>
				          Play the reference tone and set your <strong class="text-foreground">computer's volume</strong> so
				          the tone is quiet but clear. Don't change it again until the end.
			          </p>
		          </>}
		          footer={<Button onClick={matching.calibrated}>The tone is quiet but clear</Button>}>
			<PlayButton id="reference" class="w-full" onClick={matching.toggleReference}>Reference tone, 1 kHz</PlayButton>
		</StepCard>
	);
}

function HearingStep(props: {state: WizardState}) {
	return (
		<Show when={props.state.audiometry} fallback={
			<StepCard title="Hearing check (optional)"
			          description={<>
				          <p>
					          You'll hear short beeps in one ear at a time, getting quieter, and say whether you heard
					          them. Tinnitus is often pitched near where hearing drops off, so this gives the comparisons
					          a head start, and lets the sounds you compare be equally easy to hear.
				          </p>
				          <p>It takes 5–7 minutes. It is not a medical hearing test.</p>
			          </>}
			          footer={<>
				          <Button variant="outline" onClick={matching.skipHearing}>Skip</Button>
				          <Button onClick={matching.startHearing}>Start</Button>
			          </>}/>
		}>{audiometry => {
			const presentation = () => currentPresentation(audiometry());
			return (
				<StepCard title="Did you hear the beeps?"
				          description={<>
					          <p>
						          Answer yes only if you heard the beeps, even faintly. Your tinnitus may sound similar:
						          listen for the rhythm. Replay them if you're unsure.
					          </p>
				          </>}
				          footer={<Button variant="outline" onClick={matching.skipHearing}>Skip the check</Button>}>
					<div class="flex items-center justify-between text-sm text-muted-foreground">
						<span>Sound {audiometry().index + 1} of {PRESENTATION_COUNT}</span>
						<span class="font-medium text-foreground">
							{presentation().ear === 'left' ? 'Left' : 'Right'} ear
						</span>
					</div>
					<PlayButton id="beep" class="w-full" onClick={matching.playBeeps}>Play again</PlayButton>
					<div class="grid grid-cols-2 gap-3">
						<Button variant="secondary" onClick={() => matching.hearingResponse(false)}>No</Button>
						<Button onClick={() => matching.hearingResponse(true)}>Yes, I heard them</Button>
					</div>
				</StepCard>
			);
		}}</Show>
	);
}

function TypeStep(props: {state: WizardState}) {
	return (
		<StepCard title="What does your tinnitus sound like?"
		          description={<>
			          <p>Listen to the examples if you are unsure. Pitch doesn't matter here, only the kind of sound.</p>
			          <Show when={props.state.hypothesis}>{hypothesis =>
				          <p class="rounded-md bg-muted px-3 py-2 text-foreground">
					          Your hearing drops off steeply around {formatFrequency(hypothesis())}; the comparisons
					          will start from there.
				          </p>
			          }</Show>
		          </>}
		          footer={null}>
			<div class="grid gap-3 sm:grid-cols-2">
				<TypeOption type="tonal" title="A tone or whistle" text="One clear pitch, like a beep or ringing."/>
				<TypeOption type="hissing" title="A hiss or rushing" text="Like steam, static or wind, without one clear pitch.">
					<p class="text-xs text-amber-700 dark:text-amber-400">
						Notched therapy has been studied on tonal tinnitus and is expected to help less with hissing.
					</p>
				</TypeOption>
			</div>
		</StepCard>
	);
}

function TypeOption(props: {type: 'tonal' | 'hissing'; title: string; text: string; children?: JSX.Element}) {
	return (
		<div class="flex flex-col gap-3 rounded-lg border p-4">
			<div class="space-y-1">
				<div class="font-medium">{props.title}</div>
				<p class="text-sm text-muted-foreground">{props.text}</p>
				{props.children}
			</div>
			<div class="mt-auto flex gap-2">
				<PlayButton id={props.type} onClick={() => matching.playExample(props.type)}>Example</PlayButton>
				<Button class="flex-1" onClick={() => matching.chooseType(props.type)}>This one</Button>
			</div>
		</div>
	);
}

function CompareStep(props: {state: WizardState}) {
	const run = () => props.state.run!;
	const number = () => run().index * TRIALS_PER_RUN + run().trial + 1;

	return (
		<StepCard title="Which sound is closer to your tinnitus?"
		          description={<>
			          <p>Compare the pitch, not the loudness. Go with your first impression: there are no wrong answers.</p>
			          <Show when={run().trial === 0 && run().index > 0}>
				          <p class="rounded-md bg-muted px-3 py-2 text-foreground">
					          Round {run().index + 1} of {RUNS}: the same task again, starting from different sounds.
					          It's fine if your answers differ from the last round.
				          </p>
			          </Show>
		          </>}
		          footer={<Button variant="outline" onClick={matching.playPair}>Replay both</Button>}>
			<div class="flex items-center justify-between text-sm text-muted-foreground">
				<span>Comparison {number()} of {RUNS * TRIALS_PER_RUN}</span>
				<span>Round {run().index + 1} of {RUNS}</span>
			</div>
			<div class="grid grid-cols-2 gap-3">
				<For each={['a', 'b'] as const}>{id =>
					<div class={cn('space-y-2 rounded-lg border p-3 transition-colors',
						matching.playing() === id && 'border-primary bg-primary/5')}>
						<PlayButton id={id} class="w-full" onClick={() => matching.playOne(id)}>
							Sound {id.toUpperCase()}
						</PlayButton>
						<Button class="w-full" onClick={() => matching.answer(id)}>
							{id.toUpperCase()} is closer
						</Button>
					</div>
				}</For>
			</div>
			<Button variant="secondary" class="w-full" onClick={() => matching.answer('same')}>
				About the same
			</Button>
			<LevelSlider label="Level, if a sound is hard to hear"/>
		</StepCard>
	);
}

function OctaveStep(props: {state: WizardState}) {
	return (
		<StepCard title="Check the octave"
		          description="Sounds an octave apart are easy to confuse. Which of these is closest to your tinnitus?"
		          footer={<Button variant="outline" onClick={matching.playOptions}>Replay all</Button>}>
			<div class="grid gap-3" style={{'grid-template-columns': `repeat(${props.state.octaveOptions.length}, 1fr)`}}>
				<For each={props.state.octaveOptions}>{(frequency, i) =>
					<div class={cn('space-y-2 rounded-lg border p-3 transition-colors',
						matching.playing() === String(frequency) && 'border-primary bg-primary/5')}>
						<PlayButton id={String(frequency)} class="w-full" onClick={() => matching.playOption(frequency)}>
							Sound {i() + 1}
						</PlayButton>
						<Button class="w-full" onClick={() => matching.chooseOctave(frequency)}>Closest</Button>
					</div>
				}</For>
			</div>
			<LevelSlider label="Level"/>
		</StepCard>
	);
}

function FineTuneStep(props: {state: WizardState}) {
	const combined = () => props.state.combined!;
	const frequency = () => props.state.frequency!;
	// Captured once: the slider moves around the octave choice, not around itself.
	const base = props.state.frequency!;
	const semitones = () => Math.round(12 * Math.log2(frequency() / base) * 4) / 4;
	const set = (f: number) => matching.fineTune(Math.round(f));

	return (
		<StepCard title="Fine-tune"
		          description="Play the sound and nudge it until the pitch matches your tinnitus as closely as you can."
		          footer={<Button onClick={matching.confirmFrequency}>This matches</Button>}>
			<Show when={!combined().reliable}>
				<div class="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm">
					<p>
						Your three rounds disagreed by {combined().spreadOctaves.toFixed(1)} octaves
						({props.state.estimates.map(formatFrequency).join(', ')}), so this match may be inaccurate.
						You can repeat the comparisons, or fine-tune by ear.
					</p>
					<Button variant="outline" size="sm" onClick={matching.repeatMatching}>Repeat comparisons</Button>
				</div>
			</Show>
			<div class="text-center text-4xl font-semibold tabular-nums">{formatFrequency(frequency())}</div>
			<Slider class="space-y-3" minValue={-FINE_TUNE_SEMITONES} maxValue={FINE_TUNE_SEMITONES} step={0.25}
			        value={[semitones()]}
			        getValueLabel={({values}) => formatSemitones(values[0])}
			        onChange={([value]) => set(base * 2 ** (value / 12))}>
				<div class="flex w-full justify-between">
					<SliderLabel>Pitch</SliderLabel>
					<SliderValueLabel/>
				</div>
				<SliderTrack>
					<SliderFill/>
					<SliderThumb/>
				</SliderTrack>
			</Slider>
			<div class="grid grid-cols-2 gap-2">
				<Button variant="outline" size="sm" disabled={semitones() <= -FINE_TUNE_SEMITONES}
				        onClick={() => set(shiftOctaves(frequency(), -1 / 12))}>−semitone</Button>
				<Button variant="outline" size="sm" disabled={semitones() >= FINE_TUNE_SEMITONES}
				        onClick={() => set(shiftOctaves(frequency(), 1 / 12))}>+semitone</Button>
			</div>
			<PlayButton id="probe" class="w-full" onClick={matching.toggleProbe}>Play</PlayButton>
			<LevelSlider label="Level"/>
		</StepCard>
	);
}

function ThresholdStep() {
	return (
		<StepCard title="Loudness: your hearing threshold"
		          description={<>
			          <p>
				          This measures how loud your tinnitus is, to track it over time. It is optional.
			          </p>
			          <p>Play the sound and lower the level until you can only just hear it.</p>
		          </>}
		          footer={<>
			          <Button variant="outline" onClick={matching.skipLoudness}>Skip</Button>
			          <Button onClick={matching.setThreshold}>I can just hear it</Button>
		          </>}>
			<PlayButton id="probe" class="w-full" onClick={matching.toggleProbe}>Play</PlayButton>
			<LevelSlider label="Level"/>
		</StepCard>
	);
}

function LoudnessStep() {
	return (
		<StepCard title="Loudness: match your tinnitus"
		          description="Now raise the level until the sound is as loud as your tinnitus."
		          footer={<>
			          <Button variant="outline" onClick={matching.skipLoudness}>Skip</Button>
			          <Button onClick={matching.setLoudness}>As loud as my tinnitus</Button>
		          </>}>
			<PlayButton id="probe" class="w-full" onClick={matching.toggleProbe}>Play</PlayButton>
			<LevelSlider label="Level"/>
		</StepCard>
	);
}

function InhibitionStep(props: {state: WizardState}) {
	const phase = matching.inhibitionPhase;
	const f = () => matching.testFrequency() ?? props.state.frequency!;
	const remaining = () => Math.max(0, INHIBITION_SECONDS - matching.elapsedSeconds());
	const atMatch = () => props.state.inhibition.filter(t => t.frequency === props.state.frequency);
	const tried = (frequency: number) => props.state.inhibition.some(t => t.frequency === frequency);
	/** Shown when the matched pitch had no effect: try half an octave either way. */
	const alternatives = () => atMatch().length && !atMatch().some(hasEffect)
		? alternativeFrequencies(props.state.frequency!).filter(a => !tried(a))
		: [];
	/** Alternatives that worked, which the user may switch therapy to. */
	const better = () => atMatch().some(hasEffect) ? [] : [...new Set(props.state.inhibition
		.filter(t => t.frequency !== props.state.frequency && hasEffect(t))
		.map(t => t.frequency))];

	return (
		<Switch>
			<Match when={phase() === 'intro'}>
				<StepCard title="After-effect check (optional)"
				          description={<>
					          <p>
						          You'll hear a minute of noise around {formatFrequency(f())}, then silence. Many people
						          notice their tinnitus is quieter, or even gone, for a short while afterwards. That
						          suggests the pitch is right; it's fine if nothing happens.
					          </p>
					          <p>Keep the noise comfortable: a little louder than your tinnitus, never unpleasant.</p>
				          </>}
				          footer={<>
					          <Button variant="outline" onClick={matching.finishInhibition}>
						          {props.state.inhibition.length ? 'Finish' : 'Skip'}
					          </Button>
					          <Button onClick={() => matching.startInhibition(f())}>Start, 1 minute</Button>
				          </>}/>
			</Match>
			<Match when={phase() === 'playing'}>
				<StepCard title="Listen to the noise"
				          description="Just listen. When it stops, pay attention to your tinnitus."
				          footer={<Button variant="outline" onClick={matching.stopInhibition}>Stop</Button>}>
					<div class="text-center text-4xl font-semibold tabular-nums" aria-live="off">
						{formatClock(remaining() * 1000)}
					</div>
					<LevelSlider label="Level"/>
				</StepCard>
			</Match>
			<Match when={phase() === 'ask'}>
				<StepCard title="How is your tinnitus now?" description="Compared with before the noise." footer={null}>
					<div class="grid grid-cols-2 gap-2">
						<Button onClick={() => matching.inhibitionEffect('gone')}>Gone</Button>
						<Button onClick={() => matching.inhibitionEffect('quieter')}>Quieter</Button>
						<Button variant="secondary" onClick={() => matching.inhibitionEffect('none')}>No change</Button>
						<Button variant="secondary" onClick={() => matching.inhibitionEffect('louder')}>Louder</Button>
					</div>
				</StepCard>
			</Match>
			<Match when={phase() === 'timing'}>
				<StepCard title="Tap when it's back to usual"
				          description="Keep listening to your tinnitus. The timer started when the noise stopped."
				          footer={<Button onClick={matching.inhibitionBack}>It's back</Button>}>
					<div class="text-center text-4xl font-semibold tabular-nums">
						{formatClock(matching.elapsedSeconds() * 1000)}
					</div>
					<p class="text-center text-xs text-muted-foreground">
						Stops by itself after {MAX_TIMED_SECONDS / 60} minutes.
					</p>
				</StepCard>
			</Match>
			<Match when={phase() === 'result'}>
				<StepCard title="After-effect"
				          description={<>
					          <ul class="space-y-1">
						          <For each={props.state.inhibition}>{t =>
							          <li>{formatFrequency(t.frequency)}: {describeInhibition(t)}</li>
						          }</For>
					          </ul>
					          <Show when={alternatives().length}>
						          <p>
							          No after-effect isn't unusual, and therapy can still help. Sometimes it means the
							          match is a little off: you can try half an octave lower or higher.
						          </p>
					          </Show>
				          </>}
				          footer={<Button onClick={matching.finishInhibition}>Finish</Button>}>
					<Show when={alternatives().length || better().length}>
						<div class="flex flex-wrap gap-2">
							<For each={alternatives()}>{a =>
								<Button variant="outline" onClick={() => matching.startInhibition(a)}>
									Try {formatFrequency(a)}
								</Button>
							}</For>
							<For each={better()}>{b =>
								<Button variant="outline" disabled={props.state.frequency === b}
								        onClick={() => matching.adoptFrequency(b)}>
									Use {formatFrequency(b)} for therapy
								</Button>
							}</For>
						</div>
					</Show>
				</StepCard>
			</Match>
		</Switch>
	);
}

function DoneStep(props: {state: WizardState; onOpenTherapy: () => void}) {
	const loudness = () => sensationLevel(props.state);
	return (
		<Card>
			<CardHeader>
				<CardTitle>Your match: {formatFrequency(props.state.frequency!)}</CardTitle>
				<CardDescription>Saved and set as your therapy frequency.</CardDescription>
			</CardHeader>
			<CardContent class="space-y-2 text-sm">
				<Show when={!props.state.combined?.reliable}>
					<p class="text-amber-700 dark:text-amber-400">
						The comparison rounds disagreed, so the match may be off. Consider repeating it another day.
					</p>
				</Show>
				<Show when={props.state.type === 'hissing'}>
					<p class="text-muted-foreground">
						For hissing tinnitus notched therapy is expected to be less effective.
					</p>
				</Show>
				<Show when={loudness() !== null}>
					<p class="text-muted-foreground">
						Tinnitus loudness: {loudness()} dB above your hearing threshold at this pitch.
					</p>
				</Show>
				<Show when={props.state.inhibition.length}>
					<p class="text-muted-foreground">
						After-effect: {props.state.inhibition.map(t => `${formatFrequency(t.frequency)} ${describeInhibition(t)}`).join(', ')}.
					</p>
				</Show>
				<Show when={props.state.audiogram}>{audiogram =>
					<div class="space-y-2 pt-2">
						<div class="font-medium">Hearing check</div>
						<AudiogramChart audiogram={audiogram()} marker={props.state.frequency!}/>
					</div>
				}</Show>
			</CardContent>
			<CardFooter class="gap-2">
				<Button variant="outline" onClick={matching.close}>Close</Button>
				<Button class="ml-auto" onClick={() => {
					matching.close();
					props.onOpenTherapy();
				}}>Go to therapy</Button>
			</CardFooter>
		</Card>
	);
}

/** Level relative to the calibration tone, which is what the user set their volume by. */
function formatLevel(db: number) {
	const relative = Math.round(db - REFERENCE_DB);
	return `${relative > 0 ? '+' : ''}${relative} dB`;
}

function formatSemitones(value: number) {
	const sign = value > 0 ? '+' : value < 0 ? '−' : '';
	return `${sign}${Math.abs(value)} ${Math.abs(value) === 1 ? 'semitone' : 'semitones'}`;
}
