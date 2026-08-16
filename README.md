<p align="center">
  <img src="assets/logo.png" alt="mcp-six-eyes logo" width="180" height="180" />
</p>

# mcp-six-eyes

MCP server that gives **text-only AI agents** the ability to understand images, including multi-image chats like “refer image 1 and 2” or “compare these screenshots.”

Text-only models cannot see pixels. This server bridges that gap: agents call vision tools, the server talks to a multimodal API, and the agent gets plain text back.

```text
Agent (text-only)
   │  tool call: analyze / compare / refer / ocr / …
   ▼
mcp-six-eyes (this server)
   │  1..N images: path | URL | base64  (labels: 1, 2, before, …)
   ▼
Vision API (OpenAI / Anthropic / Gemini / OpenRouter / custom)
   │
   ▼
Plain-text description / OCR / comparison / structured extract
   │
   ▼
Agent continues reasoning with text
```

## Why this works

MCP exposes **tools** an agent can call. The agent never needs native vision:

1. User uploads or points at one or more images
2. Agent calls a vision tool with those sources (and optional labels)
3. Server loads the image(s) and sends them to a multimodal model
4. Server returns **only text**, with stable image labels
5. The text-only agent uses that text like any other tool result

## Tools

| Tool | Purpose |
| --- | --- |
| `analyze_image` | General Q&A over one or more images |
| `describe_image` | Dense scene/UI description (great “context dump” for agents) |
| `ocr_image` | Extract visible text (per-image sections when multi) |
| `compare_images` | Diff 2+ images (before/after, A/B, variants) |
| `refer_images` | Answer questions that cite “image 1”, “both figures”, etc. |
| `inspect_ui` | UI/UX screenshot review and multi-step flows |
| `read_chart` | Charts, plots, tables, dashboards |
| `explain_diagram` | Architecture / flowchart / ERD / whiteboard explainers |
| `extract_from_images` | Structured JSON from forms, receipts, tables, labels |
| `vision_status` | Show configured provider/model and limits |

### Image inputs

Every image tool accepts:

- **Single:** `image`: local path, `file://`, `http(s)`, data URL, or base64  
- **Multi:** `images`: array of sources **or** `{ source, label?, mimeType? }` objects  
- You can pass both; they are merged

Labels default to `"1"`, `"2"`, … so agent prompts like “compare image 1 and 2” map cleanly. Custom labels work too (`"before"`, `"after"`, `"fig-a"`).

```text
# one image
analyze_image({ image: "./shot.png", prompt: "What failed?" })

# multi-image with default labels 1..n
compare_images({
  images: ["./a.png", "./b.png"],
  prompt: "What changed in the error state?"
})

# multi-image with explicit labels (best for long threads)
refer_images({
  images: [
    { source: "./login.png", label: "1" },
    { source: "./dashboard.png", label: "2" }
  ],
  prompt: "Using image 1 and image 2, is the user authenticated?"
})
```

Supported source forms:

- local file path (`/path/to/image.png` or `C:\path\to\image.png`)
- `file://` URI
- `http(s)` URL
- data URL (`data:image/png;base64,...`)
- raw base64 (pass `mimeType` when possible)

## Requirements

- Node.js 20+
- A vision-capable API key (OpenAI, Anthropic, Google, OpenRouter, or any OpenAI-compatible endpoint)

## Install

