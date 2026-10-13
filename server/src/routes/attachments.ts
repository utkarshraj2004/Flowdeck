import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { auth, mutationId, type Ctx } from '../context.js';
import { one } from '../db.js';
import { forbidden, invalid, notFound } from '../lib/errors.js';
import { requireBoard } from '../lib/permissions.js';
import { runMutation } from '../lib/mutation.js';
import { cardAudience, emitCard, loadCard } from '../lib/cards.js';
import { removeFiles, storagePath } from '../lib/files.js';
import { randomToken } from '../lib/security.js';
import { LIMITS } from '../lib/constants.js';
import * as v from '../lib/validate.js';
import { attachmentJson } from './cards.js';

const INLINE_TYPES = /^(image\/(png|jpe?g|gif|webp)|application\/pdf|text\/plain)$/;

function cleanName(name: string) {
  const base = path.basename(name || 'file').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (base || 'file').slice(0, 256);
}

export async function attachmentRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db, config } = ctx;

  app.post('/cards/:cardId/attachments', async (req) => {
    const u = auth(req);
    const card = await loadCard(db, (req.params as any).cardId);
    // Permission is checked before any upload bytes are read.
    await requireBoard(db, u.id, card.board_id, 'edit');
    const count = await one(db, 'SELECT count(*)::int AS n FROM attachments WHERE card_id = $1', [card.id]);
    if (count.n >= LIMITS.attachmentsPerCard) throw invalid('This card has reached its attachment limit', { code: 'limit_exceeded' });

    let record: { kind: 'file' | 'link'; name: string; url?: string; key?: string; mime?: string; bytes?: number; sha?: string };
    if (req.isMultipart()) {
      const file = await req.file();
      if (!file) throw invalid('Choose a file to upload');
      const key = randomToken(24);
      const dest = storagePath(config.uploadDir, key);
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      const hash = crypto.createHash('sha256');
      let bytes = 0;
      const meter = new Transform({
        transform(chunk, _enc, cb) {
          hash.update(chunk);
          bytes += chunk.length;
          cb(null, chunk);
        },
      });
      try {
        await pipeline(file.file, meter, fs.createWriteStream(dest, { flags: 'wx' }));
        if (file.file.truncated) throw Object.assign(new Error('too large'), { code: 'FST_REQ_FILE_TOO_LARGE' });
      } catch (err) {
        await fsp.rm(dest, { force: true });
        throw err;
      }
      record = { kind: 'file', name: cleanName(file.filename), key, mime: (file.mimetype || 'application/octet-stream').slice(0, 100), bytes, sha: hash.digest('hex') };
    } else {
      const b = v.body(req.body);
      const url = v.str(b, 'url', { min: 1, max: 2048, label: 'Link' })!;
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        throw invalid('Enter a full link starting with http:// or https://', { field: 'url' });
      }
      if (!['http:', 'https:'].includes(parsed.protocol)) throw invalid('Only http:// and https:// links can be attached', { field: 'url' });
      // Links are stored only; the server never fetches them (no SSRF surface).
      record = { kind: 'link', name: v.str(b, 'name', { max: 256, optional: true }) || parsed.host + parsed.pathname.replace(/\/$/, ''), url: parsed.toString() };
    }

    try {
      const { data, events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
        await m.lock(card.board_id);
        const still = await one(m.tx, 'SELECT * FROM cards WHERE id = $1', [card.id]);
        if (!still) throw notFound('Card not found');
        const a = await one(
          m.tx,
          `INSERT INTO attachments (card_id, uploader_id, kind, name, url, storage_key, mime_type, bytes, sha256) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [card.id, u.id, record.kind, record.name.slice(0, 256), record.url ?? null, record.key ?? null, record.mime ?? null, record.bytes ?? null, record.sha ?? null],
        );
        const json = attachmentJson({ ...a, full_name: u.full_name });
        if (json.isImage && !still.cover) await m.tx.query('UPDATE cards SET cover = $2 WHERE id = $1', [card.id, { attachmentId: a.id }]);
        await emitCard(m, still, 'attachment.added', { attachmentName: json.name, kind: record.kind }, { attachmentId: a.id });
        await m.notify(await cardAudience(m.tx, card.id), 'attachment_added', { boardId: card.board_id, cardId: card.id, data: { cardName: still.name, attachmentName: json.name } });
        return json;
      });
      return { attachment: data, event: events[0] };
    } catch (err) {
      if (record.key) await removeFiles(config.uploadDir, [record.key]);
      throw err;
    }
  });

  async function loadAttachment(id: string) {
    if (!v.isUuid(id)) throw notFound('Attachment not found');
    const a = await one(db, 'SELECT a.*, c.board_id FROM attachments a JOIN cards c ON c.id = a.card_id WHERE a.id = $1', [id]);
    if (!a) throw notFound('Attachment not found');
    return a;
  }

  // Downloads always go through this permission-checked route; there are no public file URLs.
  app.get('/attachments/:attachmentId/download', async (req, reply) => {
    const u = auth(req);
    const a = await loadAttachment((req.params as any).attachmentId);
    await requireBoard(db, u.id, a.board_id, 'view');
    if (a.kind !== 'file' || !a.storage_key) throw notFound('This attachment is a link');
    const file = storagePath(config.uploadDir, a.storage_key);
    if (!fs.existsSync(file)) throw notFound('The file is missing from storage. Ask an administrator to check backups.');
    const inline = INLINE_TYPES.test(a.mime_type ?? '') && (req.query as any).download !== '1';
    const encoded = encodeURIComponent(a.name).replace(/['()]/g, escape);
    reply.header('Content-Type', inline ? a.mime_type : 'application/octet-stream');
    reply.header('Content-Length', String(a.bytes));
    reply.header('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${a.name.replace(/[^\x20-\x7e]|"/g, '_')}"; filename*=UTF-8''${encoded}`);
    reply.header('Content-Security-Policy', "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
    reply.header('Cache-Control', 'private, max-age=300');
    return reply.send(fs.createReadStream(file));
  });

  app.delete('/attachments/:attachmentId', async (req) => {
    const u = auth(req);
    const a = await loadAttachment((req.params as any).attachmentId);
    const access = await requireBoard(db, u.id, a.board_id, 'edit');
    if (a.uploader_id !== u.id && !access.can.admin) throw forbidden('You can only remove attachments you added. Board admins can remove any attachment.');
    const card = await loadCard(db, a.card_id);
    const { events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
      await m.lock(a.board_id);
      await m.tx.query('DELETE FROM attachments WHERE id = $1', [a.id]);
      if (card.cover?.attachmentId === a.id) await m.tx.query('UPDATE cards SET cover = NULL WHERE id = $1', [card.id]);
      await emitCard(m, card, 'attachment.removed', { attachmentName: a.name }, { attachmentId: a.id });
    });
    if (a.storage_key) await removeFiles(config.uploadDir, [a.storage_key]);
    return { ok: true, event: events[0] };
  });
}
