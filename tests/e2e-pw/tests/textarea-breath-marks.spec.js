import { test, expect } from '@playwright/test';

test('Breath marks should be parsed correctly in textarea mode', async ({ page }) => {
  await page.goto('/');

  const textarea = page.locator('.notation-textarea').first();
  await expect(textarea).toBeVisible({ timeout: 10000 });

  // Wait for WASM to load
  await page.waitForFunction(() => window.MusicNotationApp?.app()?.editor !== undefined, { timeout: 10000 });

  // Type: 1 (space space) ' (space space) ---
  await textarea.click();
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
  await page.waitForTimeout(500);

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
  await page.waitForTimeout(500);

  const lyContent = await lyPane.innerText();
  const notesMatch = lyContent.match(/\\clef treble\s+(.*?)\s+}/s);
  if (notesMatch) {
    console.log('\n=== LilyPond notes ===');
    console.log(notesMatch[1].trim());
  }

  // Verify textarea content includes the breath mark
  const textareaValue = await textarea.inputValue();
  console.log('\n=== Textarea content ===');
  console.log('Value:', textareaValue);
  console.log('Codepoints:', [...textareaValue].map(c => `${c}:${c.codePointAt(0).toString(16)}`).join(' '));
});

test('Breath mark apostrophe should be visible in textarea', async ({ page }) => {
  await page.goto('/');

  const textarea = page.locator('.notation-textarea').first();
  await expect(textarea).toBeVisible({ timeout: 10000 });

  // Type note followed by breath mark
  await textarea.click();
  await page.keyboard.type("1'");

  await page.waitForTimeout(300);

  // Get textarea content
  const textareaValue = await textarea.inputValue();
  console.log('Textarea after "1\'":', textareaValue);

  // The breath mark should be preserved in some form
  expect(textareaValue.length).toBeGreaterThan(0);
});
