---
name: nexus-capture
description: Distill a codebase, docs folder, or the current work session into high-quality memory proposals for the owner's NEXUS second brain (architecture, decisions, conventions, known issues, lessons). Use when the user says "add this project to NEXUS", "seed/bootstrap my second brain from this repo", "save what we learned this session to NEXUS", "capture this decision", or when nexus-memory recall shows a project has little or no stored knowledge. Proposals go to the owner's review queue; nothing is written as verified.
---

# NEXUS capture

Turn scattered knowledge into a small set of durable, searchable memories that the owner reviews once and every future agent benefits from. Quality beats volume: 8 excellent records are worth more than 80 noisy ones.

Prerequisite: a working NEXUS surface (see **nexus-memory** §1, or run the **nexus-setup** doctor). Scripts referenced below live in this skill's `scripts/` folder.

## Workflow

### 1. Scope
- Identify the NEXUS project. Desktop: `search_memory {query:"<name>"}` and take the record with kind `project`. API: `node scripts/nexus-api.mjs projects`.
- If the project doesn't exist in NEXUS: on Desktop, propose one (`kind: "project"`, body = identity and objectives). On the API, ask the owner to create it (agents can't).
- Agree on the source with the user: whole repo, a docs folder, specific files, or "this session".

### 2. Inventory what's already known
Pull existing knowledge first so you don't duplicate it: `get_project_context` + `list_recent_decisions` (Desktop), or `nexus-api.mjs context "<project>"` (API). Note the titles. Anything already covered is either skipped or becomes an `update` proposal.

### 3. Survey the source (read, don't guess)
For a repo, in this order, stopping when you have enough:
1. `README*`, `docs/`, `ARCHITECTURE*`, `ADR`/`decisions/` folders, `CONTRIBUTING*`, `AGENTS.md`/`CLAUDE.md`
2. Manifests and config: `package.json`, `pyproject.toml`, `Cargo.toml`, compose/infra files, CI workflows
3. `git log --oneline -50` and notable merge or fix commits for milestones and bug resolutions
4. Entry points and top-level module layout

For a session: the decisions taken, bugs root-caused, gotchas hit and the outcome.

### 4. Draft candidates
Aim for these categories (skip any with no real evidence):

| Category | Desktop kind / memory_type | API type (+tags) |
|---|---|---|
| Project identity and goals | `project` / `general` | `project` |
| Architecture and stack | `technology` or `memory` / `architecture` | `architecture` |
| Key decisions (with why) | `decision` / `decision` | `decision` |
| Constraints and security policy | `decision` / `decision` | `decision` + `constraint`/`security` |
| Conventions and how-to (build, test, release) | `document` / `documentation` | `document` |
| Known issues and blockers | `problem` / `blocker` | `issue` |
| Solved bugs and lessons | `solution` / `bug_resolution` or `lesson` | `fact` or `research` + `lesson` |
| Milestones | `milestone` / `achievement` | `milestone` |

Each candidate uses this body template, written for an agent with zero context:
```
What: <one sentence>
Why: <rationale / root cause>
Details: <specifics: components, commands, versions; repo-relative paths>
Alternatives rejected: <decisions only>
Evidence: <file:line, commit, doc section>
Status / follow-ups: <if any>
```
Rules: one idea per record; a specific, searchable title; cite evidence for every claim; mark inferences as inferences ("Inferred from compose.yml: …"); no secrets, tokens, `.env` values, personal data or absolute home-directory paths; no pasted code beyond a few essential lines.

### 5. Confirm with the user (always)
Show a numbered table (title, kind/type, one-line summary, and new or update) and ask which to submit. Proposals land in the owner's review queue, so don't flood it. Default batch ≤ 12.

### 6. Submit
- **Desktop MCP**: `propose_memory` per approved item (`action: "create"`, or `"update"` with `target_record_id`). Add a `link` proposal when two records clearly relate (e.g. a solution to the problem it solves).
  - Shell fallback: `node scripts/nexus-mcp.mjs propose --title "…" --body "…" --kind decision --type decision --project <id> --rationale "Captured from README §Architecture" --tags "architecture"`
- **API**: `node scripts/nexus-api.mjs remember <project> <type> "<title>" "<content>" --tags a,b --agent <name>`, then `link <from> <RELATION> <to> "<evidence>"` for relationships.

If proposals are disabled, stop and tell the user how to enable them (NEXUS → AI Agents). Don't fall back to anything else.

### 7. Report
List what was submitted (title → proposal/memory ID), what was skipped as duplicate, and remind the user to review the queue in NEXUS. Unreviewed proposals are invisible to other agents until verified and shared.
