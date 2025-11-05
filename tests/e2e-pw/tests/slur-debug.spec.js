/**
 * DEBUG: Detailed slur output inspection
 */

import { test, expect } from '@playwright/test';
import { openTab, readPaneText, getDocumentModel } from '../helpers/inspectors.js';

test('DEBUG: Show complete MusicXML for slur (123 with slur)', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  // Clear
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);

  // Type: 1 2 3
  await page.keyboard.type('1 2 3');
  await page.waitForTimeout(300);

  // Select all
  await page.keyboard.press('Home');
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Shift+ArrowRight');
  }

  // Apply slur
  await page.keyboard.press('Alt+S');
  await page.waitForTimeout(500);

  // Get Document Model to see slur_indicator values
  const doc = await getDocumentModel(page);
  console.log('\n=== DOCUMENT MODEL ===');
  console.log('Cells with slur_indicator:');
  doc.lines[0].cells.forEach((cell, idx) => {
    if (cell.slur_indicator && cell.slur_indicator.name !== 'none') {
      console.log(`  Cell[${idx}]: "${cell.char}" slur_indicator=${cell.slur_indicator.name}`);
    } else if (cell.pitch_code && cell.pitch_code.name) {
      console.log(`  Cell[${idx}]: "${cell.char}" pitch=${cell.pitch_code.name} slur_indicator=${cell.slur_indicator?.name || 'none'}`);
    }
  });

  // Open MusicXML and get FULL output
  await openTab(page, 'tab-musicxml');
  const musicxmlText = await readPaneText(page, 'pane-musicxml');

  console.log('\n=== MUSICXML FULL OUTPUT ===');
  console.log(musicxmlText);

  // Extract all note/slur pairs
  const noteRegex = /<note>[\s\S]*?<\/note>/g;
  const notes = musicxmlText.match(noteRegex) || [];
  console.log(`\nFound ${notes.length} note elements:`);
  notes.forEach((note, idx) => {
    const pitchMatch = note.match(/<step>([A-G])<\/step>/);
    const slurMatch = note.match(/<slur[^>]*>/);
    console.log(`  Note ${idx}: pitch=${pitchMatch ? pitchMatch[1] : '?'} slur=${slurMatch ? slurMatch[0] : 'none'}`);
  });
});
