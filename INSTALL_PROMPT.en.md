# OpenClaw Control Center Install Prompt

Language: [中文](INSTALL_PROMPT.md) | **English**

Give the full prompt below to your own OpenClaw so it can install and connect `OpenClaw Control Center` to this machine's OpenClaw environment.

The target end state after install should be:
- the user opens the local URL and sees the login page first
- the user signs in with the `LOCAL_API_TOKEN` from `.env`
- readonly mode stays on by default
- the user can immediately use `Overview`, `Usage`, and `Staff`

```text
You are installing and connecting OpenClaw Control Center to this machine's OpenClaw environment.

Your goal is not to explain theory. Your goal is to complete a safe first-run setup end to end.

Hard rules:
1. Work only inside the control-center repository.
2. Do not modify application source code unless I explicitly ask.
3. Do not modify OpenClaw's own config files.
4. Do not enable live import or approval mutations.
5. Keep all high-risk write paths disabled.
6. Do not assume default agent names, default paths, or a default subscription model. Use real inspection results from this machine.
7. Do not treat missing subscription data, missing Codex data, or a missing billing snapshot as an install failure. If the UI can run safely, continue and clearly mark which panels will be degraded.
8. Do not fabricate, generate, or overwrite any provider API key, token, cookie, or external credential. If OpenClaw itself is missing those prerequisites, report the gap instead of guessing.

Follow this order:

Phase 1: inspect the environment
1. Check whether the OpenClaw Gateway is reachable and confirm the correct `GATEWAY_URL`.
2. Confirm the correct `OPENCLAW_HOME` and `CODEX_HOME` on this machine.
3. If the subscription or billing snapshot is stored outside the default path, find the correct `OPENCLAW_SUBSCRIPTION_SNAPSHOT_PATH`.
4. Confirm which prerequisites are truly present and which are missing-but-degradable. At minimum, evaluate:
   - `node`
   - `npm`
   - write access to the repo directory
   - npm-registry reachability if dependencies are not installed yet
   - the OpenClaw Gateway
   - `openclaw.json`
   - OpenClaw session/runtime data
   - `CODEX_HOME`
   - the subscription/billing snapshot
   - whether the provider/backend prerequisites used by OpenClaw are already present (check presence only; never print secrets)
5. If more than one plausible `OPENCLAW_HOME`, Gateway, or workspace exists, do not guess. Prefer the combination backed by a live Gateway, a readable `openclaw.json`, and the strongest evidence that it belongs to the current project. If it is still ambiguous, stop and list the candidates.
6. If a path, process, or file is missing in a way that makes the control center impossible to start at all, such as missing `node` / `npm`, no ability to download dependencies, a non-writable repo, or an unreadable OpenClaw root, stop and tell me exactly what is missing instead of guessing.
7. If the missing item only affects richer dashboards, such as subscription snapshots, Codex telemetry, part of the runtime data, or Codex-specific telemetry on a machine that actually uses API-key/provider mode, continue the install and mark those areas as "install can continue, but this surface will be partial".
8. Do not assume any fixed agent names. If `openclaw.json` is readable, treat it as the source of truth. If not, fall back to runtime-visible agents and explicitly say that roster confidence is lower.

Phase 2: install the project
9. Confirm that the current directory is the control-center repo root.
10. First verify the repo is complete. At minimum, confirm these paths exist:
   - `package.json`
   - `src/runtime`
   - `src/ui`
   - `.env.example`
11. If `src/runtime`, `src/ui`, or `package.json` is missing, do not continue and do not guess where the code should come from. Classify it as "wrong repo / incomplete checkout / wrong working directory", then:
   - leave the incorrect directory
   - re-clone `https://github.com/TianyiDataScience/openclaw-control-center.git`
   - continue only after entering the new repo root
12. Install dependencies.
13. If `.env` does not exist, create it from `.env.example`. If it already exists, update it while preserving safe first-run defaults. Do not delete unrelated user settings; only change the keys required for this connection.

Phase 3: apply safe first-run settings
14. Keep these values:
   - READONLY_MODE=true
   - LOCAL_TOKEN_AUTH_REQUIRED=true
   - APPROVAL_ACTIONS_ENABLED=false
   - APPROVAL_ACTIONS_DRY_RUN=true
   - IMPORT_MUTATION_ENABLED=false
   - IMPORT_MUTATION_DRY_RUN=false
   - UI_MODE=false
15. Only change these when the machine actually requires it:
   - GATEWAY_URL
   - OPENCLAW_HOME
   - CODEX_HOME
   - OPENCLAW_SUBSCRIPTION_SNAPSHOT_PATH
   - UI_PORT
16. If this machine runs OpenClaw on provider API keys or a non-Codex backend instead of a Codex / GPT subscription, do not treat that as an error. Continue the install as long as OpenClaw itself can run, and say clearly that subscription/quota surfaces may be partially visible or unavailable.
17. If `CODEX_HOME` does not exist, or this machine simply does not have Codex / GPT subscription data, do not invent a path. Leave it unset and say clearly that Usage / Subscription will be partially visible or unavailable.
18. If no subscription snapshot exists, do not fabricate `OPENCLAW_SUBSCRIPTION_SNAPSHOT_PATH`. Continue the install and say that quota/subscription cards will show disconnected or estimated states.
19. If `4310` is already in use, choose a free local port, write it to `UI_PORT`, and report the new address clearly.
20. Do not change application logic just because my agent roster differs from the examples in this repo. The control center should reflect the agents configured or visible on my own machine.

Phase 4: verify the install
21. Run:
   - npm run build
   - npm test
   - npm run smoke:ui
22. If any step fails, stop and tell me:
   - which step failed
   - why it failed
   - what I should do next
23. If build / test / smoke pass but the live Gateway is still unreachable, do not classify the install as failed. Classify it as "local UI ready, live observability not connected yet".
24. If OpenClaw itself cannot produce live data because external provider credentials are missing, do not call that a control-center install failure. Classify it separately as "control center installed, upstream OpenClaw prerequisite missing".

Phase 5: hand off a ready-to-run result
25. If verification passes, print:
   - which env values you changed
   - which env values stayed on the defaults
   - the exact command I should run next to launch the UI
   - the login page URL
   - which token I should use to sign in (state the source only; never print the raw token)
   - the first 3 dashboard pages I should open
   - which missing signals are normal for a partially connected environment
   - which capabilities are working now
   - which capabilities are degraded because this machine lacks those data sources
   - which env values or prerequisites I would need later if I want to connect subscription / Codex / live Gateway data
   - which missing provider credentials, external auth, or upstream OpenClaw services are outside the control-center repo and still need operator action

Format your final answer as:
- Environment check
- Differences and degradation assessment
- Actual changes
- Verification result
- Login flow
- Next command
- First pages to open
```
