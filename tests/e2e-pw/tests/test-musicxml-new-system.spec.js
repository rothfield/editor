import { test, expect } from '@playwright/test';

test('Type 1 + Enter + 2 should create two measures with new-system break', async ({ page }) => {
  await page.goto('/');
  
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();
  await editor.click();
  
  // Type "1", press Enter, then type "2"
  await page.keyboard.type('1');
  await page.keyboard.press('Enter');
  await page.keyboard.type('2');
  await page.waitForTimeout(500);
  
  // Get MusicXML tab
  const musicxmlTab = page.getByTestId('tab-musicxml');
  await expect(musicxmlTab).toBeVisible();
  await musicxmlTab.click();
  
  // Wait for MusicXML to render
  await page.waitForTimeout(500);
  
  // Get MusicXML content
  const musicxmlPane = page.getByTestId('pane-musicxml');
  const musicxml = await musicxmlPane.innerText();
  
  console.log('MusicXML output:', musicxml);
  
  // Verify structure
  expect(musicxml).toContain('<part id="P1">'); // Single part
  expect(musicxml).toContain('<measure number="1">'); // First measure
  expect(musicxml).toContain('<measure number="2">'); // Second measure
  expect(musicxml).toContain('<print new-system="yes"/>'); // System break at measure 2
  
  // Verify the print element is in measure 2 (not measure 1)
  const measure1Start = musicxml.indexOf('<measure number="1">');
  const measure1End = musicxml.indexOf('</measure>', measure1Start);
  const measure1Content = musicxml.substring(measure1Start, measure1End);
  expect(measure1Content).not.toContain('<print new-system="yes"/>');
  
  const measure2Start = musicxml.indexOf('<measure number="2">');
  const measure2End = musicxml.indexOf('</measure>', measure2Start);
  const measure2Content = musicxml.substring(measure2Start, measure2End);
  expect(measure2Content).toContain('<print new-system="yes"/>');
});
