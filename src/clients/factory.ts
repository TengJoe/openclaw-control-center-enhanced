import { DemoToolClient } from "./demo-client";
import { OpenClawLiveClient } from "./openclaw-live-client";
import type { ToolClient } from "./tool-client";

export function createToolClient(): ToolClient {
  if (process.env.DEMO_MODE === "true") {
    return new DemoToolClient();
  }
  return new OpenClawLiveClient();
}
