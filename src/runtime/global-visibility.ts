import { readTaskHeartbeatRuns } from "./task-heartbeat";
import { listSessionConversations } from "./session-conversations";
import type { ToolClient } from "../clients/tool-client";
import type { AgentRunState, ReadModelSnapshot } from "../types";
import type { UiLanguage } from "./ui-preferences";

export type GlobalVisibilityTaskStatus = "done" | "not_done";
export type GlobalVisibilityTaskType = "cron" | "heartbeat" | "current_task" | "tool_call";

export interface GlobalVisibilityTaskRow {
  taskType: GlobalVisibilityTaskType;
  taskTypeLabel: string;
  taskName: string;
  executor: string;
  currentAction: string;
  nextRun: string;
  latestResult: string;
  status: GlobalVisibilityTaskStatus;
  nextAction: string;
  detailsHref: string;
  detailsLabel: string;
}

export interface GlobalVisibilityViewModel {
  tasks: GlobalVisibilityTaskRow[];
  doneCount: number;
  notDoneCount: number;
  noTaskMessage: string;
  signalCounts: {
    schedule: number;
    heartbeat: number;
    currentTasks: number;
    toolCalls: number;
  };
}

export interface OpenclawCronJobSummary {
  jobId: string;
  name: string;
  enabled: boolean;
  owner: string;
  ownerAgentId?: string;
  purpose: string;
  scheduleLabel: string;
  sourcePath: string;
}

interface CronOverviewLike {
  nextRunAt?: string;
  jobs: Array<{
    jobId: string;
    enabled: boolean;
    nextRunAt?: string;
  }>;
}

interface BuildGlobalVisibilityInput {
  currentTasksCount?: number;
  strongTaskEvidenceCount?: number;
  followupTaskEvidenceCount?: number;
  weakTaskEvidenceCount?: number;
  toolCallsCount?: number;
}

interface BuildGlobalVisibilityDeps {
  t: (en: string, zh: string) => string;
  cronOverview: CronOverviewLike;
  openclawCronJobs: OpenclawCronJobSummary[];
  formatExecutorAgentLabel: (agentId: string, language: UiLanguage) => string;
  cronRuntimePurpose: (jobId: string, language: UiLanguage) => string;
  summarizeNames: (items: string[], language: UiLanguage, emptyLabel: string) => string;
  buildGlobalVisibilityDetailHref: (taskType: GlobalVisibilityTaskType, language: UiLanguage) => string;
}

