# Release Note 2026-03-14

## Summary

This release turns the enhanced edition into a smoother long-running local control center with clearer boundaries, safer defaults, and more reviewable code.

## Main Improvements

1. Security and auth
- tightened local-token boundaries
- protected sensitive localhost read routes
- added a UI login wall for protected local access

2. Performance and responsiveness
- added gzip for large HTML responses
- skipped unnecessary session-history reads for session preview
- preferred local session stores over slow CLI listing
- preferred local cron and approvals files over slow CLI reads
- switched snapshot serving to stale-while-revalidate so page switches stay fast after cache expiry

3. Runtime structure
- extracted UI read-model caching into `src/runtime/ui-read-model-cache.ts`
- extracted global visibility / overview data logic into `src/runtime/global-visibility.ts`
- kept `src/ui/server.ts` as a thinner route-and-render shell

4. UI and operator experience
- improved dark-theme readability and nested-surface consistency
- added safe nav prefetch for read-only routes
- reduced readonly log noise for missing UI preferences
- aligned health semantics so readonly UI mode is no longer penalized for expected missing monitor artifacts

## Validation

The enhanced repository was validated with:

- `npm install`
- `npm run build`
- `npm test`
- `npm run smoke:ui`

## Deployment Recommendation

Do not switch the local production-like deployment away from the fork yet.

Why:

- the fork remains the best upstream-aligned integration branch
- the enhanced repository is now stable and public, but can continue evolving as the product-facing repository first
- switching deployment should wait until you decide that the enhanced repository, not the fork, is your long-term operational source of truth

## Attribution

Original upstream project:

- `TianyiDataScience/openclaw-control-center`
- https://github.com/TianyiDataScience/openclaw-control-center

This repository is a downstream derivative focused on productization, hardening, performance work, and maintainability improvements.
