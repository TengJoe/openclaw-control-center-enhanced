# Mission Control Runbook

## 1) Safety defaults
- Keep `READONLY_MODE=true` unless explicitly validating live reads.
- Keep `LOCAL_TOKEN_AUTH_REQUIRED=true` by default.
- Keep `APPROVAL_ACTIONS_ENABLED=false` by default.
- Keep `APPROVAL_ACTIONS_DRY_RUN=true` by default.
- Keep `IMPORT_MUTATION_ENABLED=false` by default.
- Keep `IMPORT_MUTATION_DRY_RUN=false` by default.
- Never modify `~/.openclaw/openclaw.json` from this project.

## 2) Startup
1. `npm run build`
2. `npm test`
3. `npm run validate`
4. `npm run dev` (smoke monitor run)
5. Optional UI mode: `UI_MODE=true npm run dev` (or `npm run start`)
  - In restricted sandboxes, `listen EPERM` on `127.0.0.1:*` is environment-only (socket bind restriction), not a control-center functional regression.
6. Optional continuous monitor: `npm run dev:continuous`
7. Optional UI preview without OpenClaw: `npm run dev:demo` (DEMO_MODE=true, built-in sample data)
8. Optional single-file bundle (faster startup, lower memory):
  - `npm run build:single` produces `dist/control-center.js`
  - `npm run start:single` (or `node dist/control-center.js`)

## 2b) Startup & memory baseline

Measured on Windows, DEMO_MODE=true readonly UI (time to /healthz):

| Mode | Startup | RSS (start) | RSS (25s resident) |
|---|---|---|---|
| tsx (dev) | ~515ms | ~116 MB | ~70 MB |
| single-file bundle | ~515ms | ~89 MB | ~50 MB |

- The single-file bundle drops the tsx/esbuild runtime and is the recommended
  distribution path (`npm run build:single` + `node dist/control-center.js`).
- DEMO_MODE is readonly and skips monitor artifact writes.

## 3) Enable live mode safely
1. Confirm baseline safety checks:
  - `READONLY_MODE=true`
  - `LOCAL_TOKEN_AUTH_REQUIRED=true`
  - `APPROVAL_ACTIONS_ENABLED=false`
  - `APPROVAL_ACTIONS_DRY_RUN=true`
  - `IMPORT_MUTATION_ENABLED=false`
  - `IMPORT_MUTATION_DRY_RUN=false`
  - `npm run build` passes
2. Enable live reads only (no approval execution):
  - Run with `READONLY_MODE=false` and keep:
    - `APPROVAL_ACTIONS_ENABLED=false`
    - `APPROVAL_ACTIONS_DRY_RUN=true`
3. Validate behavior in UI:
  - `GET /snapshot`
  - `GET /tasks`
  - `GET /exceptions`
4. Only if explicitly required, enable approval execution:
  - `READONLY_MODE=false`
  - `APPROVAL_ACTIONS_ENABLED=true`
  - `APPROVAL_ACTIONS_DRY_RUN=false`
5. After any live test, return to defaults immediately:
  - `READONLY_MODE=true`
  - `LOCAL_TOKEN_AUTH_REQUIRED=true`
  - `APPROVAL_ACTIONS_ENABLED=false`
  - `APPROVAL_ACTIONS_DRY_RUN=true`
  - `IMPORT_MUTATION_ENABLED=false`
  - `IMPORT_MUTATION_DRY_RUN=false`

## 4) Local token auth gate
- Protected operations require local token auth when `LOCAL_TOKEN_AUTH_REQUIRED=true` (default):
  - all state-changing routes (`POST`/`PATCH` APIs and form ack route)
  - task heartbeat execution route (`POST /api/tasks/heartbeat`)
  - import/export routes with side effects (`POST /api/import/dry-run`, `POST /api/import/live`, `GET /export/state.json`, `GET /api/export/state.json`)
  - protected command modes (`command:backup-export`, `command:import-validate`, `command:acks-prune`, `command:task-heartbeat`)
- Configure explicit gate token:
  - `LOCAL_API_TOKEN=<strong-random-token>`
