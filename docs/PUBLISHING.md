# Publishing Guide

This project is safest to publish as its own standalone repository.

## Recommended release boundary
- Publish only the `control-center/` directory.
- Do not publish the larger parent workspace/repository.
- Keep runtime output, build output, local env files, and internal planning artifacts out of the public repo.

## Best-practice flow

### 1. Work inside `control-center/`
All release checks and commits should happen from this directory.

### 2. Run the public-release audit
```bash
npm run release:audit
npm run build
npm test
npm run smoke:ui
```

### 3. Keep the first public repo safe
Use these defaults for the public project:
- `READONLY_MODE=true`
- `LOCAL_TOKEN_AUTH_REQUIRED=true`
- `APPROVAL_ACTIONS_ENABLED=false`
- `IMPORT_MUTATION_ENABLED=false`

### 3b. Recommended distribution artifact
Build the single-file bundle and ship it with plain Node (no npm install for the operator):
```bash
npm run build:single
# ship dist/control-center.js
node dist/control-center.js   # or npm run start:single
```
Optional preview without OpenClaw: `npm run dev:demo` (DEMO_MODE=true).

### 4. Create a standalone local git repo here
If this directory is not already its own git repo:
```bash
git init -b main
git add .
git commit -m "Initial public release"
```

### 5. Create an empty GitHub repository
Create a new empty repository on GitHub for `control-center` only.

### 6. Connect and push
```bash
git remote add origin <your-github-repo-url>
git push -u origin main
```

## Pre-push checklist
- README renders correctly on GitHub
- screenshots load
- no absolute personal home paths
- no hard-coded secrets or live tokens
- no runtime artifacts
- no internal-only planning or workflow files
- tests/build/smoke all pass
