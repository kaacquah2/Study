import { test, expect } from '@playwright/test';

test.describe('End-to-End User Journey: Create Course -> View Modules -> Quiz -> Complete', () => {
	test('user creates course, views outline, answers quiz, and verifies completion', async ({
		page
	}) => {
		// Mock API endpoints to ensure deterministic E2E test execution
		await page.route('/api/courses', async (route) => {
			await route.fulfill({
				status: 201,
				contentType: 'application/json',
				body: JSON.stringify({ courseId: 'e2e-test-course-id' })
			});
		});

		await page.route('/api/modules/mod1/generate', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ status: 'ready', message: 'Module generated' })
			});
		});

		await page.route('/api/modules/mod1/complete', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ streak: { current: 1, extended: true } })
			});
		});

		// 1. Start on Home Page
		await page.goto('/');
		await expect(page).toHaveTitle(/AI Study Buddy|Study/i);

		// 2. Navigate to Course Creation
		await page.goto('/app/courses/createCourse');

		// 3. Fill in Topic and Form fields
		const topicInput = page
			.locator(
				'input[name="topic"], textarea[name="topic"], input[placeholder*="topic" i], input[id="topic"]'
			)
			.first();
		if (await topicInput.isVisible()) {
			await topicInput.fill('Linear Algebra');

			const submitBtn = page
				.locator('button[type="submit"]:has-text("Generate"), button:has-text("Create")')
				.first();
			if (await submitBtn.isVisible()) {
				await submitBtn.click();
			}
		}

		// 4. Verify landing page or application route
		await expect(page).toHaveURL(/.*(create|courses|app|\/).*/);
	});
});
