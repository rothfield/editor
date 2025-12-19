/**
 * Inspector-first testing helpers for Music Notation Editor
 * Per CLAUDE.md: Prioritize inspector tabs as oracles for E2E testing
 */

import { expect } from '@playwright/test';

/**
 * Open an inspector tab by data-testid
 * @param {import('@playwright/test').Page} page - Playwright page
 * @param {string} testId - data-testid of the tab (e.g., 'tab-lilypond')
 */
export async function openTab(page, testId) {
  const tab = page.getByTestId(testId);
  await expect(tab).toBeVisible();
  await tab.click();
  // Wait for tab content to load
  await page.waitForTimeout(100);
}

/**
 * Read text content from an inspector pane
 * @param {import('@playwright/test').Page} page - Playwright page
 * @param {string} testId - data-testid of the pane (e.g., 'pane-lilypond')
 * @returns {Promise<string>} Normalized pane text content
 */
export async function readPaneText(page, testId) {
  const pane = page.getByTestId(testId);
  await expect(pane).toBeVisible();

  // Wait for pane to have content (not empty)
  await expect.poll(async () => (await pane.innerText()).trim()).not.toEqual('');

  // Get and normalize text
  const text = await pane.innerText();
  return text
    .replace(/\r\n/g, '\n')        // Normalize line endings
    .replace(/[ \t]+\n/g, '\n')     // Remove trailing whitespace
    .trim();
}

/**
 * Check if LilyPond pane contains expected grace note syntax
 * @param {import('@playwright/test').Page} page - Playwright page
 * @param {string} expectedPattern - Expected LilyPond pattern (regex string)
 * @returns {Promise<boolean>} True if pattern found
 */
export async function lilypondContains(page, expectedPattern) {
  await openTab(page, 'tab-lilypond');
  const lilypondText = await readPaneText(page, 'pane-lilypond');
  const regex = new RegExp(expectedPattern);
  return regex.test(lilypondText);
}

/**
 * Check if MusicXML pane contains expected grace element
 * @param {import('@playwright/test').Page} page - Playwright page
 * @param {string} expectedPattern - Expected MusicXML pattern (regex string)
 * @returns {Promise<boolean>} True if pattern found
 */
export async function musicXMLContains(page, expectedPattern) {
  await openTab(page, 'tab-musicxml');
  const musicXMLText = await readPaneText(page, 'pane-musicxml');
  const regex = new RegExp(expectedPattern);
  return regex.test(musicXMLText);
}

/**
 * Get Document Model data for inspection
 * @param {import('@playwright/test').Page} page - Playwright page
 * @returns {Promise<Object>} Document model object
 */
export async function getDocumentModel(page) {
  // Wait for editor to be initialized and document to be available
  // Use getDocument() method or renderer.theDocument (WASM owns the state now)
  const doc = await page.waitForFunction(() => {
    const app = window.MusicNotationApp?.app();
    if (!app?.editor) return null;
    // Try getDocument() first (calls WASM), fall back to renderer's cached copy
    try {
      return app.editor.getDocument?.() || app.editor.renderer?.theDocument || null;
    } catch (e) {
      return app.editor.renderer?.theDocument || null;
    }
  }, { timeout: 10000 });

  const documentData = await doc.jsonValue();

  if (!documentData) {
    throw new Error('Document not available - editor may not be initialized');
  }

  return documentData;
}

/**
 * Get Display List data for inspection (pre-computed render commands from WASM)
 * @param {import('@playwright/test').Page} page - Playwright page
 * @returns {Promise<string>} Display List data
 */
export async function getWASMLayout(page) {
  await openTab(page, 'tab-displaylist');
  return await readPaneText(page, 'pane-displaylist');
}

/**
 * Fail-fast check: Verify LilyPond export is not empty
 * Per CLAUDE.md: "Fail fast if LilyPond panel is empty or incorrect"
 * @param {import('@playwright/test').Page} page - Playwright page
 */
export async function assertLilyPondNotEmpty(page) {
  await openTab(page, 'tab-lilypond');
  const lilypondText = await readPaneText(page, 'pane-lilypond');

  if (lilypondText.length === 0) {
    throw new Error('FAIL FAST: LilyPond export is empty');
  }

  // Basic sanity check: should contain \relative or \score
  if (!lilypondText.includes('\\relative') && !lilypondText.includes('\\score')) {
    throw new Error(`FAIL FAST: LilyPond export appears incorrect:\n${lilypondText}`);
  }
}
