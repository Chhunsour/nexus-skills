#!/usr/bin/env node
/*
  nexus-mcp: call the NEXUS Desktop MCP connector from any shell, no MCP registration needed.

    node nexus-mcp.mjs tools
    node nexus-mcp.mjs search "<query>" [--project <id>] [--mode hybrid|fts|semantic]
    node nexus-mcp.mjs read <record-id>
    node nexus-mcp.mjs context <project-id>
    node nexus-mcp.mjs related <record-id> [--depth 1|2]
    node nexus-mcp.mjs decisions [--project <id>] [--limit 1-30]
    node nexus-mcp.mjs solutions "<query>" [--project <id>]
    node nexus-mcp.mjs remember "<content>" [--title "<title>"] [--type agent_finding] [--project <id>]
                                [--tags "a,b"] [--updates <your-earlier-memory-id>]
    node nexus-mcp.mjs propose --title "<title>" --body "<body>" [--kind memory] [--type agent_finding]
                               [--project <id>] [--action create|update|link] [--target <record-id>]
                               [--rationale "<why>"] [--tags "a,b"]
    node nexus-mcp.mjs call <tool-name> '<json-arguments>'

  Options (or environment):
    --as claude|codex   connector identity to use        (NEXUS_CONNECTOR, default: claude)
    --app <path>        path to NEXUS.app or its binary  (NEXUS_APP, default: /Applications/NEXUS.app)
    --raw               print the tool's raw text instead of pretty JSON

  Writes: `remember` saves your own unverified memory (recallable by you at once); `propose_memory` queues a
  change to the owner's records for review. Reads return the owner's verified+shared records plus your own memories.
*/
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(`--${name}`);
  return at < 0 ? undefined : args.splice(at, 2)[1];
};
const has = (name) => {
  const at = args.indexOf(`--${name}`);
  if (at >= 0) args.splice(at, 1);
  return at >= 0;
};

function usage(code = 1) {
  const text = fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0].split("/*")[1];
  (code ? console.error : console.log)(text);
  process.exit(code);
}

function findBinary(hint) {
  const candidates = hint
    ? [hint, path.join(hint, "Contents", "MacOS", "nexus")]
    : [
        "/Applications/NEXUS.app/Contents/MacOS/nexus",
        path.join(os.homedir(), "Applications", "NEXUS.app", "Contents", "MacOS", "nexus"),
      ];
  return candidates.find((p) => {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  });
}

const raw = has("raw");
const connector = flag("as") ?? process.env.NEXUS_CONNECTOR ?? "claude";
const binary = findBinary(flag("app") ?? process.env.NEXUS_APP);
const [command, ...rest] = args;
if (!command || command === "help" || command === "--help") usage(command ? 0 : 1);
if (!["claude", "codex"].includes(connector)) {
  console.error(`Unknown connector "${connector}". NEXUS offers two connector identities: claude, codex.`);
  process.exit(1);
}
if (!binary) {
  console.error("NEXUS Desktop was not found. Install NEXUS.app in /Applications or pass --app <path> (or set NEXUS_APP).");
  process.exit(2);
}

function session(calls) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, ["--mcp", connector], { stdio: ["pipe", "pipe", "pipe"] });
    const replies = new Map();
    let buffer = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("NEXUS did not answer within 20 seconds."));
    }, 20_000);
    const send = (msg) => child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...msg })}\n`);
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      let nl;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        replies.set(msg.id, msg);
        if (msg.id === 1 && msg.error) {
          finish();
          return;
        }
        if (msg.id === 1) {
          send({ method: "notifications/initialized" });
          calls.forEach((call, index) => send({ id: index + 2, ...call }));
        }
        if (replies.size === calls.length + 1) finish();
      }
    });
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", () => {
      clearTimeout(timer);
      const init = replies.get(1);
      if (!init) return reject(new Error(stderr.trim() || "NEXUS closed the connection before it initialized."));
      if (init.error) return reject(new Error(init.error.message));
      resolve(calls.map((_, index) => replies.get(index + 2)));
    });
    function finish() {
      child.stdin.end();
    }
    send({ id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "nexus-skills", version: "1.0.0" } } });
  });
}

function toolCall(name, argumentsObject) {
  return { method: "tools/call", params: { name, arguments: argumentsObject } };
}

function compact(object) {
  return Object.fromEntries(Object.entries(object).filter(([, v]) => v !== undefined && v !== ""));
}

let request;
switch (command) {
  case "tools":
    request = { method: "tools/list", params: {} };
    break;
  case "search":
    if (!rest[0]) usage();
    request = toolCall("search_memory", compact({ query: rest[0], project_id: flag("project"), mode: flag("mode") }));
    break;
  case "read":
    if (!rest[0]) usage();
    request = toolCall("read_memory", { id: rest[0] });
    break;
  case "context":
    if (!rest[0]) usage();
    request = toolCall("get_project_context", { project_id: rest[0] });
    break;
  case "related": {
    if (!rest[0]) usage();
    const depth = flag("depth");
    request = toolCall("explore_relationships", compact({ id: rest[0], depth: depth ? Number(depth) : undefined }));
    break;
  }
  case "decisions": {
    const limit = flag("limit");
    request = toolCall("list_recent_decisions", compact({ project_id: flag("project"), limit: limit ? Number(limit) : undefined }));
    break;
  }
  case "solutions":
    if (!rest[0]) usage();
    request = toolCall("find_solutions", compact({ query: rest[0], project_id: flag("project") }));
    break;
  case "remember":
    if (!rest[0]) usage();
    request = toolCall(
      "remember",
      compact({ content: rest[0], title: flag("title"), memory_type: flag("type"), project_id: flag("project"), tags: flag("tags"), updates: flag("updates") }),
    );
    break;
  case "propose": {
    const proposal = compact({
      action: flag("action") ?? "create",
      title: flag("title"),
      body: flag("body"),
      kind: flag("kind"),
      memory_type: flag("type"),
      project_id: flag("project"),
      target_record_id: flag("target"),
      rationale: flag("rationale"),
      tags: flag("tags"),
    });
    if (!proposal.title || !proposal.body) {
      console.error("propose needs --title and --body.");
      process.exit(1);
    }
    request = toolCall("propose_memory", proposal);
    break;
  }
  case "call": {
    if (!rest[0]) usage();
    let parsed = {};
    try {
      parsed = rest[1] ? JSON.parse(rest[1]) : {};
    } catch {
      console.error("The arguments must be a JSON object, e.g. '{\"query\":\"auth\"}'.");
      process.exit(1);
    }
    request = toolCall(rest[0], parsed);
    break;
  }
  default:
    usage();
}

try {
  const [reply] = await session([request]);
  if (!reply) throw new Error("NEXUS returned no reply.");
  if (reply.error) throw new Error(reply.error.message);
  if (command === "tools") {
    for (const tool of reply.result.tools) console.log(`${tool.name}\t${tool.description}`);
  } else {
    const text = reply.result?.content?.map((c) => c.text).join("\n") ?? "";
    if (raw) console.log(text);
    else {
      try {
        const value = JSON.parse(text);
        console.log(JSON.stringify(value, null, 2));
        if (Array.isArray(value) && value.length === 0 && command !== "propose") {
          console.error("(No results. Agents only see records the owner has verified and shared, plus memories they saved with remember; empty is not proof of absence.)");
        }
      } catch {
        console.log(text);
      }
    }
  }
} catch (error) {
  console.error(`NEXUS: ${error.message}`);
  process.exit(1);
}