Published on npm as [`mcp-six-eyes`](https://www.npmjs.com/package/mcp-six-eyes).

```bash
npx -y mcp-six-eyes
```

Or install globally / as a project dependency:

```bash
npm install -g mcp-six-eyes
# or
npm install mcp-six-eyes
```

Most people wire it into an MCP client instead of running it by hand. Example Claude Desktop / Cursor config:

```json
{
  "mcpServers": {
    "mcp-six-eyes": {
      "command": "npx",
      "args": ["-y", "mcp-six-eyes"],
      "env": {
        "VISION_PROVIDER": "openai",
        "OPENAI_API_KEY": "sk-..."
      }
    }
  }
}
```

Why `npx` is popular here:

- no global install
- client starts the server on demand
- `-y` skips the install prompt on first run
- npm caches the package for later launches

### Local development

```bash
npm install
npm run build
```

Then either:

```json
{
  "mcpServers": {
    "mcp-six-eyes": {
      "command": "npx",
      "args": ["-y", "."],
      "env": {
        "VISION_PROVIDER": "openai",
        "OPENAI_API_KEY": "sk-..."
      }
    }
  }
}
```

or point Node at the built entrypoint:

```json
{
  "mcpServers": {
    "mcp-six-eyes": {
      "command": "node",
      "args": ["./build/index.js"],
      "env": {
        "VISION_PROVIDER": "openai",
        "OPENAI_API_KEY": "sk-..."
      }
    }
  }
}
```

## Environment

Set provider keys in the MCP client `env` block (recommended) or a local `.env` for development.

Minimal OpenAI setup:

```bash
VISION_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

Optional model / limits:

```bash
VISION_MODEL=gpt-4o-mini
VISION_MAX_IMAGES=10
VISION_MAX_IMAGE_BYTES=20971520
VISION_CACHE_MAX_ENTRIES=200
```

The server speaks MCP over **stdio**. Do not write application logs to stdout.

## Caching

Vision calls are memoized by content, in memory. The cache key hashes the actual image bytes plus the task, prompt, labels, and token cap (not the source string), so a model that re-calls `describe_image` (or any vision tool) on the same image gets the previous answer back instantly, marked `Cached: yes`, without re-billing the vision API.

- Default: `VISION_CACHE_MAX_ENTRIES=200` (bounded, oldest evicted first)
- Set `VISION_CACHE_MAX_ENTRIES=0` to disable
- First answer wins for a given key; a changed file or URL produces a new key
- Failed and fallback responses are never cached
- Cache lives only for the process lifetime (no disk persistence)

## Client notes

### Claude Desktop

Config file:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%AppData%\Claude\claude_desktop_config.json`

Use the `npx` block from [Quick start with npx](#quick-start-with-npx).

### Cursor

Add the same server block to `.cursor/mcp.json` (project) or your global Cursor MCP config.

### Other stdio MCP hosts

Any host that can spawn:

```text
npx -y mcp-six-eyes
```

and pass environment variables will work.

## Providers

| Provider | `VISION_PROVIDER` | Key env var | Default model |
| --- | --- | --- | --- |
| OpenAI | `openai` | `OPENAI_API_KEY` | `gpt-4o-mini` |
| Anthropic | `anthropic` | `ANTHROPIC_API_KEY` | `claude-sonnet-4-5` |
| Google Gemini | `google` | `GOOGLE_API_KEY` | `gemini-2.0-flash` |
| OpenRouter | `openrouter` | `OPENROUTER_API_KEY` | `openai/gpt-4o-mini` |
| Custom OpenAI-compatible | `custom` | `VISION_API_KEY` + `VISION_BASE_URL` | set `VISION_MODEL` |

Optional fallback:

```bash
VISION_FALLBACK_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

## Example agent usage

### Single screenshot

```text
User: What's wrong in this screenshot? ./screenshots/build-error.png

Agent → ocr_image({ image: "./screenshots/build-error.png" })
Agent → analyze_image({
  image: "./screenshots/build-error.png",
  prompt: "Explain the error and suggest a fix"
})
Agent → answers in plain text
```

### Multi-image: refer / compare

```text
User: I uploaded two shots. Compare image 1 and 2. Did the fix work?

Agent → compare_images({
  images: [
    { source: "./before.png", label: "1" },
    { source: "./after.png", label: "2" }
  ],
  prompt: "Did the red error banner disappear after the fix?"
})
```

```text
User: Refer image 1 and image 2. Which CTA is primary?

Agent → refer_images({
  images: [
    { source: "./landing-a.png", label: "1" },
    { source: "./landing-b.png", label: "2" }
  ],
  prompt: "Which image has the stronger primary CTA and why?"
})
```

### UI flow, chart, diagram, structured extract

```text
inspect_ui({
  images: ["./step1.png", "./step2.png", "./step3.png"],
  prompt: "Describe the checkout flow and any friction"
})

read_chart({
  image: "https://example.com/revenue.png",
  prompt: "Summarize the trend and call out outliers"
})

explain_diagram({
  image: "./architecture.png",
  prompt: "List services and data flow"
})

extract_from_images({
  image: "./receipt.jpg",
  schema: "{\"merchant\":string,\"date\":string,\"total\":number,\"items\":[{\"name\":string,\"price\":number}]}"
})
```

## Architecture

```text
src/
  index.ts                 MCP server + tools
  config.ts                env/provider config
  image.ts                 path/URL/base64 loader + multi-image labels
  prompts.ts               task prompts (analyze/describe/ocr/compare/...)
  providers/
    index.ts               provider router + fallback
    openai-compatible.ts   OpenAI / OpenRouter / custom (multi-image)
    anthropic.ts           Claude vision (multi-image)
    google.ts              Gemini vision (multi-image)
    types.ts               shared contracts
test/                      unit tests (node:test, mocked providers)
assets/
  logo.png                 project logo
```

## Design notes

- **Tools, not resources**: image understanding is an action with side effects (API cost), so it is exposed as tools.
- **Text-only output**: host models without vision only need text content blocks.
- **Labeled multi-image**: agents in chat UIs talk about “image 1/2”; labels keep that grounding stable.
- **Task-specific tools**: compare / refer / UI / chart / diagram / extract beat one mega-prompt for tool selection.
- **Stdio transport**: simplest local integration for desktop agents.
- **No stdout logging**: stdout is reserved for JSON-RPC; diagnostics go to stderr.
- **Provider abstraction**: swap backends without changing tool names the agent learns.

## Development

```bash
npm install
npm test
npm start
```

| Script | Purpose |
| --- | --- |
| `npm run build` | Compile TypeScript to `build/` |
| `npm run typecheck` | Typecheck only |
| `npm test` | Build + full unit test suite |
| `npm run test:unit` | Run tests against current `build/` |
| `npm run smoke` | Quick image-loader smoke script |
| `npm start` | Run MCP server on stdio |

Debug with the [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector):

```bash
npx @modelcontextprotocol/inspector node ./build/index.js
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for PR and coding guidelines.

## Links

- npm: [mcp-six-eyes](https://www.npmjs.com/package/mcp-six-eyes)
- Maintainer: [rimunace](https://www.npmjs.com/~rimunace)

## Release workflow

Maintainer path after local changes:

```bash
# one-time
npm login

# bump version + CHANGELOG, then ship
npm test
npm publish --access public
```

Optional helper (tests, then npm publish):

```bash
npm run release
```

## Security

- API keys stay in environment variables / client config, never in tool responses
- Remote URL fetches are explicit tool inputs; treat untrusted URLs carefully
- Large images are rejected via `VISION_MAX_IMAGE_BYTES` (default 20MB)
- Image count per call is capped via `VISION_MAX_IMAGES` (default 10)
- The response cache holds only content hashes and result text in memory; nothing is persisted to disk

Full policy: [SECURITY.md](./SECURITY.md).

## Contributing

Issues and pull requests are welcome. Please run `npm test` before opening a PR and read [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE)
