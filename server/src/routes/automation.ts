import type { FastifyInstance } from 'fastify';
import { auth, type Ctx } from '../context.js';
import { many, one } from '../db.js';
import { invalid, notFound } from '../lib/errors.js';
import { requireBoard } from '../lib/permissions.js';
import { MAX_RULES_PER_BOARD, parseRule, ruleJson } from '../lib/automation.js';
import * as v from '../lib/validate.js';
import { resolveBoardId } from './boards.js';

/** Board automation rules. Board members can see them; only board admins can change them. */
export async function automationRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;

  async function loadRule(userId: string, ruleId: string) {
    if (!v.isUuid(ruleId)) throw notFound('Rule not found');
    const rule = await one(db, 'SELECT * FROM automation_rules WHERE id = $1', [ruleId]);
    if (!rule) throw notFound('Rule not found');
    await requireBoard(db, userId, rule.board_id, 'admin');
    return rule;
  }

  app.get('/boards/:id/automations', async (req) => {
    const u = auth(req);
    const boardId = await resolveBoardId(db, (req.params as any).id);
    await requireBoard(db, u.id, boardId, 'view');
    const rows = await many(db, 'SELECT * FROM automation_rules WHERE board_id = $1 ORDER BY created_at, id', [boardId]);
    return { rules: rows.map(ruleJson) };
  });

  app.post('/boards/:id/automations', async (req) => {
    const u = auth(req);
    const boardId = await resolveBoardId(db, (req.params as any).id);
    const access = await requireBoard(db, u.id, boardId, 'admin');
    if (access.board.closed_at) throw invalid('Reopen the board to add rules.');
    const b = v.body(req.body);
    const name = v.str(b, 'name', { min: 1, max: 100, label: 'Rule name' })!;
    const { trigger, actions } = await parseRule(db, boardId, b.trigger, b.actions);
    const count = await one(db, 'SELECT count(*)::int AS n FROM automation_rules WHERE board_id = $1', [boardId]);
    if (count.n >= MAX_RULES_PER_BOARD)
      throw invalid(`A board can have at most ${MAX_RULES_PER_BOARD} rules`, {
        code: 'limit_exceeded',
      });
    const row = await one(db, 'INSERT INTO automation_rules (board_id, name, trigger, actions, enabled, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [
      boardId,
      name,
      JSON.stringify(trigger),
      JSON.stringify(actions),
      b.enabled !== false,
      u.id,
    ]);
    return { rule: ruleJson(row) };
  });

  app.patch('/automations/:ruleId', async (req) => {
    const u = auth(req);
    const rule = await loadRule(u.id, (req.params as any).ruleId);
    const b = v.body(req.body);
    const name = 'name' in b ? v.str(b, 'name', { min: 1, max: 100, label: 'Rule name' })! : rule.name;
    const enabled = 'enabled' in b ? v.bool(b, 'enabled')! : rule.enabled;
    const parsed =
      'trigger' in b || 'actions' in b
        ? await parseRule(db, rule.board_id, b.trigger ?? rule.trigger, b.actions ?? rule.actions)
        : { trigger: rule.trigger, actions: rule.actions };
    // The rule acts with the rights of whoever saved it last (it is their decision), and a saved change clears an old error.
    const row = await one(
      db,
      `UPDATE automation_rules SET name = $2, enabled = $3, trigger = $4, actions = $5, created_by = $6, updated_at = now(), last_error = NULL, last_error_at = NULL
        WHERE id = $1 RETURNING *`,
      [rule.id, name, enabled, JSON.stringify(parsed.trigger), JSON.stringify(parsed.actions), u.id],
    );
    return { rule: ruleJson(row) };
  });

  app.delete('/automations/:ruleId', async (req) => {
    const u = auth(req);
    const rule = await loadRule(u.id, (req.params as any).ruleId);
    await db.query('DELETE FROM automation_rules WHERE id = $1', [rule.id]);
    return { ok: true };
  });
}
