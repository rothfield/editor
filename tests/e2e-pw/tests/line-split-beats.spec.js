import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test.describe('Line split with beat groupings', () => {
  test('should preserve beat groupings after splitting line with Enter', async ({ page }) => {
    await page.goto('/');
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();

    // Clear editor
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(200);

    // Type a line with clear beat groupings: "S r g m | P d n S"
    // This creates two measures with explicit beat structure
    await editor.click();
    await page.keyboard.type('S r g m | P d n S');
    await page.waitForTimeout(300);

    // Check initial beat structure in display list
    await openTab(page, 'tab-displaylist');
    const initialDisplayList = await readPaneText(page, 'pane-displaylist');
    console.log('Initial display list (before split):');
    console.log(initialDisplayList.substring(0, 2000));

    // Verify initial structure has beats
    expect(initialDisplayList).toContain('"beats"');

    // Count initial beat arcs (should have beat groupings)
    const initialBeatCount = (initialDisplayList.match(/"beats"/g) || []).length;
    console.log(`Initial beat count: ${initialBeatCount}`);

    // Now split the line: move cursor to after "|" and press Enter
    await editor.click();
    // Move to start
    await page.keyboard.press('Home');
    // Move past "S r g m |" (10 characters with spaces)
    for (let i = 0; i < 11; i++) {
      await page.keyboard.press('ArrowRight');
    }
    await page.waitForTimeout(100);

    // Split the line
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // Check beat structure after split
    await openTab(page, 'tab-displaylist');
    const afterSplitDisplayList = await readPaneText(page, 'pane-displaylist');
    console.log('\nDisplay list (after split):');
    console.log(afterSplitDisplayList.substring(0, 2000));

    // Verify split occurred (should now have 2 lines)
    expect(afterSplitDisplayList).toContain('line_idx": 0');
    expect(afterSplitDisplayList).toContain('line_idx": 1');

    // Verify both lines still have beat structure
    expect(afterSplitDisplayList).toContain('"beats"');

    // Check that beats are present in the display list
    const afterSplitBeatCount = (afterSplitDisplayList.match(/"beats"/g) || []).length;
    console.log(`After split beat count: ${afterSplitBeatCount}`);

    // Should have beat data for both lines
    expect(afterSplitBeatCount).toBeGreaterThan(0);

    // Check MusicXML export to verify rhythm is correct
    await openTab(page, 'tab-musicxml');
    const musicxml = await readPaneText(page, 'pane-musicxml');
    console.log('\nMusicXML (after split):');
    console.log(musicxml.substring(0, 1500));

    // Verify MusicXML has notes with durations (beat structure preserved)
    expect(musicxml).toContain('<note');
    expect(musicxml).toContain('<duration>');

    // Verify we have two parts (one for each line after split)
    const partCount = (musicxml.match(/<part /g) || []).length;
    console.log(`MusicXML parts: ${partCount}`);
    expect(partCount).toBe(2); // Should have 2 parts after split
  });

  test('should maintain beat arcs after splitting line', async ({ page }) => {
    await page.goto('/');
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();

    // Clear editor
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(200);

    // Type a line with beat groupings that will have visual beat arcs
    await editor.click();
    await page.keyboard.type('S-r- g-m- | P-d- n-S-');
    await page.waitForTimeout(300);

    // Count beat arcs before split
    const initialBeatArcs = await page.locator('.beat-arc').count();
    console.log(`Initial beat arcs: ${initialBeatArcs}`);
    expect(initialBeatArcs).toBeGreaterThan(0);

    // Split line in the middle
    await editor.click();
    await page.keyboard.press('Home');
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('ArrowRight');
    }
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // Count beat arcs after split
    const afterSplitBeatArcs = await page.locator('.beat-arc').count();
    console.log(`After split beat arcs: ${afterSplitBeatArcs}`);

    // Should still have beat arcs (beats were recomputed)
    expect(afterSplitBeatArcs).toBeGreaterThan(0);

    // Check that beat arcs are visible in both lines
    const line0BeatArcs = await page.locator('.notation-line').nth(0).locator('.beat-arc').count();
    const line1BeatArcs = await page.locator('.notation-line').nth(1).locator('.beat-arc').count();

    console.log(`Line 0 beat arcs: ${line0BeatArcs}`);
    console.log(`Line 1 beat arcs: ${line1BeatArcs}`);

    // Both lines should have beat arcs if they have beat groupings
    // (This will be true if the beats were properly recomputed)
  });
});
