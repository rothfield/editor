import { test, expect } from '@playwright/test';

test('DIAGNOSTIC: Trace all staff notation renders during initialization', async ({ page }) => {
  // Intercept and log console messages
  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push({
      type: msg.type(),
      text: msg.text(),
      timestamp: new Date().toISOString()
    });
  });

  // Go to fresh page
  await page.goto('/');

  // Wait for editor to be visible
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible({ timeout: 5000 });

  // Give a moment for all initialization to complete
  await page.waitForTimeout(1000);

  // Filter relevant logs
  const renderLogs = consoleLogs.filter(log =>
    log.text.includes('[OSMD]') ||
    log.text.includes('[Staff Notation]') ||
    log.text.includes('scheduleStaffNotationUpdate') ||
    log.text.includes('switchTab') ||
    log.text.includes('renderStaffNotation') ||
    log.text.includes('isInitialized')
  );

  console.log('\n=== RENDER SEQUENCE ===');
  renderLogs.forEach((log, i) => {
    console.log(`${i + 1}. [${log.type}] ${log.text}`);
  });

  // Check final state - should have exactly 1 SVG
  const svgElements = page.locator('#staff-notation-container svg');
  const svgCount = await svgElements.count();

  console.log(`\nFinal SVG count: ${svgCount}`);

  // Count OSMD render calls
  const osmdRenderCalls = renderLogs.filter(log =>
    log.text.includes('Rendered') ||
    log.text.includes('Cache')
  );

  console.log(`OSMD render calls: ${osmdRenderCalls.length}`);
  osmdRenderCalls.forEach((log, i) => {
    console.log(`  ${i + 1}. ${log.text}`);
  });

  expect(svgCount).toBe(1, 'Should have exactly 1 SVG on initial load');
});

test('DIAGNOSTIC: Check if ui.isInitialized is working', async ({ page }) => {
  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push(msg.text());
  });

  await page.goto('/');

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible({ timeout: 5000 });

  await page.waitForTimeout(500);

  // Check if any logs show the isInitialized guard being hit
  const initLogs = consoleLogs.filter(log =>
    log.includes('isInitialized') ||
    log.includes('Skip if UI not initialized') ||
    log.includes('Skip scheduling timer')
  );

  console.log('\nInitialization logs:');
  initLogs.forEach(log => console.log(`  - ${log}`));

  if (initLogs.length === 0) {
    console.log('  (No isInitialized logs found - guard may not be logging)');
  }
});

test('DIAGNOSTIC: Check HTML structure for duplicates', async ({ page }) => {
  await page.goto('/');

  const container = page.locator('#staff-notation-container');
  await expect(container).toBeVisible({ timeout: 5000 });

  await page.waitForTimeout(500);

  // Get all HTML
  const html = await container.innerHTML();

  // Count SVG tags
  const svgMatches = html.match(/<svg/g);
  const svgCount = svgMatches ? svgMatches.length : 0;

  console.log(`\nContainer HTML length: ${html.length} characters`);
  console.log(`SVG tags in HTML: ${svgCount}`);

  // Check for nested SVGs or multiple top-level SVGs
  const svgElements = await page.locator('#staff-notation-container > svg').count();
  const nestedSvgs = await page.locator('#staff-notation-container svg svg').count();

  console.log(`Top-level SVGs: ${svgElements}`);
  console.log(`Nested SVGs: ${nestedSvgs}`);

  if (svgCount > 1) {
    console.log('\n⚠️ Multiple SVG tags detected in container!');
    console.log('HTML snippet (first 2000 chars):');
    console.log(html.substring(0, 2000));
  }

  expect(svgCount).toBe(1, `Should have exactly 1 SVG tag, found ${svgCount}`);
});
