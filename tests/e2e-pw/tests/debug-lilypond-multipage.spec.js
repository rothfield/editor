import { test, expect } from '@playwright/test';

test('DEBUG: LilyPond PNG tab rendering', async ({ page }) => {
  // Capture all console messages
  const consoleLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(text);
    console.log(`[BROWSER] ${msg.type()}: ${text}`);
  });

  // Capture errors
  page.on('pageerror', error => {
    console.log(`[PAGE ERROR] ${error.message}`);
  });

  // Go to app
  await page.goto('/');

  // Wait for editor
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type simple content
  console.log('[TEST] Typing content...');
  await page.keyboard.type('1234');
  await page.keyboard.press('Enter');
  await page.keyboard.type('1234');

  // Wait a bit
  await page.waitForTimeout(500);

  // Click LilyPond PNG tab
  console.log('[TEST] Clicking LilyPond PNG tab...');
  const lilypondTab = page.locator('#tab-lilypond-png');
  await expect(lilypondTab).toBeVisible();
  await lilypondTab.click();

  // Wait for content area
  const tabContent = page.locator('#tab-content-lilypond-png');
  await expect(tabContent).toBeVisible();

  console.log('[TEST] Waiting for rendering...');

  // Wait longer for rendering
  await page.waitForTimeout(10000);

  // Check what's in the render area
  const renderArea = page.locator('.lilypond-svg-display');
  const innerHTML = await renderArea.innerHTML();
  console.log('[TEST] Render area HTML:', innerHTML.substring(0, 500));

  // Check for images
  const images = page.locator('.lilypond-svg-display img');
  const imageCount = await images.count();
  console.log('[TEST] Found', imageCount, 'image(s)');

  // Print relevant console logs
  console.log('\n==== LilyPond Display Logs ====');
  consoleLogs
    .filter(log => log.includes('[LilyPondDisplay]'))
    .forEach(log => console.log(log));

  console.log('\n==== LilyPond Renderer Logs ====');
  consoleLogs
    .filter(log => log.includes('[LilyPond]'))
    .forEach(log => console.log(log));
});
