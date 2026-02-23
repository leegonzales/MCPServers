#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────
# MCP Server Installer
# Sets up all MCP servers for Claude Code in one shot.
#
# Usage:
#   ./install.sh                    # Interactive (prompts for keys)
#   ./install.sh --from-env         # Read keys from .env file
#   ./install.sh --dry-run          # Show what would be done
# ─────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DRY_RUN=false
FROM_ENV=false

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[+]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[x]${NC} $*"; }
info() { echo -e "${CYAN}[i]${NC} $*"; }

# ── Parse args ──────────────────────────────────────────────
for arg in "$@"; do
    case "$arg" in
        --dry-run)  DRY_RUN=true ;;
        --from-env) FROM_ENV=true ;;
        --help|-h)
            echo "Usage: ./install.sh [--from-env] [--dry-run]"
            echo ""
            echo "  --from-env   Read API keys from .env file"
            echo "  --dry-run    Show what would be done without doing it"
            exit 0
            ;;
    esac
done

# ── Check prerequisites ────────────────────────────────────
check_prereqs() {
    local missing=()
    command -v node  >/dev/null || missing+=("node")
    command -v npm   >/dev/null || missing+=("npm")
    command -v npx   >/dev/null || missing+=("npx")
    command -v claude >/dev/null || missing+=("claude")

    if [[ ${#missing[@]} -gt 0 ]]; then
        err "Missing required tools: ${missing[*]}"
        echo "Install Node.js (>=18) and Claude Code CLI first."
        exit 1
    fi

    local node_major
    node_major=$(node -v | sed 's/v//' | cut -d. -f1)
    if [[ "$node_major" -lt 18 ]]; then
        err "Node.js >= 18 required (found $(node -v))"
        exit 1
    fi
}

# ── Load or prompt for API keys ─────────────────────────────
load_keys() {
    if $FROM_ENV; then
        if [[ -f "$SCRIPT_DIR/.env" ]]; then
            # shellcheck disable=SC1091
            source "$SCRIPT_DIR/.env"
            log "Loaded keys from .env"
        else
            err "No .env file found. Copy .env.example to .env and fill in your keys."
            exit 1
        fi
    fi

    # Google API Key (for nanobanana + veo)
    if [[ -z "${GOOGLE_API_KEY:-}" ]]; then
        echo ""
        info "Google API Key — needed for image gen (nanobanana) and video gen (veo)"
        info "Get one at: https://aistudio.google.com/"
        read -rp "GOOGLE_API_KEY (or Enter to skip): " GOOGLE_API_KEY
    fi

    # Brave Search API Key
    if [[ -z "${BRAVE_API_KEY:-}" ]]; then
        echo ""
        info "Brave Search API Key — needed for web/news/image search"
        info "Get one at: https://brave.com/search/api/"
        read -rp "BRAVE_API_KEY (or Enter to skip): " BRAVE_API_KEY
    fi

    # Google Maps API Key
    if [[ -z "${GOOGLE_MAPS_API_KEY:-}" ]]; then
        echo ""
        info "Google Maps API Key — needed for routes, weather, place search"
        info "Get one at: https://console.cloud.google.com/apis/credentials"
        read -rp "GOOGLE_MAPS_API_KEY (or Enter to skip): " GOOGLE_MAPS_API_KEY
    fi

    # Obsidian vault path
    if [[ -z "${OBSIDIAN_VAULT:-}" ]]; then
        echo ""
        info "Obsidian vault path — needed for note reading/writing"
        info "Example: ~/Obsidian Vault/My Vault"
        read -rp "OBSIDIAN_VAULT (or Enter to skip): " OBSIDIAN_VAULT
        # Expand tilde
        OBSIDIAN_VAULT="${OBSIDIAN_VAULT/#\~/$HOME}"
    fi
}

# ── Mask secrets in a string for display ─────────────────────
mask_secrets() {
    local output="$*"
    for var in GOOGLE_API_KEY BRAVE_API_KEY GOOGLE_MAPS_API_KEY; do
        local val="${!var:-}"
        if [[ -n "$val" ]]; then
            local masked="${val:0:4}...${val: -4}"
            output="${output//$val/$masked}"
        fi
    done
    echo "$output"
}

# ── Run command (or print in dry-run mode) ──────────────────
run() {
    if $DRY_RUN; then
        echo "  [dry-run] $(mask_secrets "$*")"
    else
        "$@"
    fi
}

# ── Build local servers ─────────────────────────────────────
build_local_servers() {
    log "Building local MCP servers..."

    if [[ -d "$SCRIPT_DIR/nanobanana-mcp" ]]; then
        log "  Building nanobanana-mcp..."
        run bash -c "cd '$SCRIPT_DIR/nanobanana-mcp' && npm install --silent && npm run build"
    fi

    if [[ -d "$SCRIPT_DIR/veo-mcp" ]]; then
        log "  Building veo-mcp..."
        run bash -c "cd '$SCRIPT_DIR/veo-mcp' && npm install --silent && npm run build"
    fi
}

# ── Register MCP servers with Claude Code ───────────────────
register_servers() {
    log "Registering MCP servers with Claude Code..."
    echo ""

    # 1. nanobanana-mcp (local)
    if [[ -f "$SCRIPT_DIR/nanobanana-mcp/dist/index.js" ]] || $DRY_RUN; then
        log "  [1/7] nanobanana-mcp (image generation)"
        if [[ -n "${GOOGLE_API_KEY:-}" ]]; then
            run claude mcp add nanobanana-mcp \
                --scope user \
                --env GOOGLE_API_KEY="$GOOGLE_API_KEY" \
                -- node "$SCRIPT_DIR/nanobanana-mcp/dist/index.js"
        else
            warn "  Skipped — no GOOGLE_API_KEY"
        fi
    fi

    # 2. veo-mcp (local)
    if [[ -f "$SCRIPT_DIR/veo-mcp/dist/index.js" ]] || $DRY_RUN; then
        log "  [2/7] veo-mcp (video generation)"
        if [[ -n "${GOOGLE_API_KEY:-}" ]]; then
            run claude mcp add veo-mcp \
                --scope user \
                --env GOOGLE_API_KEY="$GOOGLE_API_KEY" \
                -- node "$SCRIPT_DIR/veo-mcp/dist/index.js"
        else
            warn "  Skipped — no GOOGLE_API_KEY"
        fi
    fi

    # 3. brave-search (npx)
    log "  [3/7] brave-search (web search)"
    if [[ -n "${BRAVE_API_KEY:-}" ]]; then
        run claude mcp add brave-search \
            --scope user \
            --env BRAVE_API_KEY="$BRAVE_API_KEY" \
            -- npx -y @brave/brave-search-mcp-server
    else
        warn "  Skipped — no BRAVE_API_KEY"
    fi

    # 4. chrome-devtools (npx)
    log "  [4/7] chrome-devtools (Chrome control)"
    run claude mcp add chrome-devtools \
        --scope user \
        -- npx -y chrome-devtools-mcp@latest

    # 5. playwright (npx)
    log "  [5/7] playwright (browser automation)"
    run claude mcp add playwright \
        --scope user \
        -- npx -y @playwright/mcp

    # 6. obsidian (npx)
    log "  [6/7] obsidian (vault access)"
    if [[ -n "${OBSIDIAN_VAULT:-}" ]] && [[ -d "${OBSIDIAN_VAULT}" ]]; then
        run claude mcp add obsidian \
            --scope user \
            -- npx @mauricio.wolff/mcp-obsidian@latest "$OBSIDIAN_VAULT"
    else
        warn "  Skipped — no vault path or vault not found"
    fi

    # 7. maps-grounding-lite (HTTP)
    log "  [7/7] maps-grounding-lite (Google Maps)"
    if [[ -n "${GOOGLE_MAPS_API_KEY:-}" ]]; then
        # HTTP-type MCPs can't be added via `claude mcp add` — manual config needed
        warn "  maps-grounding-lite uses HTTP transport."
        warn "  Add this to your ~/.claude.json under \"mcpServers\":"
        echo ""
        echo "    \"maps-grounding-lite\": {"
        echo "      \"type\": \"http\","
        echo "      \"url\": \"https://mapstools.googleapis.com/mcp\","
        if $DRY_RUN; then
            echo "      \"headers\": { \"X-Goog-Api-Key\": \"$(mask_secrets "$GOOGLE_MAPS_API_KEY")\" }"
        else
            echo "      \"headers\": { \"X-Goog-Api-Key\": \"$GOOGLE_MAPS_API_KEY\" }"
        fi
        echo "    }"
        echo ""
    else
        warn "  Skipped — no GOOGLE_MAPS_API_KEY"
    fi
}

# ── Summary ─────────────────────────────────────────────────
print_summary() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log "Done! Restart Claude Code to pick up the new servers."
    echo ""
    info "Installed servers:"
    [[ -n "${GOOGLE_API_KEY:-}" ]]       && echo "  ✅ nanobanana-mcp"  || echo "  ⏭  nanobanana-mcp (skipped)"
    [[ -n "${GOOGLE_API_KEY:-}" ]]       && echo "  ✅ veo-mcp"         || echo "  ⏭  veo-mcp (skipped)"
    [[ -n "${BRAVE_API_KEY:-}" ]]        && echo "  ✅ brave-search"    || echo "  ⏭  brave-search (skipped)"
    echo "  ✅ chrome-devtools"
    echo "  ✅ playwright"
    [[ -n "${OBSIDIAN_VAULT:-}" ]]       && echo "  ✅ obsidian"        || echo "  ⏭  obsidian (skipped)"
    [[ -n "${GOOGLE_MAPS_API_KEY:-}" ]]  && echo "  ⚙️  maps-grounding-lite (manual config printed above)" || echo "  ⏭  maps-grounding-lite (skipped)"
    echo ""
    info "Not included (separate setup):"
    echo "  📂 google-workspace — clone github.com/leegonzales/google-workspace-mcp"
    echo "  💬 claude.ai Slack  — enable in Claude's Slack integration settings"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# ── Main ────────────────────────────────────────────────────
main() {
    echo ""
    echo "╔══════════════════════════════════════╗"
    echo "║   MCP Server Installer for Claude    ║"
    echo "╚══════════════════════════════════════╝"
    echo ""

    check_prereqs
    load_keys
    build_local_servers
    register_servers
    print_summary
}

main
