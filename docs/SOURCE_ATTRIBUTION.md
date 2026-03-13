# Source Attribution

## Upstream Source

This repository is derived from the original open-source project:

- Original author / upstream project:
  - `TianyiDataScience/openclaw-control-center`
  - https://github.com/TianyiDataScience/openclaw-control-center

The original author created the base product concept, the local-control-center direction, and the initial implementation foundation.

## Scope of This Edition

This edition keeps the local-first, readonly-first control-center idea, while extending it in four main directions:

1. Security hardening
- tightened localhost token boundaries
- protected sensitive local read APIs
- added a UI login wall
- aligned readonly behavior with documented expectations

2. UX and operator clarity
- added light / dark / system theme switching
- improved dark-mode contrast and nested-surface styling
- simplified login copy
- rewrote setup docs for real local installs

3. Performance and LCP work
- added Gzip compression for large HTML responses
- short-circuited session preview history reads when the overview only needs summary-level runtime evidence
- prioritized local session-store reads over slow CLI calls
- cached slow metadata paths and shifted snapshot refreshes to stale-while-revalidate

4. Engineering and maintainability
- added a cross-platform `smoke:ui`
- improved Windows-friendly test behavior
- added project-structure documentation
- started extracting UI read-model cache logic out of the monolithic `src/ui/server.ts`

## Maintainer Notes

If you redistribute or publish further derivatives of this repository, keep the upstream attribution visible and make it clear which enhancements were added downstream.
