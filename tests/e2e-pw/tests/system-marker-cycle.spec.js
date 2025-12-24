// @ts-check
import { test, expect } from '@playwright/test';

test.describe('System Marker Cycling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');

    // Wait for WASM to be ready
    await page.waitForFunction(() => {
      return window.editor && window.editor.wasmModule && window.editor.wasmModule.createNewDocument;
    });

    // Create a new document
    await page.evaluate(() => {
      window.editor.createNewDocument();
    });

    // Wait for document to be rendered
    await page.waitForSelector('.notation-line-container');
  });

  test('clicking line 0 gutter should cycle through all marker states up to 8', async ({ page }) => {
    // Add 2 lines so we have 3 total
    // Even with only 3 lines, should be able to cycle up to «8
    await page.evaluate(async () => {
      for (let i = 0; i < 2; i++) {
        await window.editor.wasmModule.insertNewline();
      }
      await window.editor.renderAndUpdate();
    });

    await page.waitForTimeout(200);

    // Get the system marker indicator for line 0
    const indicator = page.locator('.system-marker-indicator[data-line-index="0"]');

    // Initial state should be standalone (·)
    await expect(indicator).toHaveText('·');

    let count = await page.evaluate(() => {
      return window.editor.wasmModule.getSystemStart(0);
    });
    expect(count).toBe(0);

    // Cycle through all states: · → «1 → «2 → «3 → 4 → 5 → 6 → 7 → 8 → ·
    // Note: count=1 is interpreted as standalone in backend (part_id=P1, no brackets)
    // But UI shows «1 for clarity
    const states = ['«1', '«2', '«3', '«4', '«5', '«6', '«7', '«8', '·'];

    for (let i = 0; i < states.length; i++) {
      await indicator.click();
      await page.waitForTimeout(100);

      const text = await indicator.textContent();
      console.log(`After click ${i + 1} - DOM shows: ${text}`);

      count = await page.evaluate(() => {
        return window.editor.wasmModule.getSystemStart(0);
      });
      console.log(`After click ${i + 1} - WASM returns: ${count}`);

      await expect(indicator).toHaveText(states[i]);
      expect(count).toBe(i < 8 ? i + 1 : 0);
    }
  });

  test('clicking middle/end line should be editable and start new system', async ({ page }) => {
    // Create a 3-line system to test middle/end line editing
    await page.evaluate(async () => {
      for (let i = 0; i < 2; i++) {
        await window.editor.wasmModule.insertNewline();
      }
      await window.editor.renderAndUpdate();
    });

    await page.waitForTimeout(200);

    const indicator0 = page.locator('.system-marker-indicator[data-line-index="0"]');
    const indicator1 = page.locator('.system-marker-indicator[data-line-index="1"]');
    const indicator2 = page.locator('.system-marker-indicator[data-line-index="2"]');

    // Set up a 3-line system
    await indicator0.click(); // → «1
    await page.waitForTimeout(50);
    await indicator0.click(); // → «2
    await page.waitForTimeout(50);
    await indicator0.click(); // → «3
    await page.waitForTimeout(100);

    // Verify 3-line system is created
    await expect(indicator0).toHaveText('«3'); // Start
    await expect(indicator1).toHaveText('├');  // Middle
    await expect(indicator2).toHaveText('└');  // End

    // Now click the middle line (line 1) - should be editable
    await indicator1.click();
    await page.waitForTimeout(100);

    // Line 1 should now have a marker (starting a new system from there)
    const line1Text = await indicator1.textContent();
    console.log('After clicking middle line, indicator shows:', line1Text);

    // Should show «1 or «2 (depending on implementation)
    // The key is it should NOT still show ├ - it should be editable
    expect(line1Text).not.toBe('├');
    expect(['«1', '«2', '·']).toContain(line1Text);

    // Verify line 1 now has a system_start_count
    const line1Count = await page.evaluate(() => {
      return window.editor.wasmModule.getSystemStart(1);
    });
    console.log('Line 1 count after click:', line1Count);

    // Should be non-zero since we clicked it
    expect(line1Count).toBeGreaterThan(0);
  });

  test('setting «2 on line 0 should show continuation indicators', async ({ page }) => {
    // Add a second line using WASM API
    await page.evaluate(async () => {
      await window.editor.wasmModule.insertNewline();
      await window.editor.renderAndUpdate();
    });

    // Wait for the second line to be rendered
    await page.waitForSelector('.system-marker-indicator[data-line-index="1"]', { timeout: 5000 });

    // Now we have 2 lines, both standalone
    const indicator0 = page.locator('.system-marker-indicator[data-line-index="0"]');
    const indicator1 = page.locator('.system-marker-indicator[data-line-index="1"]');

    await expect(indicator0).toHaveText('·');
    await expect(indicator1).toHaveText('·');

    // Set line 0 to «2 (2-line system)
    await indicator0.click(); // → «1
    await page.waitForTimeout(50);
    await indicator0.click(); // → «2
    await page.waitForTimeout(100);

    // Line 0 should show «2
    await expect(indicator0).toHaveText('«2');

    // Line 1 should show └ (end of system)
    await expect(indicator1).toHaveText('└');

    // Check system IDs from WASM
    const systemData = await page.evaluate(() => {
      const doc = window.editor.getDocument();
      return doc.lines.map((l, idx) => ({
        index: idx,
        system_id: l.system_id,
        system_start_count: l.system_start_count,
        role: window.editor.wasmModule.getLineSystemRole(idx)
      }));
    });

    console.log('System data:', systemData);

    // Both lines should be in system 1
    expect(systemData[0].system_id).toBe(1);
    expect(systemData[1].system_id).toBe(1);

    // Line 0 should be start, line 1 should be end
    expect(systemData[0].role.type).toBe('start');
    expect(systemData[0].role.count).toBe(2);
    expect(systemData[1].role.type).toBe('end');
  });

  test('4-staff system followed by unmarked line should have separate system_ids', async ({ page }) => {
    // Create 5 lines (0-4)
    await page.evaluate(async () => {
      for (let i = 0; i < 4; i++) {
        await window.editor.wasmModule.insertNewline();
      }
      await window.editor.renderAndUpdate();
    });

    await page.waitForTimeout(200);

    // Set line 0 to «4 (4-staff system covering lines 0-3)
    const indicator0 = page.locator('.system-marker-indicator[data-line-index="0"]');

    // Click 4 times to get to «4
    for (let i = 0; i < 4; i++) {
      await indicator0.click();
      await page.waitForTimeout(50);
    }

    await page.waitForTimeout(100);

    // Verify line 0 shows «4
    await expect(indicator0).toHaveText('«4');

    // Check system IDs from WASM
    const systemData = await page.evaluate(() => {
      const doc = window.editor.getDocument();
      return doc.lines.map((l, idx) => ({
        index: idx,
        system_id: l.system_id,
        part_id: l.part_id,
        system_start_count: l.system_start_count,
      }));
    });

    console.log('System data:', systemData);

    // Lines 0-3 should be in system 1
    expect(systemData[0].system_id).toBe(1);
    expect(systemData[1].system_id).toBe(1);
    expect(systemData[2].system_id).toBe(1);
    expect(systemData[3].system_id).toBe(1);

    // Line 4 (unmarked) should be in system 2 (NOT system 1!)
    expect(systemData[4].system_id).toBe(2);
    expect(systemData[4].system_start_count).toBeUndefined(); // No marker

    // Part IDs should be position-based (position 0 in any system = P1)
    expect(systemData[0].part_id).toBe('P1');
    expect(systemData[1].part_id).toBe('P2');
    expect(systemData[2].part_id).toBe('P3');
    expect(systemData[3].part_id).toBe('P4');
    expect(systemData[4].part_id).toBe('P1'); // Position 0 in new system!
  });
});
