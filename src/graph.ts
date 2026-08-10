import type { ScannedObject } from "./scanner.js";

export type GraphNode = {
  id: string;
  supersedes: string[];
  tombstoned: boolean;
  kind: string;
  trust: string;
};

export type GraphEvaluation = {
  /** IDs excluded from normal retrieval */
  excluded: Set<string>;
  /** Terminal conflict groups (each group is unresolved competing terminals) */
  conflictGroups: string[][];
  /** Active heads per memory lineage roots (best-effort) */
  activeTerminals: string[];
  reasons: Map<string, string[]>;
};

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

export function buildGraphNodes(objects: ScannedObject[]): Map<string, GraphNode> {
  const nodes = new Map<string, GraphNode>();
  const tombstoneTargets = new Set<string>();

  for (const o of objects) {
    if (o.kind === "tombstone" && o.meta && typeof o.meta.target_id === "string") {
      if (o.trust === "approved" || o.issues.length === 0) {
        tombstoneTargets.add(o.meta.target_id);
      }
    }
  }

  for (const o of objects) {
    if (!o.id || o.kind !== "memory") continue;
    if (o.trust === "invalid" || o.trust === "conflicted") {
      // still register for edge awareness if meta present
    }
    const supersedes =
      o.meta && Array.isArray(o.meta.supersedes)
        ? asStringArray(o.meta.supersedes)
        : [];
    nodes.set(o.id, {
      id: o.id,
      supersedes,
      tombstoned: tombstoneTargets.has(o.id),
      kind: o.kind,
      trust: o.trust,
    });
  }

  // mark tombstoned
  for (const t of tombstoneTargets) {
    const n = nodes.get(t);
    if (n) n.tombstoned = true;
    else {
      nodes.set(t, {
        id: t,
        supersedes: [],
        tombstoned: true,
        kind: "memory",
        trust: "approved",
      });
    }
  }

  return nodes;
}

/**
 * Evaluate supersession DAG + tombstones + resolutions.
 * Timestamps never pick winners.
 */
