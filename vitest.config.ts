import {defineConfig} from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// Separate from vite.config.ts: procedure logic is pure and runs in node, without the Solid/DOM setup.
export default defineConfig({
	plugins: [tsconfigPaths()],
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts'],
	},
});
