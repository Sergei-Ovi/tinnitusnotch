import {store} from '@/app/store';
import {AudiogramChart} from '@/components/audiogram-chart';
import {RatingTrendChart} from '@/components/rating-trend-chart';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from '@/components/ui/card';
import {formatFrequency, formatMinutes} from '@/lib/format';
import {describeInhibition} from '@/lib/matching/inhibition';
import {type MatchResult, mergeMatches, sensationLevel} from '@/lib/matching/wizard';
import {createBackup, parseBackup} from '@/lib/therapy/backup';
import {dailyRatings, mergeSessions, type Rating, type Session, sessionStats} from '@/lib/therapy/session';
import {createMemo, createSignal, For, onCleanup, Show} from 'solid-js';

const dateFormat = new Intl.DateTimeFormat(undefined, {
	weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});
const matchDateFormat = new Intl.DateTimeFormat(undefined, {day: 'numeric', month: 'short', year: 'numeric'});
/** "Today" and "7 days" are recounted this often, so they roll over at midnight while the tab is open. */
const STATS_REFRESH_MS = 60_000;

/** Therapy time, the rating trend, frequency matches and hearing, sessions with backup. */
export function ProgressPage() {
	const [now, setNow] = createSignal(new Date());
	const timer = setInterval(() => setNow(new Date()), STATS_REFRESH_MS);
	onCleanup(() => clearInterval(timer));
	const stats = createMemo(() => sessionStats(store.sessions(), now()));
	const days = createMemo(() => dailyRatings(store.sessions()));
	const [message, setMessage] = createSignal<{text: string; error?: boolean} | null>(null);
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
			setMessage({text: result.error, error: true});
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
		setMessage({
			text: `Imported ${sessions.length} sessions (${added} new)`
				+ (matches.length ? ` and ${matches.length} frequency matches.` : '.')
				+ (restoreSettings ? ' Frequency and sound settings restored.' : ''),
		});
	}

	function remove(id: string) {
		store.setSessions(current => current.filter(s => s.id !== id));
		setConfirmDelete(null);
	}

	return (
		<div class="w-full space-y-6">
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
				<Stat label="Today" value={formatMinutes(stats().todayMinutes)}/>
				<Stat label="Last 7 days" value={formatMinutes(stats().weekMinutes)}/>
				<Stat label="Sessions, 7 days" value={String(stats().weekSessions)}/>
				<Stat label="Avg. change" value={formatChange(stats().meanRatingChange)}
				      hint={stats().ratedSessions ? `over ${stats().ratedSessions} rated` : 'no rated sessions'}/>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Tinnitus loudness</CardTitle>
					<CardDescription>Your 0–10 ratings before and after sessions. Lower means quieter.</CardDescription>
				</CardHeader>
				<CardContent>
					<Show when={days().length >= 2} fallback={
						<p class="py-4 text-center text-sm text-muted-foreground">
							Rate your tinnitus before and after sessions on at least two days to see a trend here.
						</p>
					}>
						<RatingTrendChart days={days()}/>
					</Show>
				</CardContent>
			</Card>

			<MatchesCard/>

			<Card>
				<CardHeader>
					<CardTitle>Sessions</CardTitle>
					<CardDescription>Stored only in this browser. Export a backup to keep it safe or move it.</CardDescription>
				</CardHeader>
				<CardContent>
					<Show when={store.sessions().length} fallback={
						<p class="py-6 text-center text-sm text-muted-foreground">No sessions yet.</p>
					}>
						<ul class="divide-y">
							<For each={store.sessions()}>{s =>
								<li class="flex items-center gap-3 py-3 text-sm">
									<div class="min-w-0 flex-1 space-y-0.5">
										<div class="font-medium">{dateFormat.format(new Date(s.startedAt))}</div>
										<div class="text-muted-foreground">
											{describeSession(s)}
										</div>
									</div>
									<div class="text-right tabular-nums" title="Tinnitus loudness before → after">
										{formatRating(s.ratingBefore)} → {formatRating(s.ratingAfter)}
									</div>
									<Show when={confirmDelete() === s.id} fallback={
										<Button variant="ghost" size="sm" aria-label="Delete session"
										        onClick={() => setConfirmDelete(s.id)}>✕</Button>
									}>
										<Button variant="destructive" size="sm" onClick={() => remove(s.id)}>Delete</Button>
										<Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>Keep</Button>
									</Show>
								</li>
							}</For>
						</ul>
					</Show>
				</CardContent>
				<CardFooter class="flex-col items-stretch gap-3">
					<div class="flex gap-2">
						<Button variant="outline" class="flex-1" disabled={!store.sessions().length && !store.matches().length} onClick={exportData}>
							Export JSON
						</Button>
						<Button variant="outline" class="flex-1" onClick={() => fileInput.click()}>Import JSON</Button>
						<input ref={fileInput} type="file" accept="application/json,.json" class="hidden"
						       onChange={e => {
							       const file = e.currentTarget.files?.[0];
							       e.currentTarget.value = '';
							       if (file) void importData(file);
						       }}/>
					</div>
					<Show when={message()}>{m =>
						<p class={`text-sm ${m().error ? 'text-destructive' : 'text-muted-foreground'}`}>{m().text}</p>
					}</Show>
				</CardFooter>
			</Card>
		</div>
	);
}

