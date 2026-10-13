import { expect, test, type Page } from '@playwright/test';
import { addToWorkspaceAndBoard, cardTitles, createUser, list, loginContext, seedBoard, uniq } from './util.js';

const tile = (page: Page, name: string) => page.locator('[data-card-id]').filter({ hasText: name });

test('label popover from the keyboard: create a bold label, apply it, Esc returns focus to the card', async ({ page, context }) => {
  const user = await createUser(uniq('labels'));
  const api = await loginContext(context, user.email);
  const { board, lists } = await seedBoard(api, 'Label board');
  await api.call('POST', `/lists/${lists[0].id}/cards`, { name: 'Tag me' });
  await page.goto(`/b/${board.shortId}`);
  await tile(page, 'Tag me').focus();
  await page.keyboard.press('l');
  const pop = page.getByRole('dialog', { name: 'Labels' });
  await expect(pop.getByLabel('Search labels')).toBeFocused();
  await pop.getByRole('button', { name: 'Create a new label' }).click();
  const create = page.getByRole('dialog', { name: 'Create label' });
  await create.getByLabel('Title').fill('Urgent');
  await create.getByRole('radio', { name: 'bold red' }).click();
  await create.getByRole('button', { name: 'Create' }).click();
  // Back on the list step with the new label applied.
  await expect(pop.getByRole('checkbox').last()).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(page.locator('.popover')).toHaveCount(0);
  await expect(tile(page, 'Tag me')).toBeFocused();
  await expect(tile(page, 'Tag me').locator('.card-label.label-red_bold')).toHaveCount(1);
  // `;` shows label names on every card.
  await page.locator('.board-header').click({ position: { x: 600, y: 5 } });
  await page.keyboard.press(';');
  await expect(tile(page, 'Tag me').locator('.card-label')).toHaveText('Urgent');
  const persisted = (await api.call('GET', `/boards/${board.id}`)).cards[0];
  expect(persisted.labelIds).toHaveLength(1);
});

test('quick edit renames in place and a teammate sees it live; archive with c, restore with z', async ({ browser }) => {
  const [ua, ub] = [await createUser(uniq('qa')), await createUser(uniq('qb'))];
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const apiA = await loginContext(ctxA, ua.email);
  const apiB = await loginContext(ctxB, ub.email);
  const { board, lists, workspaceId } = await seedBoard(apiA, 'Quick board');
  await addToWorkspaceAndBoard(apiA, workspaceId, board.id, apiB, ub.id);
  await apiA.call('POST', `/lists/${lists[0].id}/cards`, { name: 'Old name' });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await a.goto(`/b/${board.shortId}`);
  await b.goto(`/b/${board.shortId}`);
  await tile(a, 'Old name').hover();
  await a.keyboard.press('e');
  const quick = a.getByRole('dialog', { name: /Quick edit/ });
  await quick.getByLabel('Card title').fill('New name');
  await a.keyboard.press('Enter');
  await expect(quick).toHaveCount(0);
  await expect(tile(b, 'New name')).toBeVisible();
  await tile(a, 'New name').focus();
  await a.keyboard.press('c');
  await expect(tile(b, 'New name')).toHaveCount(0);
  await a.locator('.board-header').click({ position: { x: 600, y: 5 } });
  await a.keyboard.press('z');
  await expect(tile(b, 'New name')).toBeVisible();
  await ctxA.close();
  await ctxB.close();
});

