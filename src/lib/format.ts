export function formatFrequency(frequency: number) {
	return frequency >= 1000 ? `${+(frequency / 1000).toFixed(2)} kHz` : `${frequency} Hz`;
}

/** Countdown display: m:ss, or h:mm:ss from an hour. */
export function formatClock(ms: number) {
	const total = Math.max(0, Math.ceil(ms / 1000));
	const h = Math.floor(total / 3600);
	const m = Math.floor(total / 60) % 60;
	const s = String(total % 60).padStart(2, '0');
	return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function formatMinutes(minutes: number) {
	if (minutes < 60) return `${minutes} min`;
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return m ? `${h} h ${m} min` : `${h} h`;
}
