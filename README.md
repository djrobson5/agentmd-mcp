# agentmd-mcp

MCP server for [AgentMD](https://www.getagentmd.com) — convert **PDF, DOCX, HTML, and URLs into clean, LLM-ready markdown**, with tables preserved and web-page boilerplate stripped.

Agents ingest documents constantly, and most document formats are hostile to language models. This gives your agent three tools that turn any of them into markdown it can actually read.

## Install

Get a free API key (50 conversions, no card) at https://www.getagentmd.com — or fully programmatically:

```bash
curl -X POST https://www.getagentmd.com/api/v1/keys/free \
  -H "Content-Type: application/json" -d '{"email": "you@example.com"}'
```

Then:

**Claude Code**

```bash
claude mcp add agentmd --env AGENTMD_API_KEY=<your-key> -- npx -y agentmd-mcp
```

**Any MCP client** (`mcp.json` / `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "agentmd": {
      "command": "npx",
      "args": ["-y", "agentmd-mcp"],
      "env": { "AGENTMD_API_KEY": "<your-key>" }
    }
  }
}
```

**Remote (no install)** — the hosted server speaks streamable HTTP directly:

```bash
claude mcp add --transport http agentmd https://www.getagentmd.com/api/mcp \
  --header "Authorization: Bearer <your-key>"
```

## Tools

| Tool | Use it for |
| --- | --- |
| `convert_url_to_markdown` | A web page or a document at an http(s) URL |
| `convert_file_to_markdown` | A document on the local filesystem, by path |
| `convert_document_to_markdown` | Document bytes you already hold, as base64 |

All three return markdown, prefixed with the detected title and any warnings.

## Supported formats

- **PDF** — text extraction (scanned/image-only PDFs return a warning; OCR is on the roadmap)
- **DOCX** — headings, lists, and tables preserved
- **HTML / URLs** — main-article extraction, GFM tables, links resolved to absolute URLs
- **Markdown / plain text** — normalized passthrough

Limit: 25 MB per document.

## Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `AGENTMD_API_KEY` | yes | Your API key |
| `AGENTMD_BASE_URL` | no | Point at a different deployment (self-hosting, staging) |

## Pricing

First 50 conversions free (per email, no card). After that, $0.002 per successful conversion, billed monthly. No per-seat licensing — you pay for calls your agents actually make.

## License

MIT (this client shim). The hosted service has its own terms.