- Send token from client:
  - `x-local-token: <LOCAL_API_TOKEN>`
  - or `Authorization: Bearer <LOCAL_API_TOKEN>`
- If `LOCAL_API_TOKEN` is unset while gate is enabled:
  - protected operations are blocked by design.

## 5) Approval actions (runtime-gated)
- Endpoints (also require local token auth):
  - `POST /api/approvals/:approvalId/approve`
  - `POST /api/approvals/:approvalId/reject` (requires JSON body `{"reason":"..."}`)
- Gate logic:
  - If `APPROVAL_ACTIONS_ENABLED=false`: blocked (no execution)
  - If `APPROVAL_ACTIONS_DRY_RUN=true`: simulated (no execution)
  - If `READONLY_MODE=true`: blocked (no execution)
  - Real execution only when:
    - `APPROVAL_ACTIONS_ENABLED=true`
    - `APPROVAL_ACTIONS_DRY_RUN=false`
    - `READONLY_MODE=false`
- All attempts are written to `runtime/approval-actions.log` as JSON lines.

## 6) Project + Task APIs
- `GET /projects`: project list with optional filters:
  - `status=planned|active|blocked|done`
  - `owner=<owner>`
  - `projectId=<projectId>`
- `GET /api/projects`: compatibility endpoint with same query filters.
- `POST /api/projects`: create project in `runtime/projects.json`.
- `PATCH /api/projects/:projectId`: update `title`, `status`, `owner`.
- `GET /tasks`: flattened task list with optional filters:
  - `status=todo|in_progress|blocked|done`
  - `owner=<owner>`
  - `project=<projectId>`
- `GET /api/tasks`: compatibility endpoint with the same query filters.
- `POST /api/tasks`: create task in `runtime/tasks.json`.
- `PATCH /api/tasks/:taskId/status`: status transition.
- `GET /api/tasks/heartbeat`: recent heartbeat runs from `runtime/task-heartbeat.log`.
- `POST /api/tasks/heartbeat`: execute assigned-backlog heartbeat pickup (supports `dryRun` + `maxTasksPerRun` override).
- Mutation endpoints above require local token auth.
- Validation:
  - Strong schema checks for required fields, enums, and bounded field lengths.
  - Task create/update validates linked `projectId` against `runtime/projects.json`.
  - Invalid payloads return 4xx with `issues`.
  - Unknown project/task IDs return 404.

### Heartbeat backlog automation
- Monitor cycles now include a task heartbeat pass that checks the board for assigned backlog tasks (`status=todo` + assigned owner).
- Default gate posture:
  - `TASK_HEARTBEAT_ENABLED=true`
  - `TASK_HEARTBEAT_DRY_RUN=true`
  - `TASK_HEARTBEAT_MAX_TASKS_PER_RUN=3`
- Live promotion (`todo -> in_progress`) requires:
  - heartbeat dry-run disabled (`TASK_HEARTBEAT_DRY_RUN=false` or request body `{"dryRun":false}`)
  - local token configured when `LOCAL_TOKEN_AUTH_REQUIRED=true`
- Evidence file:
  - `runtime/task-heartbeat.log` (JSONL; includes selected/executed counts and gate mode)

## 7) Commander exceptions + action queue
- Endpoint: `GET /api/commander/exceptions`
- Summarizes:
  - blocked sessions
  - errored sessions
  - pending approvals
  - over-budget evaluations
  - tasks due (`dueAt <= now`, excluding `done`)
- Routed feed endpoint: `GET /exceptions`
  - Levels: `info`, `warn`, `action-required`
  - Routes: `timeline`, `operator-watch`, `action-queue`
- Notification center endpoint: `GET /api/action-queue`
  - Derived from `GET /exceptions` action-required route entries
  - Includes acknowledgement state from `runtime/acks.json`
  - Includes `links[]` with relevant session/task/project endpoints for operator jump navigation
- Acknowledge endpoint: `POST /api/action-queue/:itemId/ack`
  - Persists/updates local ack entry in `runtime/acks.json`
  - Optional expiry controls: `ttlMinutes` (1..10080) or `snoozeUntil` (future ISO timestamp)
  - `ttlMinutes` and `snoozeUntil` are mutually exclusive
  - UI form uses minimal POST to `/action-queue/ack`
  - Requires local token auth

