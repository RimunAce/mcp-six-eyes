# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.2.0]: https://www.npmjs.com/package/mcp-six-eyes/v/1.2.0
[1.1.0]: https://www.npmjs.com/package/mcp-six-eyes/v/1.1.0
[1.0.0]: https://www.npmjs.com/package/mcp-six-eyes/v/1.0.0
