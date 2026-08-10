import fs from "node:fs";
import path from "node:path";

export type BoundaryErrorCode =
  | "outside_root"
  | "symlink"
  | "not_found"
  | "not_file"
  | "io_error";

export type ResolvedPath =
  | { ok: true; absPath: string; relPath: string }
  | { ok: false; code: BoundaryErrorCode; message: string };

function realpathSafe(p: string): string | null {
  try {
    return fs.realpathSync(p);
  } catch {
    return null;
  }
}

/**
 * Resolve a path that must remain inside memoryRoot.
 * Rejects absolute escapes, .. segments after join, and symlinks.
 */
export function resolveInsideRoot(
  memoryRootAbs: string,
  relativePath: string,
): ResolvedPath {
  if (!relativePath || typeof relativePath !== "string") {
    return { ok: false, code: "outside_root", message: "empty path" };
  }
  if (
    path.isAbsolute(relativePath) ||
    /^[A-Za-z]:[\\/]/.test(relativePath) ||
    relativePath.includes("\0")
  ) {
    return {
      ok: false,
      code: "outside_root",
      message: "absolute or NUL path rejected",
    };
  }

  const rootReal = realpathSafe(memoryRootAbs);
  if (!rootReal) {
    return {
      ok: false,
      code: "not_found",
      message: `memory root missing: ${memoryRootAbs}`,
    };
  }

  // Disallow symlink at root itself
  try {
    const lst = fs.lstatSync(memoryRootAbs);
    if (lst.isSymbolicLink()) {
      return {
        ok: false,
        code: "symlink",
        message: "memory root must not be symlink",
      };
    }
  } catch (err) {
    return {
      ok: false,
      code: "io_error",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  const joined = path.resolve(rootReal, relativePath);
  const rel = path.relative(rootReal, joined);
  if (
    rel.startsWith("..") ||
    path.isAbsolute(rel) ||
    rel.split(path.sep).includes("..")
  ) {
    return {
      ok: false,
      code: "outside_root",
      message: "path escapes memory root",
    };
  }

  // Walk each segment; reject any symlink component.
  let cursor = rootReal;
  const parts = rel.split(path.sep).filter(Boolean);
  for (const part of parts) {
    cursor = path.join(cursor, part);
    let st: fs.Stats;
    try {
      st = fs.lstatSync(cursor);
    } catch {
      return {
        ok: false,
        code: "not_found",
        message: `missing: ${path.relative(rootReal, cursor)}`,
      };
    }
    if (st.isSymbolicLink()) {
      return {
        ok: false,
        code: "symlink",
        message: `symlink rejected: ${path.relative(rootReal, cursor)}`,
      };
    }
  }

  return {
    ok: true,
    absPath: cursor,
    relPath: parts.join("/"),
  };
}

export function assertFile(resolved: Extract<ResolvedPath, { ok: true }>): ResolvedPath {
  try {
    const st = fs.lstatSync(resolved.absPath);
    if (st.isSymbolicLink()) {
      return {
        ok: false,
        code: "symlink",
        message: "symlink rejected",
      };
    }
    if (!st.isFile()) {
      return {
        ok: false,
        code: "not_file",
        message: "not a regular file",
      };
    }
    return resolved;
  } catch (err) {
    return {
      ok: false,
      code: "io_error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/** True if basename looks like a Syncthing conflict copy. */
export function isSyncConflictName(name: string): boolean {
  return /\.sync-conflict-\d{8}-\d{6}-[A-Za-z0-9]+\.md$/i.test(name)
    || /^STANDING\.sync-conflict-/i.test(name);
}

export function isStversionsPath(relPath: string): boolean {
  const norm = relPath.replace(/\\/g, "/").toLowerCase();
  return (
    norm === ".stversions" ||
    norm.startsWith(".stversions/") ||
    norm.includes("/.stversions/")
  );
}
