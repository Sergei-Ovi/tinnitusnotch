import type {BackupError} from '@/lib/therapy/backup';
import {makePersisted} from '@solid-primitives/storage';
import {createEffect, createRoot, createSignal} from 'solid-js';
import {en, type Messages} from './en';
import {ru} from './ru';

export type Locale = 'en' | 'ru';
export const LOCALES: Locale[] = ['en', 'ru'];
const MESSAGES: Record<Locale, Messages> = {en, ru};

/** The browser's first preferred language we have, else English. */
function detectLocale(): Locale {
	const preferred = typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language];
	for (const tag of preferred) {
		const language = tag.toLowerCase().split('-')[0];
		if (LOCALES.includes(language as Locale)) return language as Locale;
	}
	return 'en';
}

/** Interface language: detected on the first visit, then the user's choice. */
export const i18n = createRoot(() => {
	const [stored, setLocale] = makePersisted(createSignal<Locale>(detectLocale()), {name: 'locale'});
	// A value from storage that is no longer supported falls back to detection.
	const locale = () => LOCALES.includes(stored()) ? stored() : detectLocale();

	createEffect(() => {
		document.documentElement.lang = locale();
		document.title = MESSAGES[locale()].title;
	});

	return {locale, setLocale};
});

/** Messages in the current language; reactive. */
export const t = () => MESSAGES[i18n.locale()];

export const formatFrequency = (frequency: number) => t().format.frequency(frequency);
export const formatMinutes = (minutes: number) => t().format.minutes(minutes);

/** Dates in the current language. */
export function formatDate(date: Date | number, options: Intl.DateTimeFormatOptions) {
	return new Intl.DateTimeFormat(i18n.locale(), options).format(date);
}

export function describeBackupError(error: BackupError) {
	return (t().backupErrors[error.kind] as (e: BackupError) => string)(error);
}
