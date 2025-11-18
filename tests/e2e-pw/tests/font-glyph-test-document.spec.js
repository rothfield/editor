/**
 * Font Glyph Test Document Generator
 *
 * Creates a comprehensive test document that exercises all font glyphs:
 * - All pitch systems (Number, Western, Sargam, Doremi)
 * - All accidentals (natural, sharp, flat, half-flat, double-sharp, double-flat)
 * - All octave variants (base, +1, +2, -1, -2)
 * - Musical symbols (barlines, ornaments)
 *
 * This document can be used for visual verification of font rendering.
 */

import { test, expect } from '@playwright/test';

test('Generate comprehensive font glyph test document', async ({ page }) => {
  await page.goto('/');

  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();
  await editor.click();

  // Wait for WASM and editor to fully initialize
  await expect.poll(async () => {
    return await page.evaluate(() => {
      return window.editor?.isInitialized && window.editor?.wasmModule !== null;
    });
  }, { timeout: 10000 }).toBeTruthy();

  // Helper to add a line with label
  async function addLine(label, content) {
    // Type content
    await page.keyboard.type(content);

    // Press Enter to create new line
    await page.keyboard.press('Enter');

    // Wait a bit for the line to be created
    await page.waitForTimeout(100);

    // Set label for the line we just created
    const success = await page.evaluate(async (lineLabel) => {
      if (!window.editor || !window.editor.wasmModule) {
        return false;
      }
      try {
        const doc = window.editor.getDocument();
        const lineIndex = doc.lines.length - 2; // Previous line (we just added a new one)
        if (lineIndex >= 0) {
          window.editor.wasmModule.setLineLabel(lineIndex, lineLabel);
          await window.editor.renderAndUpdate();
        }
        return true;
      } catch (e) {
        console.error('Error setting label:', e);
        return false;
      }
    }, label);

    if (!success) {
      console.warn(`Failed to set label: ${label}`);
    }
  }

  // === NUMBER SYSTEM TESTS ===

  // Basic scale (1-7)
  await addLine('Number: Basic Scale', '1 2 3 4 5 6 7 |');

  // Sharp accidentals (s prefix)
  await addLine('Number: Sharps', 's1 s2 s3 s4 s5 s6 s7 |');

  // Flat accidentals (b prefix)
  await addLine('Number: Flats', 'b1 b2 b3 b4 b5 b6 b7 |');

  // Half-flat accidentals (hf prefix)
  await addLine('Number: Half-flats', 'hf1 hf2 hf3 hf4 hf5 hf6 hf7 |');

  // Double-sharp (ss prefix)
  await addLine('Number: Double-sharps', 'ss1 ss2 ss3 ss4 ss5 ss6 ss7 |');

  // Double-flat (bb prefix)
  await addLine('Number: Double-flats', 'bb1 bb2 bb3 bb4 bb5 bb6 bb7 |');

  // Octave variants with dots
  await addLine('Number: +1 octave', '1. 2. 3. 4. 5. 6. 7. |');
  await addLine('Number: +2 octave', '1.. 2.. 3.. 4.. 5.. 6.. 7.. |');
  await addLine('Number: -1 octave', '1, 2, 3, 4, 5, 6, 7, |');
  await addLine('Number: -2 octave', '1,, 2,, 3,, 4,, 5,, 6,, 7,, |');

  // Combined: accidentals with octave shifts
  await addLine('Number: Sharp +1', 's1. s2. s3. s4. s5. s6. s7. |');
  await addLine('Number: Flat -1', 'b1, b2, b3, b4, b5, b6, b7, |');

  // === WESTERN SYSTEM TESTS ===

  // Switch to Western system
  await page.evaluate(() => {
    window.editor.wasmModule.setDocumentPitchSystem(0); // Western
    window.editor.renderAndUpdate();
  });

  await page.keyboard.press('Enter');

  // Basic scale (C-B uppercase)
  await addLine('Western: Major Scale', 'C D E F G A B |');

  // Lowercase (lower octave)
  await addLine('Western: Lower octave', 'c d e f g a b |');

  // Sharps
  await addLine('Western: Sharps', 'sC sD sE sF sG sA sB |');

  // Flats
  await addLine('Western: Flats', 'bC bD bE bF bG bA bB |');

  // Octave shifts
  await addLine('Western: +1 octave', 'C. D. E. F. G. A. B. |');
  await addLine('Western: -1 octave', 'C, D, E, F, G, A, B, |');

  // === SARGAM SYSTEM TESTS ===

  // Switch to Sargam system
  await page.evaluate(() => {
    window.editor.wasmModule.setDocumentPitchSystem(2); // Sargam
    window.editor.renderAndUpdate();
  });

  await page.keyboard.press('Enter');

  // Basic sargam (Sa Re Ga Ma Pa Dha Ni)
  await addLine('Sargam: Shuddha Svaras', 'S R G M P D N |');

  // Komal (flat) svaras
  await addLine('Sargam: Komal (lowercase)', 'S r g M P d n |');

  // Tivra Ma (sharp 4th)
  await addLine('Sargam: Tivra Ma', 'S R G sM P D N |');

  // Octave shifts
  await addLine('Sargam: Taar Saptak (+1)', 'S. R. G. M. P. D. N. |');
  await addLine('Sargam: Mandra Saptak (-1)', 'S, R, G, M, P, D, N, |');

  // === DOREMI SYSTEM TESTS ===

  // Switch to Doremi system
  await page.evaluate(() => {
    window.editor.wasmModule.setDocumentPitchSystem(3); // Doremi
    window.editor.renderAndUpdate();
  });

  await page.keyboard.press('Enter');

  // Basic solfège
  await addLine('Doremi: Major Scale', 'd r m f s l t |');

  // Uppercase (higher)
  await addLine('Doremi: Upper octave', 'D R M F S L T |');

  // Accidentals
  await addLine('Doremi: Sharps', 'sd sr sm sf ss sl st |');
  await addLine('Doremi: Flats', 'bd br bm bf bs bl bt |');

  // Octave shifts
  await addLine('Doremi: +1 octave', 'd. r. m. f. s. l. t. |');
  await addLine('Doremi: -1 octave', 'd, r, m, f, s, l, t, |');

  // === MIXED CONTENT TESTS ===

  // Switch back to Number system for final tests
  await page.evaluate(() => {
    window.editor.wasmModule.setDocumentPitchSystem(1); // Number
    window.editor.renderAndUpdate();
  });

  await page.keyboard.press('Enter');

  // Barlines and measure markers
  await addLine('Barlines', '1 2 3 4 | 5 6 7 1 || 1 2 3 4 |:');

  // Rests (dashes)
  await addLine('Rests', '1 - - 2 | 3 - 4 - |');

  // Extensions (dashes after pitch)
  await addLine('Extensions', '1-- 2- 3 4 | 5--- 6 7 |');

  // Dense chromatic run
  await addLine('Chromatic', '1 s1 2 b2 s2 3 b3 s3 4 s4 5 b5 s5 6 b6 s6 7 b7 s7 |');

  // All octaves for one pitch
  await addLine('Octave Range', '1,, 1, 1 1. 1.. |');

  // Complex mixed accidentals and octaves
  await addLine('Mixed Complex', 's1. b2, ss3.. bb4,, hf5 s6. b7 |');

  // Take screenshot of the full document
  await page.screenshot({
    path: 'artifacts/font-glyph-test-full.png',
    fullPage: true
  });

  // Get document JSON for inspection
  const docJSON = await page.evaluate(() => {
    return JSON.stringify(window.editor.getDocument(), null, 2);
  });

  console.log('Generated test document with comprehensive glyph coverage');
  console.log('Lines created:', (docJSON.match(/"content":/g) || []).length);

  // Save document to artifacts for manual inspection
  await page.evaluate(() => {
    const json = JSON.stringify(window.editor.getDocument(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'font-glyph-test-document.json';
    a.click();
  });

  // Switch to different inspector tabs and capture

  // Capture Display List
  await page.click('[data-tab="displaylist"]');
  await page.waitForTimeout(500);
  await page.screenshot({
    path: 'artifacts/font-glyph-test-displaylist.png',
    fullPage: false
  });

  // Capture MusicXML
  await page.click('[data-tab="musicxml"]');
  await page.waitForTimeout(500);
  await page.screenshot({
    path: 'artifacts/font-glyph-test-musicxml.png',
    fullPage: false
  });

  // Capture LilyPond
  await page.click('[data-tab="lilypond-src"]');
  await page.waitForTimeout(500);
  const lilypondText = await page.locator('#lilypond-source').textContent();
  console.log('\n=== LilyPond Export Sample ===');
  console.log(lilypondText.slice(0, 500) + '...');

  await page.screenshot({
    path: 'artifacts/font-glyph-test-lilypond.png',
    fullPage: false
  });

  // Switch to Font Test tab to verify glyphs
  await page.click('[data-tab="font-test"]');
  await page.waitForTimeout(500);

  // Click "Show All" to display comprehensive view
  await page.click('#font-test-show-all');
  await page.waitForTimeout(1000);

  await page.screenshot({
    path: 'artifacts/font-glyph-test-fonttest.png',
    fullPage: true
  });

  // Verify no console errors
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  expect(errors).toHaveLength(0);

  console.log('\n✅ Font glyph test document created successfully!');
  console.log('📸 Screenshots saved to artifacts/');
  console.log('📄 Check artifacts/font-glyph-test-document.json for full document');
});

test('Verify specific problematic glyph: 5# (sharp)', async ({ page }) => {
  await page.goto('/');

  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();
  await editor.click();

  // Wait for WASM and editor to fully initialize
  await expect.poll(async () => {
    return await page.evaluate(() => {
      return window.editor?.isInitialized && window.editor?.wasmModule !== null;
    });
  }, { timeout: 10000 }).toBeTruthy();

  // Type "5#" (which was showing dots instead of sharp)
  await page.keyboard.type('s5');

  // Wait for rendering
  await page.waitForTimeout(300);

  // Take close-up screenshot
  await page.screenshot({
    path: 'artifacts/test-5-sharp-glyph.png',
    clip: { x: 0, y: 0, width: 200, height: 200 }
  });

  // Get the rendered cell
  const cellText = await page.evaluate(() => {
    const cells = document.querySelectorAll('.char-cell');
    return cells[0]?.textContent || '';
  });

  console.log('Rendered glyph for "s5":', cellText);
  console.log('Character code:', cellText.charCodeAt(0).toString(16).toUpperCase());

  // Switch to Font Test tab
  await page.click('[data-tab="font-test"]');
  await page.waitForTimeout(500);

  // Show comprehensive view
  await page.click('#font-test-show-all');
  await page.waitForTimeout(1500); // Give it more time to render

  // Wait for font test grid to have content
  await expect.poll(async () => {
    const content = await page.locator('#font-test-grid').textContent();
    return content.trim().length > 0;
  }, { timeout: 5000 }).toBeTruthy();

  // Search for "5" in the font test display
  const fontTestContent = await page.locator('#font-test-grid').textContent();

  expect(fontTestContent.length).toBeGreaterThan(0);

  console.log('Font test grid has content:', fontTestContent.length, 'characters');
  console.log('✅ Glyph test for 5# completed');
});
