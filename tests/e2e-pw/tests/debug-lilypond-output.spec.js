import { test, expect } from '../fixtures/editor.fixture';
import fs from 'fs';

test('debug: capture LilyPond output for various content lengths', async ({ cleanPage: page }) => {
  await page.goto('/');

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Test with 150 repetitions of valid Carnatic notation
  const pattern = 'S r G m P d n S | ';
  const content200 = pattern.repeat(150);

  await page.evaluate((content) => {
    const editor = document.querySelector('[data-testid="editor-root"]');
    if (editor) {
      editor.focus();
      document.execCommand('insertText', false, content);
    }
  }, content200);

  // Click LilyPond Source tab to see the generated code
  const lilypondSourceTab = page.locator('#tab-lilypond-src');
  await expect(lilypondSourceTab).toBeVisible();
  await lilypondSourceTab.click();

  // Wait for the source to be displayed
  await page.waitForFunction(() => {
    const sourceArea = document.querySelector('#tab-content-lilypond-src pre');
    return sourceArea && sourceArea.textContent.trim().length > 0;
  }, { timeout: 10000 });

  // Get the LilyPond source
  const sourceArea = page.locator('#tab-content-lilypond-src pre');
  const lilypondSource = await sourceArea.textContent();

  // Save to file for inspection
  fs.writeFileSync('/tmp/lilypond-200-reps.ly', lilypondSource);
  console.log(`LilyPond source saved (${lilypondSource.length} bytes)`);
  console.log('First 500 chars:', lilypondSource.substring(0, 500));

  // Now test rendering
  const lilypondPngTab = page.locator('#tab-lilypond-png');
  await lilypondPngTab.click();

  // Wait for rendering
  await page.waitForFunction(() => {
    const renderArea = document.querySelector('.lilypond-svg-display');
    if (!renderArea) return false;
    return renderArea.querySelectorAll('img').length > 0 ||
           renderArea.textContent.trim().length > 0;
  }, { timeout: 15000 });

  // Check how many pages were generated
  const renderArea = page.locator('.lilypond-svg-display');
  const pagesContainer = renderArea.locator('.lp-preview');
  const containerExists = await pagesContainer.count() > 0;

  if (containerExists) {
    const pageCount = await pagesContainer.locator('img').count();
    console.log(`✅ Multi-page display: ${pageCount} page(s)`);
  } else {
    const singleImages = await renderArea.locator('img').count();
    console.log(`ℹ️  Single-page fallback: ${singleImages} image(s)`);
  }
});
