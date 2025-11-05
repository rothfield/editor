import { test, expect } from '@playwright/test';

test('DEBUG: Check document structure before and after changes', async ({ page }) => {
  await page.goto('/');

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Type initial notation
  await editor.click();
  await page.keyboard.type('C-- D');
  await page.waitForTimeout(300);

  // Check document structure
  const initialStructure = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const doc = app?.editor?.theDocument;
    if (!doc) return null;
    return {
      hasMeasures: !!doc.measures,
      measureCount: doc.measures?.length || 0,
      hasCells: !!doc.cells,
      cellCount: doc.cells?.length || 0,
      firstMeasure: doc.measures?.[0] ? {
        id: doc.measures[0].id,
        hasNotes: !!doc.measures[0].notes,
        noteCount: doc.measures[0].notes?.length || 0,
        hasBeats: !!doc.measures[0].beats,
        beatCount: doc.measures[0].beats?.length || 0,
      } : null,
      cells: doc.cells?.slice(0, 5).map(c => ({
        id: c.id,
        content: c.content,
        type: c.type
      })) || []
    };
  });

  console.log('=== INITIAL STRUCTURE ===');
  console.log('Initial structure:', JSON.stringify(initialStructure, null, 2));

  // Switch to lilypond tab and type more
  const lilypondTab = page.getByTestId('tab-lilypond');
  await lilypondTab.click();
  await page.waitForTimeout(300);

  console.log('\n=== TYPING MORE NOTATION ===');
  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' E F G');
  await page.waitForTimeout(500);

  // Check updated structure
  const updatedStructure = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const doc = app?.editor?.theDocument;
    if (!doc) return null;
    return {
      hasMeasures: !!doc.measures,
      measureCount: doc.measures?.length || 0,
      hasCells: !!doc.cells,
      cellCount: doc.cells?.length || 0,
      firstMeasure: doc.measures?.[0] ? {
        id: doc.measures[0].id,
        hasNotes: !!doc.measures[0].notes,
        noteCount: doc.measures[0].notes?.length || 0,
        hasBeats: !!doc.measures[0].beats,
        beatCount: doc.measures[0].beats?.length || 0,
      } : null,
      cells: doc.cells?.slice(0, 10).map(c => ({
        id: c.id,
        content: c.content,
        type: c.type
      })) || []
    };
  });

  console.log('\n=== UPDATED STRUCTURE ===');
  console.log('Updated structure:', JSON.stringify(updatedStructure, null, 2));

  console.log('\n=== COMPARISON ===');
  console.log('Cell count changed?', initialStructure.cellCount !== updatedStructure.cellCount);
  console.log('Measure count changed?', initialStructure.measureCount !== updatedStructure.measureCount);
  console.log('Note count changed?', initialStructure.firstMeasure?.noteCount !== updatedStructure.firstMeasure?.noteCount);
});
