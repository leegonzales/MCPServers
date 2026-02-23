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
#   ./install.sh --force            # Overwrite existing server configs
# ─────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DRY_RUN=false
FROM_ENV=false
FORCE=false

# Track results for summary
declare -a INSTALLED=()
declare -a SKIPPED=()
declare -a PRESERVED=()
declare -a UPDATED=()

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
        --force)    FORCE=true ;;
        --help|-h)
            echo "Usage: ./install.sh [--from-env] [--dry-run] [--force]"
            echo ""
            echo "  --from-env   Read API keys from .env file"
            echo "  --dry-run    Show what would be done without doing it"
            echo "  --force      Overwrite existing server configs (default: preserve)"
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

# ── Check if an MCP server is already registered ─────────────
server_exists() {
    local name="$1"
    python3 -c "
import json, sys
try:
    with open('$HOME/.claude.json') as f:
        data = json.load(f)
    sys.exit(0 if '$name' in data.get('mcpServers', {}) else 1)
except Exception:
    sys.exit(1)
" 2>/dev/null
}

# ── Safe server registration (won't overwrite without --force) ─
add_server() {
    local name="$1"
    shift

    if $DRY_RUN; then
        run claude mcp add "$@"
        INSTALLED+=("$name")
        return 0
    fi

    local existed=false
    server_exists "$name" && existed=true

    if $existed && ! $FORCE; then
        warn "  $name already registered — skipping (use --force to overwrite)"
        PRESERVED+=("$name")
        return 0
    fi

    if $existed; then
        claude mcp remove "$name" --scope user 2>/dev/null || true
    fi

    claude mcp add "$@"

    if $existed; then
        UPDATED+=("$name")
    else
        INSTALLED+=("$name")
    fi
}

# ── Write maps-grounding-lite directly to ~/.claude.json ──────
add_maps_server() {
    local api_key="$1"
    if $DRY_RUN; then
        echo "  [dry-run] Would add maps-grounding-lite (HTTP) to ~/.claude.json"
        return 0
    fi
    python3 -c "
import json
config_path = '$HOME/.claude.json'
with open(config_path, 'r') as f:
    data = json.load(f)
servers = data.setdefault('mcpServers', {})
servers['maps-grounding-lite'] = {
    'type': 'http',
    'url': 'https://mapstools.googleapis.com/mcp',
    'headers': {'X-Goog-Api-Key': '$api_key'}
}
with open(config_path, 'w') as f:
    json.dump(data, f, indent=2)
"
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
            add_server nanobanana-mcp nanobanana-mcp \
                --scope user \
                --env GOOGLE_API_KEY="$GOOGLE_API_KEY" \
                -- node "$SCRIPT_DIR/nanobanana-mcp/dist/index.js"
        else
            warn "  Skipped — no GOOGLE_API_KEY"
            SKIPPED+=("nanobanana-mcp")
        fi
    fi

    # 2. veo-mcp (local)
    if [[ -f "$SCRIPT_DIR/veo-mcp/dist/index.js" ]] || $DRY_RUN; then
        log "  [2/7] veo-mcp (video generation)"
        if [[ -n "${GOOGLE_API_KEY:-}" ]]; then
            add_server veo-mcp veo-mcp \
                --scope user \
                --env GOOGLE_API_KEY="$GOOGLE_API_KEY" \
                -- node "$SCRIPT_DIR/veo-mcp/dist/index.js"
        else
            warn "  Skipped — no GOOGLE_API_KEY"
            SKIPPED+=("veo-mcp")
        fi
    fi

    # 3. brave-search (npx)
    log "  [3/7] brave-search (web search)"
    if [[ -n "${BRAVE_API_KEY:-}" ]]; then
        add_server brave-search brave-search \
            --scope user \
            --env BRAVE_API_KEY="$BRAVE_API_KEY" \
            -- npx -y @brave/brave-search-mcp-server
    else
        warn "  Skipped — no BRAVE_API_KEY"
        SKIPPED+=("brave-search")
    fi

    # 4. chrome-devtools (npx)
    log "  [4/7] chrome-devtools (Chrome control)"
    add_server chrome-devtools chrome-devtools \
        --scope user \
        -- npx -y chrome-devtools-mcp@latest

    # 5. playwright (npx)
    log "  [5/7] playwright (browser automation)"
    add_server playwright playwright \
        --scope user \
        -- npx -y @playwright/mcp

    # 6. obsidian (npx)
    log "  [6/7] obsidian (vault access)"
    if [[ -n "${OBSIDIAN_VAULT:-}" ]] && [[ -d "${OBSIDIAN_VAULT}" ]]; then
        add_server obsidian obsidian \
            --scope user \
            -- npx @mauricio.wolff/mcp-obsidian@latest "$OBSIDIAN_VAULT"
    else
        warn "  Skipped — no vault path or vault not found"
        SKIPPED+=("obsidian")
    fi

    # 7. maps-grounding-lite (HTTP — written directly to config)
    log "  [7/7] maps-grounding-lite (Google Maps)"
    if [[ -n "${GOOGLE_MAPS_API_KEY:-}" ]]; then
        if server_exists maps-grounding-lite && ! $FORCE && ! $DRY_RUN; then
            warn "  maps-grounding-lite already registered — skipping (use --force to overwrite)"
            PRESERVED+=("maps-grounding-lite")
        else
            local maps_existed=false
            server_exists maps-grounding-lite && maps_existed=true
            add_maps_server "$GOOGLE_MAPS_API_KEY"
            if $maps_existed; then
                UPDATED+=("maps-grounding-lite")
            else
                INSTALLED+=("maps-grounding-lite")
            fi
            log "  Added maps-grounding-lite to ~/.claude.json"
        fi
    else
        warn "  Skipped — no GOOGLE_MAPS_API_KEY"
        SKIPPED+=("maps-grounding-lite")
    fi
}

# ── Summary ─────────────────────────────────────────────────
print_summary() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log "Done! Restart Claude Code to pick up the new servers."
    echo ""

    if [[ ${#INSTALLED[@]} -gt 0 ]]; then
        info "Installed:"
        for s in "${INSTALLED[@]}"; do echo "  ✅ $s"; done
    fi
    if [[ ${#UPDATED[@]} -gt 0 ]]; then
        info "Updated (--force):"
        for s in "${UPDATED[@]}"; do echo "  🔄 $s"; done
    fi
    if [[ ${#PRESERVED[@]} -gt 0 ]]; then
        info "Preserved (already registered):"
        for s in "${PRESERVED[@]}"; do echo "  🔒 $s"; done
    fi
    if [[ ${#SKIPPED[@]} -gt 0 ]]; then
        info "Skipped (missing key/path):"
        for s in "${SKIPPED[@]}"; do echo "  ⏭  $s"; done
    fi

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
