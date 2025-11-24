import { chromium } from 'playwright';
import { writeFile } from 'fs/promises';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Focus on inspector panel tabs
  const screenshot = await page.screenshot({
    fullPage: false,
    clip: { x: 800, y: 0, width: 600, height: 300 }
  });
  await writeFile('/home/john/editor/tab-icons-check.png', screenshot);

  await browser.close();
  console.log('Screenshot saved to tab-icons-check.png');
})();