## 8) Session visibility APIs
- `GET /sessions` / `GET /api/sessions`
  - Local readonly view combining session list with latest history snippets per session
  - Query filters:
    - `state=idle|running|blocked|waiting_approval|error`
    - `agentId=<agentId>`
    - `q=<search>`
    - pagination: `page`, `pageSize`, `historyLimit`
- `GET /sessions/:id`
  - Session detail + usage status + recent history entries (`historyLimit` optional)
- `GET /api/sessions/:id`
  - Explicit API alias for session detail JSON
- `GET /session/:id`
  - UI drill-down page rendering latest messages and tool events per session
  - History content is safely truncated for readonly rendering

## 9) Audit timeline
- `GET /audit` renders newest-first runtime timeline view with severity filter.
- `GET /api/audit` returns JSON timeline.
- Data sources:
  - `runtime/timeline.log`
  - `runtime/approval-actions.log`
  - `runtime/operation-audit.log`
  - current snapshot (`runtime/last-snapshot.json`)
- Supported severities: `all`, `info`, `warn`, `action-required`, `error`.

## 10) Graph + export APIs
- `GET /graph`
  - Returns project-task-session-agent linkage graph JSON (nodes + edges + counts)
- `GET /export/state.json`
  - Bundles current sessions/tasks/projects/budgets/exceptions into one portable JSON document
  - Requires local token auth
  - Writes timestamped copies to:
    - `runtime/export-snapshots/*.json` (replay/debug index)
    - `runtime/exports/*.json` (backup/import target bundles)

## 11) Commander digest
- Every monitor run writes/refreshes the current day digest files:
  - `runtime/digests/YYYY-MM-DD.json`
  - `runtime/digests/YYYY-MM-DD.md`
- Digest summarizes sessions, approvals, projects, tasks, budgets, alerts, and top exceptions.

## 12) Phase 7 operations
- Pixel adapter:
  - endpoint: `GET /view/pixel-state.json`
  - source: snapshot + local project/task/session links
- Notification policy preview:
  - config file: `runtime/notification-policy.json`
  - endpoint: `GET /notifications/preview`
  - optional simulation: `GET /notifications/preview?at=<ISO-8601>`
- Cron overview:
  - endpoint: `GET /cron`
  - reports next run + per-job health + monitor lag summary
- System health:
  - endpoint: `GET /healthz`
  - includes build info + snapshot freshness + monitor lag
- Digest renderer:
  - endpoint: `GET /digest/latest`
  - renders latest markdown digest file as HTML

## 13) Phase 8 operations
- Operator dashboard polish:
  - compact status strip toggle persisted in `runtime/ui-preferences.json`
  - quick filter chips (`all`, `attention`, task states)
  - home/dashboard query choices auto-persist as default UI preferences
- UI preference APIs:
  - `GET /api/ui/preferences`
  - `PATCH /api/ui/preferences`
- Search APIs (safe substring + bounded limits):
  - `GET /api/search/tasks?q=&limit=`
  - `GET /api/search/projects?q=&limit=`
  - `GET /api/search/sessions?q=&limit=`
  - `GET /api/search/exceptions?q=&limit=`
- Replay/debug index API:
  - `GET /api/replay/index?timelineLimit=&digestLimit=&exportLimit=&from=&to=`
  - Data sources: `runtime/timeline.log`, `runtime/digests/`, `runtime/export-snapshots/`, `runtime/exports/`
  - `from` / `to` are optional ISO date-time filters for replay artifact windows
  - response includes per-source replay filter stats (`total`, `returned`, `filteredOut`, `filteredOutByWindow`, `filteredOutByLimit`, `latencyMs`, `latencyBucketsMs(p50,p95)`, `totalSizeBytes`, `returnedSizeBytes`)
- API docs summary endpoint:
  - `GET /api/docs`
- Telemetry correlation:
  - every response returns `x-request-id` header
  - JSON responses include `requestId`
  - error logs include requestId for correlation

