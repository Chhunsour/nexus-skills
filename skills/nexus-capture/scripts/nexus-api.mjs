#!/usr/bin/env node
/*
  nexus-api: the agent-side client for the NEXUS OS memory API (the self-hosted server edition).

    node nexus-api.mjs projects
    node nexus-api.mjs context "<task, naming the project>" [--project <slug|id>] [--budget 500-60000] [--json]
    node nexus-api.mjs search <project> "<query>" [--type decision] [--limit 20] [--json]
    node nexus-api.mjs get <memory-id>
    node nexus-api.mjs related <memory-id>
    node nexus-api.mjs outcome <project> <succeeded|failed|partial> "<task>" "<summary>"
                               [--context <context-package-id>] [--related <id,id>]
    node nexus-api.mjs remember <project> <type> "<title>" "<content>" [--tags a,b]
    node nexus-api.mjs link <from-id> <RELATION> <to-id> ["<evidence>"]

  Configuration (first match wins):
    environment            NEXUS_API_URL (or NEXUS_API_INTERNAL_URL), NEXUS_AGENT_TOKEN
    $NEXUS_ENV_FILE        a KEY=value file
    ~/.config/nexus/agent.env
  Default URL: http://127.0.0.1:4100. Options: --agent <name> labels your writes (default: cli).

  This client only uses the AGENT token. Everything it writes is stored as agent-origin and unverified;
  only the owner can verify, correct or delete memories.
*/
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

function loadEnvFile(file) {
  if (!file || !fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || line.trim().startsWith("#")) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, "$2");
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}
loadEnvFile(process.env.NEXUS_ENV_FILE);
loadEnvFile(path.join(os.homedir(), ".config", "nexus", "agent.env"));

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

const json = has("json");
const agent = flag("agent") ?? "cli";
const budget = flag("budget");
const base = (process.env.NEXUS_API_URL ?? process.env.NEXUS_API_INTERNAL_URL ?? "http://127.0.0.1:4100").replace(/\/+$/, "");
const token = process.env.NEXUS_AGENT_TOKEN;
const [command, ...rest] = args;
if (!command || command === "help" || command === "--help") usage(command ? 0 : 1);
if (!token) {
  console.error("No NEXUS_AGENT_TOKEN found. Put NEXUS_API_URL and NEXUS_AGENT_TOKEN in ~/.config/nexus/agent.env (see the nexus-setup skill).");
  process.exit(2);
}

async function call(method, route, body) {
  let response;
  try {
    response = await fetch(`${base}/api/memory${route}`, {
      method,
      headers: { authorization: `Bearer ${token}`, "x-nexus-actor": agent, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    console.error(`Cannot reach the NEXUS API at ${base} (${error.cause?.code ?? error.message}). Is it running? (pnpm run db:up && pnpm run dev:api)`);
    process.exit(3);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(`${response.status}: ${data.message ?? "request failed"}`);
    if (data.detail) console.error(JSON.stringify(data.detail, null, 2));
    process.exit(1);
  }
  return data;
}

async function projectId(name) {
  const { projects } = await call("GET", "/projects");
  const match = projects.find((p) => p.id === name || p.slug === name || p.name.toLowerCase() === String(name).toLowerCase());
  if (!match) {
    console.error(`No project "${name}". Indexed projects: ${projects.map((p) => `${p.slug} (${p.name})`).join(", ") || "none"}`);
    process.exit(1);
  }
  return match.id;
}

const print = (value) => console.log(JSON.stringify(value, null, 2));

if (command === "projects") {
  const { projects } = await call("GET", "/projects");
  if (json) print(projects);
  else for (const p of projects) console.log(`${p.slug}\t${p.memoryCount ?? "?"} memories\t${p.name}\t${p.id}`);
} else if (command === "context" && rest[0] !== undefined) {
  const project = flag("project");
  const pkg = await call("POST", "/context", {
    task: rest[0],
    ...(project ? { projectId: await projectId(project) } : {}),
    ...(budget ? { tokenBudget: Number(budget) } : {}),
  });
  if (json) print(pkg);
  else {
    console.log(pkg.markdown);
    console.error(`\n(context package ${pkg.id}; pass --context ${pkg.id} when you record the outcome)`);
  }
} else if (command === "search" && rest[1]) {
  const params = new URLSearchParams({ projectId: await projectId(rest[0]), q: rest[1] });
  const type = flag("type");
  const limit = flag("limit");
  if (type) params.set("type", type);
  if (limit) params.set("limit", limit);
  const result = await call("GET", `/search?${params}`);
  if (json) print(result);
  else {
    console.log(`${result.hits.length} hits (${result.keyword?.mode ?? "keyword"}${result.semantic?.enabled ? " + semantic" : ", keyword only"})`);
    for (const hit of result.hits) console.log(`${hit.memory.id}  [${hit.memory.type}/${hit.memory.verification}]  ${hit.memory.title}`);
  }
} else if (command === "get" && rest[0]) {
  print(await call("GET", `/memories/${rest[0]}`));
} else if (command === "related" && rest[0]) {
  print(await call("GET", `/memories/${rest[0]}/related`));
} else if (command === "outcome" && rest[3]) {
  const context = flag("context");
  const related = flag("related");
  const result = await call("POST", "/outcomes", {
    projectId: await projectId(rest[0]),
    status: rest[1],
    task: rest[2],
    summary: rest[3],
    agent,
    ...(context ? { contextPackageId: context } : {}),
    ...(related ? { relatedMemoryIds: related.split(",").map((s) => s.trim()).filter(Boolean) } : {}),
  });
  console.log(`Recorded as memory ${result.memory.id} (agent origin, unverified). Run ${result.runId}.`);
} else if (command === "remember" && rest[3]) {
  const tags = flag("tags");
  const memory = await call("POST", "/memories", {
    projectId: await projectId(rest[0]),
    type: rest[1],
    title: rest[2],
    content: rest[3],
    ...(tags ? { tags: tags.split(",").map((s) => s.trim()).filter(Boolean) } : {}),
  });
  console.log(`Stored memory ${memory.id ?? memory.memory?.id} (agent origin, unverified).`);
} else if (command === "link" && rest[2]) {
  const edge = await call("POST", "/edges", { fromId: rest[0], relation: rest[1], toId: rest[2], evidence: rest[3] ?? "" });
  console.log(`Linked ${rest[0]} ${rest[1]} ${rest[2]}${edge.id ? ` (edge ${edge.id})` : ""}.`);
} else {
  usage();
}
