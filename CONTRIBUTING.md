# Contributing

Guide for adding new MCP servers to this collection.

## Adding a New Server

### 1. Create the directory structure

```bash
mkdir -p new-server-mcp/src
```

### 2. Initialize with standard files

```
new-server-mcp/
├── src/
│   └── index.ts      # MCP server implementation
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

### 3. Use the standard package.json template

```json
{
  "name": "new-server-mcp",
  "version": "1.0.0",
  "description": "MCP server for [purpose]",
  "main": "dist/index.js",
  "bin": {
    "new-server-mcp": "dist/index.js"
  },
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsc --watch",
    "prepublishOnly": "npm run build"
  },
  "keywords": ["mcp", "model-context-protocol"],
  "author": "Lee Gonzales",
  "license": "MIT",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0"
  },
  "engines": {
    "node": ">=18"
  },
  "files": ["dist", "README.md"]
}
```

### 4. Use the standard tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 5. Add to root package.json workspaces

```json
{
  "workspaces": [
    "nanobanana-mcp",
    "new-server-mcp"
  ]
}
```

### 6. Create a beads issue

```bash
bd create "new-server-mcp" --type feature --priority 2
```

### 7. Update root README.md

Add the server to the table with appropriate status.

## MCP Server Implementation Pattern

```typescript
#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "new-server-mcp",
  version: "1.0.0",
});

// Define tools with Zod schemas
server.tool(
  "tool_name",
  "Description of what the tool does",
  {
    param: z.string().describe("Parameter description"),
  },
  async ({ param }) => {
    // Implementation
    return {
      content: [{ type: "text", text: "Result" }],
    };
  }
);

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
```

## Testing

```bash
# Build
npm run build

# Test with MCP Inspector
npx @modelcontextprotocol/inspector node dist/index.js

# Test with Claude Code
claude mcp add test-server -- node /path/to/dist/index.js
```

## Conventions

- **Naming**: `kebab-case-mcp` for packages
- **Tool names**: `snake_case` (e.g., `generate_image`, `fetch_paper`)
- **Environment variables**: `SCREAMING_SNAKE_CASE`
- **Validation**: Always use Zod for input validation
- **Errors**: Return user-friendly error messages