export function evaluateGraph(
  objects: ScannedObject[],
): GraphEvaluation {
  const nodes = buildGraphNodes(objects);
  const excluded = new Set<string>();
  const reasons = new Map<string, string[]>();
  const addReason = (id: string, r: string) => {
    const list = reasons.get(id) ?? [];
    list.push(r);
    reasons.set(id, list);
    excluded.add(id);
  };

  // Apply resolutions first: accepted stay, rejected excluded
  const resolvedRejected = new Set<string>();
  const resolvedAccepted = new Set<string>();
  for (const o of objects) {
    if (o.kind !== "resolution" || !o.meta) continue;
    if (o.trust === "invalid") continue;
    for (const id of asStringArray(o.meta.rejects)) {
      resolvedRejected.add(id);
      addReason(id, "resolution_rejected");
    }
    for (const id of asStringArray(o.meta.accepts)) {
      resolvedAccepted.add(id);
    }
  }

  // Tombstones
  for (const [id, n] of nodes) {
    if (n.tombstoned) addReason(id, "tombstoned");
  }

  // Invalid/conflicted scanned objects
  for (const o of objects) {
    if (o.id && (o.trust === "invalid" || o.trust === "conflicted")) {
      addReason(o.id, `trust_${o.trust}`);
    }
  }

  // Build children map: parent -> nodes that supersede it
  const children = new Map<string, string[]>();
  for (const [id, n] of nodes) {
    for (const parent of n.supersedes) {
      const list = children.get(parent) ?? [];
      list.push(id);
      children.set(parent, list);
    }
  }

  // Cycle detection
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cyclic = new Set<string>();
  function dfs(id: string, stack: string[]) {
    if (visiting.has(id)) {
      for (const s of stack) cyclic.add(s);
      cyclic.add(id);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    stack.push(id);
    const n = nodes.get(id);
    if (n) {
      for (const p of n.supersedes) dfs(p, stack);
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of nodes.keys()) dfs(id, []);
  for (const id of cyclic) addReason(id, "cycle");

  // Terminals: nodes not superseded by any non-excluded child
  // A node is superseded if any child points to it via supersedes and child not excluded for other hard reasons
  const supersededBy = new Map<string, string[]>();
  for (const [id, n] of nodes) {
    if (excluded.has(id) && !resolvedAccepted.has(id)) continue;
    for (const p of n.supersedes) {
      const list = supersededBy.get(p) ?? [];
      list.push(id);
      supersededBy.set(p, list);
    }
  }

  // For each parent that has 2+ competing terminal descendants that are not resolved, conflict
  // Simpler rule: any id with 2+ direct superseding children that are themselves not superseded → conflict group
  const conflictGroups: string[][] = [];
  const seenGroup = new Set<string>();

  for (const [parent, kids] of children) {
    const liveKids = kids.filter(
      (k) =>
        !resolvedRejected.has(k) &&
        !(excluded.has(k) && !resolvedAccepted.has(k)) &&
        !cyclic.has(k),
    );
    // terminals among kids = kids not themselves superseded by another live kid chain tip
    const terminalKids = liveKids.filter((k) => {
      const grand = children.get(k) ?? [];
      const liveGrand = grand.filter(
        (g) => !resolvedRejected.has(g) && !cyclic.has(g),
      );
      return liveGrand.length === 0;
    });
    // Also treat unresolved concurrent supersessions of same parent
    if (terminalKids.length >= 2) {
      const unresolved = terminalKids.filter((k) => !resolvedAccepted.has(k));
      // if more than one not accepted, or none accepted while multiple exist
      const acceptedAmong = terminalKids.filter((k) => resolvedAccepted.has(k));
      if (acceptedAmong.length === 0 && unresolved.length >= 2) {
        const key = unresolved.slice().sort().join("|");
        if (!seenGroup.has(key)) {
          seenGroup.add(key);
          conflictGroups.push(unresolved.slice());
          for (const id of unresolved) addReason(id, "concurrent_supersession");
          addReason(parent, "contested_ancestor");
        }
      } else if (acceptedAmong.length >= 1) {
        // reject other terminals not accepted
        for (const id of terminalKids) {
          if (!resolvedAccepted.has(id)) addReason(id, "superseded_by_resolution");
        }
      }
    }
  }

  // Nodes that have a live superseding child are excluded as non-terminal (unless accepted terminal)
  for (const [parent, kids] of supersededBy) {
    const live = kids.filter((k) => !excluded.has(k) || resolvedAccepted.has(k));
    if (live.length >= 1 && !resolvedAccepted.has(parent)) {
      addReason(parent, "superseded");
    }
  }

  const activeTerminals = [...nodes.keys()].filter(
    (id) => !excluded.has(id) && nodes.get(id)?.kind === "memory",
  );

  return { excluded, conflictGroups, activeTerminals, reasons };
}

/** Apply graph evaluation onto scanned objects (mutates trust for memories). */
export function applyGraphToObjects(objects: ScannedObject[]): GraphEvaluation {
  const ev = evaluateGraph(objects);
  for (const o of objects) {
    if (!o.id) continue;
    if (ev.excluded.has(o.id) && o.trust === "approved") {
      const rs = ev.reasons.get(o.id) ?? [];
      if (rs.includes("tombstoned") || rs.includes("superseded")) {
        // keep approved but mark retrieval exclusion via issues
        o.issues = [...o.issues, ...rs.map((r) => `graph:${r}`)];
      } else if (
        rs.includes("concurrent_supersession") ||
        rs.includes("contested_ancestor")
      ) {
        o.trust = "conflicted";
        o.issues = [...o.issues, ...rs.map((r) => `graph:${r}`)];
      } else if (rs.some((r) => r.startsWith("trust_"))) {
        // already
      } else {
        o.issues = [...o.issues, ...rs.map((r) => `graph:${r}`)];
      }
    }
  }
  return ev;
}

export function isRetrievalEligible(o: ScannedObject, ev: GraphEvaluation): boolean {
  if (o.kind !== "memory") return false;
  if (o.trust !== "approved") return false;
  if (!o.id) return false;
  if (ev.excluded.has(o.id)) {
    const rs = ev.reasons.get(o.id) ?? [];
    // superseded/tombstoned/conflict excluded
    return false;
  }
  if (o.issues.some((i) => i.startsWith("graph:"))) return false;
  return true;
}