## 14) Phase 9 operations
- Final integration checklist endpoint:
  - `GET /done-checklist` (alias: `GET /api/done-checklist`)
  - combines docs-aligned checks + runtime capability checks
  - includes readiness scoring for:
    - observability
    - governance
    - collaboration
    - security
- Commander feed polish:
  - `/exceptions` now returns items sorted by severity first (`action-required` > `warn` > `info`), then newest by event timestamp.
- Backup/export command mode:
  - `npm run command:backup-export`
  - requires `LOCAL_API_TOKEN` when `LOCAL_TOKEN_AUTH_REQUIRED=true`
  - writes timestamped bundle under `runtime/exports/*.json`
- Import dry-run validator:
  - command: `npm run command:import-validate -- runtime/exports/<file>.json`
  - API: `POST /api/import/dry-run`
  - command/API require local token auth when `LOCAL_TOKEN_AUTH_REQUIRED=true`
  - validation is dry-run only; no state mutation.
- Ack prune command mode:
  - command: `npm run command:acks-prune`
  - optional dry-run: `COMMAND_ARG=--dry-run npm run command:acks-prune`
  - command requires local token auth when `LOCAL_TOKEN_AUTH_REQUIRED=true`
  - prunes expired acknowledgement records from `runtime/acks.json`
- Ack prune preview API:
  - API: `GET /api/action-queue/acks/prune-preview`
  - requires local token auth when `LOCAL_TOKEN_AUTH_REQUIRED=true`
  - returns `before/removed/after` counts only (no write)
- Optional live import mutation endpoint:
  - API: `POST /api/import/live`
  - HIGH RISK and disabled by default (`IMPORT_MUTATION_ENABLED=false`)
  - requires local token auth and `READONLY_MODE=false` for live apply
  - `dryRun=true` forces non-mutating validation path on this endpoint
- Operation audit:
  - import dry-run + import apply + backup export + ack prune actions are appended to `runtime/operation-audit.log`.

## 15) UX v2 operator navigation
- Home dashboard now uses section tabs via `/?section=<tab>` with six supported values:
  - `overview`
  - `office-space`
  - `projects-tasks`
  - `alerts`
  - `replay-audit`
  - `settings`
- Layout intent:
  - left rail: major section navigation
  - center panel: section content
  - right rail: office context + quick shortcuts
- Office-space behavior:
  - auto-derives agent roster from sessions, task owners, project owners, and agent budget entries
  - maps each agent to a deterministic animal identity from name semantics
  - reports zone + workload summary ("busy on what") per agent
- Empty states:
  - user-facing empty blocks should render as `Not activated yet`
  - avoid exposing raw zero-heavy debug values when no actionable signal exists

## 16) Usage and cost observability (Phase 22)
- New route surfaces:
  - `GET /usage-cost` (redirects to `/?section=usage-cost`)
  - `GET /api/usage-cost` (JSON snapshot)
- Dashboard placement:
  - card-level pulse on `Overview`
  - dedicated `Usage & Cost` section in left sidebar navigation
  - right-rail usage summary card
- Usage adapter sources:
  - live snapshot status data (`sessions + session_status`)
  - OpenClaw session runtime stores (`~/.openclaw/agents/*/sessions/sessions.json` + `*.jsonl`) for real request/tokens/cost windows (`today/7d/30d`) and per-source breakdown
  - digest history (`runtime/digests/*.json`) as fallback trend source when runtime request events are unavailable
  - optional model context catalog (`runtime/model-context-catalog.json`) for context-window percentages
- Disconnected metrics policy:
  - if source is missing, render `Data source not connected` (do not fabricate zero values)
  - if runtime source is connected but usage is truly zero, render zero values (not placeholders)
  - context-window limits prefer live session context metadata and fallback to model catalog only when needed
- Settings connector checklist:
  - model context catalog
  - digest history continuity (fallback)
  - runtime request/event source
  - cost budget limit source
  - provider attribution refinement

## 19) Mission Control v3 operations (Phase 25)
- Navigation and IA (UI sections):
  - `overview` -> Command Deck
  - `usage-cost` -> Usage & Billing
  - `office-space` -> Pixel Office
  - `projects-tasks` -> Work Board
  - `alerts` -> Decisions
  - `replay-audit` -> Timeline
  - `settings` -> Control Room
