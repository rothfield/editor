import { test, expect } from '@playwright/test';

test.describe('Textarea multiline export order', () => {
  test('LilyPond export should have lines in correct order (1 then 2)', async ({ page }) => {
    await page.goto('/');

    const textarea = page.locator('.notation-textarea').first();
    await expect(textarea).toBeVisible();
    await textarea.click();

    // Type "1", Enter, "2"
    await page.keyboard.type('1');
    await page.keyboard.press('Enter');
    await page.keyboard.type('2');

    // Should have 2 lines now
    const textareas = page.locator('.notation-textarea');
    await expect(textareas).toHaveCount(2);

    // Open LilyPond tab to check export
    const lilypondTab = page.locator('[data-testid="tab-lilypond"]');
    if (await lilypondTab.isVisible()) {
      await lilypondTab.click();
    } else {
      // Try clicking by text
      await page.locator('text=LilyPond').first().click();
    }

    // Wait for LilyPond content
    await page.waitForTimeout(500);

    // Get LilyPond output
    const lilypondPane = page.locator('[data-testid="pane-lilypond"]');
    let lilypondText = '';
    if (await lilypondPane.isVisible()) {
      lilypondText = await lilypondPane.innerText();
    } else {
      // Fallback: find pre or code element in inspector
      const preElement = page.locator('.inspector-pane pre, .inspector-content pre').first();
      if (await preElement.isVisible()) {
        lilypondText = await preElement.innerText();
      }
    }

    console.log('LilyPond output:', lilypondText);

    // c'4 (note 1) should appear BEFORE d'4 (note 2)
    const cIndex = lilypondText.indexOf("c'4");
    const dIndex = lilypondText.indexOf("d'4");

    console.log('c\'4 index:', cIndex);
    console.log('d\'4 index:', dIndex);

    expect(cIndex).toBeGreaterThan(-1); // c'4 exists
    expect(dIndex).toBeGreaterThan(-1); // d'4 exists
    expect(cIndex).toBeLessThan(dIndex); // c'4 comes before d'4
  });
});
