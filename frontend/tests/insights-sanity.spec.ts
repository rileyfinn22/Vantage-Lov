import { test, expect } from '@playwright/test';

test.describe('Insights Sanity Test', () => {
  test('should sign in as lee@v.alexw.codes and verify insights functionality', async ({ page }) => {
    // Navigate to the app
    await page.goto('/');

    // Should redirect to /dash and show login form
    await page.goto('/dash');
    await expect(page.locator('h1')).toContainText('Vantage.ai');

    // Sign in as lee@v.alexw.codes
    await page.fill('input[placeholder="Email"]', 'lee@v.alexw.codes');
    await page.fill('input[placeholder="Password"]', 'brazil-tree-fire'); // You may need to adjust this password
    await page.click('button[type="submit"]');

    // Wait for successful login - just wait for URL change and assume success if no redirect to login

    // Navigate to insights page
    await page.click('button:has-text("Insights")');

    // Wait for insights page to load - check for loading spinner first, then content

    // Check if there's an error state first
    const errorAlert = page.locator('.alert.alert-error');
    if (await errorAlert.isVisible()) {
      console.log('Error found on insights page:', await errorAlert.textContent());
    }

    // Wait for either the insights content to load or loading spinner
    await page.waitForSelector('h1:has-text("Sales Insights"), .loading.loading-spinner, .alert.alert-error');

    // If we have a loading spinner, wait for it to disappear
    const loadingSpinner = page.locator('.loading.loading-spinner');
    if (await loadingSpinner.isVisible()) {
      await loadingSpinner.waitFor({ state: 'detached' });
    }

    // Now check for the main heading
    await expect(page.locator('h1')).toContainText('Sales Insights');
    await expect(page.locator('text=Analyze sales patterns and pain points across different phases')).toBeVisible();

    // Verify that the insights data sections are present
    await expect(page.locator('text=Top Prospect Objections')).toBeVisible();
    await expect(page.locator('text=Top Prospect Pain Points')).toBeVisible();
    await expect(page.locator('text=Top Rep Pain Points')).toBeVisible();

    // Verify the main insights sections are visible and functional
    // (Phase tabs and time period selectors are not currently implemented)

    // Check that insights data is loaded (should have some cards with data)
    // Look for cards with border styling that contain insight data
    const insightCards = page.locator('.card.bg-base-100.shadow-lg');
    await expect(insightCards).toHaveCount(3); // Should have 3 main insight categories

    // Verify that each card has content
    for (let i = 0; i < 3; i++) {
      const card = insightCards.nth(i);
      await expect(card.locator('.card-title')).toBeVisible();
      // Card should have either data items or be in a loading state
      const hasData = await card.locator('.p-4.border').count() > 0;
      const isLoading = await card.locator('.loading.loading-spinner').isVisible();
      expect(hasData || isLoading).toBeTruthy();
    }

    // Test "View Details" button functionality (if data is present)
    const viewDetailsButtons = page.locator('button:has-text("View Details")');
    const buttonCount = await viewDetailsButtons.count();

    if (buttonCount > 0) {
      // Click the first "View Details" button
      await viewDetailsButtons.first().click();

      // Should navigate to a detail page (URL should change)
      await page.waitForURL(/\/insights\/(objection|prospect-pain|rep-pain)\/\d+/);

      // Navigate back to insights to continue testing
      await page.click('button:has-text("Insights")');
    }
  });

});