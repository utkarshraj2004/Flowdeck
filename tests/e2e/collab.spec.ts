import { expect, test } from '@playwright/test';
import { createUserToken } from '../../server/src/lib/tokens.js';
import { addToWorkspaceAndBoard, cardTitles, createUser, db, dragTo, list, loginContext, loginUi, PASSWORD, seedBoard, uniq } from './util.js';

test('first admin sets up, invites a teammate, and both work on the same board live', async ({ browser }) => {
  // J01: one-time setup link (what `flowdeck admin create` prints).
  const email = `${uniq('owner')}@example.test`;
  const u = await db().query(`INSERT INTO users (email, username, full_name, initials, is_system_admin) VALUES ($1,$2,'x','?',true) RETURNING id`, [email, uniq('pending')]);
  const token = await createUserToken(db(), u.rows[0].id, 'setup');
  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  await a.goto(`/setup/${token}`);
  await a.getByLabel('Full name').fill('Olivia Owner');
  await a.getByLabel('Username').fill(uniq('olivia'));
  await a.getByLabel('Password (at least 12 characters)').fill(PASSWORD);
  await a.getByLabel('Confirm password').fill(PASSWORD);
  await a.getByRole('button', { name: 'Create account' }).click();
  await expect(a.getByRole('heading', { name: /Olivia Owner.s workspace/ })).toBeVisible();

  // Create a board in the UI.
  await a.getByRole('button', { name: 'Create new board' }).click();
  await a.getByLabel('Board title').fill('Team board');
  await a.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(a.getByRole('heading', { name: 'Team board' })).toBeVisible();
  const boardUrl = a.url();

  // Invite link from the workspace members page.
  await a.goto('/');
  await a.getByRole('link', { name: /Members & settings/ }).click();
  await a.getByRole('tab', { name: /Members/ }).click();
  await a.getByRole('button', { name: 'Create invite link' }).click();
  const inviteUrl = await a.getByTestId('invite-url').inputValue();
  expect(inviteUrl).toMatch(/\/invite\//);

  // Teammate signs up through the link in a separate browser profile.
  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await b.goto(inviteUrl.replace(/^https?:\/\/[^/]+/, ''));
  await b.getByLabel('Full name').fill('Ben Builder');
  await b.getByLabel('Username').fill(uniq('ben'));
  await b.getByLabel('Email').fill(`${uniq('ben')}@example.test`);
  await b.getByLabel('Password (at least 12 characters)').fill(PASSWORD);
  await b.getByRole('button', { name: 'Create account and join' }).click();
  await expect(b.getByRole('heading', { name: /Olivia Owner.s workspace/ })).toBeVisible();
  await b.getByRole('link', { name: /Team board/ }).click();
  await expect(b.getByText('You can view this board but not change it.')).toBeVisible();
  await b.getByRole('button', { name: 'Join board' }).click();
  await expect(list(b, 'To do').getByRole('button', { name: '+ Add a card' })).toBeVisible();

  // A adds a card; B sees it without reloading.
  await a.goto(boardUrl);
  await list(a, 'To do').getByRole('button', { name: '+ Add a card' }).click();
  await a.getByLabel('Card title').fill('Hello from Olivia');
  await a.keyboard.press('Enter');
  const t0 = Date.now();
  await expect(list(b, 'To do').getByText('Hello from Olivia')).toBeVisible();
  const latency = Date.now() - t0;
  test.info().annotations.push({ type: 'realtime latency (ms)', description: String(latency) });
  expect(latency).toBeLessThan(2000);

  // B drags it to "Doing"; A sees the move live.
  await dragTo(b, list(b, 'To do').getByText('Hello from Olivia'), list(b, 'Doing').locator('.list-cards'));
  await expect(list(a, 'Doing').getByText('Hello from Olivia')).toBeVisible();

  // Both reload: the state persisted.
  await a.reload();
  await b.reload();
  await expect.poll(() => cardTitles(a, 'Doing')).toEqual(['Hello from Olivia']);
  await expect.poll(() => cardTitles(b, 'Doing')).toEqual(['Hello from Olivia']);
  await ctxA.close();
  await ctxB.close();
});

test('mouse drag reorders cards within a list and lists across the board; order persists', async ({ page, context }) => {
  const user = await createUser(uniq('drag'));
  const api = await loginContext(context, user.email);
  const { board, lists } = await seedBoard(api, 'Drag board');
  for (const n of ['one', 'two', 'three']) await api.call('POST', `/lists/${lists[0].id}/cards`, { name: n });
  await page.goto(`/b/${board.shortId}`);
  await dragTo(page, list(page, 'To do').getByText('three'), list(page, 'To do').getByText('one'), -10);
  await expect.poll(() => cardTitles(page, 'To do')).toEqual(['three', 'one', 'two']);
  await dragTo(page, list(page, 'Done').locator('.list-header'), list(page, 'To do').locator('.list-header'));
  await expect.poll(async () => page.locator('.list-name').allInnerTexts()).toEqual(['Done', 'To do', 'Doing']);
  await page.reload();
  await expect.poll(() => cardTitles(page, 'To do')).toEqual(['three', 'one', 'two']);
  expect(await page.locator('.list-name').allInnerTexts()).toEqual(['Done', 'To do', 'Doing']);
});

test('keyboard-only: move a card with Space + arrows, open it with Enter, focus stays in the dialog and returns', async ({ page, context }) => {
  const user = await createUser(uniq('kbd'));
  const api = await loginContext(context, user.email);
  const { board, lists } = await seedBoard(api, 'Keyboard board');
  for (const n of ['alpha', 'beta', 'gamma']) await api.call('POST', `/lists/${lists[0].id}/cards`, { name: n });
  await page.goto(`/b/${board.shortId}`);
  const alpha = page.locator('[data-card-id]').filter({ hasText: 'alpha' });
  await alpha.focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#board-announcer')).toContainText('Picked up “alpha”');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#board-announcer')).toContainText('Doing, position 1 of 1');
  await page.keyboard.press('Enter');
  await expect(page.locator('#board-announcer')).toContainText('Dropped “alpha” in Doing');
  await expect.poll(() => cardTitles(page, 'Doing')).toEqual(['alpha']);
  // "." moves the focused card to the next list.
  await page.locator('[data-card-id]').filter({ hasText: 'beta' }).focus();
  await page.keyboard.press('.');
  await expect.poll(() => cardTitles(page, 'Doing')).toEqual(['alpha', 'beta']);
  await page.reload();
  await expect.poll(() => cardTitles(page, 'To do')).toEqual(['gamma']);
  expect(await cardTitles(page, 'Doing')).toEqual(['alpha', 'beta']);

  // Enter opens the card; Tab stays inside the dialog; Esc closes and returns focus to the card.
  const gamma = page.locator('[data-card-id]').filter({ hasText: 'gamma' });
  await gamma.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(gamma).toBeFocused();
});

test('concurrent description edits: live notice, presence, and an explicit choice on save', async ({ browser }) => {
  const ua = await createUser(uniq('cfa'), 'Ana');
  const ub = await createUser(uniq('cfb'), 'Bo');
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const apiA = await loginContext(ctxA, ua.email);
  const apiB = await loginContext(ctxB, ub.email);
  const { board, lists, workspaceId } = await seedBoard(apiA, 'Conflict board');
  await addToWorkspaceAndBoard(apiA, workspaceId, board.id, apiB, ub.id);
  const card = (await apiA.call('POST', `/lists/${lists[0].id}/cards`, { name: 'Spec' })).card;
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await a.goto(`/b/${board.shortId}/c/${card.number}`);
  await b.goto(`/b/${board.shortId}/c/${card.number}`);
  await b.getByRole('button', { name: 'Add a more detailed description…' }).click();
  await a.getByRole('button', { name: 'Add a more detailed description…' }).click();
  await expect(b.getByText('Ana is editing')).toBeVisible();
  await a.getByLabel('Description (Markdown)').fill('Ana’s version');
  await a.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(b.getByText(/Ana updated the description while you were editing/)).toBeVisible();
  await b.getByLabel('Description (Markdown)').fill('Bo’s version');
  await b.getByRole('button', { name: 'Save', exact: true }).click();
  const conflict = b.getByRole('dialog', { name: 'The description changed while you were editing' });
  await expect(conflict).toBeVisible();
  await expect(conflict.getByText('Ana’s version')).toBeVisible();
  await conflict.getByRole('button', { name: 'Keep mine (replace theirs)' }).click();
  await expect(b.locator('.markdown').getByText('Bo’s version')).toBeVisible();
  await expect(a.locator('.markdown').getByText('Bo’s version')).toBeVisible(); // live on A

  // Card deleted while someone is typing: the draft is kept and can be copied.
  await b.getByRole('button', { name: 'Edit', exact: true }).click();
  await b.getByLabel('Description (Markdown)').fill('unsaved thoughts');
  await apiA.call('POST', `/cards/${card.id}/archive`);
  await apiA.call('DELETE', `/cards/${card.id}`);
  await expect(b.getByText('Ana deleted this card. Your unsaved text is still here.')).toBeVisible();
  await expect(b.getByRole('button', { name: 'Copy draft' })).toBeVisible();
  await ctxA.close();
  await ctxB.close();
});

test('closing a card with unsaved text asks first', async ({ page, context }) => {
  const user = await createUser(uniq('unsaved'));
  const api = await loginContext(context, user.email);
  const { board, lists } = await seedBoard(api, 'Unsaved board');
  const card = (await api.call('POST', `/lists/${lists[0].id}/cards`, { name: 'Draft card' })).card;
  await page.goto(`/b/${board.shortId}/c/${card.number}`);
  await page.getByPlaceholder(/Write a comment/).fill('half-written comment');
  await page.getByRole('button', { name: 'Close card' }).click();
  await expect(page.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByPlaceholder(/Write a comment/)).toHaveValue('half-written comment');
  await page.getByRole('button', { name: 'Close card' }).click();
  await page.getByRole('button', { name: 'Discard changes' }).click();
  await expect(page).toHaveURL(new RegExp(`/b/${board.shortId}$`));
});

test('reconnect: an offline client catches up on missed changes without reloading', async ({ browser }) => {
  const ua = await createUser(uniq('rca'));
  const ub = await createUser(uniq('rcb'));
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const apiA = await loginContext(ctxA, ua.email);
  const apiB = await loginContext(ctxB, ub.email);
  const { board, lists, workspaceId } = await seedBoard(apiA, 'Reconnect board');
  await addToWorkspaceAndBoard(apiA, workspaceId, board.id, apiB, ub.id);
  const b = await ctxB.newPage();
  await b.goto(`/b/${board.shortId}`);
  await expect(list(b, 'To do')).toBeVisible();
  await ctxB.setOffline(true);
  // Break the open socket the way a network drop does.
  for (const n of ['missed 1', 'missed 2', 'missed 3']) await apiA.call('POST', `/lists/${lists[0].id}/cards`, { name: n });
  await b.waitForTimeout(1000);
  expect(await cardTitles(b, 'To do')).toEqual([]);
  await expect(b.getByRole('alert').filter({ hasText: 'Connection to Flowdeck lost' })).toBeVisible({ timeout: 8000 });
  await ctxB.setOffline(false);
  const t0 = Date.now();
  await expect.poll(() => cardTitles(b, 'To do'), { timeout: 15_000 }).toEqual(['missed 1', 'missed 2', 'missed 3']);
  test.info().annotations.push({ type: 'catch-up after reconnect (ms)', description: String(Date.now() - t0) });
  await expect(b.getByText('Back online. Your board is up to date.')).toBeVisible();
  await ctxA.close();
  await ctxB.close();
});

test('permissions in the UI: observer is read-only, outsiders get not-found, removal is live', async ({ browser }) => {
  const ua = await createUser(uniq('pa'));
  const ub = await createUser(uniq('pb'));
  const uc = await createUser(uniq('pc'));
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const ctxC = await browser.newContext();
  const apiA = await loginContext(ctxA, ua.email);
  const apiB = await loginContext(ctxB, ub.email);
  await loginContext(ctxC, uc.email);
  const { board, lists, workspaceId } = await seedBoard(apiA, 'Roles board');
  await apiA.call('PATCH', `/boards/${board.id}`, { visibility: 'private' });
  await addToWorkspaceAndBoard(apiA, workspaceId, board.id, apiB, ub.id, 'observer');
  const card = (await apiA.call('POST', `/lists/${lists[0].id}/cards`, { name: 'Look, don’t touch' })).card;
  const b = await ctxB.newPage();
  await b.goto(`/b/${board.shortId}`);
  await expect(b.getByText(/You are an observer on this board/)).toBeVisible();
  await expect(b.getByRole('button', { name: '+ Add a card' })).toHaveCount(0);
  await b.getByText('Look, don’t touch').click();
  await expect(b.getByRole('heading', { name: 'Add to card' })).toHaveCount(0);
  await b.keyboard.press('Escape');

  const c = await ctxC.newPage();
  await c.goto(`/b/${board.shortId}`);
  await expect(c.getByText('This board doesn’t exist, or you don’t have access to it.')).toBeVisible();
  await c.goto(`/b/${board.shortId}/c/${card.number}`);
  await expect(c.getByText('This board doesn’t exist, or you don’t have access to it.')).toBeVisible();

  // Role change reaches B live, then removal switches B's view to no-access.
  await apiA.call('PATCH', `/boards/${board.id}/members/${ub.id}`, { role: 'member' });
  await expect(b.getByRole('button', { name: '+ Add a card' }).first()).toBeVisible();
  const t0 = Date.now();
  await apiA.call('DELETE', `/boards/${board.id}/members/${ub.id}`);
  await expect(b.getByText(/You no longer have access to this board/)).toBeVisible();
  expect(Date.now() - t0).toBeLessThan(2000);
  for (const ctx of [ctxA, ctxB, ctxC]) await ctx.close();
});

test('attachments: upload through the card, enforce the size limit with a clear message', async ({ page, context }) => {
  const user = await createUser(uniq('files'));
  const api = await loginContext(context, user.email);
  const { board, lists } = await seedBoard(api, 'Files board');
  const card = (await api.call('POST', `/lists/${lists[0].id}/cards`, { name: 'With files' })).card;
  await page.goto(`/b/${board.shortId}/c/${card.number}`);
  await page.getByRole('button', { name: 'Attachment' }).click();
  await page.getByLabel('Upload a file').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('meeting notes') });
  await expect(page.locator('.attachments').getByRole('link', { name: 'notes.txt' })).toBeVisible();
  await page.getByRole('button', { name: 'Attachment' }).click();
  await page.getByLabel('Upload a file').setInputFiles({ name: 'huge.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(2 * 1024 * 1024 + 1) });
  await expect(page.getByRole('alert').filter({ hasText: 'File is larger than 2 MB' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-card-id]').getByLabel('1 attachments')).toBeVisible();
});

test('filter with shortcuts and global search', async ({ page, context }) => {
  const user = await createUser(uniq('find'));
  const api = await loginContext(context, user.email);
  const { board, lists } = await seedBoard(api, 'Find board');
  const labels = (await api.call('GET', `/boards/${board.id}`)).labels;
  const c1 = (await api.call('POST', `/lists/${lists[0].id}/cards`, { name: 'Fix login bug' })).card;
  await api.call('POST', `/lists/${lists[0].id}/cards`, { name: 'Write newsletter' });
  await api.call('PUT', `/cards/${c1.id}/labels/${labels[3].id}`);
  await page.goto(`/b/${board.shortId}`);
  await expect(list(page, 'To do').getByText('Fix login bug')).toBeVisible();
  await page.keyboard.press('f');
  const panel = page.getByRole('region', { name: 'Filter cards' });
  await panel.getByRole('checkbox', { name: 'No labels' }).check();
  await expect.poll(() => cardTitles(page, 'To do')).toEqual(['Write newsletter']);
  await panel.getByRole('checkbox', { name: 'No labels' }).uncheck();
  await panel.getByLabel('Keyword').fill('login');
  await expect.poll(() => cardTitles(page, 'To do')).toEqual(['Fix login bug']);
  await expect(page).toHaveURL(/q=login/);
  await expect(list(page, 'To do').locator('.list-count')).toHaveText('1 of 2');
  await page.getByRole('button', { name: 'Close filter' }).click();
  await page.keyboard.press('x');
  await expect.poll(() => cardTitles(page, 'To do')).toEqual(['Fix login bug', 'Write newsletter']);
  await page.keyboard.press('/');
  await page.keyboard.type('newsletter');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('link', { name: 'Write newsletter' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Fix login bug' })).toHaveCount(0);
});
