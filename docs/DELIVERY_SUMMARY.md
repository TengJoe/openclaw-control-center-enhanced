# Delivery Summary

## Repositories

### `TengJoe/openclaw-control-center`
- Role: upstream-aligned working fork
- Purpose: primary integration branch for changes that still track the original project closely
- Best use:
  - compare against upstream issues and PRs
  - keep deployment aligned with the upstream-derived code line
  - land hardening, performance, and structure work before deciding whether it also belongs in the independent project

### `TengJoe/openclaw-control-center-enhanced`
- Role: independent product-facing repository
- Purpose: downstream repository for public positioning, attribution, and longer-term product identity
- Best use:
  - independent presentation
  - product-facing docs and attribution
  - future divergence when the project is no longer maintained primarily as an upstream-aligned fork

## Local Deployment

Current deployment source:

- local deployed path: `~/.openclaw/workspace/agents/main/control-center`
- current git remote: the local working fork at `/Users/qinhuaisanren/Documents/OC/forks/openclaw-control-center-fork`
- deployment should stay on the fork for now

Reasoning:

- the fork is the cleanest place to keep following upstream changes
- the deployment path is already stabilized on the fork
- the enhanced repository is ready and validated, but it is still better treated as the independent public-facing project until you explicitly want to switch operational ownership

## What Was Added Downstream

Main downstream work in this phase:

- localhost auth hardening and UI login wall
- readonly boundary fixes
- dark/light theme support and dark-mode cleanup
- gzip and route-response performance work
- session-history short-circuiting
- local session-store, cron, and approvals fast paths
- stale-while-revalidate snapshot serving
- cross-platform smoke checks
- extraction of UI read-model cache and global visibility logic out of the monolithic UI server

## Recommended Ongoing Workflow

1. Continue deploying from the fork.
2. Continue reviewing upstream issues and PRs before major changes.
3. Promote changes into the enhanced repository when they are stable and worth carrying as part of the independent product line.
4. Switch deployment to the enhanced repository only when it becomes the long-term operational source of truth.
