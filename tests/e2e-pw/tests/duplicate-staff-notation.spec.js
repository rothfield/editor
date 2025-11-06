import { test, expect } from '@playwright/test';

test.describe('Duplicate Staff Notation Bug', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to simulate fresh page load
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      // Also clear IndexedDB cache to ensure fresh rendering
      return new Promise((resolve) => {
        const dbRequest = indexedDB.open('vexflow-staff-notation-cache', 1);
        dbRequest.onsuccess = (e) => {
          const db = e.target.result;
          const tx = db.transaction(['renders'], 'readwrite');
          tx.objectStore('renders').clear();
          tx.oncomplete = resolve;
        };
        dbRequest.onerror = resolve;
      });
    });
  });

  test('FAILING: should NOT render duplicate staff notations on initial load', async ({ page }) => {
    // Reload after clearing localStorage to get clean initial state
    await page.goto('/');

    // Wait for editor to be ready
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible({ timeout: 5000 });

    // Type some notation that generates a staff
    await editor.click();
    await page.keyboard.type('1111 1112555');

    // Wait for staff notation to render
    const staffNotationContainer = page.locator('#staff-notation-container');
    await expect(staffNotationContainer).toBeVisible({ timeout: 5000 });

    // Wait a moment for any async rendering to complete
    await page.waitForTimeout(500);

    // Count the number of top-level SVG elements in the container
    const svgElements = staffNotationContainer.locator('svg');
    const svgCount = await svgElements.count();

    // There should be exactly ONE SVG rendering, not multiple
    // If this fails, it means we have duplicate renderings (e.g., 2 staffs stacked)
    expect(svgCount).toBe(1,
      `Expected 1 SVG element, but found ${svgCount}. This indicates duplicate staff notation rendering.`
    );
  });

  test('FAILING: initial load should render exactly one set of notes', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible({ timeout: 5000 });

    // Type notation
    await editor.click();
    await page.keyboard.type('1111 1112555');

    const staffNotationContainer = page.locator('#staff-notation-container');
    await expect(staffNotationContainer).toBeVisible({ timeout: 5000 });

    // Wait for rendering
    await page.waitForTimeout(500);

    // Count note elements (vf-stavenote is VexFlow's note container class)
    const notes = staffNotationContainer.locator('.vf-stavenote');
    const noteCount = await notes.count();

    // Input "1111 1112555" should produce approximately 8 distinct notes
    // If we see 16, it's likely duplicated
    // This is a rough heuristic - the key is we shouldn't see 2x the expected count

    // Get bounding boxes of first and last note
    if (noteCount > 0) {
      const firstNoteBbox = await notes.first().boundingBox();
      const lastNoteBbox = await notes.last().boundingBox();

      if (firstNoteBbox && lastNoteBbox) {
        // If notes are widely separated horizontally, they're in different measures (expected)
        // If notes span a wide range vertically, they might be duplicated stacked
        const verticalSpan = lastNoteBbox.y + lastNoteBbox.height - firstNoteBbox.y;

        // A single staff is typically < 100px tall, so if span is > 200px, likely duplicated
        expect(verticalSpan).toBeLessThan(200,
          `Notes span ${verticalSpan}px vertically - possible duplicate rendering`
        );
      }
    }

    expect(noteCount).toBeGreaterThan(0, 'Should have at least one note');
  });

  test('PASSING: staff notation rendered once has single SVG', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible({ timeout: 5000 });

    await editor.click();
    await page.keyboard.type('1111 1112555');

    const staffNotationContainer = page.locator('#staff-notation-container');
    await expect(staffNotationContainer).toBeVisible({ timeout: 5000 });

    // Wait for rendering to complete
    await page.waitForTimeout(500);

    // Verify only one SVG element (not duplicated)
    const svgs = staffNotationContainer.locator('svg');
    const svgCount = await svgs.count();

    expect(svgCount).toBe(1,
      `Should have exactly 1 SVG element, but found ${svgCount}. This would indicate duplication.`
    );

    // Verify the SVG has reasonable dimensions (single staff)
    const svg = svgs.first();
    const height = await svg.getAttribute('height');
    expect(Number(height)).toBeLessThan(200,
      `SVG height should be <200px for single staff (got ${height}px)`
    );
  });

  test('FAILING: multi-load cycles should not accumulate duplicate staffs', async ({ page }) => {
    // Simulate multiple page loads/resets to catch accumulation bugs

    for (let cycle = 1; cycle <= 3; cycle++) {
      // Clear localStorage and IndexedDB cache
      await page.evaluate(() => {
        localStorage.clear();
        return new Promise((resolve) => {
          const dbRequest = indexedDB.open('vexflow-staff-notation-cache', 1);
          dbRequest.onsuccess = (e) => {
            const db = e.target.result;
            const tx = db.transaction(['renders'], 'readwrite');
            tx.objectStore('renders').clear();
            tx.oncomplete = resolve;
          };
        });
      });
      await page.goto('/');

      const editor = page.getByTestId('editor-root');
      await expect(editor).toBeVisible({ timeout: 5000 });

      await editor.click();
      await page.keyboard.type('S--r');

      const staffNotationContainer = page.locator('#staff-notation-container');
      await expect(staffNotationContainer).toBeVisible({ timeout: 5000 });
      await page.waitForTimeout(300);

      // Each cycle should have exactly 1 SVG
      const svgCount = await staffNotationContainer.locator('svg').count();
      expect(svgCount).toBe(1,
        `Cycle ${cycle}: Expected 1 SVG, got ${svgCount}`
      );
    }
  });
});
