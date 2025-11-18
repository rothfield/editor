import { test, expect } from '@playwright/test';

test('Document saves and loads correctly', async ({ page }) => {
  const logs = [];
  const errors = [];

  page.on('console', msg => {
    const text = msg.text();
    logs.push(text);
    if (text.includes('ERROR') || text.includes('error') || msg.type() === 'error') {
      errors.push(text);
      console.log('❌ ERROR:', text);
    }
    if (text.includes('autosave') || text.includes('restore') || text.includes('Document')) {
      console.log('[LOG]', text);
    }
  });

  // Load page
  await page.goto('http://localhost:8080');
  await page.waitForSelector('#editor', { state: 'visible', timeout: 10000 });

  console.log('\n=== STEP 1: Type content ===');
  const editor = page.locator('#editor');
  await editor.click();
  await page.keyboard.type('1 2 3 4 | 5 6 7');
  await page.waitForTimeout(1000);

  // Wait for autosave
  console.log('\n=== STEP 2: Wait for autosave ===');
  await page.waitForTimeout(6000); // Autosave happens every 5 seconds

  // Check localStorage
  const savedDoc = await page.evaluate(() => {
    return localStorage.getItem('music-editor-autosave-current');
  });

  console.log('\n=== Saved document ===');
  console.log(savedDoc ? 'Document saved to localStorage' : 'NO document in localStorage');
  if (savedDoc) {
    const doc = JSON.parse(savedDoc);
    console.log('Lines:', doc.lines?.length || 0);
    if (doc.lines && doc.lines.length > 0) {
      console.log('First line:', doc.lines[0]);
    }
  }

  // Reload page
  console.log('\n=== STEP 3: Reload page ===');
  await page.reload();
  await page.waitForSelector('#editor', { state: 'visible', timeout: 10000 });
  await page.waitForTimeout(2000);

  // Check if content was restored
  const editorText = await page.evaluate(() => {
    const editorEl = document.getElementById('editor');
    return editorEl ? editorEl.textContent : '';
  });

  console.log('\n=== After reload ===');
  console.log('Editor text:', editorText);
  console.log('Contains "1 2 3 4"?', editorText.includes('1'));

  // Check restore logs
  const restoreLogs = logs.filter(log =>
    log.includes('restore') || log.includes('Restore') || log.includes('autosave')
  );

  console.log('\n=== Restore logs ===');
  restoreLogs.forEach(log => console.log(log));

  console.log('\n=== Errors ===');
  console.log('Total errors:', errors.length);
  if (errors.length > 0) {
    errors.forEach(e => console.log('  -', e));
  }

  // Assertions
  expect(savedDoc).toBeTruthy();
  expect(errors).toHaveLength(0);
});
