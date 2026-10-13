import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { addToWorkspaceAndBoard, createUser, loginContext, seedBoard, uniq } from './util.js';

const tile = (page: Page, name: string) => page.locator('[data-card-id]').filter({ hasText: name });

async function seriousViolations(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')})`);
}

test('unread marker: a teammate’s comment marks a watched card for me only; opening the card clears it, also after a reload', async ({ browser }) => {
  const [ua, ub] = [await createUser(uniq('ura')), await createUser(uniq('urb'))];
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const apiA = await loginContext(ctxA, ua.email);
  const apiB = await loginContext(ctxB, ub.email);
  const { board, lists, workspaceId } = await seedBoard(apiA, 'Unread board');
  await addToWorkspaceAndBoard(apiA, workspaceId, board.id, apiB, ub.id);
  const card = (await apiA.call('POST', `/lists/${lists[0].id}/cards`, { name: 'Watched by A' })).card; // creators watch their cards
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await a.goto(`/b/${board.shortId}`);
  await b.goto(`/b/${board.shortId}`);
  await expect(tile(a, 'Watched by A').locator('.badge-unread')).toHaveCount(0);

  await apiB.call('POST', `/cards/${card.id}/comments`, { body: 'Please review' });
  await expect(tile(a, 'Watched by A').locator('.badge-unread')).toBeVisible(); // live, no reload
  await expect(tile(a, 'Watched by A')).toHaveAttribute('aria-label', /unread notifications/);
  await b.waitForTimeout(500);
  await expect(tile(b, 'Watched by A').locator('.badge-unread')).toHaveCount(0); // never for the author
  await a.reload();
  await expect(tile(a, 'Watched by A').locator('.badge-unread')).toBeVisible(); // persisted

  await tile(a, 'Watched by A').click();
  await expect(a.getByRole('heading', { name: 'Watched by A' })).toBeVisible();
  await a.getByRole('button', { name: 'Close card' }).click();
  await expect(tile(a, 'Watched by A').locator('.badge-unread')).toHaveCount(0);
  await a.reload();
  await expect(tile(a, 'Watched by A')).toBeVisible();
  await expect(tile(a, 'Watched by A').locator('.badge-unread')).toHaveCount(0);
  await ctxA.close();
  await ctxB.close();
});

test('table view: sortable rows, inline title and due edits that a teammate sees live; viewers get read-only cells', async ({ browser }) => {
  const [ua, ub] = [await createUser(uniq('tva')), await createUser(uniq('tvb'))];
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const apiA = await loginContext(ctxA, ua.email);
  const apiB = await loginContext(ctxB, ub.email);
  const { board, lists, workspaceId } = await seedBoard(apiA, 'Table board');
  await addToWorkspaceAndBoard(apiA, workspaceId, board.id, apiB, ub.id);
  for (const n of ['Charlie', 'Alpha', 'Bravo']) await apiA.call('POST', `/lists/${lists[0].id}/cards`, { name: n });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await a.goto(`/b/${board.shortId}?view=table`);
  await b.goto(`/b/${board.shortId}`);
  const titles = () => a.locator('.cards-table tbody .cell-title input').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  await expect.poll(titles).toEqual(['Charlie', 'Alpha', 'Bravo']); // list order
  await a.getByRole('button', { name: 'Card', exact: true }).click();
  await expect.poll(titles).toEqual(['Alpha', 'Bravo', 'Charlie']);
  await expect(a.locator('th[aria-sort="ascending"]')).toHaveText(/Card/);

  await a.getByLabel('Title of Alpha').fill('Alpha (renamed)');
  await a.keyboard.press('Enter');
  await expect(tile(b, 'Alpha (renamed)')).toBeVisible();
  await a.getByLabel('Due date of Bravo').fill('2031-05-04T09:30');
  await a.getByLabel('Due date of Bravo').blur();
  await expect(tile(b, 'Bravo').locator('.badge.i-clock')).toBeVisible();
  await a.getByLabel('List of Charlie').selectOption({ label: 'Done' });
  await expect.poll(async () => (await apiB.call('GET', `/boards/${board.id}`)).cards.find((c: any) => c.name === 'Charlie').listId).toBe(lists[2].id);

  // The teammate's change shows in the table without a reload.
  const charlie = (await apiB.call('GET', `/boards/${board.id}`)).cards.find((c: any) => c.name === 'Charlie');
  await apiB.call('PATCH', `/cards/${charlie.id}`, { name: 'Charlie (by B)' });
  await expect.poll(titles).toContain('Charlie (by B)');

  // Switching back to the board view shows the lists again.
  await a.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Board' }).click();
  await expect(tile(a, 'Alpha (renamed)')).toBeVisible();
  await a.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Table' }).click();
  await expect(a.locator('.cards-table')).toBeVisible();
  expect(await seriousViolations(a)).toEqual([]);

  // A workspace member who is not on the board views it read-only: text, no inputs.
  const viewer = await createUser(uniq('tvv'));
  const ctxV = await browser.newContext();
  const apiV = await loginContext(ctxV, viewer.email);
  const inv = await apiA.call('POST', `/workspaces/${workspaceId}/invites`, { kind: 'link' });
  await apiV.call('POST', `/invites/${inv.invite.url.split('/invite/')[1]}/accept`);
  const v = await ctxV.newPage();
  await v.goto(`/b/${board.shortId}?view=table`);
  await expect(v.locator('.cards-table')).toContainText('Alpha (renamed)');
  await expect(v.locator('.cards-table input, .cards-table select')).toHaveCount(0);
  await ctxA.close();
  await ctxB.close();
  await ctxV.close();
});

