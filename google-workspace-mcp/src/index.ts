#!/usr/bin/env node

/**
 * Google Workspace MCP — Multi-Account Launcher
 *
 * Thin wrapper around the gemini-cli-extensions/workspace fork that adds
 * multi-account profile support via WORKSPACE_PROFILE env var.
 *
 * Architecture:
 *   upstream repo:  github.com/gemini-cli-extensions/workspace
 *   our fork:       github.com/leegonzales/google-workspace-mcp
 *   this launcher:  sets up env and delegates to the fork's built server
 *
 * Profile isolation:
 *   WORKSPACE_PROFILE=""          → keychain: gemini-cli-workspace-oauth (default)
 *   WORKSPACE_PROFILE="personal"  → keychain: gemini-cli-workspace-oauth-personal
 *   WORKSPACE_PROFILE="catalyst"  → keychain: gemini-cli-workspace-oauth-catalyst
 *
 * Usage in Claude Code settings.json:
 *   {
 *     "mcpServers": {
 *       "google-workspace-personal": {
 *         "command": "node",
 *         "args": ["<fork-path>/workspace-server/dist/index.js"],
 *         "env": { "WORKSPACE_PROFILE": "personal" }
 *       }
 *     }
 *   }
 */

import { spawn } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

// Resolve the fork's built server
const FORK_REPO = process.env["GOOGLE_WORKSPACE_FORK_PATH"] || path.join(
    os.homedir(),
    "Projects",
    "leegonzales",
    "google-workspace-mcp"
);
const SERVER_ENTRY = path.join(FORK_REPO, "workspace-server", "dist", "index.js");

function main(): void {
    const profile = process.env["WORKSPACE_PROFILE"] || "";
    const args = process.argv.slice(2);

    // Verify the fork exists and is built
    if (!fs.existsSync(SERVER_ENTRY)) {
        console.error(`[google-workspace-mcp] Server not found at: ${SERVER_ENTRY}`);
        console.error("");
        console.error("Setup required:");
        console.error("  1. Clone the fork:");
        console.error("     git clone git@github.com:leegonzales/google-workspace-mcp.git \\");
        console.error(`       ${FORK_REPO}`);
        console.error("  2. Build it:");
        console.error(`     cd ${FORK_REPO} && npm install && npm run build`);
        console.error("");
        console.error("Or set GOOGLE_WORKSPACE_FORK_PATH to a custom location.");
        console.error("Then restart Claude Code.");
        process.exit(1);
    }

    if (profile) {
        console.error(`[google-workspace-mcp] Starting with profile: ${profile}`);
    } else {
        console.error("[google-workspace-mcp] Starting with default profile");
    }

    const env = { ...process.env };

    // Delegate to the fork's server, inheriting stdio for MCP transport
    const child = spawn("node", [SERVER_ENTRY, ...args], {
        env,
        stdio: "inherit",
    });

    child.on("error", (err) => {
        console.error(`[google-workspace-mcp] Failed to start server: ${err.message}`);
        process.exit(1);
    });

    child.on("exit", (code) => {
        process.exit(code ?? 0);
    });
}

main();
