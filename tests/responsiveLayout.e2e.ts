import { test, expect } from '@playwright/test';

// Matrix of 8 real and OS-scaled laptop viewports
const laptopViewports = [
	{ name: 'Netbook / 175% Scaled 1080p', width: 1024, height: 600 },
	{ name: '1366x768 @ 125% Scale', width: 1093, height: 614 },
	{ name: '1536x864 @ 125% Scale', width: 1228, height: 691 },
	{ name: '720p Unscaled / 1080p @ 150% Scale', width: 1280, height: 720 },
	{ name: '1366x768 @ 100% Unscaled Chromebook', width: 1366, height: 768 },
	{ name: '1440x900 @ 100% Unscaled MacBook', width: 1440, height: 900 },
	{ name: '1536x864 @ 100% Unscaled Panel', width: 1536, height: 864 },
	{ name: '1920x1080 @ 100% Full HD', width: 1920, height: 1080 }
];

test.describe('Laptop Responsiveness & Layout Suite (Phase 1)', () => {
	for (const vp of laptopViewports) {
		test(`Landing Page renders without horizontal overflow at ${vp.width}x${vp.height} (${vp.name})`, async ({
			page
		}) => {
			await page.setViewportSize({ width: vp.width, height: vp.height });
			await page.goto('/');

			// Check that page scrollWidth does not exceed clientWidth (no horizontal scrollbar)
			const hasHorizontalOverflow = await page.evaluate(() => {
				return document.documentElement.scrollWidth > document.documentElement.clientWidth;
			});

			expect(hasHorizontalOverflow).toBe(false);
		});

		test(`App Dashboard renders without horizontal overflow at ${vp.width}x${vp.height} (${vp.name})`, async ({
			page
		}) => {
			await page.setViewportSize({ width: vp.width, height: vp.height });
			await page.goto('/app');

			const hasHorizontalOverflow = await page.evaluate(() => {
				return document.documentElement.scrollWidth > document.documentElement.clientWidth;
			});

			expect(hasHorizontalOverflow).toBe(false);
		});

		test(`Course Creation Wizard renders without horizontal overflow at ${vp.width}x${vp.height} (${vp.name})`, async ({
			page
		}) => {
			await page.setViewportSize({ width: vp.width, height: vp.height });
			await page.goto('/app/courses/createCourse');

			const hasHorizontalOverflow = await page.evaluate(() => {
				return document.documentElement.scrollWidth > document.documentElement.clientWidth;
			});

			expect(hasHorizontalOverflow).toBe(false);
		});

		test(`Explore Page renders without horizontal overflow at ${vp.width}x${vp.height} (${vp.name})`, async ({
			page
		}) => {
			await page.setViewportSize({ width: vp.width, height: vp.height });
			await page.goto('/app/explore');

			const hasHorizontalOverflow = await page.evaluate(() => {
				return document.documentElement.scrollWidth > document.documentElement.clientWidth;
			});

			expect(hasHorizontalOverflow).toBe(false);
		});

		test(`Knowledge Base renders without horizontal overflow at ${vp.width}x${vp.height} (${vp.name})`, async ({
			page
		}) => {
			await page.setViewportSize({ width: vp.width, height: vp.height });
			await page.goto('/app/knowledge');

			const hasHorizontalOverflow = await page.evaluate(() => {
				return document.documentElement.scrollWidth > document.documentElement.clientWidth;
			});

			expect(hasHorizontalOverflow).toBe(false);
		});

		test(`Settings Page renders without horizontal overflow at ${vp.width}x${vp.height} (${vp.name})`, async ({
			page
		}) => {
			await page.setViewportSize({ width: vp.width, height: vp.height });
			await page.goto('/app/settings');

			const hasHorizontalOverflow = await page.evaluate(() => {
				return document.documentElement.scrollWidth > document.documentElement.clientWidth;
			});

			expect(hasHorizontalOverflow).toBe(false);
		});
	}
});
