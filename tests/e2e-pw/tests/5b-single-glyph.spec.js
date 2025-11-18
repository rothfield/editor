import { test, expect } from '@playwright/test';

test.describe('5b (5 flat) Should Be Single Glyph', () => {
  test('VERIFY: 5b is rendered as one composite glyph, not two separate glyphs', async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    console.log('\n╔═══════════════════════════════════════════════════════╗');
    console.log('║   5b SINGLE GLYPH TEST                               ║');
    console.log('╚═══════════════════════════════════════════════════════╝\n');

    // Type "5b" (5 flat)
    await editor.click();
    await page.keyboard.type('5b');
    await page.waitForTimeout(1000); // Increased wait time

    // Get actual rendered cells from the editor
    const renderedCells = await page.locator('.char-cell.kind-pitched').count();
    console.log(`   Rendered cells in DOM: ${renderedCells}`);
    console.log('');

    // Check WASM Layout (Display List) to see how many cells are rendered
    await page.click('[data-testid="tab-displaylist"]');
    await page.waitForTimeout(300);
    const displayList = await page.locator('[data-testid="pane-displaylist"]').innerText();

    console.log('📐 WASM Display List:');
    console.log('   Raw output (first 500 chars):');
    console.log('  ', displayList.substring(0, 500));
    console.log('');

    // Count cells in the first line - try multiple patterns
    let cellCount = 0;
    const charPattern = /char: "(.+?)"/g;
    const cellMatches = displayList.match(charPattern);
    cellCount = cellMatches ? cellMatches.length : 0;

    // If no matches, try alternative pattern
    if (cellCount === 0) {
      const altPattern = /cells:\s*\n([\s\S]*?)(?=\n\w+:|$)/;
      const cellsBlock = displayList.match(altPattern);
      if (cellsBlock) {
        const dashCount = (cellsBlock[1].match(/- /g) || []).length;
        console.log('   Found cells block with', dashCount, 'items');
        cellCount = dashCount;
      }
    }

    console.log('   Total cells rendered:', cellCount);
    console.log('');

    // Extract the char values
    if (cellMatches) {
      console.log('   Cell characters:');
      cellMatches.forEach((match, idx) => {
        const char = match.match(/char: "(.+?)"/)[1];
        console.log(`     Cell ${idx}: "${char}" (length: ${char.length} char(s))`);
      });
    }
    console.log('');

    // Check Document Model to see pitch_code
    await page.click('[data-testid="tab-docmodel"]');
    await page.waitForTimeout(300);
    const docModel = await page.locator('[data-testid="pane-docmodel"]').innerText();

    console.log('📄 Document Model:');
    console.log('   Raw cell data (first 800 chars):');
    const cellSection = docModel.substring(docModel.indexOf('cells:'), docModel.indexOf('cells:') + 800);
    console.log('  ', cellSection);
    console.log('');

    // Find the cell with pitch_code, char, octave, pitch_system
    const pitchCodeMatch = docModel.match(/pitch_code: (\d+)/);
    const charMatch = docModel.match(/char: "(.*)"/);
    const octaveMatch = docModel.match(/octave: (-?\d+)/);
    const pitchSystemMatch = docModel.match(/pitch_system: (\d+)/);

    console.log('   Cell properties:');
    console.log('     char:', charMatch ? `"${charMatch[1]}"` : 'NOT FOUND');
    console.log('     pitch_code:', pitchCodeMatch ? pitchCodeMatch[1] : 'NOT FOUND');
    console.log('     octave:', octaveMatch ? octaveMatch[1] : 'NOT FOUND');
    console.log('     pitch_system:', pitchSystemMatch ? pitchSystemMatch[1] : 'NOT FOUND');
    console.log('');

    console.log('🎯 EXPECTED BEHAVIOR:');
    console.log('   • "5b" should create 1 cell, not 2 cells');
    console.log('   • Cell char should be a single composite glyph (5♭)');
    console.log('   • pitch_code should be 8 (Sol flat / G♭)');
    console.log('');

    console.log('🐛 ACTUAL BEHAVIOR:');
    console.log('   • Cell count:', cellCount);
    console.log('   • Is single glyph:', cellCount === 1 ? 'YES ✅' : `NO ❌ (${cellCount} cells)`);
    console.log('');

    if (cellCount !== 1) {
      console.log('❌ BUG DETECTED: 5b is being rendered as multiple cells');
      console.log('');
      console.log('📁 POSSIBLE ROOT CAUSES:');
      console.log('   1. Parser is creating separate cells for "5" and "b"');
      console.log('   2. pitch_code recognition not working for flat notation');
      console.log('   3. Font lookup not finding composite glyph for 5♭');
      console.log('');
    }

    // Verify: should be exactly 1 cell
    expect(cellCount).toBe(1);
  });

  test('VERIFY: 5b uses correct pitch code for Sol flat', async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    console.log('\n╔═══════════════════════════════════════════════════════╗');
    console.log('║   5b PITCH CODE VERIFICATION                         ║');
    console.log('╚═══════════════════════════════════════════════════════╝\n');

    // Type "5b" (5 flat = Sol flat = G♭)
    await editor.click();
    await page.keyboard.type('5b');
    await page.waitForTimeout(500);

    // Check document model for pitch_code
    await page.click('[data-testid="tab-docmodel"]');
    await page.waitForTimeout(300);
    const docModel = await page.locator('[data-testid="pane-docmodel"]').innerText();

    // Extract pitch_code from first cell
    const cellMatch = docModel.match(/cells:\s*-[\s\S]*?pitch_code: (\d+)/);
    const pitchCode = cellMatch ? parseInt(cellMatch[1]) : null;

    console.log('📄 Pitch Code Analysis:');
    console.log('   Input: "5b" (Sol flat / G♭)');
    console.log('   pitch_code:', pitchCode);
    console.log('');

    console.log('🎯 EXPECTED:');
    console.log('   • pitch_code should be 8 (PitchCode::Gb / Sol flat)');
    console.log('');

    console.log('🐛 ACTUAL:');
    console.log('   • pitch_code:', pitchCode);
    console.log('   • Correct:', pitchCode === 8 ? 'YES ✅' : `NO ❌ (expected 8, got ${pitchCode})`);
    console.log('');

    if (pitchCode !== 8) {
      console.log('❌ BUG: pitch_code is incorrect');
      console.log('');
      console.log('📚 REFERENCE: PitchCode enum values');
      console.log('   0 = Do (C)');
      console.log('   1 = Db (C♯/D♭)');
      console.log('   2 = Re (D)');
      console.log('   3 = Eb (D♯/E♭)');
      console.log('   4 = Mi (E)');
      console.log('   5 = Fa (F)');
      console.log('   6 = Fs (F♯/G♭)');
      console.log('   7 = Sol (G)');
      console.log('   8 = Gb (G♯/A♭)');
      console.log('   ... etc');
      console.log('');
    }

    // Verify correct pitch code
    expect(pitchCode).toBe(8);
  });
});
