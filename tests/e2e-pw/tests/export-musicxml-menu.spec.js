import { test, expect } from '@playwright/test';
import * as fs from 'fs';

test('File menu has Export MusicXML option', async ({ page }) => {
  // Navigate to the editor
  await page.goto('/');

  // Wait for editor to be ready
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Open File menu
  const fileMenuButton = page.locator('#file-menu-button');
  await fileMenuButton.click();

  // Verify Export MusicXML menu item exists
  const exportMusicXMLItem = page.locator('#menu-export-musicxml');
  await expect(exportMusicXMLItem).toBeVisible();
  await expect(exportMusicXMLItem).toHaveText('Export MusicXML...');
});

test('Export MusicXML from File menu creates download', async ({ page }) => {
  // Navigate to the editor
  await page.goto('/');

  // Wait for editor to be ready
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Type some notes
  await editor.click();
  await page.keyboard.type('1 2 3 4');

  // Wait a bit for content to be rendered
  await page.waitForTimeout(500);

  // Set up dialog handler FIRST (before triggering the action)
  page.once('dialog', async dialog => {
    expect(dialog.type()).toBe('prompt');
    expect(dialog.message()).toContain('Enter filename');
    await dialog.accept('test-export');
  });

  // Set up download listener
  const downloadPromise = page.waitForEvent('download');

  // Open File menu
  const fileMenuButton = page.locator('#file-menu-button');
  await fileMenuButton.click();

  // Click Export MusicXML menu item (this will trigger the dialog)
  const exportMusicXMLItem = page.locator('#menu-export-musicxml');
  await exportMusicXMLItem.click();

  // Wait for download to complete
  const download = await downloadPromise;

  // Verify download properties
  expect(download.suggestedFilename()).toBe('test-export.musicxml');

  // Read downloaded file content
  const path = await download.path();
  const content = fs.readFileSync(path, 'utf-8');

  // Verify it's valid MusicXML
  expect(content).toContain('<?xml version="1.0"');
  expect(content).toContain('<score-partwise');
  expect(content).toContain('</score-partwise>');
});

test('Export MusicXML via Export dialog works', async ({ page }) => {
  // Navigate to the editor
  await page.goto('/');

  // Wait for editor to be ready
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Type some notes
  await editor.click();
  await page.keyboard.type('1 2 3 4 5');

  // Switch to MusicXML tab to verify content exists
  const musicxmlTab = page.getByTestId('tab-musicxml');
  await musicxmlTab.click();

  // Wait for MusicXML content to appear
  const musicxmlPane = page.getByTestId('pane-musicxml');
  await expect(musicxmlPane).toBeVisible();

  // Verify MusicXML content is not empty
  const musicxmlContent = await musicxmlPane.innerText();
  expect(musicxmlContent.length).toBeGreaterThan(0);
  expect(musicxmlContent).toContain('<?xml');
  expect(musicxmlContent).toContain('<score-partwise');
});
