// 進捗の SQLite 保存（Vite のサーバーとスクリプトで共有）
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

export const DB_PATH = process.env.PROGRESS_DB
  ? resolve(process.env.PROGRESS_DB)
  : resolve(dirname(fileURLToPath(import.meta.url)), '../data/progress.db');

/**
 * 進捗は1行の JSON として持つ。
 * - revision：書き込みごとに +1（端末間の書き込み競合の検出用）
 * - epoch：リセット・全クリなど「サーバーの内容を正とする」変更で +1
 */
export function openDb() {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS progress (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL,
      revision INTEGER NOT NULL,
      epoch INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

/** @returns {{ data: any, revision: number, epoch: number }} */
export function readProgress(db) {
  const row = db.prepare('SELECT data, revision, epoch FROM progress WHERE id = 1').get();
  if (!row) return { data: null, revision: 0, epoch: 0 };
  return { data: JSON.parse(row.data), revision: row.revision, epoch: row.epoch };
}

/**
 * baseRevision が現在の revision と一致するときだけ書き込む。
 * @returns {{ ok: boolean, data: any, revision: number, epoch: number }}
 */
export function writeProgress(db, data, baseRevision, bumpEpoch = false) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const cur = readProgress(db);
    if (baseRevision !== cur.revision) {
      db.exec('ROLLBACK');
      return { ok: false, ...cur };
    }
    const next = { data, revision: cur.revision + 1, epoch: cur.epoch + (bumpEpoch ? 1 : 0) };
    db.prepare(
      `INSERT INTO progress (id, data, revision, epoch, updated_at) VALUES (1, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, revision = excluded.revision,
         epoch = excluded.epoch, updated_at = excluded.updated_at`,
    ).run(JSON.stringify(data), next.revision, next.epoch, new Date().toISOString());
    db.exec('COMMIT');
    return { ok: true, ...next };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/** スクリプト用：現在の進捗を書き換えて保存し、起動中のアプリにも反映させる */
export function modifyProgress(fn) {
  const db = openDb();
  try {
    for (;;) {
      const cur = readProgress(db);
      const data = fn(cur.data);
      const res = writeProgress(db, data, cur.revision, true);
      if (res.ok) return res;
    }
  } finally {
    db.close();
  }
}

/** Vite の dev / preview サーバーに /api/progress を追加するプラグイン */
export function progressApiPlugin() {
  let db = null;
  const getDb = () => (db ??= openDb());

  const middleware = async (req, res, next) => {
    if (req.url?.split('?')[0] !== '/api/progress') return next();
    const send = (status, body) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(body));
    };
    try {
      if (req.method === 'GET') return send(200, readProgress(getDb()));
      if (req.method === 'PUT') {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw);
        const result = writeProgress(getDb(), body.data, body.baseRevision, Boolean(body.bumpEpoch));
        const { ok, ...rest } = result;
        return ok ? send(200, { revision: rest.revision, epoch: rest.epoch }) : send(409, rest);
      }
      send(405, { error: 'method not allowed' });
    } catch (e) {
      send(500, { error: String(e?.message ?? e) });
    }
  };

  return {
    name: 'progress-api',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
