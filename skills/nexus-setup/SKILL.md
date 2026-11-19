---
name: nexus-setup
description: Connect an AI agent (Claude Code, Codex, Antigravity, Gemini CLI, Cursor or any MCP client) to the owner's NEXUS second brain, and diagnose broken connections. Use when the user asks to "connect/install/set up NEXUS", "give my agent access to my second brain", when the nexus-memory skill finds no working NEXUS surface, or when NEXUS tools return errors like "Local memory access is disabled", "Record unavailable", 401 or connection refused.
---

# NEXUS setup

NEXUS comes in two editions. An agent can use either or both:

- **NEXUS Desktop** (`NEXUS.app`, macOS). It's a native app with a SQLite library and a built-in **read-only MCP stdio server** (plus review-queued proposals). This is the main path.
- **NEXUS OS** (self-hosted server). It's a Fastify memory API on `127.0.0.1:4100` backed by Postgres + pgvector, used with an **agent token**.

## Step 1: Diagnose

```bash
node scripts/nexus-doctor.mjs            # human-readable, read-only
node scripts/nexus-doctor.mjs --json     # machine-readable
```
It finds `NEXUS.app`, handshakes both connectors (`claude`, `codex`), checks whether Claude Code and Codex have a `nexus` MCP server, probes the API and agent token, and prints the exact fix for each gap. It never changes anything and never prints tokens.

## Step 2: Fix what the doctor reports

### Desktop connector (owner does this in the app)
1. Put `NEXUS.app` in its **final location** first (usually `/Applications`). The registration command embeds the path.
2. Open NEXUS → **AI Agents** → enable **Claude Code** and/or **Codex**. Optionally scope it to projects and allow **proposals** (needed for agents to suggest memories).
3. In NEXUS, mark the records agents may see as **verified** and **shared with agents**. Agents see nothing else. This is the #1 reason for empty results.

### Register the MCP server in the agent client
NEXUS never registers itself. Show the user the command and run it only when they ask you to.

**Claude Code**
```bash
claude mcp add --scope local --transport stdio nexus -- '/Applications/NEXUS.app/Contents/MacOS/nexus' --mcp claude
```
(Use `--scope user` to make it available in every project.)

**Codex**
```bash
codex mcp add nexus -- '/Applications/NEXUS.app/Contents/MacOS/nexus' --mcp codex
```

**Any other MCP client** (Antigravity, Gemini CLI, Cursor, Windsurf, Claude Desktop…). Add a stdio server to the client's MCP config, reusing one of NEXUS's two connector identities (`claude` or `codex`). Both are subject to the same sharing rules, and activity is logged under that identity.
```json
{
  "mcpServers": {
    "nexus": {
      "command": "/Applications/NEXUS.app/Contents/MacOS/nexus",
      "args": ["--mcp", "claude"]
    }
  }
}
```
Common config files: Antigravity `~/.gemini/config/mcp_config.json`, Gemini CLI `~/.gemini/settings.json`, Cursor `~/.cursor/mcp.json`, Claude Desktop `~/Library/Application Support/Claude/claude_desktop_config.json`. Restart the client afterwards.

**No MCP support at all?** No registration is needed. `scripts/nexus-mcp.mjs` (bundled here and in nexus-memory) speaks to the same connector over stdio from any shell.

### Server API (optional)
1. Start it from the `nexus-os` repo: `pnpm run db:up && pnpm run db:migrate && pnpm run dev:api`.
2. Give agents the **agent** token, never the owner token. Ask the user to create the file (or create it with them, without echoing the value):
   ```bash
   mkdir -p ~/.config/nexus && umask 177 && cat > ~/.config/nexus/agent.env <<'EOF'
   NEXUS_API_URL=http://127.0.0.1:4100
   NEXUS_AGENT_TOKEN=<value of NEXUS_AGENT_TOKEN from nexus-os/.env>
   EOF
   ```
   If `nexus-os/.env` has no `NEXUS_AGENT_TOKEN`, the owner adds one (e.g. `openssl rand -hex 32`) and restarts the API.
3. Re-run the doctor. It should report "Agent token accepted".

## Step 3: Verify end to end
```bash
node scripts/nexus-mcp.mjs tools          # desktop: lists 7 tools
node scripts/nexus-mcp.mjs search "test"  # desktop: [] until records are verified + shared
node scripts/nexus-api.mjs projects       # server: lists projects
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Local memory access is disabled for this agent.` | Connector off | NEXUS → AI Agents → enable it |
| `Open NEXUS and enable the connector first.` | Library not created yet | Launch NEXUS once, then enable the connector |
| Tools work but every result is `[]` | Nothing is verified **and** shared | Verify + share records in NEXUS; check project scope |
| `Memory write proposals are disabled for this agent.` | Proposals off | Enable proposals for that connector |
| `Project unavailable.` | Project outside connector scope | Add it to the connector's scope, or leave it |
| MCP server fails to start after moving the app | Registered path is stale | Remove and re-add with the new path (`claude mcp remove nexus`) |
| Connector shows disconnected in NEXUS | No live session or heartbeat | Restart the agent client. Revoking in NEXUS also ends sessions |
| API `401` | Wrong or missing token | Re-copy `NEXUS_AGENT_TOKEN`; restart the API after changing it |
| API `403` | Agent tried an owner-only action | Expected: owners verify, edit and delete in NEXUS |
| `Cannot reach the NEXUS API` | API or DB not running | `pnpm run db:up && pnpm run dev:api` |

## Rules
- Never read or modify NEXUS's SQLite/Postgres data directly, edit connector tables, or reuse the owner token to get around a restriction. If the sanctioned path fails, report it and stop.
- Don't enable connectors, change scopes or share records on the owner's behalf. Those are owner decisions made in the app.
