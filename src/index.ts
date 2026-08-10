/**
 * pi-roaming-memory — Phase 1 read-only entry.
 *
 * No writes. No command ownership of /handoff or /lanjut.
 * Registers shared_memory diagnostics only when config + fixtures/vault are valid.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadConfig } from "./config.js";
import { registerSharedMemoryTool } from "./tools/shared-memory.js";

export default function (pi: ExtensionAPI) {
  const loaded = loadConfig();
  if (!loaded.ok) {
    pi.on("session_start", async (_event, ctx) => {
      if (ctx.hasUI) {
        ctx.ui.notify(
          `pi-roaming-memory disabled: ${loaded.error}`,
          "warning",
        );
      }
    });
    return;
  }

  registerSharedMemoryTool(pi, loaded.config);
}
