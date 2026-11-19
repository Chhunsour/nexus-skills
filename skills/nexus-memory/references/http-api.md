# NEXUS OS memory API (server edition)

Base: `http://127.0.0.1:4100/api/memory` (localhost only). Every request needs `Authorization: Bearer <token>`. Optional `x-nexus-actor: <name>` labels writes; agents are always stored as `agent:<name>`.

## Roles
| Role | Token | Can |
|---|---|---|
| owner | `NEXUS_API_TOKEN` | everything |
| agent | `NEXUS_AGENT_TOKEN` | read, search, generate context, record outcomes, create **unverified** memories and edges |

Agents get `403` on verify, edit, delete, sources, ingestion and policy. **Skills must only use the agent token.**

## Agent-usable routes
| Method | Route | Body / query | Returns |
|---|---|---|---|
| GET | `/projects` | | `{ workspace, projects: [{id, slug, name, memoryCount, …}] }` |
| GET | `/projects/:id/overview` | | project overview |
| GET | `/memories` | `projectId` (req), `q`, `type`, `verification`, `status=active\|archived\|all`, `from`/`to` (YYYY-MM-DD), `limit≤200`, `offset` | `{ total, items }` |
| GET | `/memories/:id` | | memory + content + source + `relations` |
| GET | `/memories/:id/related` | | relations with direction |
| POST | `/memories` | `{ projectId, type, title≤200, content≤24000, tags≤12, privacy=agents }` | created memory (origin `agent`, unverified) |
| POST | `/edges` | `{ fromId, toId, relation, evidence≤500 }` | `{ id }` |
| GET | `/search` | `projectId`, `q` (req), plus list filters | `{ hits: [{ id, score, why, memory }], keyword, semantic }` |
| GET | `/graph` | `projectId`, `expanded`, `type`, `from`, `to`, `perCluster` | graph clusters |
| POST | `/context` | `{ task, projectId?, tokenBudget 500–60000 (6000), includeSensitive=false }` | context package |
| GET | `/context/:id` | | stored context package |
| POST | `/outcomes` | `{ projectId, agent, task≤300, status: succeeded\|failed\|partial, summary≤8000, contextPackageId?, relatedMemoryIds≤20 }` | `{ runId, memory }` |
| GET | `/audit` | `projectId`, `limit` | audit events |

## Enums
- Memory `type`: `project, architecture, decision, task, source_code, document, conversation, research, issue, milestone, fact`
- `relation`: `DEPENDS_ON, SUPERSEDES, RELATED_TO, BLOCKS, IMPLEMENTS, DOCUMENTS, PART_OF, CONTRADICTS`
- `verification`: `unverified, verified, disputed, outdated`
- `privacy`: `private, agents, sensitive`
- `origin`: `user, ingest, agent`

## Context package (`nexus.context/v1`)
`POST /context` selects stored records only. It never writes prose of its own. If `projectId` is omitted, the project is resolved from a name contained in `task`.

Sections (share of token budget): identity 10%, architecture 16%, locations 10% (only when the task names something in a file), progress 10% (recent first), decisions 14%, issues 10%, history 10% (recent first), constraints 8% (records tagged `constraint`/`security`/`policy` on decision/fact/architecture), references 12%.

Each item: `{ memoryId, type, title, excerpt, truncated, verification, origin, updatedAt, source, score, why[], tokens, stale? }`. The package also carries `recommendations`, `missing`, `warnings` (e.g. contradictions, stale sources), `excluded`, `tokens`, and a rendered `markdown`. Keep its `id` and pass it as `contextPackageId` when recording the outcome.

An empty section prints an explicit note, e.g. "No open issues are stored. That is not evidence that there are none."

## Outcomes
Stored as a `task` memory titled with the task, tagged `agent-outcome` + status, content `Outcome: <status>\nReported by: agent:<name>\n\n<summary>`, marked resolved when `succeeded`, plus an `agent_runs` row. `relatedMemoryIds` become `RELATED_TO` edges.
