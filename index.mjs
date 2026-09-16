#!/usr/bin/env node
/**
 * AgentMD MCP server (stdio).
 *
 * Wraps the hosted AgentMD conversion API so any MCP client can install it
 * with a single command:
 *
 *   npx agentmd-mcp
 *
 * Configuration (environment):
 *   AGENTMD_API_KEY   API key from https://www.getagentmd.com (required
 *                     unless the endpoint runs in open demo mode)
 *   AGENTMD_BASE_URL  Override the API base (self-hosting / staging)
 */
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const { version: VERSION } = createRequire(import.meta.url)("./package.json");

const BASE_URL = (
  process.env.AGENTMD_BASE_URL ?? "https://www.getagentmd.com"
).replace(/\/$/, "");
const API_KEY = process.env.AGENTMD_API_KEY ?? "";

async function convert(body) {
  const res = await fetch(`${BASE_URL}/api/v1/convert`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Unexpected response (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const hint =
      res.status === 401
        ? " Set AGENTMD_API_KEY — get a free key (50 conversions, no card) by POSTing {\"email\": ...} to https://www.getagentmd.com/api/v1/keys/free"
        : "";
    throw new Error(`${payload.error ?? `HTTP ${res.status}`}.${hint}`);
  }
  return payload;
}

function render(result) {
  const header = [
    result.meta?.title ? `# ${result.meta.title}` : null,
    result.warnings?.length ? `> Warnings: ${result.warnings.join("; ")}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    content: [
      {
        type: "text",
        text: header ? `${header}\n\n${result.markdown}` : result.markdown,
      },
    ],
  };
}

function asError(err) {
  return {
    content: [{ type: "text", text: `Error: ${err.message ?? String(err)}` }],
    isError: true,
  };
}

serveStdio(() => {
  const server = new McpServer(
    { name: "agentmd", version: VERSION },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    "convert_url_to_markdown",
    {
      title: "Convert URL to markdown",
      description:
        "Fetches a document at an http(s) URL — web page, PDF, DOCX, HTML, Markdown, or plain text — and converts it to clean, LLM-ready markdown. Use this instead of convert_file_to_markdown when the document lives on the network rather than on the filesystem of the machine running this server, and instead of convert_document_to_markdown when you hold a link rather than the raw bytes; it is the only one of the three that fetches the source itself. Returns one markdown text block: the detected title as a leading `# <title>` line when one is found, a `> Warnings: ...` blockquote line when the converter reports warnings, tables preserved as GFM, and for web pages navigation and boilerplate stripped with relative links rewritten to absolute URLs. Limits: 25 MB per document, and PDFs are text-extraction only, so scanned or image-only PDFs yield little or no text (OCR is not available yet). Requires AGENTMD_API_KEY; on a 401, a network or fetch failure, or an unsupported format it returns an isError result whose text explains what went wrong. Each successful call consumes one conversion from the account quota.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: z.object({
        url: z
          .string()
          .describe(
            "Absolute http(s) URL of the page or document to fetch and convert, e.g. https://example.com/report.pdf. Must be publicly reachable from the AgentMD service; URLs behind a login, a paywall, or a private network will fail.",
          ),
      }),
    },
    async ({ url }) => {
      try {
        return render(await convert({ url }));
      } catch (err) {
        return asError(err);
      }
    },
  );

  server.registerTool(
    "convert_file_to_markdown",
    {
      title: "Convert a local file to markdown",
      description:
        "Reads a document from the local filesystem by absolute path and converts it to clean, LLM-ready markdown. Use this instead of convert_url_to_markdown when the document is already saved on disk, and instead of convert_document_to_markdown when you have a path and would otherwise have to read and base64-encode the bytes yourself — this tool does that reading and encoding for you. Returns one markdown text block: the detected title as a leading `# <title>` line when one is found, a `> Warnings: ...` blockquote line when the converter reports warnings, and tables preserved as GFM. Supported formats are PDF, DOCX, HTML, Markdown, and plain text, up to 25 MB per document; PDFs are text-extraction only, so scanned or image-only PDFs yield little or no text (OCR is not available yet). Requires AGENTMD_API_KEY; on a missing or unreadable file, a 401, a network failure, or an unsupported format it returns an isError result whose text explains what went wrong. Each successful call consumes one conversion from the account quota.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: z.object({
        path: z
          .string()
          .describe(
            "Absolute path to the document on the filesystem of the machine running this MCP server, not the client machine (e.g. /home/me/docs/report.pdf or C:\\\\docs\\\\report.pdf). The file is read locally and its bytes are sent to the AgentMD API; the basename is used for format detection, so keep the file extension.",
          ),
      }),
    },
    async ({ path }) => {
      try {
        const bytes = await readFile(path);
        return render(
          await convert({
            base64: bytes.toString("base64"),
            filename: path.split(/[\\/]/).pop(),
          }),
        );
      } catch (err) {
        return asError(err);
      }
    },
  );

  server.registerTool(
    "convert_document_to_markdown",
    {
      title: "Convert document bytes to markdown",
      description:
        "Converts base64-encoded document bytes that you already hold into clean, LLM-ready markdown, without reading a file or fetching a URL. Use this instead of convert_file_to_markdown when the bytes came from somewhere other than this machine's filesystem (an upload, an earlier tool result, memory), and instead of convert_url_to_markdown when there is no fetchable link to the source. Returns one markdown text block: the detected title as a leading `# <title>` line when one is found, a `> Warnings: ...` blockquote line when the converter reports warnings, and tables preserved as GFM. Supported formats are PDF, DOCX, HTML, Markdown, and plain text, up to 25 MB per document — base64 inflates the payload by about a third, so prefer convert_file_to_markdown or convert_url_to_markdown for large files — and PDFs are text-extraction only, so scanned or image-only PDFs yield little or no text (OCR is not available yet). Requires AGENTMD_API_KEY; on a 401, a network failure, malformed base64, or an unsupported format it returns an isError result whose text explains what went wrong. Each successful call consumes one conversion from the account quota.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: z.object({
        base64: z
          .string()
          .describe(
            "The document's full contents encoded as standard base64 (RFC 4648: A-Z a-z 0-9 + / with = padding). Pass the encoded string on its own — no `data:` URI prefix, no media type, no surrounding quotes.",
          ),
        filename: z
          .string()
          .optional()
          .describe(
            "Original filename including its extension, e.g. report.pdf or notes.docx. Used for format detection when the bytes alone are ambiguous (HTML vs. Markdown vs. plain text) and to seed the document title. Optional, but supplying it makes detection markedly more reliable.",
          ),
      }),
    },
    async ({ base64, filename }) => {
      try {
        return render(await convert({ base64, filename }));
      } catch (err) {
        return asError(err);
      }
    },
  );

  return server;
});
