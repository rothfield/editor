/**
 * Test that constraints dialog tabs use updated labels (Raga, Maqam instead of Indian, Arabic)
 */

import { test, expect } from '@playwright/test';

test('Constraints dialog shows Raga and Maqam tabs', async ({ page }) => {
  await page.goto('/');

  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();
  await editor.click();

  // Wait for editor initialization
  await expect.poll(async () => {
    return await page.evaluate(() => {
      return window.editor?.isInitialized && window.editor?.wasmModule !== null;
    });
  }, { timeout: 10000 }).toBeTruthy();

  // Open constraints dialog
  await page.evaluate(() => {
    window.editor.ui.setConstraints();
  });

  const dialog = page.locator('#constraints-modal');
  await expect(dialog).toBeVisible({ timeout: 3000 });

  // Check tab labels
  const westernTab = page.locator('[data-tab="western"]');
  await expect(westernTab).toHaveText('Western');

  const ragaTab = page.locator('[data-tab="raga"]');
  await expect(ragaTab).toHaveText('Raga');

  const maqamTab = page.locator('[data-tab="maqam"]');
  await expect(maqamTab).toHaveText('Maqam');

  const allTab = page.locator('[data-tab="all"]');
  await expect(allTab).toHaveText('All');

  console.log('✅ Tab labels correctly show: Western, Raga, Maqam, All');

  // Click Raga tab
  await ragaTab.click();
  await page.waitForTimeout(300);

  // Verify Raga panel is active
  const ragaPanel = page.locator('[data-panel="raga"]');
  await expect(ragaPanel).toBeVisible();

  // Verify Raga constraints are displayed
  const ragaConstraints = await page.evaluate(() => {
    const grid = document.querySelector('#constraints-grid-raga');
    const cards = grid?.querySelectorAll('[data-constraint-id]');
    return Array.from(cards || []).map(card => ({
      id: card.getAttribute('data-constraint-id'),
      name: card.querySelector('.constraints-card-title')?.textContent.trim()
    }));
  });

  console.log(`Raga tab contains ${ragaConstraints.length} constraints`);
  console.log('Sample Raga constraints:', ragaConstraints.slice(0, 3));

  // Verify some expected ragas are present
  const ragaIds = ragaConstraints.map(c => c.id);
  expect(ragaIds).toContain('bhairav');
  expect(ragaIds).toContain('bhupali');
  expect(ragaIds).toContain('todi');

  // Click Maqam tab
  await maqamTab.click();
  await page.waitForTimeout(300);

  // Verify Maqam panel is active
  const maqamPanel = page.locator('[data-panel="maqam"]');
  await expect(maqamPanel).toBeVisible();

  // Verify Maqam constraints are displayed
  const maqamConstraints = await page.evaluate(() => {
    const grid = document.querySelector('#constraints-grid-maqam');
    const cards = grid?.querySelectorAll('[data-constraint-id]');
    return Array.from(cards || []).map(card => ({
      id: card.getAttribute('data-constraint-id'),
      name: card.querySelector('.constraints-card-title')?.textContent.trim()
    }));
  });

  console.log(`Maqam tab contains ${maqamConstraints.length} constraints`);
  console.log('Maqam constraints:', maqamConstraints);

  // Verify expected maqams are present
  const maqamIds = maqamConstraints.map(c => c.id);
  expect(maqamIds).toContain('maqam_rast');
  expect(maqamIds).toContain('maqam_bayati');
  expect(maqamIds).toContain('maqam_hijaz');

  // Take screenshot
  await page.screenshot({
    path: 'artifacts/constraints-tabs-updated.png',
    fullPage: false
  });

  console.log('✅ Constraints dialog tabs updated successfully');
  console.log('   - Western tab: works');
  console.log('   - Raga tab: works (replaces Indian)');
  console.log('   - Maqam tab: works (replaces Arabic)');
});
