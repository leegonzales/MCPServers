# MCP Server Reference Guide

Detailed reference for every MCP server in this setup. For quick start, see [README.md](./README.md).

---

## 1. nanobanana-mcp (Image Generation)

| | |
|---|---|
| **Source** | This repo — `nanobanana-mcp/` |
| **Author** | Lee Gonzales |
| **Requires** | `GOOGLE_API_KEY`, Node >= 18 |
| **Type** | Local (stdio) |

AI image generation and editing via Google Gemini. Generates images from text prompts, edits existing images with instructions, maintains edit history for iterative refinement.

**Tools:**
- `gemini_generate_image` — text-to-image generation
- `gemini_edit_image` — edit an existing image with instructions
- `continue_editing` — iterate on the last edit
- `get_image_by_id` — retrieve a specific generated image
- `get_image_history` — list all generated images
- `search_history` — search past generations by prompt text

**Claude Code config:**
```json
{
  "nanobanana-mcp": {
    "type": "stdio",
    "command": "node",
    "args": ["<path-to-repo>/nanobanana-mcp/dist/index.js"],
    "env": {}
  }
}
```

---

## 2. veo-mcp (Video Generation)

| | |
|---|---|
| **Source** | This repo — `veo-mcp/` |
| **Author** | Lee Gonzales |
| **Requires** | `GOOGLE_API_KEY`, Node >= 18 |
| **Type** | Local (stdio) |

AI video generation via Google Veo 3.1. Text-to-video, image-to-video, video transitions, and video extension.

**Tools:**
- `veo_generate_video` — text-to-video generation
- `veo_generate_from_image` — image + prompt to video
- `veo_generate_transition` — create transition between two images
- `veo_extend_video` — extend an existing video clip
- `veo_check_operation_status` — poll async generation jobs
- `veo_cleanup` — remove generated video files
- `veo_get_video_history` — list all generated videos

**Claude Code config:**
```json
{
  "veo-mcp": {
    "type": "stdio",
    "command": "node",
    "args": ["<path-to-repo>/veo-mcp/dist/index.js"],
    "env": {}
  }
}
```

---

## 3. brave-search (Web Search)

