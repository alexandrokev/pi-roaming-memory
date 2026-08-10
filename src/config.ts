import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type RoamingConfig = {
  schemaVersion: 1;
  vaultRoot: string;
  memoryRoot: string;
  deviceIdFile: string;
  indexFile: string;
  maxSearchResults: number;
  maxSearchTokens: number;
  maxReadBytes: number;
  enableStandingInstructions: boolean;
  enableMemoryPolicy: boolean;
  enableMemoryProposeNudge: boolean;
  memoryProposeNudgeTurns: number;
  handoffMode: "off" | "shadow" | "owner";
  hermesFallback: boolean;
};

export type LoadResult =
  | { ok: true; config: RoamingConfig }
  | { ok: false; error: string };

const DEFAULT_RUNTIME_DIR = path.join(
  os.homedir(),
  ".pi",
  "agent",
  "pi-roaming-memory",
);

function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

function isAbsolutePath(p: string): boolean {
  return path.isAbsolute(p) || /^[A-Za-z]:[\\/]/.test(p);
}

/**
 * Load local device config. Missing/invalid config disables the extension
 * (fail closed for writes/standing; Phase 1 exposes read tool only when ok).
 */
export function loadConfig(
  configPath = path.join(DEFAULT_RUNTIME_DIR, "config.json"),
): LoadResult {
  let raw: unknown;
  try {
    if (!fs.existsSync(configPath)) {
      return {
        ok: false,
        error: `missing config at ${configPath}`,
      };
    }
    raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (err) {
    return {
      ok: false,
      error: `unreadable config: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "config root must be object" };
  }
  const o = raw as Record<string, unknown>;

  if (o.schemaVersion !== 1) {
    return { ok: false, error: "schemaVersion must be 1" };
  }
  if (typeof o.vaultRoot !== "string" || !isAbsolutePath(o.vaultRoot)) {
    return { ok: false, error: "vaultRoot must be absolute path" };
  }
  if (typeof o.memoryRoot !== "string" || o.memoryRoot.length === 0) {
    return { ok: false, error: "memoryRoot required" };
  }
  if (path.isAbsolute(o.memoryRoot) || o.memoryRoot.includes("..")) {
    return {
      ok: false,
      error: "memoryRoot must be relative and stay inside vaultRoot",
    };
  }

  const handoffMode = o.handoffMode ?? "shadow";
  if (
    handoffMode !== "off" &&
    handoffMode !== "shadow" &&
    handoffMode !== "owner"
  ) {
    return { ok: false, error: "handoffMode invalid" };
  }

  const config: RoamingConfig = {
    schemaVersion: 1,
    vaultRoot: path.normalize(o.vaultRoot),
    memoryRoot: o.memoryRoot.replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""),
    deviceIdFile: expandHome(
      typeof o.deviceIdFile === "string"
        ? o.deviceIdFile
        : path.join(DEFAULT_RUNTIME_DIR, "device.json"),
    ),
    indexFile: expandHome(
      typeof o.indexFile === "string"
        ? o.indexFile
        : path.join(DEFAULT_RUNTIME_DIR, "index.sqlite"),
    ),
    maxSearchResults:
      typeof o.maxSearchResults === "number" && o.maxSearchResults > 0
        ? Math.min(o.maxSearchResults, 50)
        : 8,
    maxSearchTokens:
      typeof o.maxSearchTokens === "number" && o.maxSearchTokens > 0
        ? o.maxSearchTokens
        : 4000,
    maxReadBytes:
      typeof o.maxReadBytes === "number" && o.maxReadBytes > 0
        ? o.maxReadBytes
        : 131072,
    enableStandingInstructions: o.enableStandingInstructions !== false,
    enableMemoryPolicy: o.enableMemoryPolicy !== false,
    enableMemoryProposeNudge: o.enableMemoryProposeNudge !== false,
    memoryProposeNudgeTurns: Math.min(
      100,
      Math.max(
        3,
        typeof o.memoryProposeNudgeTurns === "number"
          ? o.memoryProposeNudgeTurns
          : 14,
      ),
    ),
    handoffMode,
    hermesFallback: o.hermesFallback !== false,
  };

  return { ok: true, config };
}

export function memoryRootAbs(config: RoamingConfig): string {
  return path.resolve(config.vaultRoot, config.memoryRoot);
}
