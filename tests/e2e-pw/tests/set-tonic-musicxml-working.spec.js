import { test, expect } from '@playwright/test';

test.describe('Tonic Should Affect MusicXML Pitch Transposition', () => {
  test('VERIFY: Setting tonic via WASM transposes pitches in MusicXML', async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // Type some musical content
    await editor.click();
    await page.keyboard.type('1 2 3');
    await page.waitForTimeout(500);

    console.log('\n╔═══════════════════════════════════════════════════════╗');
    console.log('║   TONIC → MUSICXML PITCH TRANSPOSITION TEST          ║');
    console.log('╚═══════════════════════════════════════════════════════╝\n');

    // Check MusicXML BEFORE setting tonic (default C major)
    await page.click('[data-testid="tab-musicxml"]');
    await page.waitForTimeout(300);
    let musicXMLBefore = await page.locator('[data-testid="pane-musicxml"]').innerText();

    console.log('🎼 BEFORE setting tonic (default C major):');
    console.log('   Input: 1 2 3');
    console.log('   Expected pitches: C D E');

    // In C major: 1=C, 2=D, 3=E
    const hasC = musicXMLBefore.includes('<step>C</step>');
    const hasD = musicXMLBefore.includes('<step>D</step>');
    const hasE = musicXMLBefore.includes('<step>E</step>');
    console.log('   Contains <step>C</step>:', hasC ? '✓' : '✗');
    console.log('   Contains <step>D</step>:', hasD ? '✓' : '✗');
    console.log('   Contains <step>E</step>:', hasE ? '✓' : '✗');
    console.log('');

    // Set tonic to D via WASM
    await page.evaluate(() => {
      window.editor.wasmModule.setDocumentTonic('D');
      window.editor.renderAndUpdate();
    });
    await page.waitForTimeout(300);

    // Check MusicXML AFTER setting tonic to D
    await page.click('[data-testid="tab-musicxml"]');
    await page.waitForTimeout(300);
    let musicXMLAfter = await page.locator('[data-testid="pane-musicxml"]').innerText();

    console.log('🎼 AFTER setting tonic to "D":');
    console.log('   Input: 1 2 3');
    console.log('   Expected pitches: D E F#');
    console.log('   (D major scale: degrees 1,2,3 = D,E,F#)');
    console.log('');

    // In D major: 1=D, 2=E, 3=F#
    const hasDAfter = musicXMLAfter.includes('<step>D</step>');
    const hasEAfter = musicXMLAfter.includes('<step>E</step>');
    const hasFAfter = musicXMLAfter.includes('<step>F</step>');

    // Check for F# (F with alter=1)
    const fSharpPattern = /<step>F<\/step>[\s\S]*?<alter>1<\/alter>/;
    const hasFSharp = fSharpPattern.test(musicXMLAfter);

    console.log('   Contains <step>D</step>:', hasDAfter ? '✓' : '✗');
    console.log('   Contains <step>E</step>:', hasEAfter ? '✓' : '✗');
    console.log('   Contains <step>F</step> with <alter>1</alter> (F#):', hasFSharp ? '✓' : '✗');
    console.log('');

    console.log('🎯 EXPECTED BEHAVIOR:');
    console.log('   • Tonic controls pitch transposition (NOT key signature)');
    console.log('   • Input degrees 1,2,3 in tonic D → pitches D,E,F#');
    console.log('   • Key signature remains independent (set via setDocumentKeySignature)');
    console.log('');

    // Verify transposed pitches
    expect(hasDAfter).toBeTruthy();
    expect(hasEAfter).toBeTruthy();
    expect(hasFSharp).toBeTruthy();

    console.log('✅ Tonic-based transposition working correctly in MusicXML!');
  });

  test('VERIFY: Setting tonic via UI menu transposes pitches in MusicXML', async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // Type musical content
    await editor.click();
    await page.keyboard.type('1 2 3 4 5');
    await page.waitForTimeout(500);

    console.log('\n╔═══════════════════════════════════════════════════════╗');
    console.log('║   UI MENU: TONIC → MUSICXML TRANSPOSITION TEST       ║');
    console.log('╚═══════════════════════════════════════════════════════╝\n');

    // Set tonic to G via UI menu
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
    console.log('   Input: 1 2 3 4 5');
    console.log('   Expected pitches: G A B C D');
    console.log('   (G major scale: degrees 1-5 = G,A,B,C,D)');
    console.log('');

    // In G major: 1=G, 2=A, 3=B, 4=C, 5=D
    const hasG = musicXML.includes('<step>G</step>');
    const hasA = musicXML.includes('<step>A</step>');
    const hasB = musicXML.includes('<step>B</step>');
    const hasC = musicXML.includes('<step>C</step>');
    const hasD = musicXML.includes('<step>D</step>');

    console.log('   Contains <step>G</step>:', hasG ? '✓' : '✗');
    console.log('   Contains <step>A</step>:', hasA ? '✓' : '✗');
    console.log('   Contains <step>B</step>:', hasB ? '✓' : '✗');
    console.log('   Contains <step>C</step>:', hasC ? '✓' : '✗');
    console.log('   Contains <step>D</step>:', hasD ? '✓' : '✗');
    console.log('');

    console.log('🎯 EXPECTED BEHAVIOR:');
    console.log('   • Tonic "G" transposes pitch spellings to G major');
    console.log('   • Key signature is independent (not automatically set)');
    console.log('');

    // Verify all expected pitches are present
    expect(hasG).toBeTruthy();
    expect(hasA).toBeTruthy();
    expect(hasB).toBeTruthy();
    expect(hasC).toBeTruthy();
    expect(hasD).toBeTruthy();

    console.log('✅ UI menu tonic setting working correctly!');
  });
});