- Mac parity surfaces panel:
  - shown in Command Deck with per-surface status + route links
  - covers sessions, approvals, cron, projects/tasks, usage/cost, replay/audit, health/digest, export/import safety, and pixel adapter
- Full office roster behavior:
  - best-effort config source: `~/.openclaw/openclaw.json` (read-only)
  - adapter module: `src/runtime/agent-roster.ts`
  - fallback keeps known agents visible even when no active runtime sessions exist
- Subscription usage/remaining behavior:
  - adapter module: `src/runtime/usage-cost.ts`
  - source probes (best effort):
    - `runtime/subscription-snapshot.json`
    - `~/.openclaw/subscription.json`
    - `~/.openclaw/billing/subscription.json`
    - `~/.openclaw/billing/usage.json`
    - `~/.openclaw/usage/subscription.json`
  - contract states:
    - `connected`: consumed/remaining/limit/cycle shown
    - `partial`: file detected but fields incomplete
    - `not_connected`: explicit connect hint shown (no fake zeros)

## 17) Runtime artifacts
- `runtime/last-snapshot.json`: latest read model snapshot.
- `runtime/timeline.log`: monitor run deltas.
- `runtime/projects.json`: local project store.
- `runtime/tasks.json`: local task store.
- `runtime/budgets.json`: budget policy defaults and per-scope overrides.
- `runtime/notification-policy.json`: notification quiet-hours + severity-route policy.
- `runtime/model-context-catalog.json`: optional model context-window map (`match/contextWindowTokens/provider`) for context-usage percentages.
- `runtime/ui-preferences.json`: dashboard preference state (`compactStatusStrip`, `quickFilter`, `taskFilters`).
- `runtime/acks.json`: notification action-queue acknowledgements.
- `runtime/approval-actions.log`: audit trail for approval action attempts.
- `runtime/operation-audit.log`: audit trail for import dry-run, import apply, backup export, and ack prune actions.
- `runtime/digests/`: daily commander digest JSON + Markdown.
- `runtime/export-snapshots/`: timestamped state export snapshots for replay/debug.
- `runtime/exports/`: timestamped export bundles for backup + import validation.

## 18) Rollback steps
1. Restore safe runtime mode:
  - `READONLY_MODE=true`
  - `LOCAL_TOKEN_AUTH_REQUIRED=true`
  - `APPROVAL_ACTIONS_ENABLED=false`
  - `APPROVAL_ACTIONS_DRY_RUN=true`
2. Revert only `control-center/` code changes (git revert or selective checkout from known-good commit).
3. Rebuild and smoke test:
  - `npm run build`
  - `npm run dev`
4. Verify rollback signals:
  - `/projects` and `/api/projects` return expected payloads
  - `/tasks` and `/api/tasks` return expected payloads
  - `/api/action-queue` returns valid JSON and ack state
  - `/exceptions` and `/api/commander/exceptions` return valid JSON
  - `/view/pixel-state.json` returns valid adapter JSON
  - `/notifications/preview` returns policy evaluation JSON
  - `/cron` and `/healthz` return health payloads
  - `/digest/latest` renders latest digest page
  - `/api/docs` returns route/schema summary
  - `/api/replay/index` returns timeline/digest/export index
  - `/api/search/*` endpoints return bounded matches
  - UI project board/task board/action queue sections match expected view
5. If budget behavior regressed, restore `runtime/budgets.json` to the last known-good content.
6. If notification routing behavior regressed, restore `runtime/notification-policy.json` to last known-good.

## 19) Troubleshooting
- Build failures:
  - Run `npm run build` and fix TypeScript errors first.
- Validation failures:
  - Run `npm run validate` and inspect failing assertions.
- Empty dashboard:
  - Confirm `runtime/last-snapshot.json` exists (created by `npm run dev`).
- Health endpoint stale:
  - confirm monitor wrote a fresh line in `runtime/timeline.log`
  - rerun `npm run dev` to regenerate snapshot and timeline tick