test('card templates, checklist item to card, list sort, and collapsed lists that stay collapsed', async ({ page, context }) => {
  const user = await createUser(uniq('tmpl'));
  const api = await loginContext(context, user.email);
  const { board, lists } = await seedBoard(api, 'Template board');
  const t = (await api.call('POST', `/lists/${lists[0].id}/cards`, { name: 'Bug report' })).card;
  const cl = (await api.call('POST', `/cards/${t.id}/checklists`, { name: 'Triage' })).checklist;
  for (const n of ['Reproduce', 'Write a failing test']) await api.call('POST', `/checklists/${cl.id}/items`, { name: n });
  await page.goto(`/b/${board.shortId}/c/${t.number}`);

  // Item → card, below its card.
  await page.getByRole('button', { name: 'Actions for item Write a failing test' }).click();
  await page.getByRole('menuitem', { name: 'Convert to card' }).click();
  await expect(page.getByRole('checkbox', { name: 'Write a failing test' })).toHaveCount(0);
  // Make it a template.
  await page.getByRole('button', { name: 'Card actions' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Make template' }).click();
  await expect(page.locator('.detail-topbar').getByText('Template')).toBeVisible();
  await page.getByRole('button', { name: 'Close card' }).click();
  await expect.poll(() => cardTitles(page, 'To do')).toEqual(['Bug report', 'Write a failing test']);

  // New card from the template in "Doing" keeps the checklist.
  await list(page, 'Doing').getByRole('button', { name: 'Create a card from a template in Doing' }).click();
  const create = page.getByRole('dialog', { name: 'Create card from template' });
  await create.getByLabel('Title').fill('Login fails on Safari');
  await create.getByRole('button', { name: 'Create card' }).click();
  await expect(page.getByRole('checkbox', { name: 'Reproduce' })).toBeVisible();
  await page.getByRole('button', { name: 'Close card' }).click();
  await expect(tile(page, 'Login fails on Safari').locator('.badge-template')).toHaveCount(0);

  // Sort "To do" by name.
  await api.call('POST', `/lists/${lists[0].id}/cards`, { name: 'Alpha' });
  await expect.poll(() => cardTitles(page, 'To do')).toEqual(['Bug report', 'Write a failing test', 'Alpha']);
  await page.getByRole('button', { name: 'List actions for To do' }).click();
  await page.getByRole('menuitem', { name: 'Sort by…' }).click();
  await page.getByRole('menuitem', { name: /Card name/ }).click();
  await expect.poll(() => cardTitles(page, 'To do')).toEqual(['Alpha', 'Bug report', 'Write a failing test']);

  // Collapse "Done"; it stays collapsed after a reload.
  await page.getByRole('button', { name: 'Collapse list Done' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Expand list Done' })).toBeVisible();
  await page.getByRole('button', { name: 'Expand list Done' }).click();
  await expect(page.getByRole('button', { name: 'Collapse list Done' })).toBeVisible();
});

test('toggling a label in the card dialog shows at once and costs one write plus one refresh', async ({ page, context }) => {
  const user = await createUser(uniq('reqs'));
  const api = await loginContext(context, user.email);
  const { board, lists } = await seedBoard(api, 'Request board');
  const card = (await api.call('POST', `/lists/${lists[0].id}/cards`, { name: 'Count requests' })).card;
  await page.goto(`/b/${board.shortId}/c/${card.number}`);
  await expect(page.getByRole('heading', { name: 'Count requests' })).toBeVisible();
  await page.getByRole('toolbar', { name: 'Add to card' }).getByRole('button', { name: 'Labels' }).click();
  await page.waitForTimeout(300);
  const requests: string[] = [];
  page.on('request', (r) => r.url().includes('/api/v1/') && requests.push(`${r.method()} ${new URL(r.url()).pathname}`));
  await page.getByRole('dialog', { name: 'Labels' }).getByRole('checkbox').first().check();
  await expect(page.locator('.detail-meta .label-chip')).toHaveCount(1);
  await page.waitForTimeout(800);
  expect(requests.filter((r) => r.startsWith('PUT'))).toHaveLength(1);
  expect(requests.filter((r) => r.startsWith('GET')).length).toBeLessThanOrEqual(1);
});

test('a keyboard move never leaves the board frozen: leaving the card cancels it, and z works with a card focused', async ({ page, context }) => {
  const user = await createUser(uniq('kbstuck'));
  const api = await loginContext(context, user.email);
  const { board, lists } = await seedBoard(api, 'Stuck board');
  for (const n of ['first', 'second']) await api.call('POST', `/lists/${lists[0].id}/cards`, { name: n });
  await page.goto(`/b/${board.shortId}`);
  await tile(page, 'first').focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('Tab'); // focus leaves the picked-up card
  await expect(page.locator('#board-announcer')).toHaveText('Move cancelled.');
  // Live changes still show and other cards respond to keys.
  await api.call('POST', `/lists/${lists[1].id}/cards`, { name: 'arrived later' });
  await expect(tile(page, 'arrived later')).toBeVisible();
  await tile(page, 'second').focus();
  await page.keyboard.press('c');
  await expect(tile(page, 'second')).toHaveCount(0);
  await tile(page, 'first').focus(); // keyboard users usually have a card focused
  await page.keyboard.press('z');
  await expect(tile(page, 'second')).toBeVisible();
});
