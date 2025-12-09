# MCP Servers

Personal collection of [Model Context Protocol](https://modelcontextprotocol.io/) servers for extending AI assistant capabilities.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Servers

| Server | Description | Status |
|--------|-------------|--------|
| [nanobanana-mcp](./nanobanana-mcp) | Gemini image generation & editing | ✅ Published |
| beads-mcp | Task management substrate | 🔜 Planned |
| research-mcp | ArXiv + Perplexity research | 🔜 Planned |
| media-pipeline-mcp | Remotion + FFmpeg AV production | 🔜 Planned |

See [IDEAS.md](./IDEAS.md) for the full roadmap.

## Quick Start

```bash
# Install nanobanana-mcp
claude mcp add nano-banana --env GEMINI_API_KEY=your-key -- npx -y nanobanana-mcp
```

## Development

```bash
# Build a server
cd nanobanana-mcp
npm install
npm run build

# Test with MCP Inspector
npx @modelcontextprotocol/inspector node dist/index.js
```

## Structure

Each server follows a consistent layout:

```
server-name/
├── src/
│   └── index.ts      # MCP server entry point
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## Links

- [Roadmap](./IDEAS.md) - Planned servers and prioritization
- [Contributing](./CONTRIBUTING.md) - How to add a new server
- [License](./LICENSE) - MIT

---

Built with [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)
