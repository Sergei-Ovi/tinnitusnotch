import {AudioGenerator, type PlayState} from '@/lib/audio';
import type {NoiseColor} from '@/lib/audio/noise-spectrum';
import {clamp, MAX_FREQUENCY, MIN_FREQUENCY} from '@/lib/audio/scale';
import type {MatchResult} from '@/lib/matching/wizard';
import {DEFAULT_SESSION_MINUTES, type Session, type TherapySettings} from '@/lib/therapy/session';
import {makePersisted} from '@solid-primitives/storage';
import {createEffect, createRoot, createSignal} from 'solid-js';

export const MIN_NOTCH_WIDTH = 0.25;
export const MAX_NOTCH_WIDTH = 1;
const DEFAULT_VOLUME = 30;

/** App-wide state, shared by the tabs and kept alive when switching between them. */
export const store = createRoot(() => {
	const [frequency, setFrequencyRaw] = makePersisted(createSignal(4000), {name: 'frequency'});
	// Stored under a new key: the old `volume` value meant a raw gain and is not compatible.
	const [volume, setVolumeRaw] = makePersisted(createSignal(DEFAULT_VOLUME), {name: 'volume-level'});
	const [notchWidth, setNotchWidthRaw] = makePersisted(createSignal(1), {name: 'notch-width'});
	const [noiseColor, setNoiseColor] = makePersisted(createSignal<NoiseColor>('pink'), {name: 'noise-color'});
	const [sessionMinutes, setSessionMinutes] = makePersisted(createSignal(DEFAULT_SESSION_MINUTES), {name: 'session-minutes'});
	const [sessions, setSessions] = makePersisted(createSignal<Session[]>([]), {name: 'sessions'});
	/** Finished frequency matchings, newest first. */
	const [matches, setMatches] = makePersisted(createSignal<MatchResult[]>([]), {name: 'matches'});

	const [playState, setPlayState] = createSignal<PlayState>('idle');

	const setFrequency = (value: number) => setFrequencyRaw(Math.round(clamp(value, MIN_FREQUENCY, MAX_FREQUENCY)));
	const setVolume = (value: number) => setVolumeRaw(Math.round(clamp(value, 0, 100)));
	const setNotchWidth = (value: number) => setNotchWidthRaw(clamp(value, MIN_NOTCH_WIDTH, MAX_NOTCH_WIDTH));

	const settings = (): TherapySettings => ({
		frequency: frequency(),
		notchWidth: notchWidth(),
		noiseColor: noiseColor(),
		volume: volume(),
	});

	const applySettings = (s: TherapySettings) => {
		setFrequency(s.frequency);
		setNotchWidth(s.notchWidth);
		setNoiseColor(s.noiseColor);
		setVolume(s.volume);
	};

	const audio = new AudioGenerator(settings());
	createEffect(() => audio.setVolume(volume()));
	createEffect(() => audio.setFrequency(frequency()));
	createEffect(() => audio.setNotchWidth(notchWidth()));
	createEffect(() => audio.setNoiseColor(noiseColor()));
	createEffect(() => audio.setState(playState()));

	return {
		audio,
		frequency, setFrequency,
		volume, setVolume,
		notchWidth, setNotchWidth,
		noiseColor, setNoiseColor,
		sessionMinutes, setSessionMinutes,
		sessions, setSessions,
		matches, setMatches,
		playState, setPlayState,
		settings, applySettings,
	};
});
