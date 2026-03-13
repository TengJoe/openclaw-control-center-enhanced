import { stat } from "node:fs/promises";
import { OpenClawReadonlyAdapter } from "../adapters/openclaw-readonly";
import type { ToolClient } from "../clients/tool-client";
import { mapSessionsListToSummaries } from "../mappers/openclaw-mappers";
import { computeBudgetSummary } from "./budget-governance";
import { loadBudgetPolicy, type BudgetPolicyLoadResult } from "./budget-policy";
import { loadProjectStore } from "./project-store";
import { computeProjectSummaries } from "./project-summary";
import { computeTasksSummary } from "./task-summary";
import { loadTaskStore } from "./task-store";
import type { ProjectStoreSnapshot, ReadModelSnapshot, TaskStoreSnapshot } from "../types";

interface SnapshotInFlight {
  sourceStamp: string;
  value: Promise<ReadModelSnapshot>;
}

interface LiveSessionsCacheEntry {
  expiresAt: number;
  value: Awaited<ReturnType<ToolClient["sessionsList"]>>;
}

interface UiReadModelCacheOptions {
  snapshotPath: string;
  projectsPath: string;
  tasksPath: string;
  budgetPolicyPath: string;
  snapshotCacheTtlMs: number;
  liveSessionsCacheTtlMs: number;
  readonlyMode: boolean;
  getReadonlySnapshotToolClient: () => ToolClient | undefined;
  readSnapshotRaw: () => Promise<string>;
  buildDefaultSnapshot: () => ReadModelSnapshot;
  compareSessionSummariesByLatest: (
    a: ReadModelSnapshot["sessions"][number],
    b: ReadModelSnapshot["sessions"][number],
  ) => number;
  loadProjectStore?: () => Promise<ProjectStoreSnapshot>;
  loadTaskStore?: () => Promise<TaskStoreSnapshot>;
  loadBudgetPolicy?: () => Promise<BudgetPolicyLoadResult>;
  mapSessionsListToSummaries?: typeof mapSessionsListToSummaries;
}

export interface UiReadModelCache {
  readReadModelSourceStamp(): Promise<string>;
  readReadModelSnapshot(): Promise<ReadModelSnapshot>;
  readReadModelSnapshotWithLiveSessions(toolClient: ToolClient): Promise<ReadModelSnapshot>;
}

