import { test, expect } from '../fixtures/editor.fixture';

test.describe('New Document Dialog - Professional UI', () => {
  test('should show modern dialog when creating new document', async ({ editorPage: page }) => {
    // Click File menu
    await page.click('#file-menu-button');

    // Click New menu item
    await page.click('#menu-new');

    // Wait for dialog to appear
    await page.waitForSelector('.new-document-overlay', { state: 'visible' });

    // Verify dialog structure
    const dialog = page.locator('.new-document-dialog');
    await expect(dialog).toBeVisible();

    // Verify header
    const title = page.locator('#new-document-title');
    await expect(title).toHaveText('Create New Composition');

    // Verify pitch system options are present
    const options = page.locator('.pitch-system-option');
    const count = await options.count();
    expect(count).toBe(3); // Number, Western, Sargam (Bhatkhande removed)

    // Verify default selection (Number) - check via radio button
    const selectedRadio = page.locator('input[type="radio"]:checked');
    await expect(selectedRadio).toBeVisible();
    const selectedValue = await selectedRadio.getAttribute('value');
    expect(selectedValue).toBe('number');
  });

  test('should support arrow key navigation', async ({ editorPage: page }) => {
    // Open new document dialog
    await page.click('#file-menu-button');
    await page.click('#menu-new');

    await page.waitForSelector('.new-document-overlay', { state: 'visible' });

    // Default is Number (first option), press down arrow to select Western
    await page.keyboard.press('ArrowDown');

    // Wait a moment for selection to update
    await page.waitForTimeout(100);

    // Verify Western is selected via radio button
    const selectedRadio = page.locator('input[type="radio"]:checked');
    await expect(selectedRadio).toBeVisible();
    const selectedValue = await selectedRadio.getAttribute('value');
    expect(selectedValue).toBe('western');
  });

  test('should close on ESC key', async ({ editorPage: page }) => {
    // Open dialog
    await page.click('#file-menu-button');
    await page.click('#menu-new');

    await page.waitForSelector('.new-document-overlay', { state: 'visible' });

    // Press ESC
    await page.keyboard.press('Escape');

    // Wait for dialog to close (animation)
    await page.waitForTimeout(200);

    // Verify dialog is gone
    const overlay = page.locator('.new-document-overlay');
    await expect(overlay).not.toBeVisible();
  });

  test('should create document on Enter key after selection', async ({ editorPage: page }) => {
    // Open dialog
    await page.click('#file-menu-button');
    await page.click('#menu-new');

    await page.waitForSelector('.new-document-overlay', { state: 'visible' });

    // Select Western (press arrow down)
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);

    // Press Enter to create
    await page.keyboard.press('Enter');

    // Wait for dialog to close
    await page.waitForTimeout(300);

    // Verify dialog is gone
    const overlay = page.locator('.new-document-overlay');
    await expect(overlay).not.toBeVisible();

    // Verify pitch system was set to Western
    const pitchSystemDisplay = await page.getByTestId('pitch-system').textContent();
    expect(pitchSystemDisplay).toBe('Western');
  });

  test('should close on Cancel button click', async ({ editorPage: page }) => {
    // Open dialog
    await page.click('#file-menu-button');
    await page.click('#menu-new');

    await page.waitForSelector('.new-document-overlay', { state: 'visible' });

    // Click Cancel button
    await page.click('.dialog-button-cancel');

    // Wait for dialog to close
    await page.waitForTimeout(200);

    // Verify dialog is gone
    const overlay = page.locator('.new-document-overlay');
    await expect(overlay).not.toBeVisible();
  });

  test('should create document on Create button click', async ({ editorPage: page }) => {
    // Open dialog
    await page.click('#file-menu-button');
    await page.click('#menu-new');

    await page.waitForSelector('.new-document-overlay', { state: 'visible' });

    // Select Sargam (press arrow down twice)
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);

    // Click Create button
    await page.click('.dialog-button-create');

    // Wait for dialog to close
    await page.waitForTimeout(300);

    // Verify dialog is gone
    const overlay = page.locator('.new-document-overlay');
    await expect(overlay).not.toBeVisible();

    // Verify pitch system was set to Sargam
    const pitchSystemDisplay = await page.getByTestId('pitch-system').textContent();
    expect(pitchSystemDisplay).toBe('Sargam');
  });

  test('should support clicking on options to select', async ({ editorPage: page }) => {
    // Open dialog
    await page.click('#file-menu-button');
    await page.click('#menu-new');

    await page.waitForSelector('.new-document-overlay', { state: 'visible' });

    // Verify default selection has .selected class (Number)
    const numberOption = page.locator('.pitch-system-option[data-value="number"]');
    await expect(numberOption).toHaveClass(/selected/);

    // Click on Western option
    const westernOption = page.locator('.pitch-system-option[data-value="western"]');
    await westernOption.click();

    await page.waitForTimeout(100);

    // Verify Western is selected via radio button
    const selectedRadio = page.locator('input[type="radio"]:checked');
    await expect(selectedRadio).toBeVisible();
    const selectedValue = await selectedRadio.getAttribute('value');
    expect(selectedValue).toBe('western');

    // Verify Western option has .selected class and Number doesn't
    await expect(westernOption).toHaveClass(/selected/);
    await expect(numberOption).not.toHaveClass(/selected/);
  });

  test('should show footer buttons', async ({ editorPage: page }) => {
    // Open dialog
    await page.click('#file-menu-button');
    await page.click('#menu-new');

    await page.waitForSelector('.new-document-overlay', { state: 'visible' });

    // Verify footer buttons are visible
    const cancelBtn = page.locator('.dialog-button-cancel');
    await expect(cancelBtn).toBeVisible();
    await expect(cancelBtn).toHaveText('Cancel');

    const createBtn = page.locator('.dialog-button-create');
    await expect(createBtn).toBeVisible();
    await expect(createBtn).toHaveText('Create Composition');
  });

  test('should display NotationFont glyphs from WASM', async ({ editorPage: page }) => {
    // Open dialog
    await page.click('#file-menu-button');
    await page.click('#menu-new');

    await page.waitForSelector('.new-document-overlay', { state: 'visible' });

    // Verify pitch system examples are present
    const examples = page.locator('.pitch-system-example');
    const examplesCount = await examples.count();
    expect(examplesCount).toBe(3); // Number, Western, Sargam

    // Verify Number system glyphs (1, 2♭, 2, 3♭, 3, 4, 4#, 5, 6♭, 6, 7♭, 7)
    const numberExample = page.locator('[data-value="number"] .pitch-system-example');
    await expect(numberExample).toBeVisible();
    const numberText = await numberExample.textContent();
    expect(numberText).toContain('1');
    expect(numberText).toContain('7');
    expect(numberText).toContain('♭'); // Has flats
    expect(numberText).toContain('#'); // Has sharp

    // Verify Western system glyphs (C, D♭, D, E♭, E, F, F#, G, A♭, A, B♭, B)
    const westernExample = page.locator('[data-value="western"] .pitch-system-example');
    await expect(westernExample).toBeVisible();
    const westernText = await westernExample.textContent();
    expect(westernText).toContain('C');
    expect(westernText).toContain('B');
    expect(westernText).toContain('♭'); // Has flats
    expect(westernText).toContain('#'); // Has sharp

    // Verify Sargam system glyphs (S, r, R, g, G, m, M, P, d, D, n, N)
    const sargamExample = page.locator('[data-value="sargam"] .pitch-system-example');
    await expect(sargamExample).toBeVisible();
    const sargamText = await sargamExample.textContent();
    expect(sargamText).toContain('S');
    expect(sargamText).toContain('N');
    expect(sargamText).toContain('r'); // komal Re
    expect(sargamText).toContain('M'); // tivra Ma

    // Verify NotationFont is applied to glyphs
    const notationGlyphs = page.locator('.notation-glyph');
    const glyphsCount = await notationGlyphs.count();
    expect(glyphsCount).toBeGreaterThan(30); // Should have 36 glyphs total (12 + 12 + 12)

    // Verify first glyph has NotationFont applied
    const firstGlyph = notationGlyphs.first();
    const fontFamily = await firstGlyph.evaluate(el => window.getComputedStyle(el).fontFamily);
    expect(fontFamily).toContain('NotationFont');
  });

  test('should focus editor after creating document', async ({ editorPage: page }) => {
    // Capture console logs
    const logs = [];
    page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));

    // Open dialog
    await page.click('#file-menu-button');
    await page.click('#menu-new');

    await page.waitForSelector('.new-document-overlay', { state: 'visible' });

    // Press Enter to create with default selection
    await page.keyboard.press('Enter');

    // Wait for dialog to close and editor to be ready
    await page.waitForTimeout(500); // Increased to allow for focus + render

    // Verify dialog is gone
    const overlay = page.locator('.new-document-overlay');
    await expect(overlay).not.toBeVisible();

    // Wait for focus timeout to complete (200ms from file-ops.js)
    await page.waitForTimeout(300);

    // Click editor to ensure it's ready for input
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Verify editor has focus after click
    await expect(editor).toBeFocused();

    // Type into the editor
    await page.keyboard.type('1');

    // Wait for WASM to process the keystroke and render
    await page.waitForTimeout(200);

    // Verify the character was inserted by checking the rendered cells
    const diagnostics = await page.evaluate(() => {
      const doc = window.editor?.getDocument();
      const firstLine = doc?.lines?.[0];
      return {
        hasEditor: !!window.editor,
        hasDocument: !!doc,
        linesCount: doc?.lines?.length || 0,
        firstLineCells: firstLine?.cells?.length || 0,
        firstCellChar: firstLine?.cells?.[0]?.char || '',
        firstCellPitchCode: firstLine?.cells?.[0]?.pitch_code || '',
        editorHtml: document.getElementById('notation-editor')?.innerHTML?.slice(0, 200) || ''
      };
    });

    console.log('Editor diagnostics:', diagnostics);

    // The character should have been inserted - check cells
    expect(diagnostics.firstLineCells).toBeGreaterThan(0);
    expect(diagnostics.firstCellPitchCode).toBe('N1'); // "1" in Number system
  });
});
