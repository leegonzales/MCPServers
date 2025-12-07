# MCP Servers

A collection of Model Context Protocol (MCP) servers for extending AI assistant capabilities.

## What is MCP?

The [Model Context Protocol](https://modelcontextprotocol.io/) is an open standard for connecting AI assistants to external tools, data sources, and services. MCP servers expose tools that AI assistants like Claude can discover and invoke.

## Servers

| Server | Description | npm |
|--------|-------------|-----|
| [nanobanana-mcp](./nanobanana-mcp) | AI image generation using Google Gemini | `npx nanobanana-mcp` |

## Installation

Each server is an independent npm package. Install via:

```bash
# Using Claude Code CLI
claude mcp add <server-name> --env API_KEY=xxx -- npx -y <package-name>

# Or add to ~/.claude/settings.json manually
```

## Development

Each server follows this structure:

```
server-name/
├── src/
│   └── index.ts      # Main entry point
├── package.json
├── tsconfig.json
└── README.md
```

### Building a server

```bash
cd server-name
npm install
npm run build
```

### Testing locally

```bash
# Use MCP Inspector
npx @modelcontextprotocol/inspector node dist/index.js
```

## License

MIT
