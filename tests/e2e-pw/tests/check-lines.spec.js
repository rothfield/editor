import { test } from '@playwright/test';

test('DEBUG: Check lines structure before and after changes', async ({ page }) => {
  await page.goto('/');

  const editor = page.getByTestId('editor-root');
  await editor.click();
  await page.keyboard.type('C-- D');
  await page.waitForTimeout(500);

  const initialLines = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const doc = app?.editor?.theDocument;
    return {
      lineCount: doc.lines?.length || 0,
      firstLine: doc.lines?.[0] ? {
        id: doc.lines[0].id,
        hasContent: !!doc.lines[0].content,
        contentPreview: String(doc.lines[0].content).substring(0, 100)
      } : null
    };
  });

  console.log('Initial lines:', JSON.stringify(initialLines, null, 2));

  // Switch to lilypond
  const lilypondTab = page.getByTestId('tab-lilypond');
  await lilypondTab.click();
  await page.waitForTimeout(300);

  // Type more notation
  console.log('\nTyping more notation: " E F G"');
  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' E F G');
  await page.waitForTimeout(500);

  const updatedLines = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const doc = app?.editor?.theDocument;
    return {
      lineCount: doc.lines?.length || 0,
      firstLine: doc.lines?.[0] ? {
        id: doc.lines[0].id,
        hasContent: !!doc.lines[0].content,
        contentPreview: String(doc.lines[0].content).substring(0, 100)
      } : null
    };
  });

  console.log('\nUpdated lines:', JSON.stringify(updatedLines, null, 2));
  console.log('\nLine content changed?', initialLines.firstLine?.contentPreview !== updatedLines.firstLine?.contentPreview);
});
