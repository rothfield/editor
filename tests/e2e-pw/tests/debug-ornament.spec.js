import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('Debug ornament collection and MusicXML output', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  // Clear
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);

  // Type notes
  await editor.click();
  await page.keyboard.type('2 3 4 1');
  await page.waitForTimeout(300);

  // Select first 3 and apply ornament
  await page.keyboard.press('Home');
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Shift+ArrowRight');
  }
  console.log('Applying Alt+0 to create ornament...');
  await page.keyboard.press('Alt+0');
  await page.waitForTimeout(500);

  // Check document model
  console.log('Opening docmodel tab...');
  await openTab(page, 'tab-docmodel');
  const docmodel = await readPaneText(page, 'pane-docmodel');

  // Look for ornament indicators in docmodel
  if (docmodel.includes('ornament')) {
    console.log('✓ Ornament indicators found in docmodel');
    const lines = docmodel.split('\n').slice(0, 30);
    console.log('First 30 lines of docmodel:', lines.join('\n'));
  } else {
    console.log('✗ No ornament indicators in docmodel');
    console.log('First 400 chars:', docmodel.substring(0, 400));
  }

  // Open MusicXML tab
  console.log('Opening MusicXML tab...');
  await openTab(page, 'tab-musicxml');
  const musicxml = await readPaneText(page, 'pane-musicxml');

  if (musicxml.includes('<grace')) {
    console.log('✓ Grace elements FOUND in MusicXML');
  } else {
    console.log('✗ Grace elements NOT in MusicXML');
  }

  if (musicxml.includes('<ornament')) {
    console.log('✓ Ornament elements FOUND in MusicXML');
  } else {
    console.log('✗ Ornament elements NOT in MusicXML');
  }

  console.log('\n=== MusicXML Output (first 1000 chars) ===');
  console.log(musicxml.substring(0, 1000));
  console.log('===================');

  expect(musicxml.length).toBeGreaterThan(0);
});
