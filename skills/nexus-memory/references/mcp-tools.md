# NEXUS Desktop MCP tools

Server name: `nexus`. Transport: stdio, launched as `<NEXUS.app>/Contents/MacOS/nexus --mcp <claude|codex>`. Protocol versions: 2024-11-05, 2025-03-26, 2025-06-18, 2025-11-25.

Every tool returns one text content block containing JSON. Agents see two things, always inside the connector's project scope:
1. The owner's records where `shared = true`, `verification = "verified"` and `privacy != "private"`.
2. **Their own memories** saved with `remember` (unverified or verified), never another agent's. When the owner marks one disputed or outdated it disappears.

Local file paths are replaced with `"Local verified document"`. Records replaced by a newer readable record (a confirmed `supersedes` edge) are hidden from `search_memory` and `find_solutions`.

## search_memory
Hybrid full-text (FTS5) + semantic search.
- `query` (string, required)
- `project_id` (string): restrict to one project
- `mode`: `hybrid` (default) | `fts` | `semantic`

Returns up to 20, best first: `[{ id, kind, title, snippet, score, trust, projectId, memoryType, matchedBy, updated }]`
- `snippet`: first ~320 chars of the body, so most recalls need no `read_memory` follow-up.
- `score`: relative rank score (only compare within one result list).
- `trust`: `verified` (owner truth) or `your_unverified_memory` (a lead you saved earlier).

## remember
Saves a durable memory instantly (supermemory-style) so later sessions can recall it. Stored as kind `memory`, `verification: unverified`, private to you and the owner. Requires the connector's write permission (the same NEXUS → AI Agents toggle as proposals).
- `content` (string, required): self-contained and specific
- `title` (string): defaults to the first line of `content` (≤120 chars)
- `memory_type`: `general, architecture, decision, achievement, bug_resolution, lesson, blocker, roadmap, agent_finding, personal_note, documentation` (default `agent_finding`)
- `project_id`: must be in scope; **required** when the connector is limited to selected projects
- `tags`: comma-separated string
- `updates`: ID of **your own** earlier memory that this replaces. The old one is marked outdated and linked with `supersedes`, so recall returns only the latest.

Returns `{ id, status: "saved" | "updated" | "already_saved", replaced?, message }`. Identical content is deduplicated. To change the owner's records use `propose_memory` instead.

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
| `Memory writes are disabled for this agent.` | `remember` needs write permission: owner enables it in NEXUS → AI Agents |
| `You can only update memories you saved yourself.` | `updates` pointed at someone else's record; use `propose_memory` with `action: update` |
| `Enable this connector in NEXUS first.` / `Open NEXUS and enable the connector first.` | Same; the library may not exist yet |
| `Initialize the connection first.` | Client bug: send `initialize` before other calls |
| `Project unavailable.` / `Record unavailable.` | Not shared/verified or outside scope. Don't work around it |
| `This agent is not authorized for that project.` | `project_id` outside connector scope |