| | |
|---|---|
| **Source** | [brave/brave-search-mcp-server](https://github.com/brave/brave-search-mcp-server) |
| **npm** | `@brave/brave-search-mcp-server` |
| **Requires** | `BRAVE_API_KEY` ([get one](https://brave.com/search/api/)) |
| **Type** | npx (stdio) |

Full Brave Search API access. Web search, news, images, videos, local businesses, AI summarization.

**Tools:**
- `brave_web_search` — general web search
- `brave_news_search` — recent news articles
- `brave_image_search` — image search
- `brave_video_search` — video search
- `brave_local_search` — local business search
- `brave_summarizer` — AI-powered page summarization

**Claude Code config:**
```json
{
  "brave-search": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@brave/brave-search-mcp-server"],
    "env": { "BRAVE_API_KEY": "<your-key>" }
  }
}
```

---

## 4. chrome-devtools (Chrome Control)

| | |
|---|---|
| **Source** | [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) |
| **npm** | `chrome-devtools-mcp` |
| **Requires** | Chrome with `--remote-debugging-port=9222` |
| **Type** | npx (stdio) |

Direct Chrome DevTools Protocol control. Navigate pages, click elements, fill forms, take screenshots, inspect network traffic, read console logs, run performance traces.

**Tools (25+):** `navigate_page`, `click`, `fill`, `fill_form`, `take_screenshot`, `take_snapshot`, `hover`, `press_key`, `drag`, `evaluate_script`, `list_pages`, `new_page`, `select_page`, `close_page`, `resize_page`, `emulate`, `upload_file`, `wait_for`, `handle_dialog`, `list_network_requests`, `get_network_request`, `list_console_messages`, `get_console_message`, `performance_start_trace`, `performance_stop_trace`, `performance_analyze_insight`

**Claude Code config:**
```json
{
  "chrome-devtools": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "chrome-devtools-mcp@latest"],
    "env": {}
  }
}
```

---

## 5. playwright (Browser Automation)

| | |
|---|---|
| **Source** | [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp) |
| **npm** | `@playwright/mcp` |
| **Author** | Microsoft + Anthropic |
| **Requires** | Nothing (browsers auto-install) |
| **Type** | npx (stdio) |

Official Playwright browser automation. Headless or headed. Great for testing web pages, filling forms, taking screenshots, validating UX flows.

**Claude Code config:**
```json
{
  "playwright": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@playwright/mcp"],
    "env": {}
  }
}
```

---

## 6. obsidian (Vault Access)

| | |
|---|---|
| **Source** | [bitbonsai/mcp-obsidian](https://github.com/bitbonsai/mcp-obsidian) |
| **npm** | `@mauricio.wolff/mcp-obsidian` |
| **Author** | Mauricio Wolff |
| **Requires** | Path to Obsidian vault as argument |
| **Type** | npx (stdio) |

Full Obsidian vault access. Read, write, search, delete, tag, and manage frontmatter on notes. Vault path is passed as CLI argument.

**Tools:** `read_note`, `read_multiple_notes`, `write_note`, `patch_note`, `delete_note`, `move_note`, `search_notes`, `get_notes_info`, `list_directory`, `get_vault_stats`, `manage_tags`, `get_frontmatter`, `update_frontmatter`

**Claude Code config:**
```json
{
  "obsidian": {
    "type": "stdio",
    "command": "npx",
    "args": ["@mauricio.wolff/mcp-obsidian@latest", "/path/to/vault"],
    "env": {}
  }
}
```

---

## 7. maps-grounding-lite (Google Maps)

| | |
|---|---|
| **Source** | [Google Maps Platform](https://developers.google.com/maps) (official) |
| **Requires** | Google Maps API key |
| **Type** | HTTP endpoint |

Google Maps via MCP. Route computation, weather lookup, place search. No local install — just an HTTP endpoint with API key header.

**Tools:**
- `compute_routes` — driving/walking/transit directions
- `lookup_weather` — current weather for a location
- `search_places` — find businesses, landmarks, addresses

**Claude Code config:**
```json
{
  "maps-grounding-lite": {
    "type": "http",
    "url": "https://mapstools.googleapis.com/mcp",
    "headers": { "X-Goog-Api-Key": "<your-key>" }
  }
}
```

---

## 8. google-workspace (Full Workspace Access)

| | |
|---|---|
| **Source (upstream)** | [gemini-cli-extensions/workspace](https://github.com/gemini-cli-extensions/workspace) |
| **Source (fork)** | [leegonzales/google-workspace-mcp](https://github.com/leegonzales/google-workspace-mcp) |
| **Author** | Allen Hutchison (upstream) |
| **Requires** | GCP project with OAuth + Workspace API scopes |
| **Type** | Local (stdio) |

40+ tools across Gmail, Docs, Sheets, Slides, Drive, Calendar, Chat, and People. Requires a full GCP OAuth setup — see `docs/GCP-RECREATION.md` in the repo.

**Tool families:** `gmail_*`, `docs_*`, `sheets_*`, `slides_*`, `drive_*`, `calendar_*`, `chat_*`, `people_*`, `time_*`, `auth_*`

**Claude Code config:**
```json
{
  "google-workspace": {
    "type": "stdio",
    "command": "node",
    "args": ["<path-to-repo>/workspace-server/dist/index.js", "--debug"],
    "env": {}
  }
}
```

---

## 9. claude.ai Slack (OAuth Connector)

| | |
|---|---|
| **Source** | Anthropic (built-in) |
| **Type** | OAuth (managed by Claude) |

Read channels, send messages, search public/private, create canvases, schedule messages, read user profiles. Enabled through Claude's Slack integration settings — not configured via `claude.json`.

**Tools:** `slack_read_channel`, `slack_send_message`, `slack_search_public`, `slack_search_public_and_private`, `slack_search_channels`, `slack_search_users`, `slack_read_thread`, `slack_read_user_profile`, `slack_create_canvas`, `slack_read_canvas`, `slack_schedule_message`, `slack_send_message_draft`

---

## Env Vars Summary

```bash
# Required
GOOGLE_API_KEY=...          # nanobanana-mcp, veo-mcp (Google AI Studio)
BRAVE_API_KEY=...           # brave-search (Brave Search API)
GOOGLE_MAPS_API_KEY=...     # maps-grounding-lite (Google Cloud Console)

# Google Workspace uses OAuth (no env var — interactive login)
# Obsidian needs vault path as CLI arg (no env var)
# Playwright, Chrome DevTools need no keys
```
