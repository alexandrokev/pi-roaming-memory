import fs from "node:fs";
import path from "node:path";
import { newUuid } from "./identity.js";

export type PublishResult =
  | { ok: true; absPath: string; relPath: string; bytes: number }
  | { ok: false; code: string; message: string };

export type PublishOptions = {
  memoryRootAbs: string;
  /** posix-style relative path under memory root */
  relPath: string;
  bytes: Buffer | string;
  /** age ms before stale tmp cleanup considers file old */
  staleTmpMs?: number;
};

/**
 * Create-only publish. Never overwrites an existing destination.
 * Uses O_EXCL|O_CREAT on the final path after writing a sibling temp file.
 */
export function publishCanonical(opts: PublishOptions): PublishResult {
  const root = path.resolve(opts.memoryRootAbs);
  const rel = opts.relPath.replace(/\\/g, "/");
  if (
    path.isAbsolute(rel) ||
    rel.split("/").includes("..") ||
    rel.includes("\0")
  ) {
    return { ok: false, code: "bad_path", message: "invalid relative path" };
  }
  const dest = path.resolve(root, rel);
  if (!dest.startsWith(root + path.sep) && dest !== root) {
    return { ok: false, code: "outside_root", message: "escapes memory root" };
  }

  const dir = path.dirname(dest);
  fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(dest)) {
    return {
      ok: false,
      code: "already_exists",
      message: `destination exists: ${rel}`,
    };
  }

  const data = Buffer.isBuffer(opts.bytes)
    ? opts.bytes
    : Buffer.from(opts.bytes, "utf8");
  const tmpName = `.prm-tmp-${newUuid()}`;
  const tmpPath = path.join(dir, tmpName);

  try {
    const fd = fs.openSync(
      tmpPath,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL,
      0o644,
    );
    try {
      fs.writeSync(fd, data);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    // Final create-only link via rename is not exclusive on all FS.
    // Use copy-free rename only after exclusive open of destination.
    let destFd: number | null = null;
    try {
      destFd = fs.openSync(
        dest,
        fs.constants.O_WRONLY |
          fs.constants.O_CREAT |
          fs.constants.O_EXCL |
          fs.constants.O_TRUNC,
        0o644,
      );
      // Prefer rename over rewrite: close dest and rename tmp → dest
      fs.closeSync(destFd);
      destFd = null;
      // On some platforms EXCL file exists empty; remove and rename atomically
      fs.unlinkSync(dest);
      fs.renameSync(tmpPath, dest);
    } catch (err) {
      if (destFd !== null) {
        try {
          fs.closeSync(destFd);
        } catch {
          /* ignore */
        }
      }
      // fallback: if rename failed because dest existed, fail closed
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === "EEXIST") {
        return {
          ok: false,
          code: "already_exists",
          message: `destination exists: ${rel}`,
        };
      }
      // alternate path: open EXCL failed empty — try rename only if dest absent
      if (!fs.existsSync(dest)) {
        try {
          fs.renameSync(tmpPath, dest);
        } catch (err2) {
          return {
            ok: false,
            code: "publish_failed",
            message: err2 instanceof Error ? err2.message : String(err2),
          };
        }
      } else {
        return {
          ok: false,
          code: "publish_failed",
          message: err instanceof Error ? err.message : String(err),
        };
      }
    }

    // verify bytes
    const got = fs.readFileSync(dest);
    if (!got.equals(data)) {
      try {
        fs.unlinkSync(dest);
      } catch {
        /* ignore */
      }
      return {
        ok: false,
        code: "verify_failed",
        message: "final bytes mismatch",
      };
    }

    // best-effort dir fsync
    try {
      const dfd = fs.openSync(dir, fs.constants.O_RDONLY);
      try {
        fs.fsyncSync(dfd);
      } finally {
        fs.closeSync(dfd);
      }
    } catch {
      /* unsupported */
    }

    return { ok: true, absPath: dest, relPath: rel, bytes: data.byteLength };
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "EEXIST") {
      return {
        ok: false,
        code: "already_exists",
        message: `destination exists: ${rel}`,
      };
    }
    return {
      ok: false,
      code: "publish_failed",
      message: err instanceof Error ? err.message : String(err),
    };
  } finally {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
  }
}

/** Remove only our stale temp files under memory root. */
export function cleanupStaleTemps(
  memoryRootAbs: string,
  staleTmpMs = 60 * 60 * 1000,
): string[] {
  const removed: string[] = [];
  const root = path.resolve(memoryRootAbs);
  if (!fs.existsSync(root)) return removed;
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === ".stversions") continue;
        walk(abs);
        continue;
      }
      if (!ent.isFile()) continue;
      if (!ent.name.startsWith(".prm-tmp-")) continue;
      try {
        const st = fs.statSync(abs);
        if (Date.now() - st.mtimeMs >= staleTmpMs) {
          fs.unlinkSync(abs);
          removed.push(path.relative(root, abs));
        }
      } catch {
        /* ignore */
      }
    }
  };
  walk(root);
  return removed;
}
