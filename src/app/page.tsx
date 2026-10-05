import {session} from '@/app/session-controller';
import {ProgressPage} from '@/app/progress-page';
import {SetupPage} from '@/app/setup-page';
import {store} from '@/app/store';
import {TherapyPage} from '@/app/therapy-page';
import {Card, CardContent} from '@/components/ui/card';
import {i18n, LOCALES, t} from '@/i18n';
import {cn} from '@/lib/utils';
import {createSignal, For, Match, Switch} from 'solid-js';

type Tab = 'therapy' | 'setup' | 'progress';
const TABS: Tab[] = ['therapy', 'setup', 'progress'];

export function IndexPage() {
	// First visit: start by finding the frequency.
	const [tab, setTab] = createSignal<Tab>(store.sessions().length || session.hasDraft() ? 'therapy' : 'setup');

	return (
		<div class="w-full space-y-6">
			<header class="flex items-center justify-between gap-4">
				<h1 class="text-lg font-semibold">{t().title}</h1>
				<LanguageSwitch/>
			</header>

			<Card class="gap-2 border-amber-500/40 bg-amber-500/5 py-4">
				<CardContent class="space-y-2 px-4 text-sm text-muted-foreground">
					<p>
						<strong class="text-foreground">{t().disclaimer.strong}</strong>{' '}
						{t().disclaimer.text}
					</p>
					<p>{t().disclaimer.doctor}</p>
				</CardContent>
			</Card>

			<nav class="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1" role="tablist">
				<For each={TABS}>{id =>
					<button role="tab" aria-selected={tab() === id}
					        class={cn(
						        'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
						        tab() === id ? 'bg-background shadow-xs' : 'text-muted-foreground hover:text-foreground',
					        )}
					        onClick={() => setTab(id)}>
						{t().tabs[id]}
						{id === 'therapy' && session.active() ? ' •' : ''}
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
				<Match when={tab() === 'progress'}>
					<ProgressPage/>
				</Match>
			</Switch>
		</div>
	);
}

/** EN / RU, each named in its own language for screen readers. */
function LanguageSwitch() {
	return (
		<div class="flex gap-1 rounded-md bg-muted p-0.5 text-xs font-medium" role="radiogroup" aria-label="Language / Язык">
			<For each={LOCALES}>{locale =>
				<button role="radio" aria-checked={i18n.locale() === locale} lang={locale}
				        aria-label={locale === 'en' ? 'English' : 'Русский'}
				        class={cn(
					        'rounded px-2 py-1 uppercase transition-colors',
					        i18n.locale() === locale ? 'bg-background shadow-xs' : 'text-muted-foreground hover:text-foreground',
				        )}
				        onClick={() => i18n.setLocale(locale)}>
					{locale}
				</button>
			}</For>
		</div>
	);
}
