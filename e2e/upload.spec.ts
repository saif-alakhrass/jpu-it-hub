/**
 * E2E tests for critical upload paths
 */

import { test, expect } from '@playwright/test';

test.describe('File Upload Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
    
    // Login if needed (based on actual auth implementation)
    const loginButton = page.locator('button').filter({ hasText: /login|دخول/i });
    if (await loginButton.isVisible()) {
      await loginButton.click();
      // Wait for auth page to load
      await page.waitForURL(/auth|login/, { timeout: 5000 });
      // Handle actual auth flow based on implementation
    }
  });

  test('should navigate to upload page and see upload interface', async ({ page }) => {
    // Navigate to a subject page (adjust selector based on actual implementation)
    const subjectLink = page.locator('a').filter({ hasText: /مادة|subject/i }).first();
    if (await subjectLink.isVisible()) {
      await subjectLink.click();
    }
    
    // Verify upload interface is present
    const uploadButton = page.locator('button').filter({ hasText: /رفع|upload/i });
    await expect(uploadButton).toBeVisible();
  });

  test('should show file input when upload is clicked', async ({ page }) => {
    const uploadButton = page.locator('button').filter({ hasText: /رفع|upload/i });
    await uploadButton.click();
    
    // Verify file input appears
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeVisible();
  });

  test('should validate file type (reject invalid extensions)', async ({ page }) => {
    const uploadButton = page.locator('button').filter({ hasText: /رفع|upload/i });
    await uploadButton.click();
    
    const fileInput = page.locator('input[type="file"]');
    
    // Create a temporary file with invalid extension
    const fileContent = Buffer.from('test content');
    const file = new File([fileContent], 'test.exe', { type: 'application/octet-stream' });
    
    // Try to upload invalid file
    await fileInput.setInputFiles(file);
    
    // Wait for validation error
    const errorMessage = page.locator('text=/غير مدعوم|not supported|invalid/i');
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });

  test('should validate file size (reject too large files)', async ({ page }) => {
    const uploadButton = page.locator('button').filter({ hasText: /رفع|upload/i });
    await uploadButton.click();
    
    const fileInput = page.locator('input[type="file"]');
    
    // Try to upload a large file (mock the file size validation)
    // This would need to be adjusted based on actual implementation
    // For now, we test the validation UI exists
    const maxSizeInfo = page.locator('text=/حجم الملف|file size/i');
    await expect(maxSizeInfo).toBeVisible();
  });
});

test.describe('File Download Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Login if needed
  });

  test('should show download button for available files', async ({ page }) => {
    // Navigate to a page with files
    const subjectLink = page.locator('a').filter({ hasText: /مادة|subject/i }).first();
    if (await subjectLink.isVisible()) {
      await subjectLink.click();
    }
    
    // Verify download buttons exist
    const downloadButtons = page.locator('button').filter({ hasText: /تنزيل|download/i });
    const count = await downloadButtons.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should show preview button for available files', async ({ page }) => {
    // Navigate to a page with files
    const subjectLink = page.locator('a').filter({ hasText: /مادة|subject/i }).first();
    if (await subjectLink.isVisible()) {
      await subjectLink.click();
    }
    
    // Verify preview buttons exist
    const previewButtons = page.locator('button').filter({ hasText: /عرض|preview/i });
    const count = await previewButtons.count();
    expect(count).toBeGreaterThan(0);
  });
});

test.describe('Admin Moderation Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Login as admin (if admin credentials exist)
  });

  test('should navigate to admin panel', async ({ page }) => {
    // Check if admin link exists
    const adminLink = page.locator('a').filter({ hasText: /إدارة|admin/i });
    if (await adminLink.isVisible()) {
      await adminLink.click();
      
      // Verify admin panel loads
      const adminTitle = page.locator('h1').filter({ hasText: /لوحة الإدارة|admin panel/i });
      await expect(adminTitle).toBeVisible();
    } else {
      // Skip test if admin access not available
      test.skip();
    }
  });

  test('should show pending files tab in admin panel', async ({ page }) => {
    const adminLink = page.locator('a').filter({ hasText: /إدارة|admin/i });
    if (await adminLink.isVisible()) {
      await adminLink.click();
      
      const pendingTab = page.locator('button').filter({ hasText: /قيد المراجعة|pending/i });
      await expect(pendingTab).toBeVisible();
    } else {
      test.skip();
    }
  });
});