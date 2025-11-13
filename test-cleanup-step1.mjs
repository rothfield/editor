import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  console.log('Testing after Step 1: Removed deprecated Rust attributes...');
  await page.goto('http://localhost:8080');
  await page.waitForLoadState('networkidle');
  await page.reload({ waitUntil: 'networkidle' }); // Clear cache

  // Type accidentals
  const editor = page.locator('[data-testid="editor-root"]');
  await editor.click();
  await page.keyboard.type('1# 2b 3## 4bb');
  await page.waitForTimeout(500);

  // Check rendered HTML
  const cells = await page.locator('.char-cell.kind-pitched').all();

  console.log('\nChecking rendered cells:');
  for (let i = 0; i < Math.min(cells.length, 4); i++) {
    const cell = cells[i];
    const text = await cell.textContent();
    const codepoint = text.charCodeAt(0);
    const hasAccidental = await cell.evaluate(el => el.classList.contains('has-accidental'));
    const dataAccType = await cell.getAttribute('data-accidental-type');
    const dataGlyph = await cell.getAttribute('data-composite-glyph');

    console.log(`\nCell ${i+1}:`);
    console.log(`  Text: "${text}"`);
    console.log(`  Codepoint: U+${codepoint.toString(16).toUpperCase().padStart(4, '0')}`);
    console.log(`  has-accidental class: ${hasAccidental} (should be FALSE)`);
    console.log(`  data-accidental-type: ${dataAccType} (should be null)`);
    console.log(`  data-composite-glyph: ${dataGlyph} (should be null)`);
  }

  // Take screenshot
  await page.screenshot({
    path: '/home/john/editor/artifacts/cleanup-step1.png',
    fullPage: false
  });

  console.log('\n✓ Screenshot saved to artifacts/cleanup-step1.png');
  console.log('\n✅ Step 1 verification complete!');

  await browser.close();
})();
