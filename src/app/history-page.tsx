import {store} from '@/app/store';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from '@/components/ui/card';
import {formatFrequency, formatMinutes} from '@/lib/format';
import {mergeMatches} from '@/lib/matching/wizard';
import {createBackup, parseBackup} from '@/lib/therapy/backup';
import {mergeSessions, type Rating, type Session, sessionStats} from '@/lib/therapy/session';
import {createMemo, createSignal, For, Show} from 'solid-js';

const dateFormat = new Intl.DateTimeFormat(undefined, {
	weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});

export function HistoryPage() {
	const stats = createMemo(() => sessionStats(store.sessions(), new Date()));
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
