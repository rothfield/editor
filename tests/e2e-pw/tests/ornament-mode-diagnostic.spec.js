import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('diagnostic: check ornament_edit_mode in config', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type and apply ornament
  await page.keyboard.type('Hello');
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Alt+o');

  await page.waitForTimeout(300);

  // Check document model for ornament indicators
  await openTab(page, 'tab-docmodel');
  const docModel = await readPaneText(page, 'pane-docmodel');

  console.log('=== Document Model ===');
  console.log(docModel);

  // Check if ornament indicators are present
  const hasOrnamentStart = docModel.includes('ornament_after_start') ||
                          docModel.includes('ornament_before_start') ||
                          docModel.includes('ornament_on_top_start');
  const hasOrnamentEnd = docModel.includes('ornament_after_end') ||
                        docModel.includes('ornament_before_end') ||
                        docModel.includes('ornament_on_top_end');

  console.log(`\nOrnament indicators found: Start=${hasOrnamentStart}, End=${hasOrnamentEnd}`);
  console.log(`ornament_edit_mode: ${docModel.match(/ornament_edit_mode:\s*(\w+)/)?.[1]}`);

  expect(hasOrnamentStart).toBe(true);
  expect(hasOrnamentEnd).toBe(true);
});
