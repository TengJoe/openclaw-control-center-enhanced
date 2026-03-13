import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";

interface DoDCheckResult {
  id: string;
  passed: boolean;
  detail: string;
}

type DoDStatus = "DONE" | "NOT_DONE";

interface DoDStatusArtifact {
  generatedAt: string;
  runtimeDir: string;
  status: DoDStatus;
  passed: boolean;
  checks: DoDCheckResult[];
}

interface WorkerProgress {
  cycle?: number;
  lastStep?: {
    id?: string;
    exitCode?: number;
  };
}

interface ProductDoDDefinition {
  fullChinese: boolean;
  nonTechnicalCopy: boolean;
  middleSchoolReadable: boolean;
  globalVisibility: boolean;
  appleNativeUI?: boolean;
  realSubscriptionConnected?: boolean;
  tiApproval?: boolean;
  notes?: string;
}

interface ProductSourceAudit {
  fullChinese: boolean;
  nonTechnicalCopy: boolean;
  middleSchoolReadable: boolean;
  globalVisibility: boolean;
  appleNativeUI: boolean;
  details: {
    fullChinese: string;
    nonTechnicalCopy: string;
    middleSchoolReadable: string;
    globalVisibility: string;
    appleNativeUI: string;
  };
}

interface RealSubscriptionAudit {
  connected: boolean;
  detail: string;
  sourcePath?: string;
}

interface PhraseGroup {
  id: string;
  options: string[];
}

const REQUIRED_ZH_GROUPS: PhraseGroup[] = [
  { id: "title", options: ["全局可视", "全局总览"] },
  {
    id: "summary",
    options: [
      "一眼看全局：定时任务、任务心跳、当前任务和工具调用。",
      "一眼看全局：定时任务、任务心跳、当前任务、工具调用。",
      "一眼看四件事：定时任务、任务心跳、当前任务、工具调用。",
    ],
  },
  { id: "schedule", options: ["定时任务："] },
  { id: "heartbeat", options: ["任务心跳：", "心跳检查："] },
  { id: "currentTasks", options: ["当前任务：", "进行中任务："] },
  { id: "toolCalls", options: ["工具调用："] },
];

const REQUIRED_EN_GROUPS: PhraseGroup[] = [
  { id: "title", options: ["Global Visibility"] },
  {
    id: "summary",
    options: [
      "One place to see cron, heartbeat, current tasks, and tool calls.",
      "One place to see timed jobs, heartbeat, current tasks, and tool calls.",
      "At a glance: timed jobs, heartbeat, current tasks, and tool calls.",
      "Simple view: schedule checks (cron), heartbeat checks, current tasks, and tool calls.",
      "Simple view: schedule (cron), heartbeat, tasks in progress, and tool calls.",
    ],
  },
  { id: "schedule", options: ["Cron:", "Timed jobs:", "Schedule checks (cron):", "Schedule (cron):"] },
  { id: "heartbeat", options: ["Heartbeat:", "Heartbeat checks:"] },
  { id: "currentTasks", options: ["Current tasks:", "Tasks in progress:"] },
  { id: "toolCalls", options: ["Tool calls:"] },
];

const GLOBAL_VISIBILITY_RENDER_TOKENS = [
  "renderGlobalVisibilityStrip(",
  "renderGlobalVisibilityCard(",
  "renderGlobalVisibilityStripCard(",
  '<div class="content-stack">${globalVisibilityBlock}${sectionBody}</div>',
  "copy.scheduleLabel",
  "copy.heartbeatLabel",
  "copy.currentTasksLabel",
  "copy.toolCallsLabel",
  'buildGlobalVisibilityDetailHref("cron", language)',
  'buildGlobalVisibilityDetailHref("heartbeat", language)',
  'buildGlobalVisibilityDetailHref("current_task", language)',
  'buildGlobalVisibilityDetailHref("tool_call", language)',
  'taskType: "cron"',
  'taskType: "heartbeat"',
  'taskType: "current_task"',
  'taskType: "tool_call"',
  "signalCounts: {",
  "schedule: enabledCronCount",
  "heartbeat: enabledHeartbeatCount",
  "currentTasks: currentTasksCount",
  "toolCalls: toolCallsCount",
];
const GLOBAL_VISIBILITY_RENDER_GROUPS: PhraseGroup[] = [
  {
    id: "overview-block",
    options: [
      'const globalVisibilityBlock = options.section === "overview" ? globalVisibilityCard : globalVisibilityStripCard;',
      'const globalVisibilityBlock = options.section === "overview" ? globalVisibilityCard : "";',
    ],
  },
];

