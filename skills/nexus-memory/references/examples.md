# Worked examples

## 1. Fixing a bug (Desktop MCP)

User: "The import keeps skipping my notes folder in Atlas, fix it."

```
search_memory {query: "Atlas"}                       → [{id:"p-41", kind:"project", title:"Atlas"} …]
find_solutions {query: "import skips folder", project_id:"p-41"}
  → [{title:"Importer skips hard-linked files by design", memoryType:"bug_resolution", …}]
read_memory {id:"r-907"}                             → body explains the hard-link guard and the fix
```
Agent to user: "NEXUS has a verified note that the importer deliberately skips hard-linked files. Your folder is synced by a tool that hard-links, so that's the cause rather than a bug…"

After fixing (if a real change was made):
```
propose_memory {
  action:"create", kind:"solution", memory_type:"bug_resolution", project_id:"p-41",
  title:"Importer: synced folders using hard links are skipped; copy-on-import option added",
  body:"What: …\nWhy: …\nDetails: src-tauri/src/files.rs …\nEvidence: commit abc123, test files::hardlink_copy\nStatus / follow-ups: none",
  rationale:"Prevents re-diagnosing the same report", tags:"importer,files"
}
```
Agent to user: "Proposed 1 memory to NEXUS ('Importer: synced folders…'). It's in your Review Queue."

## 2. Continuing a project (Server API)

```bash
node scripts/nexus-api.mjs context "Continue working on NEXUS OS: add rate limiting to the API" --agent claude
# → markdown package; stderr: (context package 6f1e…; pass --context 6f1e… …)
node scripts/nexus-api.mjs search nexus-os "rate limit" --agent claude
```
Work proceeds, respecting the Constraints section (e.g. "all services bind to 127.0.0.1").

```bash
node scripts/nexus-api.mjs outcome nexus-os partial "Add API rate limiting" \
  "Added @fastify/rate-limit on /api/memory (60 req/min per token). Not yet applied to /health. Tests: apps/api/src/__tests__/rate.test.ts." \
  --context 6f1e… --related 1c2d…,9a8b… --agent claude
```

## 3. A decision the user made mid-session

User: "Let's drop Redis entirely and keep pg-boss."

```bash
node scripts/nexus-api.mjs search nexus-os "redis" --agent claude     # check for an existing decision
node scripts/nexus-api.mjs remember nexus-os decision "Job queue stays on pg-boss; no Redis" \
  $'What: Background jobs use pg-boss in Postgres; Redis is not added.\nWhy: avoid extra broker memory on the shared Mac; Postgres already durable.\nAlternatives rejected: BullMQ+Redis.\nStatus: decided by owner 2026-11-19 in session.' \
  --tags architecture,constraint --agent claude
```
(Use `$'…'` quoting in bash so `\n` becomes real newlines.) If an older record said otherwise, also `link <new> SUPERSEDES <old> "Owner decision 2026-11-19"`.

## 4. Nothing found

`search_memory` returns `[]`. Say "NEXUS has nothing shared about the payment flow, so I'll work from the code", not "this was never decided". Don't keep searching with dozens of variants. Two or three phrasings is enough.
