import {formatClock} from '@/lib/format';
import type {InhibitionEffect, InhibitionTrial} from '@/lib/matching/inhibition';
import {MAX_TIMED_SECONDS} from '@/lib/matching/inhibition';
import type {NoiseColor} from '@/lib/audio/noise-spectrum';

const number = new Intl.NumberFormat('en', {maximumFractionDigits: 2});
const plural = (n: number, one: string, other: string) => `${n} ${n === 1 ? one : other}`;

const minutes = (value: number) => {
	if (value < 60) return `${value} min`;
	const h = Math.floor(value / 60);
	const m = value % 60;
	return m ? `${h} h ${m} min` : `${h} h`;
};

const effects: Record<InhibitionEffect, string> = {gone: 'gone', quieter: 'quieter', none: 'no change', louder: 'louder'};

export const en = {
	locale: 'en',
	language: 'English',
	title: 'Tinnitus Notch',

	format: {
		frequency: (f: number) => f >= 1000 ? `${number.format(f / 1000)} kHz` : `${f} Hz`,
		minutes,
		/** Level relative to the calibration tone. */
		level: (db: number) => `${db > 0 ? '+' : ''}${db} dB`,
		semitones: (value: number) => {
			const sign = value > 0 ? '+' : value < 0 ? '−' : '';
			return `${sign}${number.format(Math.abs(value))} ${Math.abs(value) === 1 ? 'semitone' : 'semitones'}`;
		},
		octaves: (value: number) => `${value.toFixed(2)} oct`,
		decimal: (value: number) => number.format(value),
		/** "quieter for 40 s", "gone for 2:05", "no change". */
		inhibition: (t: InhibitionTrial) => {
			const effect = effects[t.effect];
			if (t.seconds === null) return effect;
			const time = t.seconds < 60 ? `${t.seconds} s` : formatClock(t.seconds * 1000);
			return `${effect} for ${t.seconds >= MAX_TIMED_SECONDS ? `${time} or more` : time}`;
		},
	},

	disclaimer: {
		strong: 'Not a medical treatment.',
		text: 'Notched sound therapy may reduce tinnitus loudness for some people; evidence is limited. '
			+ 'Use headphones and start quiet: therapy noise should be no louder than your tinnitus, '
			+ 'which should stay audible. Stop if you feel discomfort or ear fullness.',
		doctor: 'See a doctor first if your tinnitus is pulsing in time with your heartbeat, appeared suddenly '
			+ 'in one ear, or comes with hearing loss or dizziness.',
	},
	tabs: {therapy: 'Therapy', setup: 'Setup', progress: 'Progress'},

	common: {
		cancel: 'Cancel',
		skip: 'Skip',
		start: 'Start',
		finish: 'Finish',
		close: 'Close',
		play: 'Play',
		stop: 'Stop',
		volume: 'Volume',
		level: 'Level',
		sessionBusy: 'A therapy session is in progress.',
	},

	rating: {
		scale: 'Tinnitus loudness, 0 to 10',
		low: '0 — not audible',
		high: '10 — as loud as it gets',
	},

	noiseColors: {white: 'White', pink: 'Pink', brown: 'Brown'} satisfies Record<NoiseColor, string>,

	therapy: {
		notices: {
			'saved': 'Session saved.',
			'too-short': 'The session was shorter than a minute and was not saved.',
			'recovered': 'An unfinished session from last time was saved with the time you listened.',
			'other-tab': 'A session is already running in another tab. Finish it there, or close that tab.',
		},
		before: {
			title: 'How loud is your tinnitus right now?',
			description: 'Rate it before the session; the noise starts after you answer.',
		},
		after: {
			complete: 'Session complete',
			ended: 'Session ended',
			description: 'How loud is your tinnitus now?',
		},
		sound: 'Sound',
		soundHint: 'Listen at a comfortable level, no louder than your tinnitus: it should stay audible.',
		noise: 'Noise',
		noiseColor: 'Noise colour',
		notchWidth: 'Notch width',
		idleTitle: 'Therapy session',
		idleBefore: 'Noise with a band around ',
		idleAfter: ' removed.',
		changeFrequency: 'Change frequency',
		duration: 'Duration',
		sessionDuration: 'Session duration',
		startSession: 'Start session',
		paused: 'Paused',
		running: 'Session in progress',
		notchedAt: (f: string) => `Notched noise at ${f}.`,
		pause: 'Pause',
		resume: 'Resume',
		endSession: 'End session',
	},

	setup: {
		paused: 'Matching paused',
		pausedText: 'A therapy session is in progress. End it to continue matching.',
		findTitle: 'Find your frequency',
		findText: 'A guided test: you compare pairs of sounds with your tinnitus, check the octave and fine-tune '
			+ 'the result. It takes about 10 minutes; you need headphones and a quiet room.',
		yourMatch: (f: string) => `Your match: ${f}`,
		matchedOn: (tonal: boolean, date: string) => `${tonal ? 'Tonal' : 'Hissing'} tinnitus · matched ${date}`,
		unreliable: 'The comparison rounds disagreed, so this match may be inaccurate.',
		loudness: (db: number) => `Loudness: ${db} dB above your hearing threshold.`,
		afterEffect: (list: string) => `After-effect: ${list}.`,
		manualInUse: (f: string) => `Therapy currently uses ${f}, set manually.`,
		matchAgain: 'Match again',
		startMatching: 'Start matching',
		busyMatching: 'A therapy session is in progress. End it to start matching.',
		knowFrequency: 'I know my frequency',
		manualTitle: 'Set the frequency manually',
		manualText: 'Play the tone and move it until it matches the pitch of your tinnitus. '
			+ 'Check one octave up and down too: octave mistakes are very common.',
		frequency: 'Frequency',
		hz: 'Hz',
		octaveDown: '−1 octave',
		octaveUp: '+1 octave',
		semitoneDown: '−semitone',
		semitoneUp: '+semitone',
		playTone: 'Play tone',
		stopTone: 'Stop tone',
		busyTone: 'A therapy session is in progress. End it to play the tone.',
	},

	wizard: {
		steps: {
			calibrate: 'Calibrate',
			hearing: 'Hearing',
			type: 'Sound type',
			match: 'Compare',
			octave: 'Octave',
			fineTune: 'Fine-tune',
			loudness: 'Loudness',
			inhibition: 'After-effect',
		},
		stepsLabel: 'Matching steps',
		calibrate: {
			title: 'Calibrate the volume',
			intro: 'Put on headphones and sit somewhere quiet. Matching takes about 10 minutes.',
			before: 'Play the reference tone and set your ',
			strong: "computer's volume",
			after: " so the tone is quiet but clear. Don't change it again until the end.",
			done: 'The tone is quiet but clear',
			reference: 'Reference tone, 1 kHz',
		},
		hearing: {
			title: 'Hearing check (optional)',
			intro: "You'll hear short beeps in one ear at a time, getting quieter, and say whether you heard them. "
				+ 'Tinnitus is often pitched near where hearing drops off, so this gives the comparisons a head start, '
				+ 'and fits the levels of the sounds you compare to your hearing.',
			duration: 'It takes 5–7 minutes. It is not a medical hearing test.',
			question: 'Did you hear the beeps?',
			hint: 'Answer yes only if you heard the beeps, even faintly. Your tinnitus may sound similar: '
				+ "listen for the rhythm. Replay them if you're unsure.",
			skip: 'Skip the check',
			progress: (n: number, total: number) => `Sound ${n} of ${total}`,
			ear: (left: boolean): string => left ? 'Left ear' : 'Right ear',
			playAgain: 'Play again',
			no: 'No',
			yes: 'Yes, I heard them',
			falseAlarm: 'There were no beeps that time. Answer yes only when you hear the three beeps, not a steady sound.',
		},
		type: {
			title: 'What does your tinnitus sound like?',
			intro: "Listen to the examples if you are unsure. Pitch doesn't matter here, only the kind of sound.",
			unreliable: "You answered yes a few times when no beeps played, so the hearing check won't set where "
				+ 'the comparisons start.',
			hypothesis: (f: string) => `Your hearing drops off steeply around ${f}; the comparisons will start from there.`,
			tonal: 'A tone or whistle',
			tonalText: 'One clear pitch, like a beep or ringing.',
			hissing: 'A hiss or rushing',
			hissingText: 'Like steam, static or wind, without one clear pitch.',
			hissingWarning: 'Notched therapy has been studied on tonal tinnitus and is expected to help less with hissing.',
			example: 'Example',
			choose: 'This one',
		},
		compare: {
			title: 'Which sound is closer to your tinnitus?',
			intro: 'Compare the pitch, not the loudness. Go with your first impression: there are no wrong answers.',
			replay: 'Replay both',
			progress: (n: number, total: number) => `Comparison ${n} of ${total}`,
			round: (n: number, total: number) => `Round ${n} of ${total}`,
			sound: (id: string) => `Sound ${id}`,
			closer: (id: string) => `${id} is closer`,
			same: 'About the same',
			again: (n: number, total: number) => `Round ${n} of ${total}: the same task again, starting from different `
				+ "sounds. It's fine if your answers differ from the last round.",
			level: 'Level, if a sound is hard to hear',
		},
		octave: {
			title: 'Check the octave',
			intro: 'Sounds an octave apart are easy to confuse. Which of these is closest to your tinnitus?',
			replay: 'Replay all',
			sound: (n: number) => `Sound ${n}`,
			closest: 'Closest',
		},
		fineTune: {
			title: 'Fine-tune',
			intro: 'Play the sound and nudge it until the pitch matches your tinnitus as closely as you can.',
			done: 'This matches',
			disagreed: (spread: string, estimates: string) => `Your three rounds disagreed by ${spread} octaves `
				+ `(${estimates}), so this match may be inaccurate. You can repeat the comparisons, or fine-tune by ear.`,
			repeat: 'Repeat comparisons',
			pitch: 'Pitch',
		},
		threshold: {
			title: 'Loudness: your hearing threshold',
			intro: 'This measures how loud your tinnitus is, to track it over time. It is optional.',
			how: 'Play the sound and lower the level until you can only just hear it.',
			done: 'I can just hear it',
		},
		loudness: {
			title: 'Loudness: match your tinnitus',
			intro: 'Now raise the level until the sound is as loud as your tinnitus.',
			done: 'As loud as my tinnitus',
		},
		inhibition: {
			title: 'After-effect check (optional)',
			intro: (f: string) => `You'll hear a minute of noise around ${f}, then silence. Many people notice their `
				+ "tinnitus is quieter, or even gone, for a short while afterwards. That suggests the pitch is right; it's "
				+ 'fine if nothing happens.',
			comfort: 'Keep the noise comfortable: a little louder than your tinnitus, never unpleasant.',
			start: 'Start, 1 minute',
			listen: 'Listen to the noise',
			listenText: 'Just listen. When it stops, pay attention to your tinnitus.',
			ask: 'How is your tinnitus now?',
			askText: 'Compared with before the noise.',
			effects: {gone: 'Gone', quieter: 'Quieter', none: 'No change', louder: 'Louder'} satisfies Record<InhibitionEffect, string>,
			timing: "Tap when it's back to usual",
			timingText: 'Keep listening to your tinnitus. The timer started when the noise stopped.',
			back: "It's back",
			autoStop: (minutes: number) => `Stops by itself after ${minutes} minutes.`,
			result: 'After-effect',
			noEffect: "No after-effect isn't unusual, and therapy can still help. Sometimes it means the match is a "
				+ 'little off: you can try half an octave lower or higher.',
			try: (f: string) => `Try ${f}`,
			use: (f: string) => `Use ${f} for therapy`,
		},
		done: {
			saved: 'Saved and set as your therapy frequency.',
			unreliable: 'The comparison rounds disagreed, so the match may be off. Consider repeating it another day.',
			hissing: 'For hissing tinnitus notched therapy is expected to be less effective.',
			loudness: (db: number) => `Tinnitus loudness: ${db} dB above your hearing threshold at this pitch.`,
			hearing: 'Hearing check',
			toTherapy: 'Go to therapy',
		},
	},

	audiogram: {
		label: 'Hearing check result',
		right: 'Right ear',
		left: 'Left ear',
		notHeard: '∨ not heard at the loudest level',
		marker: (f: string) => `your match, ${f}`,
		unreliable: (falseAlarms: number, presented: number) => `Less reliable: you answered yes to ${falseAlarms} of `
			+ `${presented} silent checks, so tinnitus may have been taken for beeps and some levels may be too low.`,
		caption: 'Quietest level heard at each pitch, relative to the calibration tone; higher on the chart is better '
			+ "hearing. Not a clinical audiogram: the headphones aren't calibrated.",
	},

	trend: {
		label: 'Tinnitus loudness ratings per day, before and after sessions',
		before: 'Before',
		after: 'After',
		beforeSessions: 'Before sessions',
		afterSessions: 'After sessions',
		sessions: (n: number) => plural(n, 'session', 'sessions'),
		caption: '0 = silent, 10 = loudest; the daily average.',
	},

	progress: {
		today: 'Today',
		week: 'Last 7 days',
		weekSessions: 'Sessions, 7 days',
		change: 'Avg. change',
		rated: (n: number) => n ? `over ${n} rated` : 'no rated sessions',
		loudnessTitle: 'Tinnitus loudness',
		loudnessText: 'Your 0–10 ratings before and after sessions. Lower means quieter.',
		noTrend: 'Rate your tinnitus before and after sessions on at least two days to see a trend here.',
		sessionsTitle: 'Sessions',
		sessionsText: 'Stored only in this browser. Export a backup to keep it safe or move it.',
		noSessions: 'No sessions yet.',
		ratingTitle: 'Tinnitus loudness before → after',
		deleteSession: 'Delete session',
		delete: 'Delete',
		keep: 'Keep',
		export: 'Export JSON',
		import: 'Import JSON',
		imported: (sessions: number, added: number, matches: number, restored: boolean) =>
			`Imported ${plural(sessions, 'session', 'sessions')} (${added} new)`
			+ (matches ? ` and ${plural(matches, 'frequency match', 'frequency matches')}.` : '.')
			+ (restored ? ' Frequency and sound settings restored.' : ''),
		session: (length: string, frequency: string, color: string, notch: string) =>
			`${length} · ${frequency} · ${color.toLowerCase()} · ${notch}`,
		partial: (listened: string, planned: string) => `${listened} of ${planned}`,
		matchesTitle: 'Frequency matches',
		matchesText: 'Loudness is how far your tinnitus is above your hearing threshold at its pitch; a drop over '
			+ 'weeks is the most objective sign of change.',
		noMatches: 'No matches yet. Run one on the Setup tab.',
		hearingOn: (date: string) => `Hearing check, ${date}`,
		match: {
			tonal: 'tonal',
			hissing: 'hissing',
			disagreed: 'rounds disagreed',
			loudness: (db: number) => `loudness ${db} dB`,
			afterEffect: (f: string, effect: string) => `after-effect at ${f}: ${effect}`,
		},
	},

	backupErrors: {
		'json': () => 'The file is not valid JSON.',
		'not-backup': () => 'This is not a Tinnitus Notch backup.',
		'version': (e: {version: string}) => `Unsupported backup version: ${e.version}.`,
		'settings': () => 'The backup has invalid settings.',
		'no-sessions': () => 'The backup has no session list.',
		'session': (e: {index: number}) => `Session #${e.index + 1} in the backup is invalid.`,
		'match-list': () => 'The backup has an invalid match list.',
		'match': (e: {index: number}) => `Frequency match #${e.index + 1} in the backup is invalid.`,
	},
};

export type Messages = typeof en;
