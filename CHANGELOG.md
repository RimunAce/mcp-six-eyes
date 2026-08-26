# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.1] - 2026-08-26

### Fixed

- MCP advertised server version now matches `package.json` instead of staying at `1.1.0`

### Security

- Block private, loopback, link-local, and cloud-metadata image URLs by default (`VISION_BLOCK_PRIVATE_URLS=true`), including redirect hops
- Restrict local path and `file://` reads to `VISION_ALLOWED_ROOTS` (cwd + temp when unset)
- Send Gemini API keys via `x-goog-api-key` instead of a query string

### Added

- Shared HTTP retry with jitter for provider `429`/`5xx` (honors `Retry-After`, default 3 attempts)
- Optional tool `detail` (`auto` | `low` | `original`) and PNG downscale to `VISION_MAX_IMAGE_EDGE` (default 2048)
- `extract_from_images` parses JSON, retries once on invalid JSON, then returns `isError`
- `vision_status` reports allowed roots, private URL block, max edge, retry, and cache policy

### Changed

- Multi-image loads run in parallel with a concurrency cap of 4 (order and labels unchanged)
- Fallback successes remain uncached so a recovered primary is not poisoned

## [1.2.0] - 2026-08-16

### Added

- Content-addressed response cache that memoizes vision calls by image bytes + task + prompt, so repeated `describe_image` (and other vision tools) on the same image are served instantly instead of re-billing the vision API
- `VISION_CACHE_MAX_ENTRIES` (default `200`, `0` disables)
- `Cached: yes` marker on cache-hit results and cache state in `vision_status`

## [1.1.0] - 2026-08-06

### Added

- Multi-image tool inputs via `image` and/or `images` with stable labels
- Tools: `compare_images`, `refer_images`, `inspect_ui`, `read_chart`, `explain_diagram`, `extract_from_images`
- `VISION_MAX_IMAGES` limit (default 10)
- Unit test suite (`npm test`) with mocked provider HTTP
- GitHub Actions CI on Node 20/22/24
- Release workflow for tagged npm publishes
- `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`

### Changed

- Package renamed to `mcp-six-eyes`
- README generalized for npm / npx / local installs
- Package homepage points at the npm listing

## [1.0.0] - 2026-08-06

### Added

- Initial MCP server with `analyze_image`, `describe_image`, `ocr_image`, `vision_status`
- Providers: OpenAI, Anthropic, Google Gemini, OpenRouter, custom OpenAI-compatible
- Optional fallback provider

[1.2.1]: https://www.npmjs.com/package/mcp-six-eyes/v/1.2.1
[1.2.0]: https://www.npmjs.com/package/mcp-six-eyes/v/1.2.0
[1.1.0]: https://www.npmjs.com/package/mcp-six-eyes/v/1.1.0
[1.0.0]: https://www.npmjs.com/package/mcp-six-eyes/v/1.0.0