export function createUiReadModelCache(options: UiReadModelCacheOptions): UiReadModelCache {
  const loadProjectStoreImpl = options.loadProjectStore ?? loadProjectStore;
  const loadTaskStoreImpl = options.loadTaskStore ?? loadTaskStore;
  const loadBudgetPolicyImpl = options.loadBudgetPolicy ?? loadBudgetPolicy;
  const mapSessionsListToSummariesImpl =
    options.mapSessionsListToSummaries ?? mapSessionsListToSummaries;
  let renderSnapshotCache:
    | {
        sourceStamp: string;
        value: ReadModelSnapshot;
        expiresAt: number;
      }
    | undefined;
  let renderSnapshotInFlight: SnapshotInFlight | undefined;
  let renderLiveSessionsCache: LiveSessionsCacheEntry | undefined;
  let renderLiveSessionsInFlight: Promise<Awaited<ReturnType<ToolClient["sessionsList"]>>> | undefined;

  async function readReadModelSourceStamp(): Promise<string> {
    const parts = await Promise.all([
      readOptionalFileStamp(options.snapshotPath),
      readOptionalFileStamp(options.projectsPath),
      readOptionalFileStamp(options.tasksPath),
      readOptionalFileStamp(options.budgetPolicyPath),
    ]);
    return parts.join("|");
  }

  async function readReadModelSnapshot(): Promise<ReadModelSnapshot> {
    const sourceStamp = await readReadModelSourceStamp();
    const now = Date.now();
    if (
      renderSnapshotCache &&
      renderSnapshotCache.sourceStamp === sourceStamp &&
      renderSnapshotCache.expiresAt > now
    ) {
      return renderSnapshotCache.value;
    }
    if (renderSnapshotCache && renderSnapshotCache.sourceStamp === sourceStamp) {
      if (!renderSnapshotInFlight || renderSnapshotInFlight.sourceStamp !== sourceStamp) {
        const nextValue = buildReadModelSnapshot(sourceStamp);
        renderSnapshotInFlight = { sourceStamp, value: nextValue };
        void nextValue.finally(() => {
          if (renderSnapshotInFlight?.sourceStamp === sourceStamp) {
            renderSnapshotInFlight = undefined;
          }
        });
      }
      return renderSnapshotCache.value;
    }
    if (renderSnapshotInFlight?.sourceStamp === sourceStamp) {
      return renderSnapshotInFlight.value;
    }

    const nextValue = buildReadModelSnapshot(sourceStamp);
    renderSnapshotInFlight = { sourceStamp, value: nextValue };
    try {
      return await nextValue;
    } finally {
      if (renderSnapshotInFlight?.sourceStamp === sourceStamp) {
        renderSnapshotInFlight = undefined;
      }
    }
  }

  async function readReadModelSnapshotWithLiveSessions(toolClient: ToolClient): Promise<ReadModelSnapshot> {
    const snapshotPromise = readReadModelSnapshot();
    const livePromise = loadCachedLiveSessions(toolClient);

    try {
      const [snapshot, live] = await Promise.all([snapshotPromise, livePromise]);
      const sessions = mapSessionsListToSummariesImpl(live);
      if (sessions.length === 0) return snapshot;

      const liveStatuses: ReadModelSnapshot["statuses"] = [];
      for (const item of live.sessions ?? []) {
        const sessionKey = item.sessionKey ?? item.key;
        if (!sessionKey) continue;
        const updatedAt =
          typeof item.updatedAt === "string" && !Number.isNaN(Date.parse(item.updatedAt))
            ? item.updatedAt
            : typeof item.updatedAtMs === "number" && Number.isFinite(item.updatedAtMs)
              ? new Date(item.updatedAtMs).toISOString()
              : new Date().toISOString();
        liveStatuses.push({
          sessionKey,
          model: item.model,
          tokensIn: item.inputTokens,
          tokensOut: item.outputTokens,
          cost: undefined,
          updatedAt,
        });
      }

      const sessionsByKey = new Map(snapshot.sessions.map((item) => [item.sessionKey, item]));
      for (const liveSession of sessions) {
        const existing = sessionsByKey.get(liveSession.sessionKey);
        sessionsByKey.set(liveSession.sessionKey, {
          ...existing,
          ...liveSession,
          label: liveSession.label ?? existing?.label,
          agentId: liveSession.agentId ?? existing?.agentId,
          lastMessageAt: liveSession.lastMessageAt ?? existing?.lastMessageAt,
        });
      }

      const statusesByKey = new Map(snapshot.statuses.map((item) => [item.sessionKey, item]));
      for (const liveStatus of liveStatuses) {
        const existing = statusesByKey.get(liveStatus.sessionKey);
        statusesByKey.set(liveStatus.sessionKey, {
          ...existing,
          ...liveStatus,
          model: liveStatus.model ?? existing?.model,
          tokensIn: liveStatus.tokensIn ?? existing?.tokensIn,
          tokensOut: liveStatus.tokensOut ?? existing?.tokensOut,
          cost: existing?.cost,
          updatedAt: liveStatus.updatedAt ?? existing?.updatedAt ?? new Date().toISOString(),
        });
      }

      return {
        ...snapshot,
        sessions: [...sessionsByKey.values()].sort(options.compareSessionSummariesByLatest),
        statuses: [...statusesByKey.values()],
      };
    } catch (error) {
      console.warn("[mission-control] live session backfill failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return snapshotPromise;
    }
  }

  async function buildReadModelSnapshot(sourceStamp: string): Promise<ReadModelSnapshot> {
    const snapshotMissing = sourceStamp.includes(`${options.snapshotPath}:missing`);
    const readonlySnapshotToolClient = options.getReadonlySnapshotToolClient();
    if (options.readonlyMode && snapshotMissing && readonlySnapshotToolClient) {
      const adapter = new OpenClawReadonlyAdapter(readonlySnapshotToolClient);
      const value = await adapter.snapshot();
      renderSnapshotCache = {
        sourceStamp,
        value,
        expiresAt: Date.now() + options.snapshotCacheTtlMs,
      };
      return value;
    }

    const snapshot = await readSnapshotJsonWithRetry();
    const [projects, tasks, budgetPolicy] = await Promise.all([
      loadProjectStoreImpl(),
      loadTaskStoreImpl(),
      loadBudgetPolicyImpl(),
    ]);

    if (budgetPolicy.issues.length > 0) {
      console.warn("[mission-control] budget policy issues", {
        path: budgetPolicy.path,
        issues: budgetPolicy.issues,
      });
    }

    const sessions = Array.isArray(snapshot.sessions) ? snapshot.sessions : [];
    const statuses = Array.isArray(snapshot.statuses) ? snapshot.statuses : [];

    const value = {
      sessions,
      statuses,
      cronJobs: Array.isArray(snapshot.cronJobs) ? snapshot.cronJobs : [],
      approvals: Array.isArray(snapshot.approvals) ? snapshot.approvals : [],
      projects,
      projectSummaries: computeProjectSummaries(projects, tasks),
      tasks,
      tasksSummary: computeTasksSummary(tasks, projects.projects.length),
      budgetSummary: computeBudgetSummary(sessions, statuses, tasks, projects, budgetPolicy.policy),
      generatedAt:
        typeof snapshot.generatedAt === "string" && !Number.isNaN(Date.parse(snapshot.generatedAt))
          ? snapshot.generatedAt
          : new Date().toISOString(),
    } satisfies ReadModelSnapshot;
    renderSnapshotCache = {
      sourceStamp,
      value,
      expiresAt: Date.now() + options.snapshotCacheTtlMs,
    };
    return value;
  }

  async function readSnapshotJsonWithRetry(): Promise<Partial<ReadModelSnapshot>> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return JSON.parse(await options.readSnapshotRaw()) as Partial<ReadModelSnapshot>;
      } catch (error) {
        if (attempt === 2) throw error;
        await delay(25 * (attempt + 1));
      }
    }
    return options.buildDefaultSnapshot();
  }

  async function loadCachedLiveSessions(
    toolClient: ToolClient,
  ): Promise<Awaited<ReturnType<ToolClient["sessionsList"]>>> {
    const now = Date.now();
    if (renderLiveSessionsCache && renderLiveSessionsCache.expiresAt > now) {
      return renderLiveSessionsCache.value;
    }
    if (renderLiveSessionsCache) {
      if (!renderLiveSessionsInFlight) {
        const nextValue = toolClient.sessionsList();
        renderLiveSessionsInFlight = nextValue;
        void nextValue
          .then((value) => {
            renderLiveSessionsCache = {
              value,
              expiresAt: Date.now() + options.liveSessionsCacheTtlMs,
            };
          })
          .finally(() => {
            renderLiveSessionsInFlight = undefined;
          });
      }
      return renderLiveSessionsCache.value;
    }
    if (renderLiveSessionsInFlight) {
      return renderLiveSessionsInFlight;
    }

    const nextValue = toolClient.sessionsList();
    renderLiveSessionsInFlight = nextValue;
    try {
      const value = await nextValue;
      renderLiveSessionsCache = {
        value,
        expiresAt: Date.now() + options.liveSessionsCacheTtlMs,
      };
      return value;
    } finally {
      renderLiveSessionsInFlight = undefined;
    }
  }

  return {
    readReadModelSourceStamp,
    readReadModelSnapshot,
    readReadModelSnapshotWithLiveSessions,
  };
}

function isFsNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

async function readOptionalFileStamp(path: string): Promise<string> {
  try {
    const file = await stat(path);
    return `${path}:${file.mtimeMs}:${file.size}`;
  } catch (error) {
    if (isFsNotFound(error)) return `${path}:missing`;
    return `${path}:error`;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
