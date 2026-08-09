# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- New **Sessions** dashboard section (nav: 会话 / Sessions) with live session cards: state badge (running / waiting approval / blocked / error / idle), agent, model, token in→out, and last activity, plus an actionable empty state.
- **OpenClaw Gateway** status card in the inspector sidebar showing endpoint, connection health, snapshot age, read-only mode and live session count, with a pairing/start-Gateway hint when the data source is stale (aligned with OpenClaw's actionable connection messaging).
- GitHub Actions CI workflow (`.github/workflows/ci.yml`) that installs dependencies, runs the test suite, and builds the project on Node 22 for every push and pull request.
- `CHANGELOG.md` to track notable changes across releases.

### Fixed
- Dark theme: collapsible card headers (`details summary`) kept a dark-navy color that was hard to read on dark panels; they now use the light dark-theme text color.
- Dark theme: interactive hover states (nav links, buttons, segment toggles, action cards, table rows) no longer flip to light backgrounds with light text — they now keep dark surfaces so labels stay readable.
- Added badge styles for `running`, `waiting_approval` and `error` session states (light and dark).

### Changed
- Theme switcher redesigned as a compact circular skeuomorphic control (34px round buttons with raised/pressed shading) that follows the active theme: light track + light buttons in light mode, dark track + dark buttons in dark mode, and no longer crowds the sidebar brand card.

### Changed
- Mobile polish: new `@media (max-width: 720px)` breakpoint with tighter shell/panel padding, smaller section titles, compact nav rows and touch-friendly spacing.
- Thin scrollbars for horizontally scrollable tables on the global visibility card.

## [0.1.0] - 2026-03-14

### Added
- Security and auth hardening: tightened local-token boundaries, protected sensitive localhost read routes, and added a UI login wall for protected local access.
- Performance improvements: gzip for large HTML responses, session-history short-circuiting for session previews, local session-store/cron/approvals fast paths, and stale-while-revalidate snapshot serving.
- Dark/light theme support with improved dark-theme readability and nested-surface consistency.
- Safe nav prefetch for read-only routes.
- Extracted UI read-model caching into `src/runtime/ui-read-model-cache.ts` and global visibility/overview logic into `src/runtime/global-visibility.ts`.
- Cross-platform UI smoke checks (`scripts/ui-smoke.js`).

### Fixed
- Readonly UI mode no longer penalized for expected missing monitor artifacts.
- Reduced log noise for missing UI preferences in readonly mode.

### Changed
- Kept `src/ui/server.ts` as a thinner route-and-render shell after extracting shared runtime logic.



