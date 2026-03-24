# google-workspace-mcp

Multi-account Google Workspace MCP server for Claude Code. Provides Gmail, Calendar, Drive, Docs, Sheets, Slides, and Chat access across multiple Google accounts.

## Architecture

This is a launcher that wraps our fork of [gemini-cli-extensions/workspace](https://github.com/gemini-cli-extensions/workspace) with multi-account profile support.

```
┌─────────────────────┐     ┌──────────────────────────────┐
│  Claude Code MCP    │     │  leegonzales/google-          │
│  settings.json      │────▶│  workspace-mcp (fork)        │
│                     │     │                              │
│  WORKSPACE_PROFILE  │     │  + WORKSPACE_PROFILE support │
│  = "personal"       │     │  + per-profile keychain slot │
└─────────────────────┘     └──────────────────────────────┘
```

## Multi-Account Profiles

Each profile gets its own credential slot in macOS Keychain:

| Profile | Keychain Service | Google Account |
|---------|-----------------|----------------|
| *(default)* | `gemini-cli-workspace-oauth` | `lee@catalystai.services` |
| `personal` | `gemini-cli-workspace-oauth-personal` | `lee.gonzales@gmail.com` |

Add more profiles by setting `WORKSPACE_PROFILE` to any string.

## Setup

### 1. Clone and build the fork

```bash
git clone git@github.com:leegonzales/google-workspace-mcp.git \
  ~/Projects/leegonzales/google-workspace-mcp
cd ~/Projects/leegonzales/google-workspace-mcp
git remote add upstream git@github.com:gemini-cli-extensions/workspace.git
npm install && npm run build
```

### 2. Build this launcher

```bash
cd ~/Projects/leegonzales/MCPServers/google-workspace-mcp
npm install && npm run build
```

### 3. Configure Claude Code

Add to `~/.claude.json` or `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "google-workspace": {
      "command": "node",
      "args": [
        "/Users/leegonzales/Projects/leegonzales/google-workspace-mcp/workspace-server/dist/index.js"
      ]
    },
    "google-workspace-personal": {
      "command": "node",
      "args": [
        "/Users/leegonzales/Projects/leegonzales/google-workspace-mcp/workspace-server/dist/index.js"
      ],
      "env": { "WORKSPACE_PROFILE": "personal" }
    }
  }
}
```

And in permissions:

```json
{
  "permissions": {
    "allow": [
      "mcp__google-workspace__*",
      "mcp__google-workspace-personal__*"
    ]
  }
}
```

### 4. Authenticate

On first use, each profile opens a browser for OAuth consent. Sign in with the correct Google account for that profile. Credentials are stored in macOS Keychain and auto-refresh.

## Syncing with upstream

```bash
cd ~/Projects/leegonzales/google-workspace-mcp
git fetch upstream
git merge upstream/main
npm run build
```

Our fork changes are isolated to two files (`config.ts` and `oauth-credential-storage.ts`), so merge conflicts should be rare.

## Available Services

- **Gmail** — search, read, send, draft, labels, attachments
- **Calendar** — list, create, update, delete events, find free time
- **Drive** — search, upload, download, create folders
- **Docs** — create, read, append, insert, replace text
- **Sheets** — read ranges, get metadata
- **Slides** — read text, get images, thumbnails
- **Chat** — spaces, DMs, threads, messages
- **People** — profiles, contacts

## Tool Naming Convention

In Claude Code, tools are prefixed by server name:

- `mcp__google-workspace__gmail_search` — Catalyst account
- `mcp__google-workspace-personal__gmail_search` — Personal account
