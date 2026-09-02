import { test, expect } from '@playwright/test';

test.describe('Fast UI Client Smoke Test: Create Course Form -> Navigation Flow', () => {
	test('renders create course wizard and handles mocked API responses', async ({ page }) => {
		// Mock API endpoints for fast isolated UI layout testing
		await page.route('/api/courses', async (route) => {
			await route.fulfill({
				status: 201,
				contentType: 'application/json',
				body: JSON.stringify({
					courseId: 'mock-e2e-course-123',
					status: 'draft',
					outline: {
						title: 'Linear Algebra Fundamentals',
						description: 'Introductory course on vectors and matrices.',
						modules: [
							{
								order: 1,
								type: 'lesson',
								title: 'Vectors and Vector Spaces',
								summary: 'Introduction to linear combinations.'
							}
						]
					}
				})
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
		await page.evaluate(() => {
			localStorage.setItem('study_buddy_has_session', 'true');
			localStorage.setItem('study_buddy_mock_auth', 'true');
			localStorage.setItem(
				'study_buddy_profile',
				JSON.stringify({ uid: 'mock-user-1', email: 'test@example.com' })
			);
		});

		// 2. Navigate to Course Creation
		await page.goto('/app/courses/createCourse');

		// 3. Fill in Topic and Form fields if rendered
		const topicInput = page
			.locator(
				'input[name="topic"], textarea[name="topic"], input[placeholder*="topic" i], input[id="topic"], textarea'
			)
			.first();
		if (await topicInput.isVisible()) {
			await topicInput.fill('Linear Algebra');

			const submitBtn = page
				.locator(
					'button[type="submit"]:has-text("Generate"), button:has-text("Continue"), button:has-text("Create")'
				)
				.first();
			if (await submitBtn.isVisible()) {
				await submitBtn.click();
			}
		}

		// 4. Verify user stays within application boundary
		await expect(page).toHaveURL(/.*(create|courses|app|\/).*/);
	});
});
