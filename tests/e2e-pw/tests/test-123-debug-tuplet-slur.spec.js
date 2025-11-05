/**
 * Debug test to understand why tuplet slurs are still broken
 */

import { test, expect } from '@playwright/test';
import { openTab, readPaneText, getDocumentModel } from '../helpers/inspectors.js';

test('DEBUG: Analyze slur markers for 123 (tuplet) case', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  // Clear
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);

  // Type: 123 (NO SPACES = TUPLET)
  await editor.click();
  await page.keyboard.type('123');
  await page.waitForTimeout(300);

  // Check BEFORE slur
  const docBefore = await getDocumentModel(page);
  console.log('\n=== DOCUMENT MODEL - BEFORE SLUR ===');
  console.log('Cells:');
  docBefore.lines[0].cells.forEach((c, idx) => {
    console.log(`  [${idx}] "${c.char}" slur_indicator=${c.slur_indicator?.name || 'none'}`);
  });

  // Select all 3 notes
  await page.keyboard.press('Home');
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Shift+ArrowRight');
  }

  // Apply slur
  await page.keyboard.press('Alt+S');
  await page.waitForTimeout(500);

  // Check AFTER slur
  const docAfter = await getDocumentModel(page);
  console.log('\n=== DOCUMENT MODEL - AFTER SLUR ===');
  console.log('Cells:');
  docAfter.lines[0].cells.forEach((c, idx) => {
    console.log(`  [${idx}] "${c.char}" slur_indicator=${c.slur_indicator?.name || 'none'}`);
  });

  // Check MusicXML
  await openTab(page, 'tab-musicxml');
  const musicxmlText = await readPaneText(page, 'pane-musicxml');

  console.log('\n=== MusicXML - DETAILED ===');
  const notes = musicxmlText.match(/<note>[\s\S]*?<\/note>/g) || [];
  notes.forEach((note, idx) => {
    const pitchMatch = note.match(/<step>([A-G])<\/step>/);
    const slurMatches = note.match(/<slur[^>]*>/g);
    const tupletMatches = note.match(/<tuplet[^>]*>/g);

    console.log(`\nNote ${idx + 1} (${pitchMatch ? pitchMatch[1] : '?'}):`);
    if (tupletMatches) {
      tupletMatches.forEach(t => console.log(`  Tuplet: ${t}`));
    }
    if (slurMatches) {
      slurMatches.forEach(s => console.log(`  Slur: ${s}`));
    } else {
      console.log(`  Slur: (none)`);
    }
  });

  // Verify we have ALL 3 notes with slurs
  const notesWithSlur = notes.filter(n => n.includes('<slur'));
  console.log(`\nNotes with slur markers: ${notesWithSlur.length} / ${notes.length}`);
  console.log('EXPECTED: 3/3 notes should have slur markers (start, continue, stop)');

  if (notesWithSlur.length !== 3) {
    console.log('❌ FAIL: Not all notes have slur markers!');
  } else {
    console.log('✓ PASS: All notes have slur markers');
  }

  // This test will FAIL if the bug still exists
  expect(notesWithSlur.length).toBe(3);
});
