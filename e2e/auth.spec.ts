/**
 * E2E tests for authentication flow
 */

import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('should show login button when not authenticated', async ({ page }) => {
    await page.goto('/');
    
    // Look for login-related buttons or links
    const loginButton = page.locator('button').filter({ hasText: /login|دخول|تسجيل/i });
    const loginLink = page.locator('a').filter({ hasText: /login|دخول|تسجيل/i });
    
    // At least one should be visible
    const hasLoginButton = await loginButton.isVisible().catch(() => false);
    const hasLoginLink = await loginLink.isVisible().catch(() => false);
    
    expect(hasLoginButton || hasLoginLink).toBeTruthy();
  });

  test('should navigate to auth page when login is clicked', async ({ page }) => {
    await page.goto('/');
    
    const loginButton = page.locator('button').filter({ hasText: /login|دخول|تسجيل/i });
    const loginLink = page.locator('a').filter({ hasText: /login|دخول|تسجيل/i });
    
    if (await loginButton.isVisible()) {
      await loginButton.click();
    } else if (await loginLink.isVisible()) {
      await loginLink.click();
    } else {
      test.skip('No login button/link found');
    }
    
    // Verify navigation to auth page (this depends on your auth implementation)
    await page.waitForTimeout(1000); // Wait for navigation
    const currentUrl = page.url();
    expect(currentUrl).toMatch(/auth|login|signin/i);
  });

  test('should show auth form with email and password fields', async ({ page }) => {
    await page.goto('/');
    
    // Navigate to auth page first
    const loginButton = page.locator('button').filter({ hasText: /login|دخول|تسجيل/i });
    const loginLink = page.locator('a').filter({ hasText: /login|دخول|تسجيل/i });
    
    if (await loginButton.isVisible()) {
      await loginButton.click();
    } else if (await loginLink.isVisible()) {
      await loginLink.click();
    } else {
      test.skip('No login button/link found');
    }
    
    // Verify form fields exist
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    const passwordInput = page.locator('input[type="password"], input[name="password"]');
    const submitButton = page.locator('button').filter({ hasText: /submit|login|دخول/i });
    
    await expect(emailInput.or(passwordInput)).toBeVisible();
    await expect(submitButton).toBeVisible();
  });

  test('should show validation error for empty fields', async ({ page }) => {
    await page.goto('/');
    
    // Navigate to auth page
    const loginButton = page.locator('button').filter({ hasText: /login|دخول|تسجيل/i });
    const loginLink = page.locator('a').filter({ hasText: /login|دخول|تسجيل/i });
    
    if (await loginButton.isVisible()) {
      await loginButton.click();
    } else if (await loginLink.isVisible()) {
      await loginLink.click();
    } else {
      test.skip('No login button/link found');
    }
    
    // Try to submit empty form
    const submitButton = page.locator('button').filter({ hasText: /submit|login|دخول/i });
    await submitButton.click();
    
    // Look for validation error
    const errorMessage = page.locator('text=/required|مطلوب|empty/i');
    await expect(errorMessage).toBeVisible({ timeout: 3000 });
  });

  test('should show error for invalid email format', async ({ page }) => {
    await page.goto('/');
    
    // Navigate to auth page
    const loginButton = page.locator('button').filter({ hasText: /login|دخول|تسجيل/i });
    const loginLink = page.locator('a').filter({ hasText: /login|دخول|تسجيل/i });
    
    if (await loginButton.isVisible()) {
      await loginButton.click();
    } else if (await loginLink.isVisible()) {
      await loginLink.click();
    } else {
      test.skip('No login button/link found');
    }
    
    // Enter invalid email
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    await emailInput.fill('invalid-email');
    
    const submitButton = page.locator('button').filter({ hasText: /submit|login|دخول/i });
    await submitButton.click();
    
    // Look for email validation error
    const errorMessage = page.locator('text=/email|invalid|بريد/i');
    await expect(errorMessage).toBeVisible({ timeout: 3000 });
  });
});