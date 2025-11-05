import { test, expect } from '../fixtures/editor.fixture';

test('verify LilyPond PNG tab renders with current template', async ({ cleanPage: page }) => {
  // Clear localStorage
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Clear and type small content
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(100);

  // Type just 5 lines of "1234"
  for (let i = 0; i < 5; i++) {
    await page.keyboard.type('1234', { delay: 0 });
    if (i < 4) await page.keyboard.press('Enter');
  }

  console.log('Typed 5 lines');

  // Click LilyPond PNG tab
  const lilypondPngTab = page.locator('#tab-lilypond-png');
  await expect(lilypondPngTab).toBeVisible();
  await lilypondPngTab.click();

  // Wait for rendering
  await page.waitForFunction(() => {
    const renderArea = document.querySelector('.lilypond-svg-display');
    if (!renderArea) return false;
    return renderArea.querySelectorAll('img').length > 0 ||
           renderArea.textContent.includes('error') ||
           renderArea.textContent.trim().length > 0;
  }, { timeout: 15000 });

  const renderArea = page.locator('.lilypond-svg-display');

  // Check for multi-page or single-page
  const pagesContainer = renderArea.locator('.lp-preview');
  const hasContainer = await pagesContainer.count() > 0;

  if (hasContainer) {
    const pageCount = await pagesContainer.locator('img').count();
    console.log(`✅ Multi-page display: ${pageCount} page(s)`);
    expect(pageCount).toBeGreaterThanOrEqual(1);
  } else {
    const singleImages = await renderArea.locator('img').count();
    console.log(`✅ Single-page display: ${singleImages} image(s)`);
    expect(singleImages).toBeGreaterThanOrEqual(1);
  }
});