test('calendar view: cards by due date, keyboard and drag rescheduling keep the time, undated cards listed separately', async ({ page, context }) => {
  const user = await createUser(uniq('cal'));
  const api = await loginContext(context, user.email);
  const { board, lists } = await seedBoard(api, 'Calendar board');
  const now = new Date();
  const at = (day: number) => new Date(now.getFullYear(), now.getMonth(), day, 14, 30).getTime();
  const c = (await api.call('POST', `/lists/${lists[0].id}/cards`, { name: 'Release notes' })).card;
  await api.call('PATCH', `/cards/${c.id}`, { dueAt: new Date(at(15)).toISOString() });
  await api.call('POST', `/lists/${lists[0].id}/cards`, { name: 'Someday idea' });
  await page.goto(`/b/${board.shortId}?view=calendar`);
  const chip = page.locator('[data-cal-card]').filter({ hasText: 'Release notes' });
  await expect(chip).toBeVisible();
  await expect(page.getByRole('region', { name: 'Cards without a due date' })).toContainText('Someday idea');
  expect(await seriousViolations(page)).toEqual([]);

  // Alt+Right moves it one day; the time of day is kept and the change is saved.
  await chip.focus();
  await page.keyboard.press('Alt+ArrowRight');
  await expect.poll(async () => new Date((await api.call('GET', `/cards/${c.id}`)).card.dueAt).getTime()).toBe(at(16));
  await expect(page.locator('#board-announcer')).toContainText('Release notes');
  await expect(chip).toBeFocused();

  // Drag it to the 20th.
  const label20 = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(at(20)));
  const day20 = page.locator(`[role="gridcell"][aria-label^="${label20},"]`);
  await chip.dragTo(day20);
  await expect.poll(async () => new Date((await api.call('GET', `/cards/${c.id}`)).card.dueAt).getTime()).toBe(at(20));
  await expect(day20.locator('[data-cal-card]')).toHaveText(/Release notes/);

  // Week mode and navigation.
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await page.getByRole('button', { name: 'Next week' }).click();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.locator('.calendar-grid.week')).toBeVisible();
});

test('automation from the board menu: an admin adds a rule and a member’s move triggers it live', async ({ browser }) => {
  const [ua, ub] = [await createUser(uniq('ama')), await createUser(uniq('amb'))];
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const apiA = await loginContext(ctxA, ua.email);
  const apiB = await loginContext(ctxB, ub.email);
  const { board, lists, workspaceId } = await seedBoard(apiA, 'Rules board');
  await addToWorkspaceAndBoard(apiA, workspaceId, board.id, apiB, ub.id);
  const card = (await apiB.call('POST', `/lists/${lists[1].id}/cards`, { name: 'Finish me' })).card;
  const a = await ctxA.newPage();
  await a.goto(`/b/${board.shortId}`);
  await a.getByRole('button', { name: 'Board menu' }).click();
  await a.getByRole('button', { name: 'Automation' }).click();
  await expect(a.getByText('No rules yet.')).toBeVisible();
  await a.getByRole('button', { name: 'Add a rule' }).click();
  await a.getByLabel('Rule name').fill('Done means complete');
  await a.getByLabel('Trigger', { exact: true }).selectOption('card_moved');
  await a.getByLabel('Trigger list').selectOption({ label: 'Done' });
  await a.getByLabel('Action 1', { exact: true }).selectOption('set_complete');
  await a.getByRole('button', { name: 'Save rule' }).click();
  await expect(a.getByRole('list', { name: 'Rules' })).toContainText('When a card is moved into “Done”: mark it complete.');
  expect(await seriousViolations(a)).toEqual([]);
  await a.getByRole('button', { name: 'Close' }).click();

  await apiB.call('POST', `/cards/${card.id}/move`, { listId: lists[2].id });
  await expect(tile(a, 'Finish me')).toHaveClass(/is-complete/);

  // Members can read rules but not change them, and do not see webhooks.
  const b = await ctxB.newPage();
  await b.goto(`/b/${board.shortId}`);
  await b.getByRole('button', { name: 'Board menu' }).click();
  await expect(b.getByRole('button', { name: 'Webhooks' })).toHaveCount(0);
  await b.getByRole('button', { name: 'Automation' }).click();
  await expect(b.getByRole('list', { name: 'Rules' })).toContainText('Done means complete');
  await expect(b.getByRole('button', { name: 'Add a rule' })).toHaveCount(0);
  await ctxA.close();
  await ctxB.close();
});
