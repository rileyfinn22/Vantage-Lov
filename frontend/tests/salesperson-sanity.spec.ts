import { test, expect } from '@playwright/test';

test.describe('Salesperson Sanity Test', () => {
  test('should sign in as lee@v.alexw.codes and verify salesperson functionality', async ({ page }) => {
    // Navigate to the app
    await page.goto('/');

    // Should redirect to /dash and show login form
    await page.goto('/dash');
    await expect(page.locator('h1')).toContainText('Vantage.ai');

    // Sign in as lee@v.alexw.codes
    await page.fill('input[placeholder="Email"]', 'lee@v.alexw.codes');
    await page.fill('input[placeholder="Password"]', 'brazil-tree-fire'); // You may need to adjust this password
    await page.click('button[type="submit"]');

    // Wait for dashboard to load
    await expect(page.locator('h1')).toContainText('Dashboard for');
    await expect(page.locator('text=Rep Dashboard')).toBeVisible();

    // Verify salespeople are visible in the leaderboard
    await expect(page.locator('[data-testid="leaderboard-entry-details"]').first()).toBeVisible();

    // Click the first salesperson's details button
    await page.locator('[data-testid="leaderboard-entry-details"]').first().click();

    // Verify we're on a salesperson detail page
    await expect(page.url()).toMatch(/\/salesperson\/\d+/);

    // Verify salesperson info displays correctly
    await expect(page.locator('h1')).toBeVisible(); // Salesperson name
    await expect(page.locator('text=Sales Rep')).toBeVisible(); // Role

    // Look for interactions section
    const interactionElement = page.locator('text=interaction').first();
    if (await interactionElement.isVisible()) {
      await interactionElement.click();

      // Verify interaction details are shown - check for the heading specifically
      await expect(page.locator('h2:has-text("Recent Interactions")')).toBeVisible();
    }
  });
});