const NON_TECH_JARGON = ["telemetry", "instrumentation", "payload", "schema", "protocol", "SDK"];
const MIXED_ZH_PHRASES = [
  "Cron 正在运行。",
  "还没有设置 Cron。",
  "保持 Cron 开启。",
  "定时任务（cron）",
  "定时检查（cron）",
  "定时安排（cron）",
];
const APPLE_NATIVE_UI_RENDER_TOKENS = [
  "data-apple-window-controls=\"true\"",
  "--apple-glass-blur",
  "-webkit-backdrop-filter",
  "@media (prefers-reduced-motion: reduce)",
];
const APPLE_NATIVE_UI_RENDER_GROUPS: PhraseGroup[] = [
  {
    id: "polish-marker",
    options: [
      'data-ui-polish="apple-native-v1"',
      'data-ui-polish="apple-native-v2"',
      'data-ui-polish="apple-native-v3"',
    ],
  },
  {
    id: "hover-elevation",
    options: [
      ".card:hover { transform: translateY(-1px);",
      ".card:hover {",
    ],
  },
];

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmp, path);
}

async function runNodeScript(
  scriptPath: string,
  args: string[],
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, ["--import", "tsx", scriptPath, ...args], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
  });
}

async function readProgress(path: string): Promise<WorkerProgress | null> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as WorkerProgress;
  } catch {
    return null;
  }
}

async function readProductDoD(path: string): Promise<ProductDoDDefinition | null> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as ProductDoDDefinition;
  } catch {
    return null;
  }
}

function findMissingPhrases(input: string, phrases: string[]): string[] {
  return phrases.filter((phrase) => !input.includes(phrase));
}

function findMissingGroups(input: string, groups: PhraseGroup[]): string[] {
  return groups
    .filter((group) => group.options.every((phrase) => !input.includes(phrase)))
    .map((group) => `${group.id}(${group.options.join(" | ")})`);
}

