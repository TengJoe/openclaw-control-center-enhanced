import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createUiReadModelCache } from "../src/runtime/ui-read-model-cache";
import type { ToolClient } from "../src/clients/tool-client";
import type { ReadModelSnapshot } from "../src/types";

const EMPTY_PROJECT_STORE = {
  projects: [],
  updatedAt: "2026-03-13T00:00:00.000Z",
} as const;

const EMPTY_TASK_STORE = {
  tasks: [],
  agentBudgets: [],
  updatedAt: "2026-03-13T00:00:00.000Z",
} as const;

const EMPTY_BUDGET_POLICY = {
  policy: {
    defaults: { warnRatio: 0.8 },
    agent: {},
    project: {},
    task: {},
  },
  path: "/tmp/budgets.json",
  loadedFromFile: false,
  issues: [],
} as const;

class FakeToolClient implements ToolClient {
  constructor(
    private readonly listResult: Awaited<ReturnType<ToolClient["sessionsList"]>>,
  ) {}

  async sessionsList() {
    return this.listResult;
  }

  async sessionStatus() {
    return { rawText: "" };
  }

  async sessionsHistory() {
    return { rawText: "" };
  }

  async cronList() {
    return { jobs: [] };
  }

  async approvalsGet() {
    return { rawText: "" };
  }

  async approvalsApprove() {
    return { ok: false, action: "approve" as const, approvalId: "n/a", rawText: "" };
  }

  async approvalsReject() {
    return { ok: false, action: "reject" as const, approvalId: "n/a", rawText: "" };
  }
}

function buildDefaultSnapshot(): ReadModelSnapshot {
  return {
    sessions: [],
    statuses: [],
    cronJobs: [],
    approvals: [],
    projects: { ...EMPTY_PROJECT_STORE },
    projectSummaries: [],
    tasks: { ...EMPTY_TASK_STORE },
    tasksSummary: {
      projects: 0,
      tasks: 0,
      todo: 0,
      inProgress: 0,
      blocked: 0,
      done: 0,
      owners: 0,
      artifacts: 0,
    },
    budgetSummary: { total: 0, ok: 0, warn: 0, over: 0, evaluations: [] },
    generatedAt: "2026-03-13T00:00:00.000Z",
  };
}

