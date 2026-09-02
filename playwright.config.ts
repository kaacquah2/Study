import { defineConfig } from '@playwright/test';

export default defineConfig({
	timeout: 60_000,
	webServer: {
		command: 'npm run build && npm run preview',
		port: 4173,
		timeout: 120_000,
		reuseExistingServer: !process.env.CI
	},
	testMatch: '**/*.e2e.{ts,js}',
	use: {
		trace: 'on-first-retry'
	},
	expect: {
		toHaveScreenshot: {
			maxDiffPixelRatio: 0.05,
			threshold: 0.2
		}
	}
});
