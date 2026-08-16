# Contributing

Thanks for helping improve **mcp-six-eyes**.

## Development setup

Requirements:

- Node.js 20+
- npm 10+

```bash
npm install
npm test
```

Useful scripts:

| Script | Purpose |
| --- | --- |
| `npm run build` | Compile TypeScript to `build/` |
| `npm run typecheck` | Typecheck without emitting |
| `npm test` | Build, then run the full unit suite |
| `npm run test:unit` | Run tests against the current `build/` |
| `npm start` | Start the MCP server on stdio |
| `npm run smoke` | Quick image-loader smoke script |

## Project layout

```text
src/
  index.ts                 MCP server + tools
  config.ts                env/provider config
  image.ts                 path/URL/base64 loader + labels
  prompts.ts               task prompts
  cache.ts                 content-addressed response cache
  providers/               vision backends + router
test/                      Node.js built-in test suite
```

## Coding guidelines

- Keep tool names stable. Agents learn them.
- Return **text only** from tools. Host models may have no vision.
- Never write application logs to **stdout** (stdio JSON-RPC). Use `console.error`.
- Prefer small, focused changes over broad refactors.
- Match existing TypeScript style: strict types, no unnecessary abstractions.
- Do not commit API keys, `.env` files, or real user images.

## Tests

This repo uses the Node.js built-in test runner (`node:test`).

```bash
npm test
```

When you change behavior:

1. Add or update tests under `test/`
2. Keep provider tests offline (mock `fetch`)
3. Cover multi-image labeling when touch `image.ts` / prompts
4. Run `npm test` before opening a PR

Optional live check (requires your own key; not run in CI):

```bash
VISION_PROVIDER=openai OPENAI_API_KEY=sk-... npm start
```

Then exercise tools with the [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector):

```bash
npx @modelcontextprotocol/inspector node ./build/index.js
```

## Pull requests

1. Fork and create a branch
2. Make the change with tests
3. Ensure `npm test` passes
4. Describe the user-facing impact (tools, env vars, docs)
5. Keep PRs focused

## Maintainer release

Only maintainers ship versions:

```bash
npm login
# bump version + CHANGELOG first when needed
npm test
npm publish --access public
```

## Reporting issues

Include:

- Node.js version
- MCP host (Claude Desktop, Cursor, etc.)
- `VISION_PROVIDER` / model (redact keys)
- Exact tool call and error text from stderr
- Package version from `npm view mcp-six-eyes version`

Security issues: see [SECURITY.md](./SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the MIT License.
