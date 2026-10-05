import {store} from '@/app/store';
import {track} from '@/lib/analytics';
import {
	finishSession,
	listenedMs,
	MIN_SAVED_SECONDS,
	mergeSessions,
	pauseClock,
	type Rating,
	remainingMs,
	resumeClock,
	type SessionClock,
	type SessionDraft,
	startClock,
} from '@/lib/therapy/session';
import {makePersisted} from '@solid-primitives/storage';
import {createEffect, createRoot, createSignal} from 'solid-js';

export type SessionPhase = 'idle' | 'rating-before' | 'running' | 'paused' | 'rating-after';
export type SessionNotice = 'saved' | 'too-short' | 'recovered' | 'other-tab' | null;

const TICK_MS = 1000;
const CHECKPOINT_EVERY_TICKS = 15;
/** Web Lock held by the tab whose session owns the draft, from the "before" rating until idle again. */
const SESSION_LOCK = 'therapy-session';

/**
 * Therapy session lifecycle: rating before → running ⇄ paused → rating after → saved.
 * The draft is checkpointed to localStorage, so a closed tab still records the time listened.
 */
export const session = createRoot(() => {
	const [phase, setPhase] = createSignal<SessionPhase>('idle');
	const [notice, setNotice] = createSignal<SessionNotice>(null);
	const [draft, setDraft] = makePersisted(createSignal<SessionDraft | null>(null), {name: 'session-draft'});
	const [clock, setClock] = createSignal<SessionClock | null>(null);
	const [now, setNow] = createSignal(Date.now());

	let timer: ReturnType<typeof setInterval> | undefined;
	let ticks = 0;
	let releaseLock: (() => void) | undefined;
	let locking = false;

	/** Takes the session lock and holds it until `unlock`; false when another tab holds it. */
	function lock(): Promise<boolean> {
		if (!navigator.locks) return Promise.resolve(true);
		return new Promise(granted => {
			navigator.locks.request(SESSION_LOCK, {ifAvailable: true}, held => {
				granted(held !== null);
				if (held) return new Promise<void>(resolve => releaseLock = resolve);
			});
		});
	}

	function unlock() {
		releaseLock?.();
		releaseLock = undefined;
	}

	function save(ratingAfter: Rating) {
		const d = draft();
		const finished = d && finishSession(d, ratingAfter);
		if (finished) store.setSessions(sessions => mergeSessions(sessions, [finished]));
		setDraft(null);
		setClock(null);
		return finished;
	}

	// A draft left over from a closed tab: keep the time it recorded, without the "after" rating.
	// While the lock is taken, the draft belongs to a session running in another tab.
	if (draft()) {
		void lock().then(free => {
			if (free && draft()) setNotice(save(null) ? 'recovered' : null);
			unlock();
		});
	}

	function checkpoint() {
		const d = draft();
		const c = clock();
		if (!d || !c) return;
		setDraft({...d, clock: pauseClock(c, Date.now()), settings: store.settings()});
	}

	function startTicking() {
		stopTicking();
		timer = setInterval(() => {
			setNow(Date.now());
			const c = clock();
			if (c && remainingMs(c, now()) <= 0) end(true);
			else if (++ticks % CHECKPOINT_EVERY_TICKS === 0) checkpoint();
		}, TICK_MS);
	}

	function stopTicking() {
		clearInterval(timer);
		timer = undefined;
	}

	function play() {
		store.setPlayState('noise');
		startTicking();
	}

	function silence() {
		store.setPlayState('idle');
		stopTicking();
	}

	/** Asks for the "before" rating; playback starts once it is answered or skipped. */
	async function begin() {
		if (phase() !== 'idle' || locking) return;
		setNotice(null);
		locking = true;
		const free = await lock();
		locking = false;
		if (free) setPhase('rating-before');
		else setNotice('other-tab');
	}

	function start(ratingBefore: Rating) {
		const at = Date.now();
		const c = startClock(store.sessionMinutes(), at);
		setClock(c);
		setNow(at);
		setDraft({
			id: crypto.randomUUID(),
			startedAt: new Date(at).toISOString(),
			ratingBefore,
			clock: pauseClock(c, at),
			settings: store.settings(),
			completed: false,
		});
		setPhase('running');
		play();
		track('session-start', {minutes: store.sessionMinutes()});
	}

	function pause() {
		const c = clock();
		if (phase() !== 'running' || !c) return;
		silence();
		setClock(pauseClock(c, Date.now()));
		checkpoint();
		setPhase('paused');
	}

	function resume() {
		const c = clock();
		if (phase() !== 'paused' || !c) return;
		setNow(Date.now());
		setClock(resumeClock(c, now()));
		setPhase('running');
		play();
	}

	/** Ends playback; long enough sessions go on to the "after" rating, short ones are dropped. */
	function end(completed: boolean) {
		const c = clock();
		const d = draft();
		if (!c || !d) return;
		silence();
		const paused = pauseClock(c, Date.now());
		setClock(paused);
		setNow(Date.now());

		const seconds = Math.round(listenedMs(paused, 0) / 1000);
		track('session-finish', {minutes: Math.round(seconds / 60), completed});
		if (seconds < MIN_SAVED_SECONDS) {
			setDraft(null);
			setClock(null);
			setNotice('too-short');
			setPhase('idle');
			return;
		}
		setDraft({...d, clock: paused, settings: store.settings(), completed});
		setPhase('rating-after');
	}

	function finish(ratingAfter: Rating) {
		if (phase() !== 'rating-after') return;
		save(ratingAfter);
		setNotice('saved');
		setPhase('idle');
	}

	function cancel() {
		if (phase() === 'rating-before') setPhase('idle');
	}

	createEffect(() => {
		if (phase() === 'idle') unlock();
	});

	window.addEventListener('pagehide', checkpoint);
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') checkpoint();
	});

	return {
		phase,
		notice,
		/** A session draft is stored: one left from a closed tab, or one running in another tab. */
		hasDraft: () => draft() !== null,
		/** Whether a session owns the audio output: other playback must wait. */
		active: () => phase() !== 'idle',
		remainingMs: () => {
			const c = clock();
			return c ? remainingMs(c, now()) : store.sessionMinutes() * 60_000;
		},
		listenedMs: () => {
			const c = clock();
			return c ? listenedMs(c, now()) : 0;
		},
		plannedMs: () => clock()?.plannedMs ?? store.sessionMinutes() * 60_000,
		completed: () => draft()?.completed ?? false,
		dismissNotice: () => setNotice(null),
		begin, start, pause, resume, end, finish, cancel,
	};
});
