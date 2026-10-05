import {HistoryPage} from '@/app/history-page';
import {session} from '@/app/session-controller';
import {SetupPage} from '@/app/setup-page';
import {store} from '@/app/store';
import {TherapyPage} from '@/app/therapy-page';
import {Card, CardContent} from '@/components/ui/card';
import {cn} from '@/lib/utils';
import {createSignal, For, Match, Switch} from 'solid-js';

type Tab = 'therapy' | 'setup' | 'history';

const TABS: {id: Tab; label: string}[] = [
	{id: 'therapy', label: 'Therapy'},
	{id: 'setup', label: 'Setup'},
	{id: 'history', label: 'History'},
];

export function IndexPage() {
	// First visit: start by finding the frequency.
	const [tab, setTab] = createSignal<Tab>(store.sessions().length || session.notice() ? 'therapy' : 'setup');

	return (
		<div class="w-full space-y-6">
			<Card class="gap-2 border-amber-500/40 bg-amber-500/5 py-4">
				<CardContent class="space-y-2 px-4 text-sm text-muted-foreground">
					<p>
						<strong class="text-foreground">Not a medical treatment.</strong>{' '}
						Notched sound therapy may reduce tinnitus loudness for some people; evidence is limited.
						Use headphones and start quiet: therapy noise should be no louder than your tinnitus,
						which should stay audible. Stop if you feel discomfort or ear fullness.
					</p>
					<p>
						See a doctor first if your tinnitus is pulsing in time with your heartbeat, appeared suddenly
						in one ear, or comes with hearing loss or dizziness.
					</p>
				</CardContent>
			</Card>

			<nav class="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1" role="tablist">
				<For each={TABS}>{t =>
					<button role="tab" aria-selected={tab() === t.id}
					        class={cn(
						        'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
						        tab() === t.id ? 'bg-background shadow-xs' : 'text-muted-foreground hover:text-foreground',
					        )}
					        onClick={() => setTab(t.id)}>
						{t.label}
						{t.id === 'therapy' && session.active() ? ' •' : ''}
					</button>
				}</For>
			</nav>

			<Switch>
				<Match when={tab() === 'therapy'}>
					<TherapyPage onOpenSetup={() => setTab('setup')}/>
				</Match>
				<Match when={tab() === 'setup'}>
					<SetupPage onOpenTherapy={() => setTab('therapy')}/>
				</Match>
				<Match when={tab() === 'history'}>
					<HistoryPage/>
				</Match>
			</Switch>
		</div>
	);
}
