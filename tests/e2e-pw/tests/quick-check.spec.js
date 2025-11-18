import { test } from '@playwright/test';

test('Check page load errors', async ({ page }) => {
  const errors = [];
  const logs = [];

  page.on('pageerror', error => {
    errors.push(error.message);
    console.log('❌ PAGE ERROR:', error.message);
  });

  page.on('console', msg => {
    const text = msg.text();
    logs.push(text);
    if (msg.type() === 'error') {
      console.log('❌ CONSOLE ERROR:', text);
    } else {
      console.log(`[${msg.type()}]`, text);
    }
  });

  await page.goto('http://localhost:8080');

  // Wait 5 seconds to see what happens
  await page.waitForTimeout(5000);

  console.log('\n=== SUMMARY ===');
  console.log('Page errors:', errors.length);
  console.log('Console logs:', logs.length);

  if (errors.length > 0) {
    console.log('\nErrors found:');
    errors.forEach(e => console.log('  -', e));
  }
});