- UI mode bind fails with `listen EPERM`:
  - classify as environment-only in restricted sandboxes where localhost bind is blocked
  - re-run `UI_MODE=true npm run dev` in unrestricted host runtime for bind + `/healthz` verification

## 20) Operational Checklist (Phase 22)
- [ ] Safety gates unchanged:
  - `READONLY_MODE=true`
  - `LOCAL_TOKEN_AUTH_REQUIRED=true`
  - `APPROVAL_ACTIONS_ENABLED=false`
  - `APPROVAL_ACTIONS_DRY_RUN=true`
  - `IMPORT_MUTATION_ENABLED=false`
  - `IMPORT_MUTATION_DRY_RUN=false`
  - `LOCAL_API_TOKEN` set explicitly for protected operations.
- [ ] `runtime/notification-policy.json` exists and is valid JSON.
- [ ] `runtime/ui-preferences.json` exists and is valid JSON.
- [ ] `GET /view/pixel-state.json` returns `rooms/entities/links`.
- [ ] `GET /notifications/preview` returns quiet-hours + route preview.
- [ ] `GET /cron` returns next-run and health summary.
- [ ] `GET /healthz` returns build/snapshot/monitor status fields.
- [ ] `GET /digest/latest` renders latest digest markdown.
- [ ] `GET /api/ui/preferences` + `PATCH /api/ui/preferences` work and persist.
- [ ] `GET /api/search/tasks|projects|sessions|exceptions` support `q` + bounded `limit`.
- [ ] Home dashboard search panel is visible and returns scoped results for `tasks|projects|sessions|exceptions`.
- [ ] `GET /api/replay/index` includes timeline, digests, export snapshots, and export bundles.
- [ ] `GET /api/replay/index?from=&to=` applies optional ISO time-window filtering.
- [ ] `GET /api/replay/index` includes replay `stats` with `total/returned/filteredOut` (+ window/limit breakdown) and per-source latency/size indicators.
- [ ] Home dashboard replay/export visibility panel shows counts + latest snapshot/bundle labels.
- [ ] Home dashboard shows section navigation for:
  - Overview, Usage & Cost, Office Space, Projects/Tasks, Alerts, Replay/Audit, Settings.
- [ ] Office Space section renders per-agent cards with:
  - semantic animal identity
  - status label
  - zone placement
  - "busy on what" summary.
- [ ] Empty lists/cards use `Not activated yet` operator copy (instead of raw `none` placeholders).
- [ ] `GET /api/usage-cost` returns:
  - periods (`today/7d/30d`)
  - context windows
  - breakdown by agent/project/model/provider
  - budget burn-rate status
  - connector TODO list.
- [ ] `runtime/model-context-catalog.json` exists or Settings TODO explicitly shows the missing connector.
- [ ] Usage & Cost section displays disconnected metrics as `Data source not connected` instead of fake zeros.
- [ ] `GET /api/docs` returns route/schema summary.
- [ ] Home import/safety guard table shows explicit disabled/enabled badges.
- [ ] Guard/checklist doc refs are clickable and resolve via `/docs/*`.
- [ ] `GET /docs` renders local docs index.
- [ ] `GET /docs/runbook|architecture|progress|readme` return markdown content.
- [ ] `GET /done-checklist` returns checklist + readiness scores.
- [ ] `POST /api/import/dry-run` validates bundles with no mutation.
- [ ] `POST /api/import/live` stays blocked unless explicit env gate + token are enabled.
- [ ] `POST /api/action-queue/:itemId/ack` supports optional `ttlMinutes` / `snoozeUntil` and expired acks re-open queue items.
- [ ] `GET /api/action-queue/acks/prune-preview` returns token-gated stale-ack prune counts with no mutation.
- [ ] `npm run command:backup-export` writes a bundle to `runtime/exports/`.
- [ ] `npm run command:acks-prune` removes expired entries from `runtime/acks.json` (or reports no-op in dry-run).
- [ ] import dry-run + import apply + backup export + ack prune actions write entries in `runtime/operation-audit.log`.
- [ ] responses include `x-request-id` and JSON `requestId`.
- [ ] `npm test` passes.
- [ ] `npm run build` passes.
- [ ] `npm run dev` smoke passes.
