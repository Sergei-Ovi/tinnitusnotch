import {matching} from '@/app/matching-controller';
import {AudiogramChart} from '@/components/audiogram-chart';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from '@/components/ui/card';
import {Slider, SliderFill, SliderLabel, SliderThumb, SliderTrack, SliderValueLabel} from '@/components/ui/slider';
import {formatFrequency, t} from '@/i18n';
import type {Messages} from '@/i18n/en';
import {shiftOctaves} from '@/lib/audio/scale';
import {formatClock} from '@/lib/format';
import {audiogramReliable, currentPresentation, PRESENTATION_COUNT} from '@/lib/matching/audiometry';
import {alternativeFrequencies, hasEffect, INHIBITION_SECONDS, MAX_TIMED_SECONDS} from '@/lib/matching/inhibition';
import {MAX_LEVEL_DB, MIN_LEVEL_DB, REFERENCE_DB} from '@/lib/matching/levels';
import {RUNS, TRIALS_PER_RUN} from '@/lib/matching/procedure';
import {sensationLevel, type WizardState, type WizardStep} from '@/lib/matching/wizard';
import {cn} from '@/lib/utils';
import {For, type JSX, Match, onCleanup, Show, Switch} from 'solid-js';

const STEPS: {steps: WizardStep[]; label: keyof Messages['wizard']['steps']}[] = [
	{steps: ['calibrate'], label: 'calibrate'},
	{steps: ['hearing'], label: 'hearing'},
	{steps: ['type'], label: 'type'},
	{steps: ['match'], label: 'match'},
	{steps: ['octave'], label: 'octave'},
	{steps: ['fine-tune'], label: 'fineTune'},
	{steps: ['threshold', 'loudness'], label: 'loudness'},
	{steps: ['inhibition'], label: 'inhibition'},
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
		<ol class="flex gap-1" aria-label={t().wizard.stepsLabel}>
			<For each={STEPS}>{(s, i) =>
				<li class="flex-1 space-y-1" aria-current={i() === current() ? 'step' : undefined}>
					<div class={cn('h-1 rounded-full', i() <= current() ? 'bg-primary' : 'bg-muted')}/>
					<div class={cn('hidden text-xs sm:block', i() === current() ? 'font-medium' : 'text-muted-foreground')}>
						{t().wizard.steps[s.label]}
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
				<Button variant="ghost" onClick={matching.close}>{t().common.cancel}</Button>
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

function LevelSlider(props: {label?: string}) {
	return (
		<Slider class="space-y-3" minValue={MIN_LEVEL_DB} maxValue={MAX_LEVEL_DB} step={1}
		        value={[matching.levelDb()]}
		        getValueLabel={({values}) => formatLevel(values[0])}
		        onChange={([value]) => matching.setLevelDb(value)}>
			<div class="flex w-full justify-between">
				<SliderLabel>{props.label ?? t().common.level}</SliderLabel>
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
	const m = () => t().wizard.calibrate;
	return (
		<StepCard title={m().title}
		          description={<>
			          <p>{m().intro}</p>
			          <p>{m().before}<strong class="text-foreground">{m().strong}</strong>{m().after}</p>
		          </>}
		          footer={<Button onClick={matching.calibrated}>{m().done}</Button>}>
			<PlayButton id="reference" class="w-full" onClick={matching.toggleReference}>{m().reference}</PlayButton>
		</StepCard>
	);
}

function HearingStep(props: {state: WizardState}) {
	const m = () => t().wizard.hearing;
	return (
		<Show when={props.state.audiometry} fallback={
			<StepCard title={m().title}
			          description={<>
				          <p>{m().intro}</p>
				          <p>{m().duration}</p>
			          </>}
			          footer={<>
				          <Button variant="outline" onClick={matching.skipHearing}>{t().common.skip}</Button>
				          <Button onClick={matching.startHearing}>{t().common.start}</Button>
			          </>}/>
		}>{audiometry => {
			const presentation = () => currentPresentation(audiometry());
			return (
				<StepCard title={m().question}
				          description={m().hint}
				          footer={<Button variant="outline" onClick={matching.skipHearing}>{m().skip}</Button>}>
					<div class="flex items-center justify-between text-sm text-muted-foreground">
						<span>{m().progress(audiometry().index + 1, PRESENTATION_COUNT)}</span>
						<span class="font-medium text-foreground">{m().ear(presentation().ear === 'left')}</span>
					</div>
					<PlayButton id="beep" class="w-full" onClick={matching.playBeeps}>{m().playAgain}</PlayButton>
					<div class="grid grid-cols-2 gap-3">
						<Button variant="secondary" onClick={() => matching.hearingResponse(false)}>{m().no}</Button>
						<Button onClick={() => matching.hearingResponse(true)}>{m().yes}</Button>
					</div>
					{/* Below the answers, so that showing it doesn't move them. */}
					<Show when={audiometry().falseAlarm}>
						<p class="rounded-md bg-muted px-3 py-2 text-sm">{m().falseAlarm}</p>
					</Show>
				</StepCard>
			);
		}}</Show>
	);
}

function TypeStep(props: {state: WizardState}) {
	const m = () => t().wizard.type;
	return (
		<StepCard title={m().title}
		          description={<>
			          <p>{m().intro}</p>
			          <Show when={props.state.audiogram && !audiogramReliable(props.state.audiogram)}>
				          <p class="rounded-md bg-muted px-3 py-2 text-foreground">{m().unreliable}</p>
			          </Show>
			          <Show when={props.state.hypothesis}>{hypothesis =>
				          <p class="rounded-md bg-muted px-3 py-2 text-foreground">
					          {m().hypothesis(formatFrequency(hypothesis()))}
				          </p>
			          }</Show>
		          </>}
		          footer={null}>
			<div class="grid gap-3 sm:grid-cols-2">
				<TypeOption type="tonal" title={m().tonal} text={m().tonalText}/>
				<TypeOption type="hissing" title={m().hissing} text={m().hissingText}>
					<p class="text-xs text-amber-700 dark:text-amber-400">{m().hissingWarning}</p>
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
				<PlayButton id={props.type} onClick={() => matching.playExample(props.type)}>{t().wizard.type.example}</PlayButton>
				<Button class="flex-1" onClick={() => matching.chooseType(props.type)}>{t().wizard.type.choose}</Button>
			</div>
		</div>
	);
}

function CompareStep(props: {state: WizardState}) {
	const m = () => t().wizard.compare;
	const run = () => props.state.run!;
	const number = () => run().index * TRIALS_PER_RUN + run().trial + 1;

	return (
		<StepCard title={m().title}
		          description={m().intro}
		          footer={<Button variant="outline" onClick={matching.playPair}>{m().replay}</Button>}>
			<div class="flex items-center justify-between text-sm text-muted-foreground">
				<span>{m().progress(number(), RUNS * TRIALS_PER_RUN)}</span>
				<span>{m().round(run().index + 1, RUNS)}</span>
			</div>
			<div class="grid grid-cols-2 gap-3">
				<For each={['a', 'b'] as const}>{id =>
					<div class={cn('space-y-2 rounded-lg border p-3 transition-colors',
						matching.playing() === id && 'border-primary bg-primary/5')}>
						<PlayButton id={id} class="w-full" onClick={() => matching.playOne(id)}>
							{m().sound(id.toUpperCase())}
						</PlayButton>
						<Button class="w-full" onClick={() => matching.answer(id)}>{m().closer(id.toUpperCase())}</Button>
					</div>
				}</For>
			</div>
			<Button variant="secondary" class="w-full" onClick={() => matching.answer('same')}>{m().same}</Button>
			{/* Below the answers, and for the whole round, so that it doesn't move them. */}
			<Show when={run().index > 0}>
				<p class="rounded-md bg-muted px-3 py-2 text-sm">{m().again(run().index + 1, RUNS)}</p>
			</Show>
			<LevelSlider label={m().level}/>
		</StepCard>
	);
}

function OctaveStep(props: {state: WizardState}) {
	const m = () => t().wizard.octave;
	return (
		<StepCard title={m().title}
		          description={m().intro}
		          footer={<Button variant="outline" onClick={matching.playOptions}>{m().replay}</Button>}>
			<div class="grid gap-3" style={{'grid-template-columns': `repeat(${props.state.octaveOptions.length}, 1fr)`}}>
				<For each={props.state.octaveOptions}>{(frequency, i) =>
					<div class={cn('space-y-2 rounded-lg border p-3 transition-colors',
						matching.playing() === String(frequency) && 'border-primary bg-primary/5')}>
						<PlayButton id={String(frequency)} class="w-full" onClick={() => matching.playOption(frequency)}>
							{m().sound(i() + 1)}
						</PlayButton>
						<Button class="w-full" onClick={() => matching.chooseOctave(frequency)}>{m().closest}</Button>
					</div>
				}</For>
			</div>
			<LevelSlider/>
		</StepCard>
	);
}

function FineTuneStep(props: {state: WizardState}) {
	const m = () => t().wizard.fineTune;
	const combined = () => props.state.combined!;
	const frequency = () => props.state.frequency!;
	// Captured once: the slider moves around the octave choice, not around itself.
	const base = props.state.frequency!;
	const semitones = () => Math.round(12 * Math.log2(frequency() / base) * 4) / 4;
	const set = (f: number) => matching.fineTune(Math.round(f));

	return (
		<StepCard title={m().title}
		          description={m().intro}
		          footer={<Button onClick={matching.confirmFrequency}>{m().done}</Button>}>
			<Show when={!combined().reliable}>
				<div class="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm">
					<p>
						{m().disagreed(
							t().format.decimal(Math.round(combined().spreadOctaves * 10) / 10),
							props.state.estimates.map(formatFrequency).join(', '),
						)}
					</p>
					<Button variant="outline" size="sm" onClick={matching.repeatMatching}>{m().repeat}</Button>
				</div>
			</Show>
			<div class="text-center text-4xl font-semibold tabular-nums">{formatFrequency(frequency())}</div>
			<Slider class="space-y-3" minValue={-FINE_TUNE_SEMITONES} maxValue={FINE_TUNE_SEMITONES} step={0.25}
			        value={[semitones()]}
			        getValueLabel={({values}) => t().format.semitones(values[0])}
			        onChange={([value]) => set(base * 2 ** (value / 12))}>
				<div class="flex w-full justify-between">
					<SliderLabel>{m().pitch}</SliderLabel>
					<SliderValueLabel/>
				</div>
				<SliderTrack>
					<SliderFill/>
					<SliderThumb/>
				</SliderTrack>
			</Slider>
			<div class="grid grid-cols-2 gap-2">
				<Button variant="outline" size="sm" disabled={semitones() <= -FINE_TUNE_SEMITONES}
				        onClick={() => set(shiftOctaves(frequency(), -1 / 12))}>{t().setup.semitoneDown}</Button>
				<Button variant="outline" size="sm" disabled={semitones() >= FINE_TUNE_SEMITONES}
				        onClick={() => set(shiftOctaves(frequency(), 1 / 12))}>{t().setup.semitoneUp}</Button>
			</div>
			<PlayButton id="probe" class="w-full" onClick={matching.toggleProbe}>{t().common.play}</PlayButton>
			<LevelSlider/>
		</StepCard>
	);
}

function ThresholdStep() {
	const m = () => t().wizard.threshold;
	return (
		<StepCard title={m().title}
		          description={<>
			          <p>{m().intro}</p>
			          <p>{m().how}</p>
		          </>}
		          footer={<>
			          <Button variant="outline" onClick={matching.skipLoudness}>{t().common.skip}</Button>
			          <Button onClick={matching.setThreshold}>{m().done}</Button>
		          </>}>
			<PlayButton id="probe" class="w-full" onClick={matching.toggleProbe}>{t().common.play}</PlayButton>
			<LevelSlider/>
		</StepCard>
	);
}

function LoudnessStep() {
	const m = () => t().wizard.loudness;
	return (
		<StepCard title={m().title}
		          description={m().intro}
		          footer={<>
			          <Button variant="outline" onClick={matching.skipLoudness}>{t().common.skip}</Button>
			          <Button onClick={matching.setLoudness}>{m().done}</Button>
		          </>}>
			<PlayButton id="probe" class="w-full" onClick={matching.toggleProbe}>{t().common.play}</PlayButton>
			<LevelSlider/>
		</StepCard>
	);
}

function InhibitionStep(props: {state: WizardState}) {
	const m = () => t().wizard.inhibition;
	const phase = matching.inhibitionPhase;
	const f = () => matching.testFrequency() ?? props.state.frequency!;
	const remaining = () => Math.max(0, INHIBITION_SECONDS - matching.elapsedSeconds());
	const atMatch = () => props.state.inhibition.filter(trial => trial.frequency === props.state.frequency);
	const tried = (frequency: number) => props.state.inhibition.some(trial => trial.frequency === frequency);
	/** Shown when the matched pitch had no effect: try half an octave either way. */
	const alternatives = () => atMatch().length && !atMatch().some(hasEffect)
		? alternativeFrequencies(props.state.frequency!).filter(a => !tried(a))
		: [];
	/** Alternatives that worked, which the user may switch therapy to. */
	const better = () => atMatch().some(hasEffect) ? [] : [...new Set(props.state.inhibition
		.filter(trial => trial.frequency !== props.state.frequency && hasEffect(trial))
		.map(trial => trial.frequency))];

	return (
		<Switch>
			<Match when={phase() === 'intro'}>
				<StepCard title={m().title}
				          description={<>
					          <p>{m().intro(formatFrequency(f()))}</p>
					          <p>{m().comfort}</p>
				          </>}
				          footer={<>
					          <Button variant="outline" onClick={matching.finishInhibition}>
						          {props.state.inhibition.length ? t().common.finish : t().common.skip}
					          </Button>
					          <Button onClick={() => matching.startInhibition(f())}>{m().start}</Button>
				          </>}/>
			</Match>
			<Match when={phase() === 'playing'}>
				<StepCard title={m().listen}
				          description={m().listenText}
				          footer={<Button variant="outline" onClick={matching.stopInhibition}>{t().common.stop}</Button>}>
					<div class="text-center text-4xl font-semibold tabular-nums" aria-live="off">
						{formatClock(remaining() * 1000)}
					</div>
					<LevelSlider/>
				</StepCard>
			</Match>
			<Match when={phase() === 'ask'}>
				<StepCard title={m().ask} description={m().askText} footer={null}>
					<div class="grid grid-cols-2 gap-2">
						<Button onClick={() => matching.inhibitionEffect('gone')}>{m().effects.gone}</Button>
						<Button onClick={() => matching.inhibitionEffect('quieter')}>{m().effects.quieter}</Button>
						<Button variant="secondary" onClick={() => matching.inhibitionEffect('none')}>{m().effects.none}</Button>
						<Button variant="secondary" onClick={() => matching.inhibitionEffect('louder')}>{m().effects.louder}</Button>
					</div>
				</StepCard>
			</Match>
			<Match when={phase() === 'timing'}>
				<StepCard title={m().timing}
				          description={m().timingText}
				          footer={<Button onClick={matching.inhibitionBack}>{m().back}</Button>}>
					<div class="text-center text-4xl font-semibold tabular-nums">
						{formatClock(matching.elapsedSeconds() * 1000)}
					</div>
					<p class="text-center text-xs text-muted-foreground">{m().autoStop(MAX_TIMED_SECONDS / 60)}</p>
				</StepCard>
			</Match>
			<Match when={phase() === 'result'}>
				<StepCard title={m().result}
				          description={<>
					          <ul class="space-y-1">
						          <For each={props.state.inhibition}>{trial =>
							          <li>{formatFrequency(trial.frequency)}: {t().format.inhibition(trial)}</li>
						          }</For>
					          </ul>
					          <Show when={alternatives().length}>
						          <p>{m().noEffect}</p>
					          </Show>
				          </>}
				          footer={<Button onClick={matching.finishInhibition}>{t().common.finish}</Button>}>
					<Show when={alternatives().length || better().length}>
						<div class="flex flex-wrap gap-2">
							<For each={alternatives()}>{a =>
								<Button variant="outline" onClick={() => matching.startInhibition(a)}>
									{m().try(formatFrequency(a))}
								</Button>
							}</For>
							<For each={better()}>{b =>
								<Button variant="outline" disabled={props.state.frequency === b}
								        onClick={() => matching.adoptFrequency(b)}>
									{m().use(formatFrequency(b))}
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
	const m = () => t().wizard.done;
	const loudness = () => sensationLevel(props.state);
	return (
		<Card>
			<CardHeader>
				<CardTitle>{t().setup.yourMatch(formatFrequency(props.state.frequency!))}</CardTitle>
				<CardDescription>{m().saved}</CardDescription>
			</CardHeader>
			<CardContent class="space-y-2 text-sm">
				<Show when={!props.state.combined?.reliable}>
					<p class="text-amber-700 dark:text-amber-400">{m().unreliable}</p>
				</Show>
				<Show when={props.state.type === 'hissing'}>
					<p class="text-muted-foreground">{m().hissing}</p>
				</Show>
				<Show when={loudness() !== null}>
					<p class="text-muted-foreground">{m().loudness(loudness()!)}</p>
				</Show>
				<Show when={props.state.inhibition.length}>
					<p class="text-muted-foreground">
						{t().setup.afterEffect(props.state.inhibition
							.map(trial => `${formatFrequency(trial.frequency)} ${t().format.inhibition(trial)}`).join(', '))}
					</p>
				</Show>
				<Show when={props.state.audiogram}>{audiogram =>
					<div class="space-y-2 pt-2">
						<div class="font-medium">{m().hearing}</div>
						<AudiogramChart audiogram={audiogram()} marker={props.state.frequency!}/>
					</div>
				}</Show>
			</CardContent>
			<CardFooter class="gap-2">
				<Button variant="outline" onClick={matching.close}>{t().common.close}</Button>
				<Button class="ml-auto" onClick={() => {
					matching.close();
					props.onOpenTherapy();
				}}>{m().toTherapy}</Button>
			</CardFooter>
		</Card>
	);
}

/** Level relative to the calibration tone, which is what the user set their volume by. */
function formatLevel(db: number) {
	return t().format.level(Math.round(db - REFERENCE_DB));
}
