import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { scanMemoryRoot, type ScannedObject } from "../scanner.js";
import { applyGraphToObjects, isRetrievalEligible, type GraphEvaluation } from "../graph.js";

export type SearchHit = {
  id: string;
  title: string | null;
  kind: string;
  trust: string;
  relPath: string;
  snippet: string;
  score: number;
};

export type Projection = {
  db: DatabaseSync;
  reportPath: string;
  graph: GraphEvaluation;
  objects: ScannedObject[];
};

export function openProjection(indexFile: string): DatabaseSync {
  fs.mkdirSync(path.dirname(indexFile), { recursive: true });
  const db = new DatabaseSync(indexFile);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      trust TEXT NOT NULL,
      title TEXT,
      rel_path TEXT NOT NULL,
      scope TEXT,
      project_id TEXT,
      workstream_id TEXT,
      tags TEXT,
      body TEXT,
      eligible INTEGER NOT NULL DEFAULT 0
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      id UNINDEXED,
      title,
      body,
      tags,
      content='notes',
      content_rowid='rowid'
    );
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}

export function rebuildProjection(
  memoryRootAbs: string,
  indexFile: string,
  opts: { maxReadBytes?: number } = {},
): Projection {
  const report = scanMemoryRoot(memoryRootAbs, {
    maxReadBytes: opts.maxReadBytes,
  });
  const graph = applyGraphToObjects(report.objects);

  // rebuild into temp then rename
  const tmp = indexFile + ".rebuild";
  try {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  } catch {
    /* ignore */
  }
  const db = openProjection(tmp);
  const insert = db.prepare(`
    INSERT INTO notes (id, kind, trust, title, rel_path, scope, project_id, workstream_id, tags, body, eligible)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec("BEGIN");
  try {
    for (const o of report.objects) {
      if (!o.id && o.kind !== "standing" && o.kind !== "inbox") continue;
      const id = o.id ?? `path:${o.relPath}`;
      const tags = o.meta && Array.isArray(o.meta.tags)
        ? (o.meta.tags as string[]).join(" ")
        : "";
      const body = loadBody(memoryRootAbs, o, opts.maxReadBytes ?? 131072);
      const eligible = isRetrievalEligible(o, graph) ? 1 : 0;
      insert.run(
        id,
        o.kind,
        o.trust,
        o.title,
        o.relPath,
        o.meta && typeof o.meta.scope === "string" ? o.meta.scope : null,
        o.meta && typeof o.meta.project_id === "string" ? o.meta.project_id : null,
        o.meta && typeof o.meta.workstream_id === "string"
          ? o.meta.workstream_id
          : null,
        tags,
        body,
        eligible,
      );
    }
    // rebuild fts from content table
    db.exec(`
      INSERT INTO notes_fts(notes_fts) VALUES('rebuild');
    `);
    db.prepare(
      `INSERT OR REPLACE INTO meta(key,value) VALUES('rebuilt_at', ?)`,
    ).run(new Date().toISOString());
    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    db.close();
    throw err;
  }
  db.close();

  // atomic swap
  fs.renameSync(tmp, indexFile);
  // reopen
  const live = openProjection(indexFile);
  return {
    db: live,
    reportPath: memoryRootAbs,
    graph,
    objects: report.objects,
  };
}

function loadBody(
  root: string,
  o: ScannedObject,
  maxBytes: number,
): string {
  if (o.bodyPreview && o.kind === "inbox") return o.bodyPreview;
  try {
    const abs = path.join(root, o.relPath);
    const buf = fs.readFileSync(abs);
    const text = buf.subarray(0, maxBytes).toString("utf8");
    const idx = text.indexOf("\n---\n");
    if (idx !== -1) return text.slice(idx + 5);
    return text;
  } catch {
    return o.bodyPreview ?? "";
  }
}

export function searchProjection(
  db: DatabaseSync,
  query: string,
  opts: {
    limit?: number;
    projectId?: string;
    onlyEligible?: boolean;
  } = {},
): SearchHit[] {
  const limit = opts.limit ?? 8;
  const onlyEligible = opts.onlyEligible !== false;
  const q = query.trim();
  if (!q) return [];

  // Escape FTS5 special chars lightly
  const ftsQuery = q.replace(/"/g, '""');

  let sql = `
    SELECT n.id, n.title, n.kind, n.trust, n.rel_path, n.body,
           bm25(notes_fts) AS score
    FROM notes_fts
    JOIN notes n ON n.rowid = notes_fts.rowid
    WHERE notes_fts MATCH ?
  `;
  const params: unknown[] = [ftsQuery];
  if (onlyEligible) {
    sql += ` AND n.eligible = 1`;
  }
  if (opts.projectId) {
    sql += ` AND (n.project_id = ? OR n.scope = 'global')`;
    params.push(opts.projectId);
  }
  sql += ` ORDER BY score LIMIT ?`;
  params.push(limit);

  try {
    const rows = db.prepare(sql).all(...params) as Array<{
      id: string;
      title: string | null;
      kind: string;
      trust: string;
      rel_path: string;
      body: string;
      score: number;
    }>;
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      kind: r.kind,
      trust: r.trust,
      relPath: r.rel_path,
      snippet: snippet(r.body, q),
      score: r.score,
    }));
  } catch {
    // fallback substring
    let sql2 = `SELECT id, title, kind, trust, rel_path, body FROM notes WHERE body LIKE ? OR title LIKE ?`;
    const like = `%${q}%`;
    const params2: unknown[] = [like, like];
    if (onlyEligible) sql2 += ` AND eligible = 1`;
    sql2 += ` LIMIT ?`;
    params2.push(limit);
    const rows = db.prepare(sql2).all(...params2) as Array<{
      id: string;
      title: string | null;
      kind: string;
      trust: string;
      rel_path: string;
      body: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      kind: r.kind,
      trust: r.trust,
      relPath: r.rel_path,
      snippet: snippet(r.body, q),
      score: 0,
    }));
  }
}

function snippet(body: string, q: string, n = 200): string {
  const lower = body.toLowerCase();
  const i = lower.indexOf(q.toLowerCase());
  if (i < 0) {
    const one = body.replace(/\s+/g, " ").trim();
    return one.length <= n ? one : one.slice(0, n) + "…";
  }
  const start = Math.max(0, i - 40);
  const slice = body.slice(start, start + n).replace(/\s+/g, " ").trim();
  return (start > 0 ? "…" : "") + slice + (start + n < body.length ? "…" : "");
}
