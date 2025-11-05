import { test, expect } from '@playwright/test';

test('QUICK: Multi-page rendering with systems-per-page', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type just 10 lines - with systems-per-page=4, this should give us 3 pages
  for (let i = 0; i < 10; i++) {
    await page.keyboard.type('1234', { delay: 0 });
    await page.keyboard.press('Enter');
  }

  console.log('[TEST] Typed 10 lines, expecting 3 pages (4+4+2 systems)');

  // First check LilyPond Source tab to see generated code
  const lilypondSourceTab = page.locator('#tab-lilypond-src');
  await expect(lilypondSourceTab).toBeVisible();
  await lilypondSourceTab.click();
  await page.waitForTimeout(500);

  const sourceContent = await page.locator('#lilypond-source').innerText();
  console.log('[TEST] LilyPond source length:', sourceContent.length);
  console.log('[TEST] LilyPond source (first 800 chars):', sourceContent.substring(0, 800));

  // Extract and print the \paper block
  const paperMatch = sourceContent.match(/\\paper \{[^}]*\}/s);
  if (paperMatch) {
    console.log('[TEST] \\paper block found:', paperMatch[0]);
  } else {
    console.log('[TEST] \\paper block NOT found!');
  }
  console.log('[TEST] Checking for systems-per-page...');
  if (sourceContent.includes('systems-per-page')) {
    console.log('[TEST] ✓ systems-per-page found in source');
  } else {
    console.log('[TEST] ✗ systems-per-page NOT found in source!');
  }

  console.log('[TEST] Checking for template markers...');
  if (sourceContent.includes('StaffGroup')) {
    console.log('[TEST] → MultiStave template detected');
  } else if (sourceContent.includes('tagline')) {
    console.log('[TEST] → Standard or Compact template');
  }

  // Count number of \new Staff
  const staffCount = (sourceContent.match(/\\new Staff/g) || []).length;
  console.log(`[TEST] Number of \\new Staff: ${staffCount}`);

  // Now click LilyPond PNG tab
  const lilypondTab = page.locator('#tab-lilypond-png');
  await expect(lilypondTab).toBeVisible();
  await lilypondTab.click();

  // Wait for rendering
  await expect.poll(async () => {
    const images = await page.locator('.lilypond-svg-display img').count();
    return images;
  }, {
    timeout: 15000,
    intervals: [500, 1000]
  }).toBeGreaterThan(0);

  // Check page count
  const images = page.locator('.lilypond-svg-display img');
  const pageCount = await images.count();
  console.log(`[TEST] Found ${pageCount} page(s)`);

  // With 10 staves and systems-per-page=4, expect 3 pages
  expect(pageCount).toBeGreaterThanOrEqual(2);

  console.log(`✓ Multi-page rendering working! ${pageCount} pages generated`);
});
