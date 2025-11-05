import { test, expect } from '../fixtures/editor.fixture';

test('debug: verify small content generates notes', async ({ cleanPage: page }) => {
  // Clear localStorage to prevent autosave interference
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Clear any default content
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);

  // Type using number notation (1234 pattern as requested by user)
  // Try different formats to see what works
  await page.keyboard.type('1234', { delay: 5 });
  await page.keyboard.press('Enter');
  await page.keyboard.type('1234', { delay: 5 });

  // Click LilyPond Source tab
  const lilypondTab = page.getByTestId('tab-lilypond');
  await expect(lilypondTab).toBeVisible();
  await lilypondTab.click();

  // Wait for source
  const lilypondPane = page.getByTestId('pane-lilypond');
  await expect(lilypondPane).toBeVisible();
  await expect.poll(async () => (await lilypondPane.innerText()).trim()).not.toEqual('');

  // Get the source
  const source = await lilypondPane.innerText();

  console.log('LilyPond source:');
  console.log(source);

  // Check if it has actual notes (not just r1)
  expect(source).not.toMatch(/^\s*r1\s*$/);
  expect(source).toContain('c\''); // Should have C notes
});
