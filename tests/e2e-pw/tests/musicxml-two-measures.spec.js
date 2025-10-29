import { test, expect } from '@playwright/test';

test('MusicXML should show 2 measures for "1 2 3 4 | 5 6 7 8"', async ({ page }) => {
  // Set up console message logging
  page.on('console', msg => console.log('[BROWSER]', msg.text()));
  page.on('pageerror', err => console.error('[PAGE ERROR]', err));

  await page.goto('http://localhost:8080');

  // Check if inspector tabs exist
  const tabs = await page.locator('[data-testid^="tab-"]').all();
  console.log(`Found ${tabs.length} inspector tabs`);

  // Wait for editor to load
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible({ timeout: 10000 });

  // Type the input
  await editor.click();
  await page.keyboard.type('1 2 3 4 | 5 6 7 8');

  // Wait for content to be generated
  await page.waitForTimeout(2000);

  // Check if MusicXML tab exists
  const musicxmlTab = page.getByTestId('tab-musicxml');
  const tabCount = await page.locator('[data-testid="tab-musicxml"]').count();
  console.log(`MusicXML tab count: ${tabCount}`);

  if (tabCount > 0) {
    await expect(musicxmlTab).toBeVisible({ timeout: 5000 });
    console.log('Clicking MusicXML tab...');
    await musicxmlTab.click();

    // Wait for MusicXML content to render
    await page.waitForTimeout(2000);

    // Take a screenshot to see the UI
    await page.screenshot({ path: '/tmp/musicxml-after-click.png' });
    console.log('Screenshot saved to /tmp/musicxml-after-click.png');
  } else {
    console.log('MusicXML tab not found! Available tabs:', tabs.length);
  }

  // Get the MusicXML pane content
  const musicxmlPane = page.getByTestId('pane-musicxml');
  console.log('Getting pane content...');
  // Use textContent() to get the actual XML text (not HTML-encoded)
  const xmlContent = await musicxmlPane.textContent();
  const innerHtml = await musicxmlPane.innerHTML();
  console.log(`pane-musicxml element found, textContent length: ${xmlContent.length}`);
  console.log(`pane-musicxml element found, innerHTML length: ${innerHtml.length}`);

  // Debug output
  console.log(`MusicXML pane content length: ${xmlContent.length}`);
  console.log('Content (first 500 chars):', xmlContent.substring(0, 500));
  console.log(`Inner HTML length: ${innerHtml.length}`);

  // Count measure tags from the actual XML text content
  const measureMatches = xmlContent.match(/<measure/g) || [];
  console.log(`Found ${measureMatches.length} measure tags`);

  // Check for error messages
  if (xmlContent.includes('Error')) {
    console.log('Found error in XML');
    const errorMatch = xmlContent.match(/<!--.*?-->/gs);
    if (errorMatch) {
      console.log('Error comment:', errorMatch[0]);
    }
  }

  // Verify 2 measures
  expect(measureMatches.length).toBe(2);
});
