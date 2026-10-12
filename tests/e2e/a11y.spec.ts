import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createUser, loginContext, seedBoard, uniq } from './util.js';

async function seriousViolations(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  return r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')})`);
}

test('axe: no serious or critical violations on key screens', async ({ page, context }) => {
  const user = await createUser(uniq('axe'));
  const api = await loginContext(context, user.email);
  const { board, lists, workspaceId } = await seedBoard(api, 'Axe board');
  const labels = (await api.call('GET', `/boards/${board.id}`)).labels;
  const card = (await api.call('POST', `/lists/${lists[0].id}/cards`, { name: 'Accessible card' })).card;
  await api.call('PUT', `/cards/${card.id}/labels/${labels[1].id}`);
  await api.call('PATCH', `/cards/${card.id}`, { description: '**Bold** text', dueAt: new Date(Date.now() + 3600e3).toISOString() });
  await api.call('POST', `/cards/${card.id}/comments`, { body: 'A comment' });
  const pages: [string, string][] = [
    ['home', '/'],
    ['board', `/b/${board.shortId}`],
    ['card', `/b/${board.shortId}/c/${card.number}`],
    ['search', '/search?q=accessible'],
    ['account', '/account'],
    ['workspace', `/w/${workspaceId}?tab=members`],
  ];
  const report: Record<string, string[]> = {};
  for (const [name, url] of pages) {
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(300);
    report[name] = await seriousViolations(page);
  }
  // Open layers: label popover with the colour palette, the card actions menu, the quick editor, notifications.
  await page.goto(`/b/${board.shortId}/c/${card.number}`);
  await page.getByRole('toolbar', { name: 'Add to card' }).getByRole('button', { name: 'Labels' }).click();
  await page.getByRole('button', { name: 'Create a new label' }).click();
  report.labelPopover = await seriousViolations(page);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Card actions' }).click();
  report.cardActions = await seriousViolations(page);
  await page.goto(`/b/${board.shortId}`);
  await page.locator('[data-card-id]').first().focus();
  await page.keyboard.press('e');
  await page.getByRole('dialog', { name: /Quick edit/ }).waitFor();
  report.quickEdit = await seriousViolations(page);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Notifications/ }).click();
  await page.waitForTimeout(300);
  report.notifications = await seriousViolations(page);
  await page.context().clearCookies();
  await page.goto('/login');
  report.login = await seriousViolations(page);
  expect(report).toEqual({ home: [], board: [], card: [], search: [], account: [], workspace: [], labelPopover: [], cardActions: [], quickEdit: [], notifications: [], login: [] });
});
