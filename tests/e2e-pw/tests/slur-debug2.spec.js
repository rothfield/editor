/**
 * DEBUG 2: Test slur with just 2 notes
 */

import { test, expect } from '@playwright/test';
import { openTab, readPaneText, getDocumentModel } from '../helpers/inspectors.js';

test('DEBUG 2: Slur on just 2 notes (1 2)', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  // Clear
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);

  // Type: 1 2
  await page.keyboard.type('1 2');
  await page.waitForTimeout(300);

  // Select both notes: Home, then 3 shifts (1, space, 2)
  await page.keyboard.press('Home');
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Shift+ArrowRight');
  }

  // Apply slur
  await page.keyboard.press('Alt+S');
  await page.waitForTimeout(500);

  // Check document model
  const doc = await getDocumentModel(page);
  console.log('\n=== DOCUMENT MODEL (2-note slur) ===');
  console.log('Cells:');
  doc.lines[0].cells.forEach((cell, idx) => {
    const pitchName = cell.pitch_code?.name || '?';
    const slurName = cell.slur_indicator?.name || 'none';
    console.log(`  Cell[${idx}]: "${cell.char}" pitch=${pitchName} slur=${slurName}`);
  });

  // Check MusicXML
  await openTab(page, 'tab-musicxml');
  const musicxmlText = await readPaneText(page, 'pane-musicxml');

  console.log('\n=== MUSICXML NOTES ===');
  const noteRegex = /<note>[\s\S]*?<\/note>/g;
  const notes = musicxmlText.match(noteRegex) || [];
  notes.forEach((note, idx) => {
    const pitchMatch = note.match(/<step>([A-G])<\/step>/);
    const slurMatch = note.match(/<slur[^>]*>/);
    console.log(`  Note ${idx}: pitch=${pitchMatch ? pitchMatch[1] : '?'} slur=${slurMatch ? slurMatch[0] : 'none'}`);
  });

  // Expect at least one slur
  if (musicxmlText.includes('<slur')) {
    console.log('✓ MusicXML contains at least one slur');
  } else {
    console.log('✗ MusicXML contains NO slurs');
  }
});
