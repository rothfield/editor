/**
 * E2E test for Sargam glyph mapping
 *
 * Sargam uses uppercase/lowercase to indicate shuddha (natural) vs komal (flat):
 * - N1 → 'S' (Sa - always uppercase)
 * - N2 → 'R' (Re - shuddha, uppercase)
 * - N2b → 'r' (re - komal, lowercase)
 * - N3 → 'G' (Ga - shuddha, uppercase)
 * - N3b → 'g' (ga - komal, lowercase)
 * - N4 → 'm' (ma - shuddha, lowercase)
 * - N4s → 'M' (Ma - tivra, uppercase)
 * - N5 → 'P' (Pa - always uppercase)
 * - N6 → 'D' (Dha - shuddha, uppercase)
 * - N6b → 'd' (dha - komal, lowercase)
 * - N7 → 'N' (Ni - shuddha, uppercase)
 * - N7b → 'n' (ni - komal, lowercase)
 */

import { test, expect } from '@playwright/test';

test.describe('Sargam Glyph Mapping', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();
  });

  test('displays shuddha (natural) notes with uppercase glyphs', async ({ page }) => {
    // Type a sequence using Number system (1-7)
    await page.keyboard.type('1 2 3 4 5 6 7');

    // Switch to Sargam pitch system via File > Set Pitch System menu
    await page.click('#file-menu-button');
    await page.waitForSelector('#menu-set-pitch-system', { state: 'visible' });

    // Handle the prompt dialog - select option 3 (Sargam)
    page.once('dialog', async dialog => {
      console.log('[TEST] Dialog type:', dialog.type());
      console.log('[TEST] Dialog message:', dialog.message());
      expect(dialog.type()).toBe('prompt');
      await dialog.accept('3'); // 3 = Sargam
    });

    await page.click('#menu-set-pitch-system');

    // Wait for pitch system to update
    await page.waitForTimeout(1000);

    // Verify pitch system display shows "Sargam"
    const pitchSystemDisplay = await page.getByTestId('pitch-system').textContent();
    expect(pitchSystemDisplay).toBe('Sargam');

    // Check display list for correct Sargam characters
    const displayListTab = page.getByTestId('tab-displaylist');
    await displayListTab.click();

    const displayListPane = page.getByTestId('pane-displaylist');
    const displayText = await displayListPane.innerText();

    // Should show uppercase letters for shuddha notes: S R G m P D N
    expect(displayText).toContain('"char": "S"'); // N1 → S
    expect(displayText).toContain('"char": "R"'); // N2 → R
    expect(displayText).toContain('"char": "G"'); // N3 → G
    expect(displayText).toContain('"char": "m"'); // N4 → m
    expect(displayText).toContain('"char": "P"'); // N5 → P
    expect(displayText).toContain('"char": "D"'); // N6 → D
    expect(displayText).toContain('"char": "N"'); // N7 → N
  });

  test('displays komal (flat) notes with lowercase glyphs', async ({ page }) => {
    // Type komal notes using Number system (2f, 3f, 6f, 7f)
    // In the editor, typing 'f' after a number creates a flat
    await page.keyboard.type('1 2f 3 3f 4 5 6f 7f');

    // Switch to Sargam pitch system via File > Set Pitch System menu
    await page.click('#file-menu-button');

    // Handle the prompt dialog - select option 3 (Sargam)
    page.once('dialog', async dialog => {
      expect(dialog.type()).toBe('prompt');
      expect(dialog.message()).toContain('Select pitch system');
      await dialog.accept('3'); // 3 = Sargam
    });

    await page.click('#menu-set-pitch-system');

    // Wait for glyphs to update
    await page.waitForTimeout(500);

    // Verify pitch system display shows "Sargam"
    const pitchSystemDisplay = await page.getByTestId('pitch-system').textContent();
    expect(pitchSystemDisplay).toBe('Sargam');

    // Check display list for correct Sargam characters
    const displayListTab = page.getByTestId('tab-displaylist');
    await displayListTab.click();

    const displayListPane = page.getByTestId('pane-displaylist');
    const displayText = await displayListPane.innerText();

    // Should show lowercase letters for komal notes
    expect(displayText).toContain('"char": "r"'); // N2b → r (komal Re)
    expect(displayText).toContain('"char": "g"'); // N3b → g (komal Ga)
    expect(displayText).toContain('"char": "d"'); // N6b → d (komal Dha)
    expect(displayText).toContain('"char": "n"'); // N7b → n (komal Ni)

    // Should also still have shuddha notes
    expect(displayText).toContain('"char": "S"'); // N1 → S
    expect(displayText).toContain('"char": "G"'); // N3 → G
    expect(displayText).toContain('"char": "m"'); // N4 → m
    expect(displayText).toContain('"char": "P"'); // N5 → P
  });

  test('displays tivra Ma with uppercase M', async ({ page }) => {
    // Type tivra Ma using Number system (4s = N4s)
    await page.keyboard.type('4 4s 5');

    // Switch to Sargam pitch system via File > Set Pitch System menu
    await page.click('#file-menu-button');

    // Handle the prompt dialog - select option 3 (Sargam)
    page.once('dialog', async dialog => {
      expect(dialog.type()).toBe('prompt');
      expect(dialog.message()).toContain('Select pitch system');
      await dialog.accept('3'); // 3 = Sargam
    });

    await page.click('#menu-set-pitch-system');

    // Wait for glyphs to update
    await page.waitForTimeout(500);

    // Verify pitch system display shows "Sargam"
    const pitchSystemDisplay = await page.getByTestId('pitch-system').textContent();
    expect(pitchSystemDisplay).toBe('Sargam');

    // Check display list for correct Sargam characters
    const displayListTab = page.getByTestId('tab-displaylist');
    await displayListTab.click();

    const displayListPane = page.getByTestId('pane-displaylist');
    const displayText = await displayListPane.innerText();

    // Should show lowercase 'm' for shuddha Ma (N4)
    expect(displayText).toContain('"char": "m"'); // N4 → m

    // Should show uppercase 'M' for tivra Ma (N4s)
    expect(displayText).toContain('"char": "M"'); // N4s → M

    // Should show uppercase 'P' for Pa (N5)
    expect(displayText).toContain('"char": "P"'); // N5 → P
  });
});
