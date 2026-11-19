#!/usr/bin/env node
/*
  nexus-doctor: check how this machine's agents can reach NEXUS, and print the exact fix for each gap.

    node nexus-doctor.mjs [--app <path to NEXUS.app>] [--json]

  Read-only. It never registers MCP servers, edits config or prints tokens.
*/
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const appAt = args.indexOf("--app");
const appHint = appAt >= 0 ? args[appAt + 1] : process.env.NEXUS_APP;
const asJson = args.includes("--json");

const report = { node: process.version, desktop: {}, api: {}, clients: {} };
const lines = [];
const ok = (msg) => lines.push(`  ✓ ${msg}`);
const warn = (msg) => lines.push(`  ! ${msg}`);
const fix = (msg) => lines.push(`      → ${msg}`);

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function findBinary() {
  const candidates = appHint
    ? [appHint, path.join(appHint, "Contents", "MacOS", "nexus")]
    : ["/Applications/NEXUS.app/Contents/MacOS/nexus", path.join(os.homedir(), "Applications", "NEXUS.app", "Contents", "MacOS", "nexus")];
  return candidates.find(isFile);
}

function handshake(binary, connector) {
  return new Promise((resolve) => {
    const child = spawn(binary, ["--mcp", connector], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill(), 8000);
    child.stdout.on("data", (c) => {
      out += c;
      if (out.includes("\n")) child.stdin.end();
    });
    child.stderr.on("data", (c) => (err += c));
    child.on("error", (e) => resolve({ ok: false, message: e.message }));
    child.on("close", () => {
      clearTimeout(timer);
      try {
        const reply = JSON.parse(out.split("\n")[0]);
        if (reply.error) resolve({ ok: false, message: reply.error.message });
        else resolve({ ok: true, version: reply.result?.serverInfo?.version });
      } catch {
        resolve({ ok: false, message: (err || out).trim() || "no reply" });
      }
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })}\n`);
  });
}

function loadEnv(file, into) {
  if (!file || !fs.existsSync(file)) return false;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith("#") && into[m[1]] === undefined) into[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return true;
}

function cli(name, argv) {
  const r = spawnSync(name, argv, { encoding: "utf8", timeout: 8000 });
  return r.status === 0 ? r.stdout : null;
}

lines.push("NEXUS doctor");
const major = Number(process.versions.node.split(".")[0]);
if (major >= 18) ok(`Node ${process.version}`);
else {
  warn(`Node ${process.version} is too old for the helper scripts`);
  fix("Install Node 18 or newer.");
}

/* Desktop edition */
lines.push("", "NEXUS Desktop (MCP connector)");
const binary = findBinary();
report.desktop.binary = binary ?? null;
if (!binary) {
  warn("NEXUS.app not found in /Applications or ~/Applications");
  fix("Install NEXUS.app in its final location (registration commands embed the path), or pass --app <path>.");
} else {
  ok(`Found ${binary}`);
  for (const connector of ["claude", "codex"]) {
    const result = await handshake(binary, connector);
    report.desktop[connector] = result;
    if (result.ok) ok(`Connector "${connector}" is enabled (server v${result.version ?? "?"})`);
    else {
      warn(`Connector "${connector}": ${result.message}`);
      fix(`Open NEXUS → AI Agents → enable ${connector === "claude" ? "Claude Code" : "Codex"}.`);
    }
  }
  const quoted = `'${binary.replace(/'/g, "'\\''")}'`;
  report.desktop.register = {
    claude: `claude mcp add --scope local --transport stdio nexus -- ${quoted} --mcp claude`,
    codex: `codex mcp add nexus -- ${quoted} --mcp codex`,
  };
}

/* MCP client registration */
lines.push("", "Agent clients");
const claudeList = cli("claude", ["mcp", "list"]);
if (claudeList === null) lines.push("  - Claude Code CLI not found or not runnable here");
else if (/\bnexus\b/.test(claudeList)) ok("Claude Code has a `nexus` MCP server registered");
else {
  warn("Claude Code has no `nexus` MCP server");
  if (report.desktop.register) fix(report.desktop.register.claude);
}
report.clients.claude = claudeList === null ? "absent" : /\bnexus\b/.test(claudeList) ? "registered" : "unregistered";
const codexList = cli("codex", ["mcp", "list"]);
if (codexList === null) lines.push("  - Codex CLI not found or not runnable here");
else if (/\bnexus\b/.test(codexList)) ok("Codex has a `nexus` MCP server registered");
else {
  warn("Codex has no `nexus` MCP server");
  if (report.desktop.register) fix(report.desktop.register.codex);
}
report.clients.codex = codexList === null ? "absent" : /\bnexus\b/.test(codexList) ? "registered" : "unregistered";
if (binary) lines.push("  - Any other MCP client (Antigravity, Gemini CLI, Cursor…): see the JSON config in nexus-setup/SKILL.md");

/* Server edition */
lines.push("", "NEXUS OS memory API (server edition, optional)");
const env = { ...process.env };
const envFile = path.join(os.homedir(), ".config", "nexus", "agent.env");
const hadFile = loadEnv(process.env.NEXUS_ENV_FILE, env) | loadEnv(envFile, env);
const base = (env.NEXUS_API_URL ?? env.NEXUS_API_INTERNAL_URL ?? "http://127.0.0.1:4100").replace(/\/+$/, "");
report.api.url = base;
report.api.tokenPresent = Boolean(env.NEXUS_AGENT_TOKEN);
try {
  const health = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) });
  report.api.reachable = health.ok;
  if (health.ok) ok(`API reachable at ${base}`);
  else warn(`API at ${base} answered ${health.status}`);
} catch {
  report.api.reachable = false;
  lines.push(`  - No API at ${base} (fine if you only use NEXUS Desktop; to start it: pnpm run db:up && pnpm run dev:api)`);
}
if (report.api.reachable) {
  if (!env.NEXUS_AGENT_TOKEN) {
    warn(`No NEXUS_AGENT_TOKEN${hadFile ? "" : ` (and no ${envFile})`}`);
    fix(`Create ${envFile} (chmod 600) with NEXUS_API_URL=${base} and NEXUS_AGENT_TOKEN=<the agent token, never the owner token>.`);
  } else {
    try {
      const r = await fetch(`${base}/api/memory/projects`, { headers: { authorization: `Bearer ${env.NEXUS_AGENT_TOKEN}`, "x-nexus-actor": "doctor" }, signal: AbortSignal.timeout(5000) });
      report.api.auth = r.status;
      if (r.ok) {
        const { projects = [] } = await r.json();
        ok(`Agent token accepted; ${projects.length} project(s) indexed`);
      } else {
        warn(`Agent token rejected (${r.status})`);
        fix("Copy NEXUS_AGENT_TOKEN from the nexus-os .env again; restart the API after changing it.");
      }
    } catch (e) {
      warn(`Auth check failed: ${e.message}`);
    }
  }
}

/* Verdict */
const desktopReady = report.desktop.claude?.ok || report.desktop.codex?.ok;
const apiReady = report.api.auth === 200;
report.ready = { desktop: Boolean(desktopReady), api: apiReady };
lines.push("", desktopReady || apiReady ? `Ready: ${[desktopReady && "desktop MCP", apiReady && "memory API"].filter(Boolean).join(" + ")}` : "Not ready: follow the → fixes above.");

console.log(asJson ? JSON.stringify(report, null, 2) : lines.join("\n"));
process.exit(desktopReady || apiReady ? 0 : 1);
