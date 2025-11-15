import { test, expect } from '@playwright/test';

test('debug slur export - step by step', async ({ page }) => {
  // Enable detailed console logging
  page.on('console', msg => console.log('[BROWSER]', msg.text()));
  page.on('pageerror', err => console.log('[PAGE ERROR]', err.message));

  await page.goto('/');
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  await page.waitForFunction(() => {
    return window.editor && window.editor.wasmModule;
  }, { timeout: 10000 });

  // Step 1: Type notation
  console.log('\n=== STEP 1: Type notation ===');
  await page.keyboard.type('1 2 3');

  // Step 2: Apply slur
  console.log('\n=== STEP 2: Apply slur ===');
  const slurResult = await page.evaluate(() => {
    return window.editor.wasmModule.applySlurLayered(0, 0, 3);
  });
  console.log('Slur apply result:', JSON.stringify(slurResult, null, 2));

  // Step 3: Check slurs in annotation layer
  console.log('\n=== STEP 3: Check annotation layer ===');
  const slurs = await page.evaluate(() => {
    return window.editor.wasmModule.getSlursForLine(0);
  });
  console.log('Slurs in annotation layer:', JSON.stringify(slurs, null, 2));

  // Step 4: Apply slurs to cells
  console.log('\n=== STEP 4: Apply slurs to cells ===');
  const applyResult = await page.evaluate(() => {
    return window.editor.wasmModule.applyAnnotationSlursToCells();
  });
  console.log('Apply to cells result:', JSON.stringify(applyResult, null, 2));

  // Step 5: Check document cells
  console.log('\n=== STEP 5: Check document cells ===');
  const docSnapshot = await page.evaluate(() => {
    return window.editor.wasmModule.getDocumentSnapshot();
  });
  const doc = JSON.parse(docSnapshot);
  console.log('Line 0 cells:');
  doc.lines[0].cells.forEach((cell, i) => {
    console.log(`  [${i}] char="${cell.char}" slur_indicator=${cell.slur_indicator} kind=${cell.kind}`);
  });

  // Step 6: Export MusicXML
  console.log('\n=== STEP 6: Export MusicXML ===');
  const musicxml = await page.evaluate(() => {
    return window.editor.wasmModule.exportMusicXML();
  });

  // Check for slur elements in MusicXML
  const hasSlurStart = musicxml.includes('<slur') && musicxml.includes('type="start"');
  const hasSlurStop = musicxml.includes('<slur') && musicxml.includes('type="stop"');

  console.log('MusicXML contains slur start:', hasSlurStart);
  console.log('MusicXML contains slur stop:', hasSlurStop);

  if (!hasSlurStart || !hasSlurStop) {
    console.log('\nMusicXML excerpt (first 2000 chars):');
    console.log(musicxml.substring(0, 2000));
  }

  expect(hasSlurStart).toBe(true);
  expect(hasSlurStop).toBe(true);
});
