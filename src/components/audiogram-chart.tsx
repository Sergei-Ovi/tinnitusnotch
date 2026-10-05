import {formatFrequency} from '@/lib/format';
import {type Audiogram, type Ear, EARS} from '@/lib/matching/audiometry';
import {MAX_LEVEL_DB, MIN_LEVEL_DB, REFERENCE_DB} from '@/lib/matching/levels';
import {cn} from '@/lib/utils';
import {For, Show} from 'solid-js';

const WIDTH = 400;
const HEIGHT = 200;
const PAD = {left: 46, right: 14, top: 10, bottom: 22};
/** Levels relative to the calibration tone; quieter (better hearing) at the top, as on an audiogram. */
const TOP_DB = MIN_LEVEL_DB - REFERENCE_DB;
const BOTTOM_DB = MAX_LEVEL_DB - REFERENCE_DB;
const GRID_DB = 20;
const AXIS_FREQUENCIES = [500, 1000, 2000, 4000, 8000];

/** Audiogram convention: right ear in red circles, left ear in blue crosses. */
const EAR_STYLE: Record<Ear, {label: string; class: string}> = {
	right: {label: 'Right ear', class: 'stroke-red-500'},
	left: {label: 'Left ear', class: 'stroke-blue-500'},
};

/** Hearing test result on a log-frequency axis, with an optional marker (the tinnitus match). */
export function AudiogramChart(props: {audiogram: Audiogram; marker?: number}) {
	const freqs = () => props.audiogram.frequencies;
	const lowF = () => freqs()[0];
	const highF = () => freqs()[freqs().length - 1];
	const x = (f: number) => PAD.left
		+ Math.log2(f / lowF()) / Math.log2(highF() / lowF()) * (WIDTH - PAD.left - PAD.right);
	const y = (thresholdDb: number) => PAD.top
		+ (thresholdDb - REFERENCE_DB - TOP_DB) / (BOTTOM_DB - TOP_DB) * (HEIGHT - PAD.top - PAD.bottom);

	const grid = Array.from({length: Math.floor((BOTTOM_DB - TOP_DB) / GRID_DB) + 1}, (_, i) => TOP_DB + i * GRID_DB);

	/** Line through the measured points; a point with no response breaks it. */
	const path = (ear: Ear) => props.audiogram[ear]
		.map((t, i) => t === null ? null : `${x(freqs()[i])},${y(t)}`)
		.reduce((d, point, i, points) =>
			point === null ? d : `${d}${i > 0 && points[i - 1] !== null ? 'L' : 'M'}${point}`, '');

	return (
		<figure class="space-y-2">
			<svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} class="h-auto w-full text-muted-foreground" role="img"
			     aria-label="Hearing check result">
				<For each={grid}>{db =>
					<g>
						<line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(db + REFERENCE_DB)} y2={y(db + REFERENCE_DB)}
						      class="stroke-border"/>
						<text x={PAD.left - 12} y={y(db + REFERENCE_DB)} text-anchor="end" dominant-baseline="middle"
						      class="fill-current text-[10px]">{db > 0 ? `+${db}` : db}</text>
					</g>
				}</For>
				<For each={AXIS_FREQUENCIES.filter(f => f >= lowF() && f <= highF())}>{f =>
					<text x={x(f)} y={HEIGHT - 6} text-anchor="middle" class="fill-current text-[10px]">
						{formatFrequency(f)}
					</text>
				}</For>
				<Show when={props.marker && props.marker >= lowF() && props.marker <= highF() && props.marker}>{marker =>
					<line x1={x(marker())} x2={x(marker())} y1={PAD.top} y2={HEIGHT - PAD.bottom}
					      class="stroke-primary" stroke-dasharray="4 3"/>
				}</Show>
				<For each={EARS}>{ear =>
					<g class={cn('fill-none', EAR_STYLE[ear].class)} stroke-width="1.5">
						<path d={path(ear)}/>
						<For each={props.audiogram[ear]}>{(t, i) => {
							const cx = () => x(freqs()[i()]);
							// Not heard at the loudest level: an arrow pointing down from the bottom edge.
							const cy = () => t === null ? HEIGHT - PAD.bottom - 6 : y(t);
							return (
								<Show when={t !== null} fallback={
									<path d={`M${cx() - 4},${cy() - 3}L${cx()},${cy() + 3}L${cx() + 4},${cy() - 3}`}/>
								}>
									<Show when={ear === 'right'} fallback={
										<path d={`M${cx() - 4},${cy() - 4}L${cx() + 4},${cy() + 4}M${cx() + 4},${cy() - 4}L${cx() - 4},${cy() + 4}`}/>
									}>
										<circle cx={cx()} cy={cy()} r="4" class="fill-card"/>
									</Show>
								</Show>
							);
						}}</For>
					</g>
				}</For>
			</svg>
			<figcaption class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
				<span><span class="text-red-500">○</span> {EAR_STYLE.right.label}</span>
				<span><span class="text-blue-500">×</span> {EAR_STYLE.left.label}</span>
				<Show when={EARS.some(ear => props.audiogram[ear].includes(null))}>
					<span>∨ not heard at the loudest level</span>
				</Show>
				<Show when={props.marker}>{marker =>
					<span><span class="text-primary">┆</span> your match, {formatFrequency(marker())}</span>
				}</Show>
				<span class="basis-full">
					Quietest level heard at each pitch, relative to the calibration tone; higher on the chart is
					better hearing. Not a clinical audiogram: the headphones aren't calibrated.
				</span>
			</figcaption>
		</figure>
	);
}
