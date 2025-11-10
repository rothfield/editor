import { test, expect } from '@playwright/test';

test('New composition should export single part (no new_system on first line)', async ({ page }) => {
  await page.goto('/');
  
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();
  
  // Wait for editor to initialize
  await page.waitForTimeout(500);
  
  // Type a single note to trigger export
  await editor.click();
  await page.keyboard.type('1');
  await page.waitForTimeout(300);
  
  // Check MusicXML export
  const musicxmlTab = page.getByTestId('tab-musicxml');
  await expect(musicxmlTab).toBeVisible();
  await musicxmlTab.click();
  await page.waitForTimeout(300);
  
  const musicxmlPane = page.getByTestId('pane-musicxml');
  const musicxml = await musicxmlPane.innerText();
  
  console.log('MusicXML output:', musicxml);
  
  // ASSERTION: Should have exactly ONE part (P1)
  // This proves new_system=false on first line (ungrouped mode)
  expect(musicxml).toContain('<score-part id="P1">');
  expect(musicxml).not.toContain('<score-part id="P2">');
  console.log('✓ Single part P1 (proves ungrouped mode)');
  
  // ASSERTION: Should NOT have part-group brackets
  // This proves no multi-part system (confirms single part behavior)
  expect(musicxml).not.toContain('<part-group');
  console.log('✓ No part-group brackets');
  
  // ASSERTION: Should have exactly one <part> element
  const partMatches = musicxml.match(/<part id="P1">/g);
  expect(partMatches).not.toBeNull();
  expect(partMatches.length).toBe(1);
  console.log('✓ Exactly one <part> element');
  
  // ASSERTION: Should NOT have <print new-system> in first measure
  // (first measure never gets new-system)
  const firstMeasureStart = musicxml.indexOf('<measure number="1">');
  const firstMeasureEnd = musicxml.indexOf('</measure>', firstMeasureStart);
  const firstMeasureContent = musicxml.substring(firstMeasureStart, firstMeasureEnd);
  expect(firstMeasureContent).not.toContain('<print new-system="yes"/>');
  console.log('✓ First measure has no <print new-system>');
});
