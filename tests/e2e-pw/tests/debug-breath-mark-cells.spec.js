import { test, expect } from '@playwright/test';

test('Debug: Check cells for 1 (2 spaces) apostrophe (2 spaces) dashes', async ({ page }) => {
  await page.goto('/');

  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible({ timeout: 10000 });

  // Wait for WASM to load
  await page.waitForFunction(() => window.editor !== undefined, { timeout: 10000 });

  // Type: 1 (space space) ' (space space) ---
  await editor.click();
  await page.keyboard.type('1  ');
  await page.keyboard.type("'  ");
  await page.keyboard.type('---');

  // Wait for processing
  await page.waitForTimeout(500);

  // Click Document Model tab
  const docTab = page.locator('[data-testid="tab-docmodel"]');
  await expect(docTab).toBeVisible();
  await docTab.click();

  // Get Document Model output
  const docPane = page.locator('[data-testid="pane-docmodel"]');
  await expect(docPane).toBeVisible();

  // Wait for content
  await page.waitForTimeout(1000);

  const docContent = await docPane.innerText();
  console.log('\n=== Document Model for "1  \'  ---" ===');
  console.log(docContent);

  // Look for breath mark cells
  const hasBreathMark = docContent.includes('BreathMark') || docContent.includes("'");
  console.log('\nHas BreathMark cell:', hasBreathMark);

  // Also check LilyPond output
  const lyTab = page.locator('[data-testid="tab-lilypond"]');
  await lyTab.click();

  const lyPane = page.locator('[data-testid="pane-lilypond"]');
  await expect(lyPane).toBeVisible();
  await page.waitForTimeout(1000);

  const lyContent = await lyPane.innerText();
  const notesMatch = lyContent.match(/\\clef treble\s+(.*?)\s+}/s);
  if (notesMatch) {
    console.log('\n=== LilyPond notes ===');
    console.log(notesMatch[1].trim());
  }
});
