import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('-- should be r4 (quarter rest), not r1 (whole rest)', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type "--" - should be rest for 1 beat (quarter note duration)
  await page.keyboard.type('--');
  await page.waitForTimeout(300);

  // Check LilyPond export
  await openTab(page, 'tab-lilypond');
  const lilypond = await readPaneText(page, 'pane-lilypond');

  console.log('LilyPond output:\n', lilypond);

  // Should contain r4 (quarter rest), not r1 (whole rest)
  expect(lilypond).toContain('r4');
  expect(lilypond).not.toContain('r1');
});
