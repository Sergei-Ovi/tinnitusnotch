import {store} from '@/app/store';
import {AudiogramChart} from '@/components/audiogram-chart';
import {RatingTrendChart} from '@/components/rating-trend-chart';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from '@/components/ui/card';
import {describeBackupError, formatDate, formatFrequency, formatMinutes, t} from '@/i18n';
import {type MatchResult, mergeMatches, sensationLevel} from '@/lib/matching/wizard';
import {createBackup, parseBackup} from '@/lib/therapy/backup';
import {dailyRatings, mergeSessions, type Rating, type Session, sessionStats} from '@/lib/therapy/session';
import {createMemo, createSignal, For, onCleanup, Show} from 'solid-js';

const SESSION_DATE: Intl.DateTimeFormatOptions = {
	weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
};
const MATCH_DATE: Intl.DateTimeFormatOptions = {day: 'numeric', month: 'short', year: 'numeric'};
/** "Today" and "7 days" are recounted this often, so they roll over at midnight while the tab is open. */
const STATS_REFRESH_MS = 60_000;

/** Therapy time, the rating trend, frequency matches and hearing, sessions with backup. */
export function ProgressPage() {
	const m = () => t().progress;
	const [now, setNow] = createSignal(new Date());
	const timer = setInterval(() => setNow(new Date()), STATS_REFRESH_MS);
	onCleanup(() => clearInterval(timer));
	const stats = createMemo(() => sessionStats(store.sessions(), now()));
	const days = createMemo(() => dailyRatings(store.sessions()));
	// Kept as a function of the language, so the message follows a language switch.
	const [message, setMessage] = createSignal<{text: () => string; error?: boolean} | null>(null);
	const [confirmDelete, setConfirmDelete] = createSignal<string | null>(null);
	let fileInput!: HTMLInputElement;

	function exportData() {
		const backup = createBackup(store.settings(), store.sessions(), store.matches(), new Date());
		const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, '\t')], {type: 'application/json'}));
		const link = document.createElement('a');
		link.href = url;
		link.download = `tinnitusnotch-${backup.exportedAt.slice(0, 10)}.json`;
		link.click();
		URL.revokeObjectURL(url);
	}

	async function importData(file: File) {
		const result = parseBackup(await file.text());
		if ('error' in result) {
			const {error} = result;
			setMessage({text: () => describeBackupError(error), error: true});
			return;
		}
		const {sessions, settings, matches} = result.backup;
		// Settings come along only on a fresh device; otherwise the current setup wins.
		const restoreSettings = store.sessions().length === 0;
		if (restoreSettings) store.applySettings(settings);
		const before = store.sessions().length;
		store.setSessions(current => mergeSessions(current, sessions));
		store.setMatches(current => mergeMatches(current, matches));
		const added = store.sessions().length - before;
		setMessage({text: () => m().imported(sessions.length, added, matches.length, restoreSettings)});
	}

	function remove(id: string) {
		store.setSessions(current => current.filter(s => s.id !== id));
		setConfirmDelete(null);
	}

	return (
		<div class="w-full space-y-6">
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
				<Stat label={m().today} value={formatMinutes(stats().todayMinutes)}/>
				<Stat label={m().week} value={formatMinutes(stats().weekMinutes)}/>
				<Stat label={m().weekSessions} value={String(stats().weekSessions)}/>
				<Stat label={m().change} value={formatChange(stats().meanRatingChange)} hint={m().rated(stats().ratedSessions)}/>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>{m().loudnessTitle}</CardTitle>
					<CardDescription>{m().loudnessText}</CardDescription>
				</CardHeader>
				<CardContent>
					<Show when={days().length >= 2} fallback={
						<p class="py-4 text-center text-sm text-muted-foreground">{m().noTrend}</p>
					}>
						<RatingTrendChart days={days()}/>
					</Show>
				</CardContent>
			</Card>

			<MatchesCard/>

			<Card>
				<CardHeader>
					<CardTitle>{m().sessionsTitle}</CardTitle>
					<CardDescription>{m().sessionsText}</CardDescription>
				</CardHeader>
				<CardContent>
					<Show when={store.sessions().length} fallback={
						<p class="py-6 text-center text-sm text-muted-foreground">{m().noSessions}</p>
					}>
						<ul class="divide-y">
							<For each={store.sessions()}>{s =>
								<li class="flex items-center gap-3 py-3 text-sm">
									<div class="min-w-0 flex-1 space-y-0.5">
										<div class="font-medium">{formatDate(new Date(s.startedAt), SESSION_DATE)}</div>
										<div class="text-muted-foreground">{describeSession(s)}</div>
									</div>
									<div class="text-right tabular-nums" title={m().ratingTitle}>
										{formatRating(s.ratingBefore)} → {formatRating(s.ratingAfter)}
									</div>
									<Show when={confirmDelete() === s.id} fallback={
										<Button variant="ghost" size="sm" aria-label={m().deleteSession}
										        onClick={() => setConfirmDelete(s.id)}>✕</Button>
									}>
										<Button variant="destructive" size="sm" onClick={() => remove(s.id)}>{m().delete}</Button>
										<Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>{m().keep}</Button>
									</Show>
								</li>
							}</For>
						</ul>
					</Show>
				</CardContent>
				<CardFooter class="flex-col items-stretch gap-3">
					<div class="flex gap-2">
						<Button variant="outline" class="flex-1" disabled={!store.sessions().length && !store.matches().length} onClick={exportData}>
							{m().export}
						</Button>
						<Button variant="outline" class="flex-1" onClick={() => fileInput.click()}>{m().import}</Button>
						<input ref={fileInput} type="file" accept="application/json,.json" class="hidden"
						       onChange={e => {
							       const file = e.currentTarget.files?.[0];
							       e.currentTarget.value = '';
							       if (file) void importData(file);
						       }}/>
					</div>
					<Show when={message()}>{msg =>
						<p class={`text-sm ${msg().error ? 'text-destructive' : 'text-muted-foreground'}`}>{msg().text()}</p>
					}</Show>
				</CardFooter>
			</Card>
		</div>
	);
}