async function auditProductSource(uiServerPath: string): Promise<ProductSourceAudit> {
  let source = "";
  let globalVisibilitySource = "";
  try {
    source = await readFile(uiServerPath, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      fullChinese: false,
      nonTechnicalCopy: false,
      middleSchoolReadable: false,
      globalVisibility: false,
      appleNativeUI: false,
      details: {
        fullChinese: `unable to read ${uiServerPath}: ${detail}`,
        nonTechnicalCopy: `unable to read ${uiServerPath}: ${detail}`,
        middleSchoolReadable: `unable to read ${uiServerPath}: ${detail}`,
        globalVisibility: `unable to read ${uiServerPath}: ${detail}`,
        appleNativeUI: `unable to read ${uiServerPath}: ${detail}`,
      },
    };
  }
  try {
    globalVisibilitySource = await readFile(
      resolve(dirname(uiServerPath), "..", "runtime", "global-visibility.ts"),
      "utf8",
    );
  } catch {
    globalVisibilitySource = "";
  }

  const copyBlock = source.match(
    /function globalVisibilityCopy[\s\S]*?function formatExecutorAgentLabel/,
  )?.[0];
  const modelBlock =
    globalVisibilitySource.match(/export async function buildGlobalVisibilityViewModel[\s\S]*?function sanitizeCronPurposeText/)?.[0] ??
    source.match(/async function buildGlobalVisibilityViewModel[\s\S]*?function dashboardSectionLinks/)?.[0];
  const globalVisibilityBlock =
    [copyBlock, modelBlock, globalVisibilitySource]
      .filter((segment): segment is string => typeof segment === "string" && segment.length > 0)
      .join("\n\n")
      .trim() || source;
  const combinedSource = [source, globalVisibilitySource]
    .filter((segment) => segment.trim().length > 0)
    .join("\n\n");
  const missingZh = findMissingGroups(globalVisibilityBlock, REQUIRED_ZH_GROUPS);
  const missingEn = findMissingGroups(globalVisibilityBlock, REQUIRED_EN_GROUPS);
  const missingRender = findMissingPhrases(combinedSource, GLOBAL_VISIBILITY_RENDER_TOKENS);
  const missingRenderGroups = findMissingGroups(combinedSource, GLOBAL_VISIBILITY_RENDER_GROUPS);
  const missingAppleNativeTokens = findMissingPhrases(source, APPLE_NATIVE_UI_RENDER_TOKENS);
  const missingAppleNativeGroups = findMissingGroups(source, APPLE_NATIVE_UI_RENDER_GROUPS);
  const matchedMixedZh = MIXED_ZH_PHRASES.filter((phrase) => globalVisibilityBlock.includes(phrase));

  const matchedJargon = NON_TECH_JARGON.filter((token) =>
    globalVisibilityBlock.toLowerCase().includes(token.toLowerCase()),
  );

  const readabilitySamples = [
    ...REQUIRED_EN_GROUPS.flatMap((group) => group.options),
    "Tasks checked:",
    "Tasks selected:",
    "Tasks started:",
    "Recent tool calls:",
    "Tool calls in recent activity:",
  ];
  const longPhrases = readabilitySamples.filter((phrase) => phrase.length > 90);
  const hardWords = readabilitySamples
    .flatMap((phrase) => phrase.split(/[^A-Za-z]+/))
    .filter((word) => word.length >= 14);

  return {
    fullChinese: missingZh.length === 0 && matchedMixedZh.length === 0,
    nonTechnicalCopy: missingEn.length === 0 && matchedJargon.length === 0,
    middleSchoolReadable: longPhrases.length === 0 && hardWords.length === 0,
    globalVisibility:
      missingRender.length === 0 &&
      missingRenderGroups.length === 0 &&
      missingEn.length === 0 &&
      missingZh.length === 0,
    appleNativeUI: missingAppleNativeTokens.length === 0 && missingAppleNativeGroups.length === 0,
    details: {
      fullChinese:
        missingZh.length === 0 && matchedMixedZh.length === 0
          ? "ui source includes required zh copy for global visibility"
          : `missing zh copy: ${missingZh.join(", ") || "none"} mixed zh/en copy: ${matchedMixedZh.join(", ") || "none"}`,
      nonTechnicalCopy:
        missingEn.length === 0 && matchedJargon.length === 0
          ? "global visibility copy remains plain-language and operator-facing"
          : `missing en plain copy=${missingEn.join(", ") || "none"} jargon=${matchedJargon.join(", ") || "none"}`,
      middleSchoolReadable:
        longPhrases.length === 0 && hardWords.length === 0
          ? "global visibility copy length/wording stays middle-school readable"
          : `long phrases=${longPhrases.join(" | ") || "none"} hard words=${hardWords.join(", ") || "none"}`,
      globalVisibility:
        missingRender.length === 0 && missingRenderGroups.length === 0
          ? "strip + card render all four signals (cron/heartbeat/current tasks/tool calls) across sections"
          : `missing render tokens: ${[...missingRender, ...missingRenderGroups].join(", ")}`,
      appleNativeUI:
        missingAppleNativeTokens.length === 0 && missingAppleNativeGroups.length === 0
          ? "apple-native polish markers present (glass surfaces, window controls, reduced-motion safety)"
          : `missing apple-native tokens: ${[...missingAppleNativeTokens, ...missingAppleNativeGroups].join(", ")}`,
    },
  };
}

