import type {
  ApprovalsActionResponse,
  ApprovalsApproveRequest,
  ApprovalsGetResponse,
  ApprovalsRejectRequest,
  CronListResponse,
  SessionStatusResponse,
  SessionsHistoryRequest,
  SessionsHistoryResponse,
  SessionsListItem,
  SessionsListResponse,
} from "../contracts/openclaw-tools";
import { APPROVAL_ACTIONS_ENABLED } from "../config";
import type { ToolClient } from "./tool-client";

/**
 * DEMO_MODE=true 时使用的内置示例数据客户端。
 * 让没有安装 OpenClaw 的环境也能预览控制中心 UI（等价 Go 版的 --demo）。
 * 数据是只读示例，不会触发任何 CLI / 磁盘写入。
 */

const NOW = Date.now();
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

const DEMO_SESSIONS: SessionsListItem[] = [
  {
    sessionKey: "demo-session-1",
    label: "优化控制中心仪表盘",
    agentId: "main",
    state: "running",
    active: true,
    model: "claude-sonnet-4",
    updatedAtMs: NOW - 12 * MIN,
    inputTokens: 96_000,
    outputTokens: 32_450,
    totalTokens: 128_450,
  },
  {
    sessionKey: "demo-session-2",
    label: "调研 Gateway 协议",
    agentId: "research",
    state: "running",
    active: true,
    model: "gpt-5.2",
    updatedAtMs: NOW - 90 * MIN,
    inputTokens: 52_100,
    outputTokens: 22_110,
    totalTokens: 74_210,
  },
  {
    sessionKey: "demo-session-3",
    label: "整理本周发布说明",
    agentId: "main",
    state: "idle",
    active: false,
    model: "claude-sonnet-4",
    updatedAtMs: NOW - 3 * HOUR,
    inputTokens: 33_400,
    outputTokens: 8_430,
    totalTokens: 41_830,
  },
  {
    sessionKey: "demo-session-4",
    label: "撰写 LOCAL_SETUP 文档",
    agentId: "docs",
    state: "idle",
    active: false,
    model: "gpt-5.2",
    updatedAtMs: NOW - 2 * HOUR,
    inputTokens: 18_200,
    outputTokens: 4_700,
    totalTokens: 22_900,
  },
];

const DEMO_CRON = [
  { id: "cron-1", name: "每日用量快照", enabled: true, nextRunAt: new Date(NOW + 10 * HOUR).toISOString() },
  { id: "cron-2", name: "会话清理", enabled: true, nextRunAt: new Date(NOW + 3 * DAY).toISOString() },
  { id: "cron-3", name: "订阅账单核对", enabled: false, nextRunAt: undefined },
];

const DEMO_APPROVALS = [
  {
    id: "appr-1",
    sessionKey: "demo-session-1",
    agentId: "main",
    command: "git push origin main",
    requestedAt: new Date(NOW - 4 * MIN).toISOString(),
  },
  {
    id: "appr-2",
    sessionKey: "demo-session-2",
    agentId: "research",
    command: "web_search: openclaw gateway protocol",
    requestedAt: new Date(NOW - 9 * MIN).toISOString(),
  },
];

export class DemoToolClient implements ToolClient {
  async sessionsList(): Promise<SessionsListResponse> {
    return { sessions: DEMO_SESSIONS };
  }

  async sessionStatus(sessionKey: string): Promise<SessionStatusResponse> {
    const item = DEMO_SESSIONS.find((s) => (s.sessionKey ?? s.key) === sessionKey);
    return { rawText: item?.state ?? "idle" };
  }

  async sessionsHistory(_request: SessionsHistoryRequest): Promise<SessionsHistoryResponse> {
    return { rawText: "", json: { history: [] } };
  }

  async cronList(): Promise<CronListResponse> {
    return { jobs: DEMO_CRON };
  }

  async approvalsGet(): Promise<ApprovalsGetResponse> {
    return { rawText: "", json: { pending: DEMO_APPROVALS } };
  }

  async approvalsApprove(request: ApprovalsApproveRequest): Promise<ApprovalsActionResponse> {
    if (!APPROVAL_ACTIONS_ENABLED) {
      throw new Error(
        `approvalsApprove is disabled by safety gate (APPROVAL_ACTIONS_ENABLED=${String(
          APPROVAL_ACTIONS_ENABLED,
        )}).`,
      );
    }
    return { ok: false, action: "approve", approvalId: request.approvalId, reason: request.reason, rawText: "demo client has no approve capability" };
  }

  async approvalsReject(request: ApprovalsRejectRequest): Promise<ApprovalsActionResponse> {
    if (!APPROVAL_ACTIONS_ENABLED) {
      throw new Error(
        `approvalsReject is disabled by safety gate (APPROVAL_ACTIONS_ENABLED=${String(
          APPROVAL_ACTIONS_ENABLED,
        )}).`,
      );
    }
    return { ok: false, action: "reject", approvalId: request.approvalId, reason: request.reason, rawText: "demo client has no reject capability" };
  }
}