export async function buildGlobalVisibilityViewModel(
  snapshot: ReadModelSnapshot,
  toolClient: ToolClient,
  language: UiLanguage,
  deps: BuildGlobalVisibilityDeps,
  input: BuildGlobalVisibilityInput = {},
): Promise<GlobalVisibilityViewModel> {
  const inProgressCount = snapshot.tasksSummary.inProgress ?? 0;
  const blockedCount = snapshot.tasksSummary.blocked ?? 0;
  const strongTaskEvidenceCount =
    typeof input.strongTaskEvidenceCount === "number"
      ? input.strongTaskEvidenceCount
      : Math.max(0, inProgressCount - blockedCount);
  const followupTaskEvidenceCount =
    typeof input.followupTaskEvidenceCount === "number" ? input.followupTaskEvidenceCount : 0;
  const weakTaskEvidenceCount =
    typeof input.weakTaskEvidenceCount === "number" ? input.weakTaskEvidenceCount : blockedCount;
  const currentTasksCount =
    input.currentTasksCount ??
    Math.max(
      inProgressCount + blockedCount,
      strongTaskEvidenceCount + followupTaskEvidenceCount + weakTaskEvidenceCount,
    );
  const hasWeakEvidence = weakTaskEvidenceCount > 0;
  const toolCallsCount =
    typeof input.toolCallsCount === "number"
      ? input.toolCallsCount
      : await countRecentToolCalls(snapshot, toolClient);

  const nonHeartbeatRuntimeCronJobs = deps.cronOverview.jobs.filter(
    (job) => !job.jobId.toLowerCase().includes("heartbeat"),
  );
  const heartbeatJobs = deps.cronOverview.jobs.filter((job) =>
    job.jobId.toLowerCase().includes("heartbeat"),
  );
  const enabledRuntimeCronJobs = nonHeartbeatRuntimeCronJobs.filter((job) => job.enabled);
  const enabledOpenclawCronJobs = deps.openclawCronJobs.filter((job) => job.enabled);
  const enabledCronCount = new Set([
    ...enabledRuntimeCronJobs.map((job) => job.jobId),
    ...enabledOpenclawCronJobs.map((job) => job.jobId),
  ]).size;
  const enabledHeartbeatCount = heartbeatJobs.filter((job) => job.enabled).length;
  const heartbeatEnabled = heartbeatJobs.some((job) => job.enabled);
  const latestHeartbeatRun = (await readTaskHeartbeatRuns(1)).runs[0];
  const cronTaskName =
    enabledCronCount > 0
      ? deps.t(`${enabledCronCount} jobs enabled`, `已启用 ${enabledCronCount} 个任务`)
      : deps.t("No timed jobs", "暂无定时任务");
  const cronOwner =
    enabledOpenclawCronJobs.length > 0
      ? deps.summarizeNames(
          enabledOpenclawCronJobs.map((job) => job.owner),
          language,
          deps.t("Scheduler", "调度器"),
        )
      : deps.formatExecutorAgentLabel("system-cron", language);
  const cronPurpose =
    (enabledOpenclawCronJobs[0]?.purpose
      ? sanitizeCronPurposeText(enabledOpenclawCronJobs[0].purpose, deps.t, 56)
      : "") ||
    (enabledRuntimeCronJobs[0]
      ? deps.cronRuntimePurpose(enabledRuntimeCronJobs[0].jobId, language)
      : deps.t("No timed job is running.", "当前没有定时任务在运行。"));
  const cronNextRun =
    nonHeartbeatRuntimeCronJobs.find((job) => job.enabled)?.nextRunAt ??
    deps.cronOverview.nextRunAt ??
    deps.t("Not scheduled", "未排程");
  const heartbeatNextRun =
    heartbeatJobs.find((job) => job.enabled)?.nextRunAt ??
    heartbeatJobs[0]?.nextRunAt ??
    deps.t("Not scheduled", "未排程");
  const heartbeatTaskName = deps.t("Task heartbeat service", "任务心跳服务");
  const heartbeatLatestResult = heartbeatEnabled
    ? latestHeartbeatRun
      ? deps.t(
          `Last heartbeat: selected ${latestHeartbeatRun.selected} tasks, started ${latestHeartbeatRun.executed}.`,
          `最近心跳：挑出 ${latestHeartbeatRun.selected} 个任务，启动 ${latestHeartbeatRun.executed} 个。`,
        )
      : deps.t(
          `Active heartbeat checks: ${enabledHeartbeatCount}.`,
          `已开启任务心跳：${enabledHeartbeatCount} 个。`,
        )
    : deps.t("No heartbeat check yet.", "还没有任务心跳记录。");
  const heartbeatPurpose = deps.t(
    "Check assigned tasks and start the picked ones.",
    "检查已分配任务，并启动挑中的任务。",
  );
  const scheduleReady = enabledCronCount > 0;

  const rows: GlobalVisibilityTaskRow[] = [
    {
      taskType: "cron",
      taskTypeLabel: deps.t("Timed jobs", "定时任务"),
      taskName: cronTaskName,
      executor: cronOwner,
      currentAction: scheduleReady
        ? deps.t(`Now running: ${cronPurpose}`, `正在执行：${cronPurpose}`)
        : deps.t("Timed jobs are off.", "还没有设置定时任务。"),
      nextRun: cronNextRun,
      latestResult: scheduleReady
        ? deps.t(
            `Active timed jobs: ${enabledCronCount}.`,
            `已开启定时任务：${enabledCronCount} 个。`,
          )
        : deps.t("No timed job yet.", "还没有定时任务记录。"),
      status: scheduleReady ? "done" : "not_done",
      nextAction: scheduleReady
        ? deps.t(
            "Keep timed jobs on and keep each job goal clear.",
            "保持定时任务开启，并确认每个任务目标清楚。",
          )
        : deps.t("Turn on one timed job.", "先添加一个定时任务。"),
      detailsHref: deps.buildGlobalVisibilityDetailHref("cron", language),
      detailsLabel: deps.t("See timed jobs", "查看定时任务"),
    },
    {
      taskType: "heartbeat",
      taskTypeLabel: deps.t("Heartbeat", "任务心跳"),
      taskName: heartbeatTaskName,
      executor: deps.formatExecutorAgentLabel("task-heartbeat-worker", language),
      currentAction: heartbeatEnabled
        ? deps.t(
            `Heartbeat is on: ${heartbeatPurpose}`,
            `任务心跳已开启：${heartbeatPurpose}`,
          )
        : deps.t("Heartbeat is off.", "还没有设置任务心跳。"),
      nextRun: heartbeatNextRun,
      latestResult: heartbeatLatestResult,
      status: heartbeatEnabled ? "done" : "not_done",
      nextAction: heartbeatEnabled
        ? deps.t(
            "Check picked tasks and confirm the choices look right.",
            "查看挑出的任务，确认挑选结果是否合理。",
          )
        : deps.t("Turn on heartbeat.", "在定时任务里开启心跳。"),
      detailsHref: deps.buildGlobalVisibilityDetailHref("heartbeat", language),
      detailsLabel: deps.t("See heartbeat checks", "查看任务心跳"),
    },
    {
      taskType: "current_task",
      taskTypeLabel: deps.t("Current tasks", "当前任务"),
      taskName: deps.t("Current tasks", "当前任务"),
      executor: deps.t("Task owners", "任务智能体"),
      currentAction:
        currentTasksCount > 0
          ? hasWeakEvidence
            ? deps.t(
                "Some current tasks still need follow-up.",
                "有些当前任务还需要继续跟进。",
              )
            : deps.t(
                "Current tasks are visible in runtime.",
                "当前任务已经能在运行时里看见。",
              )
          : deps.t("No current task signal is visible now.", "当前还没有看见任务执行信号。"),
      nextRun: deps.t("Live update", "实时更新"),
      latestResult:
        currentTasksCount > 0
          ? hasWeakEvidence
            ? deps.t(
                `${strongTaskEvidenceCount} confirmed live, ${followupTaskEvidenceCount} need follow-up, ${weakTaskEvidenceCount} need inspection.`,
                `${strongTaskEvidenceCount} 个已确认在跑，${followupTaskEvidenceCount} 个需跟进，${weakTaskEvidenceCount} 个需排查。`,
              )
            : deps.t(
                `${currentTasksCount} current tasks are backed by runtime signals.`,
                `${currentTasksCount} 个当前任务已有运行信号支撑。`,
              )
          : deps.t("No current task signal yet.", "当前还没有任务执行信号。"),
      status: currentTasksCount > 0 && !hasWeakEvidence ? "done" : "not_done",
      nextAction:
        currentTasksCount > 0
          ? hasWeakEvidence
            ? deps.t(
                "Open current tasks and inspect the follow-up items first.",
                "打开当前任务，先检查需要跟进的项。",
              )
            : deps.t("Keep following the runtime signals.", "继续盯住运行时信号即可。")
          : deps.t(
              "Start one task and let runtime evidence appear first.",
              "先启动一个任务，让运行证据出现。",
            ),
      detailsHref: deps.buildGlobalVisibilityDetailHref("current_task", language),
      detailsLabel: deps.t("See current tasks", "查看当前任务"),
    },
    {
      taskType: "tool_call",
      taskTypeLabel: deps.t("Tool calls", "工具调用"),
      taskName: deps.t("Tool calls", "工具调用"),
      executor: deps.t("Active sessions", "活跃会话"),
      currentAction:
        toolCallsCount > 0
          ? deps.t("Tools were used recently.", "最近有工具在使用。")
          : deps.t("No tool use yet.", "最近没有工具在使用。"),
      nextRun: deps.t("Live update", "实时更新"),
      latestResult:
        toolCallsCount > 0
          ? deps.t(
              `Tool calls in recent activity: ${toolCallsCount}.`,
              `最近工具调用：${toolCallsCount} 次。`,
            )
          : deps.t("No tool calls yet.", "尚无工具调用记录。"),
      status: toolCallsCount > 0 ? "done" : "not_done",
      nextAction:
        toolCallsCount > 0
          ? deps.t("Review results and keep going.", "看下结果后继续。")
          : deps.t("Run one small tool step.", "先跑一次小工具步骤。"),
      detailsHref: deps.buildGlobalVisibilityDetailHref("tool_call", language),
      detailsLabel: deps.t("See tool calls", "查看工具调用"),
    },
  ];

  const doneCount = rows.filter((row) => row.status === "done").length;
  return {
    tasks: rows,
    doneCount,
    notDoneCount: rows.length - doneCount,
    noTaskMessage: deps.t(
      "No timed jobs, heartbeat, current tasks, or tool calls yet.",
      "暂无定时任务、任务心跳、当前任务或工具调用。",
    ),
    signalCounts: {
      schedule: enabledCronCount,
      heartbeat: enabledHeartbeatCount,
      currentTasks: currentTasksCount,
      toolCalls: toolCallsCount,
    },
  };
}

async function countRecentToolCalls(snapshot: ReadModelSnapshot, toolClient: ToolClient): Promise<number> {
  if (!Array.isArray(snapshot.sessions) || snapshot.sessions.length === 0) return 0;
  const recentSessions = await listSessionConversations({
    snapshot,
    client: toolClient,
    filters: {},
    page: 1,
    pageSize: 20,
    historyLimit: 6,
  });
  return recentSessions.items.reduce((sum, item) => {
    if (typeof item.toolEventCount === "number") return sum + item.toolEventCount;
    return sum + (item.latestKind === "tool_event" ? 1 : 0);
  }, 0);
}

function sanitizeCronPurposeText(
  input: string,
  t: (en: string, zh: string) => string,
  maxLength = 72,
): string {
  const normalized = input.replace(/\s+/g, " ").trim();
  if (!normalized) return t("No purpose description.", "未提供任务目的。");
  const lower = normalized.toLowerCase();
  if (
    lower.includes("run exactly one command via exec tool") ||
    lower.includes("cd /") ||
    lower.includes("&&") ||
    lower.includes("/opt/homebrew/") ||
    lower.includes("/users/")
  ) {
    return t("Run one automation script and update status.", "执行一次自动化脚本并更新状态。");
  }
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}