function subscriptionSnapshotPaths(runtimeDir: string): string[] {
  const openclawHome = process.env.OPENCLAW_HOME?.trim() || join(homedir(), ".openclaw");
  const paths = [
    process.env.OPENCLAW_SUBSCRIPTION_SNAPSHOT_PATH?.trim(),
    resolve(runtimeDir, "subscription-snapshot.json"),
    join(openclawHome, "subscription.json"),
    join(openclawHome, "subscription-snapshot.json"),
    join(openclawHome, "billing", "subscription.json"),
    join(openclawHome, "billing", "subscription-snapshot.json"),
    join(openclawHome, "billing", "usage.json"),
    join(openclawHome, "usage", "subscription.json"),
    join(openclawHome, "usage", "subscription-snapshot.json"),
  ].filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return [...new Set(paths)];
}

function asObjectValue(input: unknown): Record<string, unknown> | undefined {
  return input !== null && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : undefined;
}

function asStringValue(input: unknown): string | undefined {
  return typeof input === "string" ? input : undefined;
}

function pickFirstNonNegative(values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  }
  return undefined;
}

function parseSubscriptionSnapshotSignal(raw: unknown): {
  consumed?: number;
  remaining?: number;
  limit?: number;
  unit: string;
  planLabel: string;
} {
  const root = asObjectValue(raw) ?? {};
  const subscription = asObjectValue(root.subscription) ?? {};
  const usage = asObjectValue(root.usage) ?? asObjectValue(subscription.usage) ?? {};
  const rootCost = asObjectValue(root.cost) ?? {};
  const subscriptionCost = asObjectValue(subscription.cost) ?? {};
  const plan = asObjectValue(root.plan) ?? asObjectValue(subscription.plan) ?? {};

  const consumed = pickFirstNonNegative([
    root.consumed,
    root.used,
    root.spent,
    subscription.consumed,
    subscription.used,
    subscription.spent,
    usage.consumed,
    usage.used,
    usage.spent,
    rootCost.used,
    rootCost.spent,
    subscriptionCost.used,
    subscriptionCost.spent,
  ]);
  const limit = pickFirstNonNegative([
    root.limit,
    root.total,
    root.quota,
    root.cap,
    subscription.limit,
    subscription.total,
    subscription.quota,
    subscription.cap,
    usage.limit,
    usage.total,
    usage.quota,
    rootCost.limit,
    subscriptionCost.limit,
  ]);
  const remaining = pickFirstNonNegative([
    root.remaining,
    root.left,
    subscription.remaining,
    subscription.left,
    usage.remaining,
    usage.left,
    typeof limit === "number" && typeof consumed === "number" ? Math.max(0, limit - consumed) : undefined,
  ]);

  const unit =
    asStringValue(root.unit) ??
    asStringValue(subscription.unit) ??
    asStringValue(usage.unit) ??
    asStringValue(root.currency) ??
    asStringValue(subscription.currency) ??
    asStringValue(usage.currency) ??
    "USD";
  const planLabel =
    asStringValue(plan.name) ??
    asStringValue(root.planLabel) ??
    asStringValue(root.planName) ??
    asStringValue(root.plan) ??
    asStringValue(root.tier) ??
    asStringValue(subscription.planLabel) ??
    asStringValue(subscription.planName) ??
    asStringValue(subscription.plan) ??
    asStringValue(subscription.tier) ??
    "Subscription";

  return {
    consumed,
    remaining,
    limit,
    unit,
    planLabel,
  };
}