async function withCacheFixture<T>(
  run: (input: {
    createFiles: () => Promise<{
      snapshotPath: string;
      projectsPath: string;
      tasksPath: string;
      budgetPolicyPath: string;
    }>;
  }) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "openclaw-ui-cache-"));
  try {
    return await run({
      createFiles: async () => {
        const runtimeDir = join(dir, "runtime");
        const snapshotPath = join(runtimeDir, "last-snapshot.json");
        const projectsPath = join(runtimeDir, "projects.json");
        const tasksPath = join(runtimeDir, "tasks.json");
        const budgetPolicyPath = join(runtimeDir, "budgets.json");
        await mkdir(runtimeDir, { recursive: true });
        await writeFile(snapshotPath, "{}\n", "utf8");
        await writeFile(projectsPath, "{}\n", "utf8");
        await writeFile(tasksPath, "{}\n", "utf8");
        await writeFile(budgetPolicyPath, "{}\n", "utf8");
        return { snapshotPath, projectsPath, tasksPath, budgetPolicyPath };
      },
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("ui read-model cache serves stale snapshot while refreshing in background", async () => {
  await withCacheFixture(async ({ createFiles }) => {
    const paths = await createFiles();
    let reads = 0;
    const cache = createUiReadModelCache({
      ...paths,
      snapshotCacheTtlMs: 40,
      liveSessionsCacheTtlMs: 10,
      readonlyMode: false,
      getReadonlySnapshotToolClient: () => undefined,
      buildDefaultSnapshot,
      compareSessionSummariesByLatest: () => 0,
      readSnapshotRaw: async () => {
        reads += 1;
        if (reads === 1) {
          return JSON.stringify({
            sessions: [],
            statuses: [],
            cronJobs: [],
            approvals: [],
            generatedAt: "2026-03-13T10:00:00.000Z",
          });
        }
        await new Promise((resolve) => setTimeout(resolve, 40));
        return JSON.stringify({
          sessions: [],
          statuses: [],
          cronJobs: [],
          approvals: [],
          generatedAt: "2026-03-13T10:05:00.000Z",
        });
      },
      loadProjectStore: async () => ({ ...EMPTY_PROJECT_STORE }),
      loadTaskStore: async () => ({ ...EMPTY_TASK_STORE }),
      loadBudgetPolicy: async () => ({ ...EMPTY_BUDGET_POLICY }),
    });

    const first = await cache.readReadModelSnapshot();
    assert.equal(first.generatedAt, "2026-03-13T10:00:00.000Z");

    await new Promise((resolve) => setTimeout(resolve, 50));
    const second = await cache.readReadModelSnapshot();
    assert.equal(second.generatedAt, "2026-03-13T10:00:00.000Z");

    await new Promise((resolve) => setTimeout(resolve, 60));
    const third = await cache.readReadModelSnapshot();
    assert.equal(third.generatedAt, "2026-03-13T10:05:00.000Z");
    assert.equal(reads, 2);
  });
});

test("ui read-model cache merges live session data onto cached snapshot", async () => {
  await withCacheFixture(async ({ createFiles }) => {
    const paths = await createFiles();
    const cache = createUiReadModelCache({
      ...paths,
      snapshotCacheTtlMs: 1000,
      liveSessionsCacheTtlMs: 1000,
      readonlyMode: false,
      getReadonlySnapshotToolClient: () => undefined,
      buildDefaultSnapshot,
      compareSessionSummariesByLatest: (a, b) =>
        (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""),
      readSnapshotRaw: async () =>
        JSON.stringify({
          sessions: [
            {
              sessionKey: "agent:main:main",
              agentId: "main",
              state: "idle",
              lastMessageAt: "2026-03-13T10:00:00.000Z",
              label: "Main",
            },
          ],
          statuses: [
            {
              sessionKey: "agent:main:main",
              updatedAt: "2026-03-13T10:00:00.000Z",
            },
          ],
          cronJobs: [],
          approvals: [],
          generatedAt: "2026-03-13T10:00:00.000Z",
        }),
      loadProjectStore: async () => ({ ...EMPTY_PROJECT_STORE }),
      loadTaskStore: async () => ({ ...EMPTY_TASK_STORE }),
      loadBudgetPolicy: async () => ({ ...EMPTY_BUDGET_POLICY }),
      mapSessionsListToSummaries: () => [
        {
          sessionKey: "agent:main:main",
          agentId: "main",
          state: "running",
          lastMessageAt: "2026-03-13T10:03:00.000Z",
          label: "Main live",
        },
      ],
    });

    const snapshot = await cache.readReadModelSnapshotWithLiveSessions(
      new FakeToolClient({
        sessions: [
          {
            key: "agent:main:main",
            sessionKey: "agent:main:main",
            agentId: "main",
            state: "running",
            updatedAtMs: Date.parse("2026-03-13T10:03:00.000Z"),
            inputTokens: 12,
            outputTokens: 8,
            totalTokens: 20,
            model: "gpt-5.4",
          },
        ],
      }),
    );

    assert.equal(snapshot.sessions.length, 1);
    assert.equal(snapshot.sessions[0]?.state, "running");
    assert.equal(snapshot.sessions[0]?.label, "Main live");
    assert.equal(snapshot.statuses.length, 1);
    assert.equal(snapshot.statuses[0]?.model, "gpt-5.4");
    assert.equal(snapshot.statuses[0]?.tokensIn, 12);
    assert.equal(snapshot.statuses[0]?.tokensOut, 8);
  });
});
