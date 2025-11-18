import { test, expect } from '@playwright/test';

test('Key signature dialog opens and allows selection', async ({ page }) => {
  await page.goto('http://localhost:8080');

  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  console.log('\n=== Test: Key Signature Dialog ===\n');

  // Type some content
  await editor.click();
  await page.keyboard.type('1 2 3');
  await page.waitForTimeout(300);

  console.log('Step 1: Open dialog via menu');
  // Click Document menu
  await page.click('button:has-text("Document")');
  await page.waitForTimeout(200);

  // Click Set Key Signature menu item
  await page.click('#menu-set-key-signature');
  await page.waitForTimeout(500);

  // Verify modal is visible
  const modal = page.locator('#key-signature-modal');
  await expect(modal).toBeVisible();
  console.log('✅ Dialog opened successfully');

  // Check that it's not hidden
  const hasHiddenClass = await modal.evaluate(el => el.classList.contains('hidden'));
  expect(hasHiddenClass).toBe(false);

  console.log('\nStep 2: Verify all key signature items are present');
  const items = await page.locator('.key-sig-item').count();
  console.log(`Found ${items} key signature items`);
  expect(items).toBeGreaterThan(10); // Should have 12+ items

  console.log('\nStep 3: Select D major');
  await page.click('.key-sig-item[data-key="D major"]');
  await page.waitForTimeout(800); // Wait for close animation

  // Modal should close after selection
  const modalVisible = await modal.isVisible();
  console.log(`Modal visible after selection: ${modalVisible}`);

  console.log('\nStep 4: Verify key signature was saved');
  // Check document model
  await page.click('[data-testid="tab-docmodel"]');
  await page.waitForTimeout(300);

  const docModel = await page.locator('[data-testid="pane-docmodel"]').innerText();

  if (docModel.includes('D major')) {
    console.log('✅ Key signature saved: D major');
  } else {
    console.log('❌ Key signature NOT saved');
    console.log('\nSearching for key_signature field:');
    const lines = docModel.split('\n');
    const keySigLine = lines.find(l => l.includes('key_signature'));
    console.log(keySigLine || 'NOT FOUND');
  }

  expect(docModel).toContain('D major');

  console.log('\n=== Test Complete ===\n');
});