async function auditRealSubscriptionSource(runtimeDir: string): Promise<RealSubscriptionAudit> {
  const paths = subscriptionSnapshotPaths(runtimeDir);
  const partial: string[] = [];
  const unreadable: string[] = [];
  const missing: string[] = [];

  for (const path of paths) {
    try {
      const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
      const parsed = parseSubscriptionSnapshotSignal(raw);
      const hasAllFields =
        typeof parsed.consumed === "number" && typeof parsed.remaining === "number" && typeof parsed.limit === "number";
      if (hasAllFields) {
        return {
          connected: true,
          sourcePath: path,
          detail: `provider snapshot connected at ${path} (${parsed.planLabel}; ${parsed.unit})`,
        };
      }
      const missingFields = [
        typeof parsed.consumed === "number" ? "" : "consumed",
        typeof parsed.remaining === "number" ? "" : "remaining",
        typeof parsed.limit === "number" ? "" : "limit",
      ].filter((item) => item !== "");
      partial.push(`${path} missing ${missingFields.join("/") || "required fields"}`);
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string"
          ? (error as { code: string }).code
          : undefined;
      if (code === "ENOENT") {
        missing.push(path);
      } else {
        unreadable.push(`${path}${code ? ` (${code})` : ""}`);
      }
    }
  }

  if (partial.length > 0) {
    return {
      connected: false,
      detail: `provider snapshot found but incomplete: ${partial.join("; ")}`,
    };
  }
  if (unreadable.length > 0) {
    return {
      connected: false,
      detail: `provider snapshot unreadable: ${unreadable.join("; ")}`,
    };
  }
  return {
    connected: false,
    detail: missing.length > 0 ? `provider snapshot missing at: ${missing.join(", ")}` : "provider snapshot paths not configured",
  };
}

function toProductChecks(
  product: ProductDoDDefinition | null,
  sourceAudit: ProductSourceAudit,
  subscriptionAudit: RealSubscriptionAudit,
  requireTiApproval: boolean,
): DoDCheckResult[] {
  const declared = product ?? null;
  const checks: DoDCheckResult[] = [
    {
      id: "product-dod-definition",
      passed: declared !== null,
      detail: declared ? "runtime/evidence/product-dod.json present" : "missing runtime/evidence/product-dod.json",
    },
  ];

  const declaredFullChinese = declared?.fullChinese === true;
  checks.push({
    id: "product-full-chinese",
    passed: declaredFullChinese && sourceAudit.fullChinese,
    detail: `声明=${declaredFullChinese ? "通过" : "未通过"}；源码=${sourceAudit.fullChinese ? "通过" : "未通过"}（${sourceAudit.details.fullChinese}）`,
  });

  const declaredNonTechnical = declared?.nonTechnicalCopy === true;
  checks.push({
    id: "product-non-technical-copy",
    passed: declaredNonTechnical && sourceAudit.nonTechnicalCopy,
    detail: `声明=${declaredNonTechnical ? "通过" : "未通过"}；源码=${sourceAudit.nonTechnicalCopy ? "通过" : "未通过"}（${sourceAudit.details.nonTechnicalCopy}）`,
  });

  const declaredReadable = declared?.middleSchoolReadable === true;
  checks.push({
    id: "product-middle-school-readable",
    passed: declaredReadable && sourceAudit.middleSchoolReadable,
    detail: `声明=${declaredReadable ? "通过" : "未通过"}；源码=${sourceAudit.middleSchoolReadable ? "通过" : "未通过"}（${sourceAudit.details.middleSchoolReadable}）`,
  });

  const declaredGlobalVisibility = declared?.globalVisibility === true;
  checks.push({
    id: "product-global-visibility",
    passed: declaredGlobalVisibility && sourceAudit.globalVisibility,
    detail: `声明=${declaredGlobalVisibility ? "通过" : "未通过"}；源码=${sourceAudit.globalVisibility ? "通过" : "未通过"}（${sourceAudit.details.globalVisibility}）`,
  });

  const declaredAppleNativeUI = declared?.appleNativeUI === true;
  checks.push({
    id: "product-apple-native-ui",
    passed: declaredAppleNativeUI && sourceAudit.appleNativeUI,
    detail:
      `声明=${declaredAppleNativeUI ? "通过" : "未通过"}；` +
      `客观检查=${sourceAudit.appleNativeUI ? "通过" : "未通过"}（${sourceAudit.details.appleNativeUI}）`,
  });

  const declaredRealSubscriptionConnected = declared?.realSubscriptionConnected === true;
  checks.push({
    id: "product-real-subscription-connected",
    passed: declaredRealSubscriptionConnected && subscriptionAudit.connected,
    detail:
      `声明=${declaredRealSubscriptionConnected ? "通过" : "未通过"}；` +
      `客观检查=${subscriptionAudit.connected ? "通过" : "未通过"}（${subscriptionAudit.detail}）`,
  });

  const tiApproved = declared?.tiApproval === true;
  checks.push({
    id: "product-ti-approval",
    passed: requireTiApproval ? tiApproved : true,
    detail: requireTiApproval
      ? tiApproved
        ? "Ti 人工验收：通过（严格模式）"
        : "Ti 人工验收：未通过（严格模式）"
      : tiApproved
        ? "Ti 人工验收：已记录（非阻塞）"
        : "Ti 人工验收：待补充（非阻塞）",
  });

  return checks;
}

