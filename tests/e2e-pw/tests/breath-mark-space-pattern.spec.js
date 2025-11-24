import { test, expect } from '@playwright/test';

test.describe('Breath mark with space patterns', () => {
  test('1 space apostrophe dashes produces 2 beats', async ({ page }) => {
    await page.goto('/');
    
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible({ timeout: 10000 });
    
    // Wait for WASM to load
    await page.waitForFunction(() => window.editor !== undefined, { timeout: 10000 });
    
    // Type: 1 '---
    await editor.click();
    await page.keyboard.type("1 '---");
    
    // Wait for processing
    await page.waitForTimeout(500);
    
    // Click LilyPond tab
    const lyTab = page.locator('[data-testid="tab-lilypond"]');
    await expect(lyTab).toBeVisible();
    await lyTab.click();
    
    // Get LilyPond output
    const lyPane = page.locator('[data-testid="pane-lilypond"]');
    await expect(lyPane).toBeVisible();
    
    // Wait for content
    await expect(async () => {
      const text = await lyPane.innerText();
      expect(text.length).toBeGreaterThan(0);
    }).toPass({ timeout: 5000 });
    
    const lyContent = await lyPane.innerText();
    console.log('\n=== LilyPond Output for "1 \'---" ===');
    console.log(lyContent);
    
    // Should contain two quarter notes/rests (not tied eighths or other subdivisions)
    // Looking for pattern like: c'4 r4 (quarter note + quarter rest)
    expect(lyContent).toMatch(/c'4\s+r4/s);
  });
});
