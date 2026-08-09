# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- GitHub Actions CI workflow (`.github/workflows/ci.yml`) that installs dependencies, runs the test suite, and builds the project on Node 22 for every push and pull request.
- `CHANGELOG.md` to track notable changes across releases.

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
