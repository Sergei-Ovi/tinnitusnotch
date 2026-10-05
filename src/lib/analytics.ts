declare global {
	interface Window {
		umami?: {track(event: string, data?: Record<string, string | number | boolean>): void};
	}
}

/** Anonymous umami event; a no-op in development, where the script is not loaded. Never send frequencies or ratings. */
export function track(event: string, data?: Record<string, string | number | boolean>) {
	try {
		window.umami?.track(event, data);
	} catch {
		// Analytics must never break the app.
	}
}
