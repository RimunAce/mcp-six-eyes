# Security Policy

## Supported versions

Security fixes are applied on a best-effort basis to the latest release of `mcp-six-eyes`.

## What this server does with data

`mcp-six-eyes` is a local MCP server. When a tool is called it may:

1. Read image bytes from a local path, `file://` URI, `http(s)` URL, data URL, or base64 payload supplied by the host/agent
2. Send those bytes plus a text prompt to the configured vision provider API
3. Return **plain text** to the MCP host

Images and prompts are not stored by this project beyond the lifetime of a tool call. Provider retention is governed by the provider you configure.

## Hardening notes for operators

- Keep API keys in MCP client `env` config or a local `.env` that is never committed
- Treat remote image URLs as untrusted input; only fetch sources you expect
- Use `VISION_MAX_IMAGE_BYTES` and `VISION_MAX_IMAGES` to bound request size
- Prefer least-privilege API keys limited to the vision models you need
- Do not log tool arguments that may contain base64 image payloads

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Instead, report privately via one of:

- [GitHub Security Advisories](https://github.com/RimunAce/mcp-six-eyes/security/advisories/new) (preferred)
- Contact [@RimunAce](https://github.com/RimunAce) or the [npm maintainer page](https://www.npmjs.com/~rimunace)

Include:

- A clear description of the issue and impact
- Reproduction steps or a proof of concept
- Affected version / commit if known

You should receive an acknowledgement when practical. Please give a reasonable window for a fix before public disclosure.

## Secrets in this repository

This project must never contain real API keys. If you find a committed secret, rotate it immediately and open a private report.
