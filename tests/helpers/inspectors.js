import { expect } from '@playwright/test';

export async function openTab(page, testId) {
  const tab = page.getByTestId(testId);
  await expect(tab).toBeVisible();
  await tab.click();
}

export async function readPaneText(page, testId) {
  const pane = page.getByTestId(testId);
  await expect(pane).toBeVisible();
  await expect.poll(async () => (await pane.innerText()).trim()).not.toEqual('');
  return (await pane.innerText())
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}
