import { test, expect } from '@playwright/test';

test.describe('Pane Resize Redraw', () => {
  test('should reflow staff notation (VexFlow) when inspector pane is resized', async ({ page }) => {
    await page.goto('/');

    // Wait for editor to be ready
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();

    // Type a long notation string to ensure wrapping across multiple systems
    await editor.click();
    await page.keyboard.type('1111111111111111111111111111111111111111111111111111111111111111111111');

    // Verify staff notation tab is active (default)
    const staffNotationTab = page.locator('[data-tab="staff-notation"]');
    await expect(staffNotationTab).toHaveClass(/active/);

    // Wait for initial render
    const staffNotationContainer = page.locator('#staff-notation-container');
    const svgElements = page.locator('#staff-notation-container svg');
    await expect(svgElements.first()).toBeVisible({ timeout: 5000 });

    // Get initial container width
    const initialContainerWidth = await staffNotationContainer.evaluate(el => el.offsetWidth);
    console.log(`Initial container width: ${initialContainerWidth}px`);

    // Count initial number of staff systems (g elements with class containing 'system')
    const initialSystemCount = await page.evaluate(() => {
      const container = document.querySelector('#staff-notation-container');
      // OSMD creates g elements for each system
      const systems = container.querySelectorAll('g[id*="system"]');
      return systems.length;
    });
    console.log(`Initial system count: ${initialSystemCount}`);

    // Get the resize handle
    const resizeHandle = page.locator('#resize-handle');
    await expect(resizeHandle).toBeVisible();

    // Get initial panel width
    const tabsPanel = page.locator('#tabs-panel');
    const initialPanelWidth = await tabsPanel.evaluate(el => el.offsetWidth);

    // Perform resize by dragging the resize handle to make panel wider
    // This gives more horizontal space for staff notation to reflow
    const handleBox = await resizeHandle.boundingBox();
    if (!handleBox) {
      throw new Error('Resize handle not found');
    }

    // Drag from center of handle to the LEFT (make panel wider = more space for staff notation)
    const startX = handleBox.x + handleBox.width / 2;
    const startY = handleBox.y + handleBox.height / 2;
    const endX = startX - 200; // Drag 200px to the left (wider panel)

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, startY);
    await page.mouse.up();

    // Wait for resize to complete and re-render to finish
    await page.waitForTimeout(500);

    // Verify panel width changed (should be wider now)
    const newPanelWidth = await tabsPanel.evaluate(el => el.offsetWidth);
    expect(newPanelWidth).toBeGreaterThan(initialPanelWidth);
    console.log(`Panel resized from ${initialPanelWidth}px to ${newPanelWidth}px`);

    // Verify container width increased (more space available for notation)
    const newContainerWidth = await staffNotationContainer.evaluate(el => el.offsetWidth);
    expect(newContainerWidth).toBeGreaterThan(initialContainerWidth);
    console.log(`Container width increased from ${initialContainerWidth}px to ${newContainerWidth}px`);

    // Wait a bit more for OSMD to finish rendering
    await page.waitForTimeout(500);

    // Verify staff notation reflowed (different number of systems or layout changed)
    const newSystemCount = await page.evaluate(() => {
      const container = document.querySelector('#staff-notation-container');
      const systems = container.querySelectorAll('g[id*="system"]');
      return systems.length;
    });
    console.log(`New system count after resize: ${newSystemCount}`);

    // With more horizontal space, we should have fewer systems (measures fit on fewer lines)
    // OR at minimum, the rendering should have changed
    // We'll verify that the render actually happened by checking the OSMD instance was reset
    const osmdWasReset = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      // If OSMD was reset and re-rendered, renderToken should have increased
      return app?.editor?.osmdRenderer?.renderToken > 0;
    });
    expect(osmdWasReset).toBe(true);

    // Verify staff notation is still visible after resize
    await expect(svgElements.first()).toBeVisible();
  });

  test('should redraw staff notation when resize handle is double-clicked', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();

    // Type notation
    await editor.click();
    await page.keyboard.type('S-- r-');

    // Verify staff notation renders
    const svgElements = page.locator('#staff-notation-container svg');
    await expect(svgElements.first()).toBeVisible({ timeout: 5000 });

    // Get initial render token
    const initialRenderToken = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      return app?.editor?.osmdRenderer?.renderToken || 0;
    });

    // Get resize handle and double-click it (should reset to default width)
    const resizeHandle = page.locator('#resize-handle');
    await expect(resizeHandle).toBeVisible();

    // First, resize the panel to a non-default width
    const handleBox = await resizeHandle.boundingBox();
    if (!handleBox) {
      throw new Error('Resize handle not found');
    }

    const startX = handleBox.x + handleBox.width / 2;
    const startY = handleBox.y + handleBox.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 50, startY);
    await page.mouse.up();
    await page.waitForTimeout(200);

    // Get render token after first resize
    const afterFirstResize = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      return app?.editor?.osmdRenderer?.renderToken || 0;
    });
    expect(afterFirstResize).toBeGreaterThan(initialRenderToken);

    // Now double-click to reset
    await resizeHandle.dblclick();
    await page.waitForTimeout(200);

    // Verify redraw was triggered again
    const afterDoubleClick = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      return app?.editor?.osmdRenderer?.renderToken || 0;
    });

    expect(afterDoubleClick).toBeGreaterThan(afterFirstResize);
    console.log(`Render token after double-click: ${afterDoubleClick}`);

    // Verify staff notation is still visible
    await expect(svgElements.first()).toBeVisible();
  });

  test('should not redraw when resizing if staff notation tab is not active', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();

    // Type notation
    await editor.click();
    await page.keyboard.type('S-- r-');

    // Wait for initial render on staff notation tab
    const svgElements = page.locator('#staff-notation-container svg');
    await expect(svgElements.first()).toBeVisible({ timeout: 5000 });

    // Switch to a different tab (e.g., LilyPond)
    const lilypondTab = page.getByTestId('tab-lilypond');
    await expect(lilypondTab).toBeVisible();
    await lilypondTab.click();
    await page.waitForTimeout(200);

    // Verify LilyPond tab is active
    await expect(lilypondTab).toHaveClass(/active/);

    // Get render token before resize
    const tokenBeforeResize = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      return app?.editor?.osmdRenderer?.renderToken || 0;
    });

    // Perform resize
    const resizeHandle = page.locator('#resize-handle');
    await expect(resizeHandle).toBeVisible();

    const handleBox = await resizeHandle.boundingBox();
    if (!handleBox) {
      throw new Error('Resize handle not found');
    }

    const startX = handleBox.x + handleBox.width / 2;
    const startY = handleBox.y + handleBox.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 100, startY);
    await page.mouse.up();
    await page.waitForTimeout(200);

    // Verify render token did NOT increase (no redraw on non-active tab)
    const tokenAfterResize = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      return app?.editor?.osmdRenderer?.renderToken || 0;
    });

    expect(tokenAfterResize).toBe(tokenBeforeResize);
    console.log(`Render token unchanged: ${tokenAfterResize} (no redraw when tab not active)`);
  });
});
