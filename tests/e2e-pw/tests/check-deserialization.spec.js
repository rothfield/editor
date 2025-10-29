import { test } from '@playwright/test';

test('DEBUG: Check deserialization - what does WASM receive?', async ({ page }) => {
  await page.goto('/');

  // Capture console logs
  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push(msg.text());
  });

  const editor = page.getByTestId('editor-root');
  await editor.click();
  await page.keyboard.type('C-- D');
  await page.waitForTimeout(500);

  console.log('\n=== INITIAL EXPORT ===');
  const initialResult = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const doc = app?.editor?.theDocument;

    const cellCount = doc.lines?.[0]?.cells?.length || 0;

    const xml = app?.editor?.wasmModule?.exportMusicXML(doc);
    return {
      cellCount,
      xmlLength: xml.length,
      xml
    };
  });

  console.log('[JS-SEND] First line has', initialResult.cellCount, 'cells');
  console.log('[JS-RECV] exportMusicXML returned:', initialResult.xmlLength, 'bytes');
  const initialMusicXML = initialResult.xml;

  // Check for WASM logs
  const wasmLogs = consoleLogs.filter(log => log.includes('[WASM]'));
  console.log('\nALL WASM logs (initial):');
  wasmLogs.forEach(log => console.log(log));

  // Switch to lilypond and modify
  const lilypondTab = page.getByTestId('tab-lilypond');
  await lilypondTab.click();
  await page.waitForTimeout(300);

  console.log('\n=== AFTER SWITCHING & MODIFYING ===');
  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' E F G');
  await page.waitForTimeout(500);

  const updatedMusicXML = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const doc = app?.editor?.theDocument;

    console.log('JavaScript side - lines after modification:', doc.lines);
    console.log('JavaScript side - first line after modification:', doc.lines?.[0]);

    const xml = app?.editor?.wasmModule?.exportMusicXML(doc);
    return xml;
  });

  console.log('MusicXML returned:', updatedMusicXML.length, 'bytes');

  // Check for WASM logs again (get the latest ones after our modification)
  const allWasmLogs = consoleLogs.filter(log => log.includes('[WASM]'));
  console.log('\nALL WASM logs (total count:', allWasmLogs.length + '):');
  const recentWasmLogs = allWasmLogs.slice(-10);  // Show last 10
  console.log('Last 10 WASM logs:');
  recentWasmLogs.forEach(log => console.log(log));

  console.log('\n=== SUMMARY ===');
  console.log('Initial WASM log should show line count');
  console.log('Updated WASM log should show same line count (same line, different content)');
  console.log('BUT if deserialization is failing, WASM log will show 0 lines!');
});
