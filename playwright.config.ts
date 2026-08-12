import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: { command: 'npm run build && npm run preview', port: 4173, timeout: 120_000 },
	testMatch: '**/*.e2e.{ts,js}',
	use: {
		channel: 'msedge'
	},
	expect: {
		toHaveScreenshot: {
			maxDiffPixelRatio: 0.05,
			threshold: 0.2
		}
	}
});
