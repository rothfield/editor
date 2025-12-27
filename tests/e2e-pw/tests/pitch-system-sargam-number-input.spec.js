import { test, expect } from '@playwright/test';

test.describe('Pitch System - Sargam with Number Input', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#notation-editor');
    await page.click('#notation-editor');
  });

  test('typing numbers in Sargam mode should display as Sargam notation', async ({ page }) => {
    // Step 1: Change pitch system to Sargam
    await page.click('#menu-document');
    await page.click('#menu-set-pitch-system');

    page.once('dialog', async dialog => {
      await dialog.accept('3'); // 3 = Sargam
    });
    await page.waitForTimeout(500);

    // Verify pitch system changed
    await expect.poll(async () => {
      return await page.getByTestId('pitch-system').textContent();
    }).toBe('Sargam');

    // Step 2: Type numbers "1234"
    await page.keyboard.type('1234');
    await page.waitForTimeout(300);

    // Step 3: Check Markup output - should show Sargam letters
    await page.click('[data-tab="markup"]');
    const markupPane = page.locator('[data-testid="pane-markup"], #markup-textarea, textarea');
    await expect(markupPane.first()).toBeVisible();

    await expect.poll(async () => {
      const text = await markupPane.first().inputValue();
      return text.includes('S') || text.includes('R') || text.includes('G');
    }, { timeout: 5000 }).toBeTruthy();

    const markupText = await markupPane.first().inputValue();
    console.log('Markup output:', markupText);

    // Should contain Sargam notation (S R G m), NOT numbers (1 2 3 4)
    expect(markupText).toContain('S'); // 1 -> Sa
    expect(markupText).toContain('R'); // 2 -> Re
    expect(markupText).toContain('G'); // 3 -> Ga
    expect(markupText).toContain('m'); // 4 -> Ma (lowercase for shuddha)

    // Numbers should NOT appear in Sargam notation output
    // (Note: barline numbers like | 1 | might still appear, but pitch content should not)
    const notationContent = markupText.replace(/\|[^|]*\|/g, ''); // Strip barlines
    expect(notationContent).not.toMatch(/\b[1234]\b/);
  });

  test('typed content should be treated as pitches, not literal text', async ({ page }) => {
    // Change to Sargam mode
    await page.click('#menu-document');
    await page.click('#menu-set-pitch-system');
    page.once('dialog', async dialog => await dialog.accept('3'));
    await page.waitForTimeout(500);

    // Type "12" - should create TWO pitch cells, not text
    await page.keyboard.type('12');

    // Check document model - should have pitched cells
    const cells = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      const doc = app?.editor?.getDocument?.();
      return doc?.lines?.[0]?.cells?.map(cell => ({
        char: cell.char,
        pitch_code: cell.pitch_code,
        cell_type: cell.cell_type
      })) || [];
    });

    console.log('Cells:', JSON.stringify(cells, null, 2));

    // Should have 2 pitched cells, not 2 text cells
    const pitchedCells = cells.filter(c => c.pitch_code !== undefined && c.pitch_code !== null);
    expect(pitchedCells.length).toBe(2);
  });
});
