import fs from "node:fs";
import path from "node:path";
import { newUuid } from "./identity.js";

const PROPOSAL_ID_RE =
  /^prop_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ProposalKind = "memory" | "resolution" | "tombstone" | "checkpoint";

export type Proposal = {
  id: string;
  kind: ProposalKind;
  createdAt: string;
  expiresAt: string;
  relPath: string;
  bytesUtf8: string;
  meta: Record<string, unknown>;
  preview: string;
  warnings: string[];
};

export class ProposalStore {
  dir: string;
  constructor(dir: string) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
  }

  private file(id: string) {
    if (!PROPOSAL_ID_RE.test(id)) {
      throw new Error(`invalid_proposal_id:${id}`);
    }
    return path.join(this.dir, `${id}.json`);
  }

  put(
    input: Omit<Proposal, "id" | "createdAt" | "expiresAt"> & {
      ttlMs?: number;
    },
  ): Proposal {
    const id = `prop_${newUuid()}`;
    const createdAt = new Date().toISOString();
    const ttl = input.ttlMs ?? 30 * 24 * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + ttl).toISOString();
    const proposal: Proposal = {
      id,
      kind: input.kind,
      createdAt,
      expiresAt,
      relPath: input.relPath,
      bytesUtf8: input.bytesUtf8,
      meta: input.meta,
      preview: input.preview,
      warnings: input.warnings,
    };
    fs.writeFileSync(this.file(id), JSON.stringify(proposal, null, 2), {
      mode: 0o600,
    });
    return proposal;
  }

  get(id: string): Proposal | null {
    if (!PROPOSAL_ID_RE.test(id)) return null;
    const f = this.file(id);
    if (!fs.existsSync(f)) return null;
    try {
      const p = JSON.parse(fs.readFileSync(f, "utf8")) as Proposal;
      // Expired proposals stay readable so a later /memory-pending review can
      // still approve or reject them; only explicit consumers remove files.
      return p;
    } catch {
      return null;
    }
  }

  /** Newest-first pending proposals (consumed markers are not .json). */
  list(): Proposal[] {
    let files: string[];
    try {
      files = fs.readdirSync(this.dir);
    } catch {
      return [];
    }
    const out: Proposal[] = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      const p = this.get(f.slice(0, -".json".length));
      if (p) out.push(p);
    }
    return out.sort((a, b) => {
      const diff = Date.parse(b.createdAt) - Date.parse(a.createdAt);
      return diff !== 0 ? diff : b.id.localeCompare(a.id);
    });
  }

  /** Explicit user rejection: drop the proposal without publishing it. */
  reject(id: string): void {
    this.delete(id);
  }

  delete(id: string): void {
    if (!PROPOSAL_ID_RE.test(id)) return;
    try {
      fs.unlinkSync(this.file(id));
    } catch {
      /* ignore */
    }
  }

  /** Mark consumed so double-commit fails. */
  consume(id: string): Proposal | null {
    if (!PROPOSAL_ID_RE.test(id)) return null;
    const p = this.get(id);
    if (!p) return null;
    this.delete(id);
    // write consumed marker briefly to defeat races
    const marker = path.join(this.dir, `${id}.consumed`);
    try {
      fs.writeFileSync(marker, new Date().toISOString());
    } catch {
      /* ignore */
    }
    return p;
  }

  wasConsumed(id: string): boolean {
    if (!PROPOSAL_ID_RE.test(id)) return false;
    return fs.existsSync(path.join(this.dir, `${id}.consumed`));
  }
}
