import fs from "node:fs";
import path from "node:path";
import { newUuid } from "./identity.js";

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
    return path.join(this.dir, `${id}.json`);
  }

  put(
    input: Omit<Proposal, "id" | "createdAt" | "expiresAt"> & {
      ttlMs?: number;
    },
  ): Proposal {
    const id = `prop_${newUuid()}`;
    const createdAt = new Date().toISOString();
    const ttl = input.ttlMs ?? 30 * 60 * 1000;
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
    const f = this.file(id);
    if (!fs.existsSync(f)) return null;
    try {
      const p = JSON.parse(fs.readFileSync(f, "utf8")) as Proposal;
      if (Date.parse(p.expiresAt) < Date.now()) {
        this.delete(id);
        return null;
      }
      return p;
    } catch {
      return null;
    }
  }

  delete(id: string): void {
    try {
      fs.unlinkSync(this.file(id));
    } catch {
      /* ignore */
    }
  }

  /** Mark consumed so double-commit fails. */
  consume(id: string): Proposal | null {
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
    return fs.existsSync(path.join(this.dir, `${id}.consumed`));
  }
}
