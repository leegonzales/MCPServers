# MCP Servers

Personal collection of [Model Context Protocol](https://modelcontextprotocol.io/) servers and a curated install script for a full AI-powered Claude Code setup.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## What You Get

Run one script and get 8 MCP servers wired into Claude Code:

| # | Server | What It Does | Install |
|---|--------|--------------|---------|
| 1 | **nanobanana-mcp** | AI image gen/edit via Google Gemini | Build from source (this repo) |
| 2 | **veo-mcp** | AI video gen via Google Veo 3.1 | Build from source (this repo) |
| 3 | **brave-search** | Web, news, image, video, local search | npx one-liner |
| 4 | **chrome-devtools** | Control Chrome: navigate, click, screenshot, network | npx one-liner |
| 5 | **playwright** | Browser automation: test pages, fill forms, screenshots | npx one-liner |
| 6 | **obsidian** | Read/write/search Obsidian vault notes | npx one-liner |
| 7 | **maps-grounding-lite** | Google Maps: routes, weather, place search | HTTP config |
| 8 | **google-workspace** | Gmail, Docs, Sheets, Slides, Drive, Calendar, Chat | Separate repo |

Plus **claude.ai Slack** (OAuth connector managed by Claude — not scriptable).

## Quick Start

```bash
# 1. Clone this repo
git clone https://github.com/leegonzales/MCPServers.git
cd MCPServers

# 2. Copy env file and add your API keys
cp .env.example .env
# Edit .env with your keys (see Prerequisites below)

# 3. Run the install script
./install.sh
```

That's it. The script builds the local servers, registers all MCPs with Claude Code, and tells you what to do next.

**Options:**
- `--from-env` — Read keys from `.env` instead of prompting
- `--dry-run` — Show what would be done without doing it
- `--force` — Overwrite existing server configs (default: preserve existing)

## Prerequisites

You need API keys for the servers that call external services:

| Key | Where to Get It | Used By |
|-----|-----------------|---------|
| `GOOGLE_API_KEY` | [Google AI Studio](https://aistudio.google.com/) | nanobanana-mcp, veo-mcp |
| `BRAVE_API_KEY` | [Brave Search API](https://brave.com/search/api/) | brave-search |
| `GOOGLE_MAPS_API_KEY` | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (Maps Platform) | maps-grounding-lite |

**Optional (separate setup):**
- **google-workspace** requires a GCP project with OAuth consent screen and Workspace API scopes. See the [google-workspace-mcp repo](https://github.com/leegonzales/google-workspace-mcp) for full setup.
- **obsidian** requires an Obsidian vault on disk. Pass the path during install.

## Servers in This Repo

### nanobanana-mcp

AI image generation and editing with Google Gemini.

**Tools:** `gemini_generate_image`, `gemini_edit_image`, `continue_editing`, `get_image_by_id`, `get_image_history`, `search_history`

```bash
cd nanobanana-mcp && npm install && npm run build
```

### veo-mcp

AI video generation with Google Veo 3.1.

**Tools:** `veo_generate_video`, `veo_generate_from_image`, `veo_generate_transition`, `veo_extend_video`, `veo_check_operation_status`, `veo_cleanup`, `veo_get_video_history`

```bash
cd veo-mcp && npm install && npm run build
```

## External Servers (installed by script)

| Server | Source | npm Package |
|--------|--------|-------------|
| brave-search | [brave/brave-search-mcp-server](https://github.com/brave/brave-search-mcp-server) | `@brave/brave-search-mcp-server` |
| chrome-devtools | [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) | `chrome-devtools-mcp` |
| playwright | [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp) | `@playwright/mcp` |
| obsidian | [bitbonsai/mcp-obsidian](https://github.com/bitbonsai/mcp-obsidian) | `@mauricio.wolff/mcp-obsidian` |
| maps-grounding-lite | [Google Maps Platform](https://developers.google.com/maps) | HTTP endpoint (no npm) |
| google-workspace | [leegonzales/google-workspace-mcp](https://github.com/leegonzales/google-workspace-mcp) (fork of [gemini-cli-extensions/workspace](https://github.com/gemini-cli-extensions/workspace)) | Build from source |

## Development

```bash
# Build all servers in this repo
npm run build

# Build a single server
cd nanobanana-mcp && npm run build

# Test with MCP Inspector
npx @modelcontextprotocol/inspector node nanobanana-mcp/dist/index.js

# Clean everything
npm run clean
```

## Structure

```
MCPServers/
├── nanobanana-mcp/       # Gemini image gen server
│   ├── src/index.ts
│   ├── package.json
│   └── README.md
├── veo-mcp/              # Veo video gen server
│   ├── src/index.ts
│   ├── package.json
│   └── README.md
├── install.sh            # One-shot MCP setup script
├── MCP_GUIDE.md          # Detailed reference for all servers
├── .env.example          # API key template
└── IDEAS.md              # Roadmap for future servers
```

## Links

- [Full MCP Guide](./MCP_GUIDE.md) — detailed reference with all tools and setup notes
- [Roadmap](./IDEAS.md) — planned servers and prioritization
- [Contributing](./CONTRIBUTING.md) — how to add a new server
- [License](./LICENSE) — MIT

---

Built with [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)