function MatchesCard() {
	const m = () => t().progress;
	const withAudiogram = () => store.matches().find(match => match.audiogram);

	return (
		<Card>
			<CardHeader>
				<CardTitle>{m().matchesTitle}</CardTitle>
				<CardDescription>{m().matchesText}</CardDescription>
			</CardHeader>
			<CardContent class="space-y-6">
				<Show when={store.matches().length} fallback={
					<p class="py-4 text-center text-sm text-muted-foreground">{m().noMatches}</p>
				}>
					<ul class="divide-y">
						<For each={store.matches()}>{match =>
							<li class="flex items-baseline gap-3 py-3 text-sm">
								<div class="min-w-0 flex-1 space-y-0.5">
									<div class="font-medium">{formatDate(new Date(match.date), MATCH_DATE)}</div>
									<div class="text-muted-foreground">{describeMatch(match)}</div>
								</div>
								<div class="text-right font-medium tabular-nums">{formatFrequency(match.frequency)}</div>
							</li>
						}</For>
					</ul>
				</Show>
				<Show when={withAudiogram()}>{match =>
					<div class="space-y-2">
						<div class="text-sm font-medium">{m().hearingOn(formatDate(new Date(match().date), MATCH_DATE))}</div>
						<AudiogramChart audiogram={match().audiogram!} marker={match().frequency}/>
					</div>
				}</Show>
			</CardContent>
		</Card>
	);
}

function describeMatch(match: MatchResult) {
	const m = t().progress.match;
	const loudness = sensationLevel(match);
	return [
		match.type === 'tonal' ? m.tonal : m.hissing,
		!match.reliable && m.disagreed,
		loudness !== null && m.loudness(loudness),
		...(match.inhibition ?? []).map(trial => m.afterEffect(formatFrequency(trial.frequency), t().format.inhibition(trial))),
	].filter(Boolean).join(' · ');
}

function Stat(props: {label: string; value: string; hint?: string}) {
	return (
		<div class="rounded-xl border bg-card px-4 py-3">
			<div class="text-xs text-muted-foreground">{props.label}</div>
			<div class="text-xl font-semibold tabular-nums">{props.value}</div>
			<Show when={props.hint}>
				<div class="text-xs text-muted-foreground">{props.hint}</div>
			</Show>
		</div>
	);
}

function describeSession(s: Session) {
	const m = t().progress;
	const listened = formatMinutes(Math.round(s.listenedSeconds / 60));
	const length = s.completed ? listened : m.partial(listened, formatMinutes(Math.round(s.plannedSeconds / 60)));
	return m.session(length, formatFrequency(s.frequency), t().noiseColors[s.noiseColor], t().format.octaves(s.notchWidth));
}

function formatRating(rating: Rating) {
	return rating === null ? '–' : String(rating);
}

function formatChange(change: number | null) {
	if (change === null) return '–';
	const rounded = Math.round(change * 10) / 10;
	return (rounded > 0 ? '+' : '') + t().format.decimal(rounded);
}
