import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('Trace ornament flow', async ({ page }) => {
  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));

  await page.goto('/');
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  // Clear and type
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(300);

  await editor.click();
  await page.keyboard.type('1 23');
  await page.waitForTimeout(300);

  // Check IR BEFORE ornament
  await openTab(page, 'tab-ir');
  const irBefore = await readPaneText(page, 'pane-ir');
  console.log('\n=== IR BEFORE ornament ===');
  console.log(irBefore.substring(0, 2000));

  // Select "23" and apply ornament
  await editor.click();
  await page.keyboard.press('Home');
  await page.waitForTimeout(100);
  await page.keyboard.press('ArrowRight'); // after "1"
  await page.keyboard.press('ArrowRight'); // after space
  await page.waitForTimeout(100);
  await page.keyboard.press('Shift+ArrowRight'); // select "2"
  await page.keyboard.press('Shift+ArrowRight'); // select "23"
  await page.waitForTimeout(200);

  // Press Alt+0 to convert to ornament
  await page.keyboard.press('Alt+0');
  await page.waitForTimeout(700);

  // Check IR AFTER ornament
  const irAfter = await readPaneText(page, 'pane-ir');
  console.log('\n=== IR AFTER ornament ===');
  console.log(irAfter.substring(0, 2000));

  // Check MusicXML
  await openTab(page, 'tab-musicxml');
  const musicxml = await readPaneText(page, 'pane-musicxml');
  console.log('\n=== MusicXML ===');
  console.log(musicxml);

  // Print relevant logs
  const relevantLogs = logs.filter(l =>
    l.includes('superscript') || l.includes('Superscript') ||
    l.includes('ornament') || l.includes('grace')
  );
  console.log('\n=== Relevant Logs ===');
  relevantLogs.forEach(l => console.log(l));

  // Check if grace notes appear in IR
  const hasGraceInIR = irAfter.includes('grace_notes_before') &&
                       !irAfter.includes('"grace_notes_before": []');
  console.log('\nGrace notes in IR:', hasGraceInIR);

  expect(hasGraceInIR).toBe(true);
});
