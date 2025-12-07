# MCP Server Ideas

Ideas for future MCP servers based on patterns across my projects.

---

## Tier 1: Direct Workflow Accelerators

### beads-mcp (Task Substrate)

**Purpose:** Native MCP interface to Beads task management, eliminating subprocess overhead in Agent0 and Agent Orchestra.

**Tools:**
- `create_task` - Create new task with title, type, priority, dependencies
- `query_ready` - Find tasks with no blockers ready for work
- `update_status` - Change task status (open → in_progress → closed)
- `get_blocked` - List blocked tasks with blocking dependency info
- `add_dependency` - Link tasks (blocks, related, parent-child)
- `get_stats` - Project statistics (open, closed, blocked counts)

**Value:** Immediate latency wins for multi-agent coordination. Already have the plugin pattern.

---

### research-mcp (Intelligence Substrate)

**Purpose:** Powers Intelbot and Inevitability Engine with structured research capabilities.

**Tools:**
- `search_arxiv` - Query ArXiv with filters (category, date, author)
- `fetch_paper` - Get paper metadata, abstract, PDF link
- `summarize_paper` - AI-powered paper summarization
- `search_web` - Perplexity API integration for verified research
- `fetch_rss` - Aggregate RSS feeds with relevance filtering
- `cache_source` - Store sources with TTL for deduplication

**Integrations:** ArXiv API, OpenReview, Perplexity, RSS feeds

---

### media-pipeline-mcp (AV Production)

**Purpose:** Support ai-talkshow-cli and video generation workflows.

**Tools:**
- `queue_render` - Submit Remotion render job
- `render_status` - Check job progress, get output path
- `cancel_render` - Abort in-progress render
- `ffmpeg_transcode` - Convert between formats
- `ffmpeg_concat` - Join multiple clips
- `ffmpeg_overlay` - Add watermarks, captions
- `elevenlabs_synthesize` - Generate speech with timestamps
- `generate_thumbnail` - Create video thumbnails
- `extract_waveform` - Audio visualization data

**Value:** Unify all media operations behind consistent MCP interface.

---

## Tier 2: Cross-Project Infrastructure

### agent-mail-mcp (Inter-Agent Communication)

**Purpose:** Expose Maildir-based agent messaging as MCP tools.

**Tools:**
- `send_message` - Send to agent with subject, body, priority
- `check_inbox` - List messages for agent (new, cur, all)
- `read_message` - Get full message content
- `mark_read` - Move from new to cur
- `subscribe_topic` - Register interest in topic pattern
- `broadcast` - Send to multiple agents

**Value:** Cleaner inter-agent communication across all multi-agent systems.

---

### substack-mcp (Publishing Pipeline)

**Purpose:** Streamline Substack publishing workflow.

**Tools:**
- `create_draft` - New post draft with title, content, section
- `update_draft` - Modify existing draft
- `schedule_post` - Set publication time
- `publish_now` - Immediate publication
- `get_analytics` - Views, engagement, subscriber metrics
- `list_posts` - Query published/draft posts
- `crosspost_linkedin` - Share to LinkedIn
- `crosspost_twitter` - Share to Twitter/X

**Integrations:** Substack API, LinkedIn API, Twitter API

---

### excel-audit-mcp (Data Analysis)

**Purpose:** Excel Auditor skill as native MCP for data analysis workflows.

**Tools:**
- `read_excel` - Parse workbook with formula preservation
- `infer_schema` - Detect column types, relationships
- `validate_data` - Check against schema, report issues
- `quality_score` - Data quality metrics
- `transform` - Pivot, filter, join operations
- `export_csv` - Convert to CSV with options
- `summarize_sheet` - AI-powered data summary

**Value:** Direct data analysis without file-based skill invocation.

---

## Tier 3: Specialized Capabilities

### wardley-mcp (Strategic Mapping)

**Purpose:** Strategic analysis for Inevitability Engine and planning workflows.

**Tools:**
- `generate_map` - Create Wardley map from description
- `analyze_evolution` - Determine component evolution stages
- `suggest_positions` - Recommend component placement
- `check_doctrine` - Validate against Wardley doctrine
- `find_opportunities` - Identify strategic plays
- `export_svg` - Render map as SVG

**Concepts:** Value chain, evolution (genesis → custom → product → commodity), doctrine patterns

---

### local-llm-mcp (Hybrid Inference)

**Purpose:** Cost-sensitive and offline LLM operations.

**Tools:**
- `list_models` - Available local models
- `generate` - Text generation with model selection
- `embed` - Generate embeddings for RAG
- `route` - Suggest model based on task complexity
- `benchmark` - Compare model performance

**Integrations:** Ollama, LM Studio, llama.cpp

---

### prompt-lab-mcp (Prompt Engineering)

**Purpose:** Version-controlled prompt development based on AIPrompts and prompt-evolve.

**Tools:**
- `save_prompt` - Store prompt with version, metadata
- `load_prompt` - Retrieve by name/version
- `list_prompts` - Query prompt library
- `test_prompt` - Run against test cases
- `compare_versions` - A/B test results
- `optimize` - Suggest improvements
- `interpolate` - Fill template variables

---

## Implementation Priority

| MCP Server | Effort | Impact | Dependencies |
|------------|--------|--------|--------------|
| beads-mcp | Low | High | SQLite, existing beads DB |
| agent-mail-mcp | Low | Medium | Maildir, fs operations |
| substack-mcp | Medium | High | Substack API access |
| research-mcp | Medium | High | ArXiv API, Perplexity key |
| excel-audit-mcp | Medium | Medium | xlsx library |
| media-pipeline-mcp | High | High | Remotion, FFmpeg, ElevenLabs |
| wardley-mcp | Medium | Medium | Mapping logic |
| local-llm-mcp | Medium | Medium | Ollama installation |
| prompt-lab-mcp | Low | Medium | File storage |

---

## Architecture Notes

All servers follow the standard structure:

```
server-name/
├── src/
│   └── index.ts      # MCP server entry
├── package.json
├── tsconfig.json
└── README.md
```

Key patterns:
- Use `@modelcontextprotocol/sdk` for server scaffolding
- Zod for input validation
- Structured error responses
- Environment variables for API keys
- npx-installable for easy distribution

---

*Generated 2024-12-07*