function MatchesCard() {
	const withAudiogram = () => store.matches().find(m => m.audiogram);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Frequency matches</CardTitle>
				<CardDescription>
					Loudness is how far your tinnitus is above your hearing threshold at its pitch; a drop over
					weeks is the most objective sign of change.
				</CardDescription>
			</CardHeader>
			<CardContent class="space-y-6">
				<Show when={store.matches().length} fallback={
					<p class="py-4 text-center text-sm text-muted-foreground">No matches yet. Run one on the Setup tab.</p>
				}>
					<ul class="divide-y">
						<For each={store.matches()}>{m =>
							<li class="flex items-baseline gap-3 py-3 text-sm">
								<div class="min-w-0 flex-1 space-y-0.5">
									<div class="font-medium">{matchDateFormat.format(new Date(m.date))}</div>
									<div class="text-muted-foreground">{describeMatch(m)}</div>
								</div>
								<div class="text-right font-medium tabular-nums">{formatFrequency(m.frequency)}</div>
							</li>
						}</For>
					</ul>
				</Show>
				<Show when={withAudiogram()}>{m =>
					<div class="space-y-2">
						<div class="text-sm font-medium">Hearing check, {matchDateFormat.format(new Date(m().date))}</div>
						<AudiogramChart audiogram={m().audiogram!} marker={m().frequency}/>
					</div>
				}</Show>
			</CardContent>
		</Card>
	);
}

function describeMatch(m: MatchResult) {
	const loudness = sensationLevel(m);
	return [
		m.type === 'tonal' ? 'tonal' : 'hissing',
		!m.reliable && 'rounds disagreed',
		loudness !== null && `loudness ${loudness} dB`,
		...(m.inhibition ?? []).map(t => `after-effect at ${formatFrequency(t.frequency)}: ${describeInhibition(t)}`),
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
	const listened = formatMinutes(Math.round(s.listenedSeconds / 60));
	const length = s.completed ? listened : `${listened} of ${formatMinutes(Math.round(s.plannedSeconds / 60))}`;
	return `${length} · ${formatFrequency(s.frequency)} · ${s.noiseColor} · ${s.notchWidth.toFixed(2)} oct`;
}

function formatRating(rating: Rating) {
	return rating === null ? '–' : String(rating);
}

function formatChange(change: number | null) {
	if (change === null) return '–';
	const rounded = Math.round(change * 10) / 10;
	return rounded > 0 ? `+${rounded}` : String(rounded);
}
