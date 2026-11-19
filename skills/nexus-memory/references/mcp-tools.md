# NEXUS Desktop MCP tools

Server name: `nexus`. Transport: stdio, launched as `<NEXUS.app>/Contents/MacOS/nexus --mcp <claude|codex>`. Protocol versions: 2024-11-05, 2025-03-26, 2025-06-18, 2025-11-25.

Every tool returns one text content block containing JSON. Agents only ever see records where **all** of these hold: `shared = true`, `verification = "verified"`, `privacy != "private"`, and (if the connector is project-scoped) the record's project is in scope. Local file paths are replaced with `"Local verified document"`.

## search_memory
Hybrid full-text (FTS5) + semantic search.
- `query` (string, required)
- `project_id` (string): restrict to one project
- `mode`: `hybrid` (default) | `fts` | `semantic`

Returns up to 20: `[{ id, kind, title, projectId, memoryType, matchedBy }]`

## read_memory
- `id` (string, required)

Returns one sanitized record (title, body, kind, memory type, project, tags, source, timestamps…). Error `Record unavailable.` means missing **or** not shared with you.

## get_project_context
- `project_id` (string, required). It must be a record of kind `project`.

Returns `{ project, decisions[≤15], milestones[≤15], solutions[≤15], records[≤25] }` where list items are `{ id, kind, title, memoryType, updated }`. Follow up with `read_memory` for bodies.

## explore_relationships
- `id` (string, required)
- `depth` (1–2, default 1)

Returns `{ nodes: [{id, kind, title}], edges: [{from, to, kind}] }`. Only confirmed edges. Edge kinds: `related to`, `depends on`, `supersedes`, `documents`, `assigned to`, `created by`, `solved by`, `documented in`, `references`, `belongs to`.

## list_recent_decisions
- `project_id` (string, optional)
- `limit` (1–30, default 12)

Returns sanitized records of kind `decision` or `milestone`.

## find_solutions
- `query` (string, required)
- `project_id` (string, optional)

Hybrid search filtered to kinds `solution`, `problem`, `decision`, `memory` or memory types `bug_resolution`, `lesson`, `blocker`. Returns ≤10 sanitized records. **Use this first for any bug.**

## propose_memory
Queues a proposal in the owner's Review Queue. Never writes directly. Fails with `Memory write proposals are disabled for this agent.` unless the owner allowed proposals for this connector.
- `action` (required): `create` | `update` | `link`
- `title` (required, ≤200 chars)
- `body` (required, ≤256 KiB)
- `kind`: one of `project, note, idea, memory, decision, task, agent, conversation, document, technology, milestone, problem, solution` (default `memory`)
- `memory_type`: `general, architecture, decision, achievement, bug_resolution, lesson, blocker, roadmap, agent_finding, personal_note, documentation, relationship` (default `agent_finding`)
- `project_id`: must be inside the connector's scope
- `target_record_id`: the record to update or link (must be visible to you)
- `rationale`: why the owner should accept it
- `tags`: comma-separated string

Returns `{ proposalId, status: "pending_review", message }`.

## Common errors
| Message | Meaning / fix |
|---|---|
| `Local memory access is disabled for this agent.` | Owner must enable the connector in NEXUS → AI Agents |
| `Enable this connector in NEXUS first.` / `Open NEXUS and enable the connector first.` | Same; the library may not exist yet |
| `Initialize the connection first.` | Client bug: send `initialize` before other calls |
| `Project unavailable.` / `Record unavailable.` | Not shared/verified or outside scope. Don't work around it |
| `This agent is not authorized for that project.` | `project_id` outside connector scope |
