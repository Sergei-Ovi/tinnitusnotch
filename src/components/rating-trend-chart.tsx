import {formatDate, t} from '@/i18n';
import type {DailyRatings} from '@/lib/therapy/session';
import {createSignal, For, Show} from 'solid-js';

const WIDTH = 400;
const HEIGHT = 170;
const PAD = {left: 26, right: 46, top: 10, bottom: 22};
const MAX_RATING = 10;
const GRID = [0, 5, 10];

/** Fixed order: "before" is the reference, "after" the app's primary colour. Validated for CVD in both themes. */
const SERIES = [
	{key: 'before', stroke: 'stroke-orange-600', mark: 'fill-orange-600', fill: 'bg-orange-600'},
	{key: 'after', stroke: 'stroke-primary', mark: 'fill-primary', fill: 'bg-primary'},
] as const;

const formatDay = (day: number) => formatDate(day, {day: 'numeric', month: 'short'});

/** Daily mean loudness ratings before and after sessions, with a hover crosshair and tooltip. */
export function RatingTrendChart(props: {days: DailyRatings[]}) {
	const [hovered, setHovered] = createSignal<number | null>(null);
	const first = () => props.days[0].day;
	const last = () => props.days[props.days.length - 1].day;
	const x = (day: number) => PAD.left + (last() === first() ? 0.5 : (day - first()) / (last() - first()))
		* (WIDTH - PAD.left - PAD.right);
	const y = (rating: number) => PAD.top + (1 - rating / MAX_RATING) * (HEIGHT - PAD.top - PAD.bottom);

	/** A line through the days that have a value; a day without one breaks it. */
	const path = (key: 'before' | 'after') => props.days
		.map(d => d[key] === null ? null : `${x(d.day)},${y(d[key]!)}`)
		.reduce((acc, point, i, points) =>
			point === null ? acc : `${acc}${i > 0 && points[i - 1] !== null ? 'L' : 'M'}${point}`, '');

	/** Hover band of each day: halfway to its neighbours. */
	const band = (i: number) => {
		const days = props.days;
		const from = i === 0 ? PAD.left : (x(days[i - 1].day) + x(days[i].day)) / 2;
		const to = i === days.length - 1 ? WIDTH - PAD.right : (x(days[i].day) + x(days[i + 1].day)) / 2;
		return {from, to};
	};

	/** Direct label at the last value of each series. */
	const lastValue = (key: 'before' | 'after') => {
		const day = [...props.days].reverse().find(d => d[key] !== null);
		return day ? {x: x(day.day), y: y(day[key]!)} : null;
	};

	return (
		<figure class="space-y-2">
			<div class="relative">
				<svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} class="h-auto w-full text-muted-foreground" role="img"
				     aria-label={t().trend.label}
				     onMouseLeave={() => setHovered(null)}>
					<For each={GRID}>{rating =>
						<g>
							<line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(rating)} y2={y(rating)} class="stroke-border"/>
							<text x={PAD.left - 8} y={y(rating)} text-anchor="end" dominant-baseline="middle"
							      class="fill-current text-[10px]">{rating}</text>
						</g>
					}</For>
					<text x={PAD.left} y={HEIGHT - 6} class="fill-current text-[10px]">{formatDay(first())}</text>
					<Show when={last() !== first()}>
						<text x={WIDTH - PAD.right} y={HEIGHT - 6} text-anchor="end" class="fill-current text-[10px]">
							{formatDay(last())}
						</text>
					</Show>
					<Show when={hovered() !== null}>
						<line x1={x(props.days[hovered()!].day)} x2={x(props.days[hovered()!].day)}
						      y1={PAD.top} y2={HEIGHT - PAD.bottom} class="stroke-muted-foreground" stroke-dasharray="3 3"/>
					</Show>
					<For each={SERIES}>{series =>
						<g class={series.stroke}>
							<path d={path(series.key)} fill="none" stroke-width="2" stroke-linejoin="round"/>
							<For each={props.days}>{d =>
								<Show when={d[series.key] !== null}>
									{/* A surface ring keeps overlapping markers apart. */}
									<circle cx={x(d.day)} cy={y(d[series.key]!)} r="4" stroke-width="2"
									        class={`stroke-card ${series.mark}`}/>
								</Show>
							}</For>
							<Show when={lastValue(series.key)}>{p =>
								<text x={p().x + 8} y={p().y} dominant-baseline="middle"
								      class="fill-muted-foreground stroke-none text-[10px]">{t().trend[series.key].toLowerCase()}</text>
							}</Show>
						</g>
					}</For>
					<For each={props.days}>{(_, i) =>
						<rect x={band(i()).from} width={band(i()).to - band(i()).from} y={0} height={HEIGHT}
						      fill="transparent" onMouseEnter={() => setHovered(i())}/>
					}</For>
				</svg>
				<Show when={hovered() !== null && props.days[hovered()!]}>{d =>
					<div class="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md"
					     style={{left: `${x(d().day) / WIDTH * 100}%`}}>
						<div class="font-medium">{formatDay(d().day)}</div>
						<For each={SERIES}>{series =>
							<div class="flex items-center gap-1.5 tabular-nums">
								<span class={`size-2 rounded-full ${series.fill}`}/>
								{t().trend[series.key]}: {formatMean(d()[series.key])}
							</div>
						}</For>
						<div class="text-muted-foreground">{t().trend.sessions(d().sessions)}</div>
					</div>
				}</Show>
			</div>
			<figcaption class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
				<For each={SERIES}>{series =>
					<span class="flex items-center gap-1.5">
						<span class={`size-2 rounded-full ${series.fill}`}/>
						{series.key === 'before' ? t().trend.beforeSessions : t().trend.afterSessions}
					</span>
				}</For>
				<span>{t().trend.caption}</span>
			</figcaption>
		</figure>
	);
}

function formatMean(value: number | null) {
	return value === null ? '–' : t().format.decimal(Math.round(value * 10) / 10);
}
