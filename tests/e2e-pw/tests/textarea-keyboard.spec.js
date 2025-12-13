import { test, expect } from '@playwright/test';

test('keyboard typing in textarea works', async ({ page }) => {
  // Capture ALL console messages
  const allLogs = [];
  page.on('console', msg => allLogs.push('[' + msg.type() + '] ' + msg.text()));

  await page.goto('/');
  await page.waitForSelector('#notation-editor');
  await page.waitForFunction(() => typeof window.musicEditor !== 'undefined');
  await page.waitForTimeout(500);

  // Find textarea
  const textarea = page.locator('.notation-textarea').first();
  await expect(textarea).toBeVisible();

  // Use JavaScript to focus the textarea directly
  await page.evaluate(() => {
    const ta = document.querySelector('.notation-textarea');
    if (ta) {
      ta.focus();
      console.log('[TEST] Directly focused textarea via JS');
    }
  });
  await page.waitForTimeout(100);

  // Check focus after JS focus
  const focusAfterJS = await page.evaluate(() => {
    const editorElement = document.getElementById('notation-editor');
    return {
      activeElement: document.activeElement?.tagName,
      activeClass: document.activeElement?.className,
      isTextarea: document.activeElement?.classList.contains('notation-textarea'),
      editorContainsActive: editorElement?.contains(document.activeElement),
      editorFocus: editorElement === document.activeElement || editorElement?.contains(document.activeElement)
    };
  });
  console.log('Focus after JS focus():', focusAfterJS);

  // Now type using keyboard
  await page.keyboard.type('123');
  await page.waitForTimeout(500);

  // Check what happened
  const result = await page.evaluate(() => {
    const ta = document.querySelector('.notation-textarea');
    return {
      textareaValue: ta?.value || '',
      activeElement: document.activeElement?.tagName
    };
  });
  console.log('After typing:', result);

  // Print all relevant console logs
  const relevantLogs = allLogs.filter(l =>
    l.includes('Events') || l.includes('Textarea') || l.includes('keyboard') || l.includes('TEST')
  );
  console.log('Relevant browser logs:', relevantLogs);

  // After typing 1, 2, 3, check WASM document model first (source of truth)
  console.log('Textarea value length:', result.textareaValue.length);
  console.log('Textarea value char codes:', [...result.textareaValue].map(c => c.charCodeAt(0)));

  // Check WASM document model first (source of truth)
  const docModel = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const doc = app?.editor?.getDocument?.();
    if (!doc || !doc.lines?.[0]) return { error: 'no doc', docExists: !!doc };

    const cells = doc.lines[0].cells || [];
    return {
      cellCount: cells.length,
      pitchCodes: cells
        .filter(c => c.pitch_code)
        .map(c => c.pitch_code),
      kinds: cells.map(c => c.kind?.name || 'unknown'),
      lineCount: doc.lines?.length
    };
  });

  console.log('WASM Document model:', docModel);

  // First verify document was updated
  expect(docModel.cellCount).toBeGreaterThan(0);

  // Then verify textarea reflects document
  expect(result.textareaValue.length).toBeGreaterThan(0);

  // Verify we have 3 pitched cells (N1, N2, N3)
  expect(docModel.pitchCodes.length).toBe(3);
  expect(docModel.pitchCodes).toContain('N1');
  expect(docModel.pitchCodes).toContain('N2');
  expect(docModel.pitchCodes).toContain('N3');
});
