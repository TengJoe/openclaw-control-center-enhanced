import assert from "node:assert/strict";
import test from "node:test";
import type { ReadModelSnapshot } from "../src/types";

function fakeSnapshot(): ReadModelSnapshot {
  return {
    generatedAt: "2026-08-10T00:00:00.000Z",
    sessions: [
      {
        sessionKey: "sess-1",
        label: "Research <script>alert(1)</script>",
        agentId: "agent-alpha",
        state: "running",
        lastMessageAt: "2026-08-10T00:05:00.000Z",
      },
      {
        sessionKey: "sess-2",
        label: "Approval wait",
        agentId: "agent-beta",
        state: "waiting_approval",
        lastMessageAt: "2026-08-10T00:04:00.000Z",
      },
      {
        sessionKey: "sess-3",
        state: "idle",
      },
    ],
    statuses: [
      {
        sessionKey: "sess-1",
        model: "gpt-5.6",
        tokensIn: 1200,
        tokensOut: 340,
        cost: 0.02,
        updatedAt: "2026-08-10T00:05:00.000Z",
      },
      {
        sessionKey: "sess-2",
        model: "hy3",
        tokensIn: 90,
        tokensOut: 30,
        updatedAt: "2026-08-10T00:04:00.000Z",
      },
    ],
  } as unknown as ReadModelSnapshot;
}

test("sessions section renders live session cards with badges, model and tokens", async () => {
  const { renderSessionsSectionForSmoke } = await import("../src/ui/server");
  const html = renderSessionsSectionForSmoke(fakeSnapshot(), "en");
  assert(html.includes("Sessions"));
  assert(html.includes("Research"));
  assert(html.includes("Running"));
  assert(html.includes("Waiting approval"));
  assert(html.includes("gpt-5.6"));
  assert(html.includes("1,200"));
  assert(html.includes("sess-3"));
  assert(html.includes("Idle"));
});

test("sessions section escapes user-controlled session labels", async () => {
  const { renderSessionsSectionForSmoke } = await import("../src/ui/server");
  const html = renderSessionsSectionForSmoke(fakeSnapshot(), "en");
  assert(!html.includes("<script>alert(1)</script>"));
  assert(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
});

test("sessions section shows an empty state without sessions", async () => {
  const { renderSessionsSectionForSmoke } = await import("../src/ui/server");
  const snapshot = {
    generatedAt: "2026-08-10T00:00:00.000Z",
    sessions: [],
    statuses: [],
  } as unknown as ReadModelSnapshot;
  const html = renderSessionsSectionForSmoke(snapshot, "en");
  assert(html.includes("No session signals yet"));
});
