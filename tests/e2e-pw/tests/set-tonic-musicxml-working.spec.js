import { test, expect } from '@playwright/test';

test.describe('Set Tonic Should Affect MusicXML Export', () => {
  test('VERIFY: Setting tonic via WASM affects MusicXML key signature', async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // Type some musical content
    await editor.click();
    await page.keyboard.type('1 2 3 4 5');
    await page.waitForTimeout(500);

    console.log('\n╔═══════════════════════════════════════════════════════╗');
    console.log('║   TONIC → MUSICXML EXPORT TEST                       ║');
    console.log('╚═══════════════════════════════════════════════════════╝\n');

    // Check MusicXML BEFORE setting tonic
    await page.click('[data-testid="tab-musicxml"]');
    await page.waitForTimeout(300);
    let musicXMLBefore = await page.locator('[data-testid="pane-musicxml"]').innerText();

    console.log('🎼 BEFORE setting tonic:');
    console.log('   MusicXML contains <key>:', musicXMLBefore.includes('<key>') ? 'YES' : 'NO');

    // Extract key signature info if present
    const keyMatchBefore = musicXMLBefore.match(/<key>[\s\S]*?<\/key>/);
    if (keyMatchBefore) {
      console.log('   Key signature block:', keyMatchBefore[0].replace(/\s+/g, ' ').trim());
    } else {
      console.log('   Key signature block: NOT FOUND');
    }
    console.log('');

    // Set tonic via WASM
    await page.evaluate(() => {
      window.editor.wasmModule.setDocumentTonic('D');
    });
    await page.waitForTimeout(300);

    // Check MusicXML AFTER setting tonic
    await page.click('[data-testid="tab-musicxml"]');
    await page.waitForTimeout(300);
    let musicXMLAfter = await page.locator('[data-testid="pane-musicxml"]').innerText();

    console.log('🎼 AFTER setting tonic to "D":');
    console.log('   MusicXML contains <key>:', musicXMLAfter.includes('<key>') ? 'YES' : 'NO');

    const keyMatchAfter = musicXMLAfter.match(/<key>[\s\S]*?<\/key>/);
    if (keyMatchAfter) {
      console.log('   Key signature block:', keyMatchAfter[0].replace(/\s+/g, ' ').trim());
    } else {
      console.log('   Key signature block: NOT FOUND');
    }
    console.log('');

    console.log('📊 COMPARISON:');
    console.log('   Key signature changed:', keyMatchBefore?.[0] !== keyMatchAfter?.[0] ? 'YES' : 'NO');
    console.log('');

    console.log('🎯 EXPECTED BEHAVIOR:');
    console.log('   • Tonic "D" should set key signature to D major (2 sharps)');
    console.log('   • MusicXML should contain <fifths>2</fifths> for D major');
    console.log('   • Or contain appropriate <step> and <alter> elements');
    console.log('');

    // Check if MusicXML has changed and contains key info related to D
    if (keyMatchAfter) {
      console.log('✅ MusicXML contains key signature information');

      // Check for D major indicators
      const hasFifths2 = musicXMLAfter.includes('<fifths>2</fifths>');
      const hasDMajorInfo = musicXMLAfter.match(/<key>[\s\S]*?D[\s\S]*?<\/key>/i);

      console.log('   Contains <fifths>2</fifths> (D major):', hasFifths2 ? 'YES' : 'NO');
      console.log('   Contains D-related key info:', hasDMajorInfo ? 'YES' : 'NO');

      // This test will FAIL if tonic doesn't affect the export
      expect(hasFifths2 || hasDMajorInfo).toBeTruthy();
    } else {
      console.log('❌ MusicXML does NOT contain key signature information');
      console.log('');
      console.log('🐛 POSSIBLE ROOT CAUSES:');
      console.log('   1. Export code does not read document.tonic field');
      console.log('   2. Export code reads tonic but does not generate <key> element');
      console.log('   3. Tonic needs to be converted to key signature format first');
      console.log('');

      // Fail the test - tonic should affect MusicXML
      throw new Error('Setting tonic had no effect on MusicXML export - key signature missing');
    }
  });

  test('VERIFY: Setting tonic via UI menu affects MusicXML export', async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // Type musical content
    await editor.click();
    await page.keyboard.type('1 2 3 4 5');
    await page.waitForTimeout(500);

    console.log('\n╔═══════════════════════════════════════════════════════╗');
    console.log('║   UI MENU: TONIC → MUSICXML EXPORT TEST              ║');
    console.log('╚═══════════════════════════════════════════════════════╝\n');

    // Set tonic via UI menu
    page.on('dialog', async dialog => {
      await dialog.accept('G');
    });

    await page.click('button:has-text("File")');
    await page.waitForTimeout(200);
    const fileMenuButtons = await page.locator('#file-menu #menu-set-tonic').all();
    if (fileMenuButtons.length > 0) {
      await fileMenuButtons[0].click();
    }
    await page.waitForTimeout(500);

    // Check MusicXML
    await page.click('[data-testid="tab-musicxml"]');
    await page.waitForTimeout(300);
    const musicXML = await page.locator('[data-testid="pane-musicxml"]').innerText();

    console.log('🎼 After setting tonic to "G" via UI menu:');

    const keyMatch = musicXML.match(/<key>[\s\S]*?<\/key>/);
    if (keyMatch) {
      console.log('   Key signature block:', keyMatch[0].replace(/\s+/g, ' ').trim());

      // G major = 1 sharp
      const hasFifths1 = musicXML.includes('<fifths>1</fifths>');
      console.log('   Contains <fifths>1</fifths> (G major):', hasFifths1 ? 'YES' : 'NO');

      console.log('');
      console.log('🎯 EXPECTED: <fifths>1</fifths> for G major (1 sharp)');

      expect(hasFifths1).toBeTruthy();
    } else {
      console.log('   ❌ NO key signature in MusicXML');
      throw new Error('Setting tonic via UI menu had no effect on MusicXML export');
    }
  });
});
