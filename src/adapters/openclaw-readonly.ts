import {
  mapApprovalsGetToSummaries,
  mapCronListToSummaries,
  mapSessionsListToSummaries,
} from "../mappers/openclaw-mappers";
import { parseSessionStatusText } from "../mappers/session-status-parser";
import type {
  ApprovalSummary,
  CronJobSummary,
  ReadModelSnapshot,
  SessionStatusSnapshot,
  SessionSummary,
} from "../types";
import type { ToolClient } from "../clients/tool-client";
import { computeBudgetSummary } from "../runtime/budget-governance";
import { loadBudgetPolicy } from "../runtime/budget-policy";
import { loadProjectStore } from "../runtime/project-store";
import { computeProjectSummaries } from "../runtime/project-summary";
import { loadTaskStore } from "../runtime/task-store";
import { computeTasksSummary } from "../runtime/task-summary";

/**
 * Official-first adapter (read path only).
 *
 * In readonly mode it uses a no-op client.
 * In live mode it uses a client that is currently guarded and not enabled yet.
 */
export class OpenClawReadonlyAdapter {
  constructor(private readonly client: ToolClient) {}

  async listSessions(): Promise<SessionSummary[]> {
    const raw = await this.client.sessionsList();
    return mapSessionsListToSummaries(raw);
  }

  async listSessionStatuses(sessionKeys: string[]): Promise<SessionStatusSnapshot[]> {
    const statuses = await Promise.all(
      sessionKeys.map(async (sessionKey) => {
        const raw = await this.client.sessionStatus(sessionKey);
        return parseSessionStatusText(sessionKey, raw.rawText);
      }),
    );

    return statuses;
  }

  async listCronJobs(): Promise<CronJobSummary[]> {
    const raw = await this.client.cronList();
    return mapCronListToSummaries(raw);
  }

  async listApprovals(): Promise<ApprovalSummary[]> {
    const raw = await this.client.approvalsGet();
    return mapApprovalsGetToSummaries(raw);
  }

  async snapshot(): Promise<ReadModelSnapshot> {
    const sessionsPromise = this.listSessions();
    const cronJobsPromise = this.listCronJobs();
    const approvalsPromise = this.listApprovals();
    const projectsPromise = loadProjectStore();
    const tasksPromise = loadTaskStore();
    const budgetPolicyPromise = loadBudgetPolicy();

    const sessions = await sessionsPromise;
    const statusesPromise = this.listSessionStatuses(sessions.map((s) => s.sessionKey));
    const [statuses, cronJobs, approvals, projects, tasks, budgetPolicy] = await Promise.all([
      statusesPromise,
      cronJobsPromise,
      approvalsPromise,
      projectsPromise,
      tasksPromise,
      budgetPolicyPromise,
    ]);

    const tasksSummary = computeTasksSummary(tasks, projects.projects.length);
    const projectSummaries = computeProjectSummaries(projects, tasks);
    const budgetSummary = computeBudgetSummary(sessions, statuses, tasks, projects, budgetPolicy.policy);

    if (budgetPolicy.issues.length > 0) {
      console.warn("[mission-control] budget policy issues", {
        path: budgetPolicy.path,
        issues: budgetPolicy.issues,
      });
    }

    return {
      sessions,
      statuses,
      cronJobs,
      approvals,
      projects,
      projectSummaries,
      tasks,
      tasksSummary,
      budgetSummary,
      generatedAt: new Date().toISOString(),
    };
  }
}
