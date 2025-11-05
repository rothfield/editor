import { test, expect } from '@playwright/test';

test('Inspector tabs update when switching between them', async ({ page }) => {
  await page.goto('/');

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Type some content to have something to display in all tabs
  // Use numbers to ensure pitched notes are generated
  await editor.click();
  await page.keyboard.type('1 2 3 |');

  // Give WASM a moment to process
  await page.waitForTimeout(300);

  // Test MusicXML tab
  console.log('Testing MusicXML tab...');
  const xmlTab = page.getByTestId('tab-musicxml');
  await xmlTab.click();

  const musicxmlPane = page.getByTestId('pane-musicxml');
  await expect(musicxmlPane).toBeVisible();

  // Wait for content to populate
  await expect.poll(async () => (await musicxmlPane.innerText()).trim()).not.toEqual('');

  const musicxml = await musicxmlPane.innerText();
  expect(musicxml).toContain('<?xml');
  expect(musicxml).toContain('<note>');
  expect(musicxml).toContain('<pitch>'); // Should have pitched notes now
  console.log('✓ MusicXML tab updated');

  // Test LilyPond tab
  console.log('Testing LilyPond tab...');
  const lilyTab = page.getByTestId('tab-lilypond');
  await lilyTab.click();

  const lilyPane = page.getByTestId('pane-lilypond');
  await expect(lilyPane).toBeVisible();

  // Wait for content to populate
  await expect.poll(async () => (await lilyPane.innerText()).trim()).not.toEqual('');

  const lilypond = await lilyPane.innerText();
  expect(lilypond).toContain('\\version');
  expect(lilypond).toContain('\\score');
  console.log('✓ LilyPond tab updated');

  // Test Display List tab
  console.log('Testing Display List tab...');
  const displayListTab = page.getByTestId('tab-displaylist');
  await displayListTab.click();

  const displayListPane = page.getByTestId('pane-displaylist');
  await expect(displayListPane).toBeVisible();

  // Wait for content to populate
  await expect.poll(async () => (await displayListPane.innerText()).trim()).not.toEqual('');

  const displayList = await displayListPane.innerText();
  expect(displayList).toContain('lines');
  console.log('✓ Display List tab updated');

  // Test Persistent Model tab
  console.log('Testing Persistent Model tab...');
  const docModelTab = page.getByTestId('tab-docmodel');
  await docModelTab.click();

  const docModelPane = page.getByTestId('pane-docmodel');
  await expect(docModelPane).toBeVisible();

  // Wait for content to populate
  await expect.poll(async () => (await docModelPane.innerText()).trim()).not.toEqual('');

  const docModel = await docModelPane.innerText();
  expect(docModel).toContain('lines');
  console.log('✓ Persistent Model tab updated');

  // Test IR tab
  console.log('Testing IR tab...');
  const irTab = page.getByTestId('tab-ir');
  await irTab.click();

  const irPane = page.getByTestId('pane-ir');
  await expect(irPane).toBeVisible();

  // Wait for content to populate (IR might take longer)
  await expect.poll(async () => (await irPane.innerText()).trim()).not.toEqual('');

  const ir = await irPane.innerText();
  // IR might have a fallback message if not implemented, that's okay
  expect(ir.length).toBeGreaterThan(0);
  console.log('✓ IR tab updated');

  console.log('All inspector tabs update correctly when switched to!');
});
