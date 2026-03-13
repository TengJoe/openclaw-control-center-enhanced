import assert from "node:assert/strict";
import test from "node:test";
import { resolveOverallStatus } from "../src/runtime/healthz";

test("healthz keeps overall status green when snapshot is ok and monitor is ok", () => {
  assert.equal(resolveOverallStatus("ok", "ok"), "ok");
});

test("healthz degrades to warn when snapshot is ok and monitor is warn", () => {
  assert.equal(resolveOverallStatus("ok", "warn"), "warn");
});

test("healthz degrades to stale when either snapshot or monitor is stale", () => {
  assert.equal(resolveOverallStatus("stale", "ok"), "stale");
  assert.equal(resolveOverallStatus("ok", "stale"), "stale");
});

test("healthz treats missing monitor as warn by default", () => {
  assert.equal(resolveOverallStatus("ok", "missing"), "warn");
});