async function runChecks(runtimeDir: string): Promise<DoDCheckResult[]> {
  const checks: DoDCheckResult[] = [];
  const goalPath = resolve(runtimeDir, "goal-state.json");
  const evidencePath = resolve(runtimeDir, "evidence", "latest.json");
  const progressPath = resolve(runtimeDir, "evidence", "worker-progress.json");
  const productDoDPath = resolve(runtimeDir, "evidence", "product-dod.json");
  const uiServerPath = resolve(process.cwd(), "src", "ui", "server.ts");
  const requireTiApproval = (process.env.DOD_REQUIRE_TI_APPROVAL ?? "false").toLowerCase() === "true";

  const goalGate = await runNodeScript(resolve(process.cwd(), "scripts", "goal-gate.ts"), [goalPath]);
  checks.push({
    id: "goal-gate",
    passed: goalGate.code === 0,
    detail: goalGate.code === 0 ? "goal gate passed" : (goalGate.stderr.trim() || goalGate.stdout.trim() || "goal gate failed"),
  });

  const evidenceGate = await runNodeScript(resolve(process.cwd(), "scripts", "evidence-gate.ts"), ["validate", evidencePath]);
  checks.push({
    id: "evidence-gate",
    passed: evidenceGate.code === 0,
    detail:
      evidenceGate.code === 0
        ? "evidence bundle valid"
        : (evidenceGate.stderr.trim() || evidenceGate.stdout.trim() || "evidence validation failed"),
  });

  const progress = await readProgress(progressPath);
  const stepPassed = progress?.lastStep?.exitCode === 0;
  checks.push({
    id: "worker-last-step",
    passed: stepPassed,
    detail: stepPassed
      ? `cycle=${progress?.cycle ?? "unknown"} step=${progress?.lastStep?.id ?? "unknown"} exit=0`
      : "missing or failing worker-progress lastStep.exitCode",
  });

  const product = await readProductDoD(productDoDPath);
  const sourceAudit = await auditProductSource(uiServerPath);
  const subscriptionAudit = await auditRealSubscriptionSource(runtimeDir);
  checks.push(...toProductChecks(product, sourceAudit, subscriptionAudit, requireTiApproval));

  return checks;
}

async function main(): Promise<void> {
  const runtimeDir = resolve(process.argv[2] ?? join(process.cwd(), "runtime"));
  const statusPath = resolve(process.argv[3] ?? join(runtimeDir, "evidence", "dod-status.json"));

  let checks: DoDCheckResult[] = [];
  try {
    checks = await runChecks(runtimeDir);
  } catch (error) {
    checks = [
      {
        id: "dod-check-runtime",
        passed: false,
        detail: error instanceof Error ? error.message : String(error),
      },
    ];
  }

  const passed = checks.every((check) => check.passed);
  const artifact: DoDStatusArtifact = {
    generatedAt: new Date().toISOString(),
    runtimeDir,
    status: passed ? "DONE" : "NOT_DONE",
    passed,
    checks,
  };

  await writeJsonAtomic(statusPath, artifact);

  if (!artifact.passed) {
    console.error(`NOT_DONE status=${statusPath}`);
    process.exit(1);
  }

  console.log(`DONE status=${statusPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
