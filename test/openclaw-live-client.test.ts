import assert from "node:assert/strict";
import test from "node:test";
import { OpenClawLiveClient } from "../src/clients/openclaw-live-client";

test("sessionsList prefers local session stores over the slower CLI listing", async () => {
  let cliCount = 0;
  const client = new OpenClawLiveClient({
    loadSessionsFromStores: async () => ({
      sessions: [
        {
          sessionKey: "agent:main:main",
          key: "agent:main:main",
          sessionId: "local-1",
          agentId: "main",
          updatedAtMs: 1773300000000,
          sessionFile: "/tmp/local-1.jsonl",
          state: "running",
          active: true,
          model: "gpt-5.4",
          inputTokens: 1,
          outputTokens: 2,
          totalTokens: 3,
        },
      ],
    }),
    runSessionsListJson: async () => {
      cliCount += 1;
      return { sessions: [] };
    },
  });

  const result = await client.sessionsList();

  assert.equal(cliCount, 0);
  assert.equal(result.sessions?.length, 1);
  assert.equal(result.sessions?.[0]?.sessionKey, "agent:main:main");
});

test("sessionsList falls back to CLI listing when local stores are empty", async () => {
  let cliCount = 0;
  const client = new OpenClawLiveClient({
    loadSessionsFromStores: async () => ({ sessions: [] }),
    runSessionsListJson: async () => {
      cliCount += 1;
      return {
        sessions: [
          {
            key: "agent:main:main",
            sessionId: "cli-1",
            agentId: "main",
            updatedAt: 1773300000000,
            sessionFile: "/tmp/cli-1.jsonl",
            state: "running",
            active: true,
            model: "gpt-5.4",
            inputTokens: 4,
            outputTokens: 5,
            totalTokens: 9,
          },
        ],
      };
    },
  });

  const result = await client.sessionsList();

  assert.equal(cliCount, 1);
  assert.equal(result.sessions?.length, 1);
  assert.equal(result.sessions?.[0]?.sessionId, "cli-1");
});

test("sessionsHistory returns file-backed history without probing CLI support", async () => {
  let fileReadCount = 0;
  let probeCount = 0;
  const sessionKey = "agent:main:main";
  const client = new OpenClawLiveClient({
    readSessionHistoryFile: async () => {
      fileReadCount += 1;
      return {
        rawText: '{"event":"accepted"}',
        json: { history: [{ event: "accepted" }] },
      };
    },
    probeSessionHistoryCliSupport: async () => {
      probeCount += 1;
      return false;
    },
  });

  ((client as unknown) as { sessionCache: Map<string, { sessionFile?: string }> }).sessionCache.set(sessionKey, {
    sessionFile: "/tmp/test-session.jsonl",
  });

  const result = await client.sessionsHistory({ sessionKey, limit: 6 });

  assert.equal(fileReadCount, 1);
  assert.equal(probeCount, 0);
  assert.equal(result.rawText, '{"event":"accepted"}');
  assert.deepEqual(result.json, { history: [{ event: "accepted" }] });
});

test("sessionsHistory caches unsupported CLI history detection after file fallback misses", async () => {
  let fileReadCount = 0;
  let probeCount = 0;
  let jsonAttemptCount = 0;
  const sessionKey = "agent:main:main";
  const client = new OpenClawLiveClient({
    readSessionHistoryFile: async () => {
      fileReadCount += 1;
      return undefined;
    },
    probeSessionHistoryCliSupport: async () => {
      probeCount += 1;
      return false;
    },
    runSessionHistoryJson: async () => {
      jsonAttemptCount += 1;
      return { history: [{ event: "accepted" }] };
    },
  });

  ((client as unknown) as { sessionCache: Map<string, { sessionFile?: string }> }).sessionCache.set(sessionKey, {
    sessionFile: "/tmp/missing-session.jsonl",
  });

  const first = await client.sessionsHistory({ sessionKey, limit: 6 });
  const second = await client.sessionsHistory({ sessionKey, limit: 6 });

  assert.equal(fileReadCount, 2);
  assert.equal(probeCount, 1);
  assert.equal(jsonAttemptCount, 0);
  assert.equal(first.rawText, "");
  assert.equal(second.rawText, "");
});

test("sessionsHistory still uses CLI when support probe passes and file history is unavailable", async () => {
  let jsonAttemptCount = 0;
  const sessionKey = "agent:main:main";
  const client = new OpenClawLiveClient({
    readSessionHistoryFile: async () => undefined,
    probeSessionHistoryCliSupport: async () => true,
    runSessionHistoryJson: async () => {
      jsonAttemptCount += 1;
      return { history: [{ role: "assistant", content: "ready" }] };
    },
  });

  ((client as unknown) as { sessionCache: Map<string, { sessionFile?: string }> }).sessionCache.set(sessionKey, {
    sessionFile: "/tmp/missing-session.jsonl",
  });

  const result = await client.sessionsHistory({ sessionKey, limit: 6 });

  assert.equal(jsonAttemptCount, 1);
  assert.deepEqual(result.json, { history: [{ role: "assistant", content: "ready" }] });
  assert.equal(result.rawText, JSON.stringify({ history: [{ role: "assistant", content: "ready" }] }));
});
