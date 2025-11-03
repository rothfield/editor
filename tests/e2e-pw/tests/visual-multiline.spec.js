import { test, expect } from '@playwright/test';

test('Visual check: multi-line arcs', async ({ page }) => {
  await page.goto('/');

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  await editor.click();
  await page.keyboard.type('1-- 2-');
  await page.keyboard.press('Enter');
  await page.keyboard.type('3-- 4-');
  await page.waitForTimeout(500);

  // Get detailed info
  const info = await page.evaluate(() => {
    const dl = window.musicEditor.displayList;
    const lines = Array.from(document.querySelectorAll('.notation-line'));
    const arcs = Array.from(document.querySelectorAll('.beat-loop-path'));

    return {
      displayListLines: dl.lines.length,
      line0Arcs: dl.lines[0]?.beat_loops?.length || 0,
      line1Arcs: dl.lines[1]?.beat_loops?.length || 0,
      domLines: lines.length,
      domArcs: arcs.length,
      line0ArcData: dl.lines[0]?.beat_loops?.map(a => ({ start_y: a.start_y, end_y: a.end_y })),
      line1ArcData: dl.lines[1]?.beat_loops?.map(a => ({ start_y: a.start_y, end_y: a.end_y })),
      arcPositions: arcs.map(a => {
        const rect = a.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom };
      })
    };
  });

  console.log(JSON.stringify(info, null, 2));

  await page.screenshot({ path: 'test-results/multiline-arcs.png', fullPage: true });
});
