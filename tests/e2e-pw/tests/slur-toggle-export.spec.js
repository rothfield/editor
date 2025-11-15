/**
 * E2E Test: Slur Toggle Export Verification
 *
 * Tests that slurs toggled via Alt+S actually appear in exported output:
 * - MusicXML should contain <slur> elements
 * - LilyPond should contain slur syntax ( ... )
 *
 * This uses the Inspector-First testing approach:
 * Check inspector tabs (MusicXML, LilyPond) for slur notation.
 */

import { test, expect } from '@playwright/test';

// Helper to open inspector tab
async function openTab(page, tabId) {
  const tab = page.locator(`[data-testid="${tabId}"]`);
  await expect(tab).toBeVisible();
  await tab.click();
}

// Helper to read inspector pane text
async function readPaneText(page, paneId) {
  const pane = page.locator(`[data-testid="${paneId}"]`);
  await expect(pane).toBeVisible();

  // Wait for non-empty content
  await expect.poll(async () => {
    const text = await pane.innerText();
    return text.trim().length;
  }, {
    timeout: 5000,
    message: `Pane ${paneId} never got content`
  }).toBeGreaterThan(0);

  const text = await pane.innerText();
  return text.replace(/\r\n/g, '\n').trim();
}

test.describe('Slur Toggle Export Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    await page.waitForFunction(() => {
      return window.editor && window.editor.wasmModule;
    }, { timeout: 10000 });

    await editor.click();
  });

  test('slur appears in MusicXML export after Alt+S', async ({ page }) => {
    // Type some notes
    await page.keyboard.type('1 2 3');

    // Select all
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');

    // Apply slur with Alt+S
    await page.keyboard.press('Alt+s');

    // Open MusicXML inspector tab (should be immediate now)
    await openTab(page, 'tab-musicxml');
    const musicxml = await readPaneText(page, 'pane-musicxml');

    // Check for slur element
    // MusicXML uses <slur type="start"> and <slur type="stop">
    expect(musicxml).toContain('<slur');
    expect(musicxml).toContain('type="start"');
    expect(musicxml).toContain('type="stop"');
  });

  test('slur appears in LilyPond export after Alt+S', async ({ page }) => {
    // Type some notes
    await page.keyboard.type('1 2 3');

    // Select all
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');

    // Apply slur with Alt+S
    await page.keyboard.press('Alt+s');

    // Small wait for LilyPond export (has separate conversion step)
    await page.waitForTimeout(100);

    // Open LilyPond inspector tab
    await openTab(page, 'tab-lilypond');
    const lilypond = await readPaneText(page, 'pane-lilypond');

    // Check for slur syntax: ( ... )
    // LilyPond uses ( for slur start and ) for slur end
    expect(lilypond).toContain('(');
    expect(lilypond).toContain(')');

    // More specific: should have opening paren after first note
    // Example: c'4( d'4 e'4) - note the octave markers (')
    expect(lilypond).toMatch(/[a-g]['',]*\d+\s*\(/);
    expect(lilypond).toMatch(/\)/);
  });

  test('slur disappears from export after toggling off', async ({ page }) => {
    // Type some notes
    await page.keyboard.type('1 2 3');

    // Select all
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');

    // Apply slur
    await page.keyboard.press('Alt+s');

    // Toggle off slur
    await page.keyboard.press('Alt+s');

    // Check MusicXML - should NOT have slur
    await openTab(page, 'tab-musicxml');
    const musicxml = await readPaneText(page, 'pane-musicxml');
    expect(musicxml).not.toContain('<slur');

    // Check LilyPond - should NOT have slur parens
    await openTab(page, 'tab-lilypond');
    const lilypond = await readPaneText(page, 'pane-lilypond');
    // Should not have slur syntax (but may have regular parens in header)
    // Check the music section doesn't have slurs
    const musicSection = lilypond.split('\\relative')[1] || lilypond;
    expect(musicSection).not.toMatch(/[a-g]\d+\s*\(/);
  });

  test('multiple toggle cycles work correctly', async ({ page }) => {
    // Type some notes
    await page.keyboard.type('1 2 3');

    // Select all
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');

    // Toggle on
    await page.keyboard.press('Alt+s');

    // Check it's there
    await openTab(page, 'tab-musicxml');
    let musicxml = await readPaneText(page, 'pane-musicxml');
    expect(musicxml).toContain('<slur');

    // Toggle off
    await page.keyboard.press('Alt+s');

    // Check it's gone
    musicxml = await readPaneText(page, 'pane-musicxml');
    expect(musicxml).not.toContain('<slur');

    // Toggle on again
    await page.keyboard.press('Alt+s');

    // Check it's back
    musicxml = await readPaneText(page, 'pane-musicxml');
    expect(musicxml).toContain('<slur');
  });

  test('partial selection slur appears correctly', async ({ page }) => {
    // Type more notes
    await page.keyboard.type('1 2 3 4 5');

    // Select middle portion (notes 2-4)
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight'); // Move to '2'
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight'); // Select '2 3 4'

    // Apply slur
    await page.keyboard.press('Alt+s');

    // Check MusicXML
    await openTab(page, 'tab-musicxml');
    const musicxml = await readPaneText(page, 'pane-musicxml');

    // Should have exactly 2 slur tags (start and stop)
    const slurMatches = musicxml.match(/<slur/g);
    expect(slurMatches).not.toBeNull();
    expect(slurMatches.length).toBe(2);
  });
});
