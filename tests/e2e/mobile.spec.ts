import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { cardTitles, createUser, list, loginContext, seedBoard, uniq } from './util.js';

test('phone layout: one list at a time, no page-level horizontal scroll, full-screen card, 44px targets', async ({ page, context }) => {
  const user = await createUser(uniq('phone'));
  const api = await loginContext(context, user.email);
  const { board, lists } = await seedBoard(api, 'Phone board');
  const card = (await api.call('POST', `/lists/${lists[0].id}/cards`, { name: 'Tap me' })).card;
  await page.goto(`/b/${board.shortId}`);
  await expect(list(page, 'To do')).toBeVisible();
  const vw = page.viewportSize()!.width;
  const listBox = (await list(page, 'To do').boundingBox())!;
  expect(listBox.width / vw).toBeGreaterThan(0.8);
  expect(listBox.width / vw).toBeLessThan(0.9);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByText('Tap me').tap();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const box = (await dialog.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(vw - 1);
  for (const name of ['Members', 'Labels', 'Checklist', 'Dates', 'Close card']) {
    const b = (await dialog.getByRole('button', { name, exact: true }).boundingBox())!;
    expect(b.height, name).toBeGreaterThanOrEqual(44);
  }
  expect(card.number).toBe(1);
});

// Synthesize real touch sequences through the browser's input pipeline. This is emulation, not a physical
// phone: long-press auto-scroll across lists still needs the owner's real-device check (research PHONE-CHECKLIST).
async function touchDrag(page: Page, context: BrowserContext, from: { x: number; y: number }, to: { x: number; y: number }) {
  const cdp = await context.newCDPSession(page);
  const touch = (type: string, x: number, y: number) => cdp.send('Input.dispatchTouchEvent', { type: type as any, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await touch('touchStart', from.x, from.y);
  await page.waitForTimeout(450); // long-press threshold is 300 ms
  for (let i = 1; i <= 10; i++) await touch('touchMove', from.x + ((to.x - from.x) * i) / 10, from.y + ((to.y - from.y) * i) / 10);
  await expect(page.locator('.card-tile.overlay')).toBeVisible();
  await page.waitForTimeout(250);
  await touch('touchEnd', to.x, to.y);
}
const center = async (l: Locator, dy = 0) => {
  const b = (await l.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 + dy };
};

test('touch: long-press then drag reorders cards on a phone', async ({ page, context }) => {
  const user = await createUser(uniq('touch'));
  const api = await loginContext(context, user.email);
  const { board, lists } = await seedBoard(api, 'Touch board');
  for (const n of ['first', 'second', 'third']) await api.call('POST', `/lists/${lists[0].id}/cards`, { name: n });
  await page.goto(`/b/${board.shortId}`);
  const todo = list(page, 'To do');
  await expect(todo.getByText('third')).toBeVisible();
  await touchDrag(page, context, await center(todo.getByText('third')), await center(todo.getByText('first'), -12));
  await expect.poll(() => cardTitles(page, 'To do')).toEqual(['third', 'first', 'second']);
  await page.reload();
  await expect.poll(() => cardTitles(page, 'To do')).toEqual(['third', 'first', 'second']);
});

test('phone: the Move dialog moves a card to another list without dragging', async ({ page, context }) => {
  const user = await createUser(uniq('tapmove'));
  const api = await loginContext(context, user.email);
  const { board, lists } = await seedBoard(api, 'Tap board');
  await api.call('POST', `/lists/${lists[0].id}/cards`, { name: 'Move by tapping' });
  await page.goto(`/b/${board.shortId}`);
  await page.getByText('Move by tapping').tap();
  await page.getByRole('button', { name: /In list To do\. Move card/ }).tap();
  await page.getByLabel('Destination list').selectOption({ label: 'Done' });
  await page.getByRole('dialog', { name: 'Move card' }).getByRole('button', { name: 'Move', exact: true }).tap();
  await expect(page.getByText('#1 in list Done')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect.poll(() => cardTitles(page, 'Done')).toEqual(['Move by tapping']);
});

test.describe('tablet (touch, two lists visible)', () => {
  test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });
  test('touch: long-press drag moves a card across lists', async ({ page, context }) => {
    const user = await createUser(uniq('tablet'));
    const api = await loginContext(context, user.email);
    const { board, lists } = await seedBoard(api, 'Tablet board');
    await api.call('POST', `/lists/${lists[0].id}/cards`, { name: 'Cross list' });
    await page.goto(`/b/${board.shortId}`);
    await expect(list(page, 'To do').getByText('Cross list')).toBeVisible();
    await touchDrag(page, context, await center(list(page, 'To do').getByText('Cross list')), await center(list(page, 'Doing').locator('.list-cards')));
    await expect.poll(() => cardTitles(page, 'Doing')).toEqual(['Cross list']);
    await page.reload();
    await expect.poll(() => cardTitles(page, 'Doing')).toEqual(['Cross list']);
  });
});
