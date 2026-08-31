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
    { name: "agentmd", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    "convert_url_to_markdown",
    {
      title: "Convert URL to markdown",
      description:
        "Fetch a URL (web page, PDF, DOCX, etc.) and convert it to clean, LLM-ready markdown. Strips navigation and boilerplate from web pages and preserves tables.",
      inputSchema: z.object({
        url: z.string().describe("The http(s) URL of the document or page to convert"),
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
        "Read a document from the local filesystem (PDF, DOCX, HTML, plain text) and convert it to clean, LLM-ready markdown.",
      inputSchema: z.object({
        path: z.string().describe("Absolute path to the document on this machine"),
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
        "Convert base64-encoded document contents (PDF, DOCX, HTML, plain text) to clean, LLM-ready markdown. Use when you already hold the bytes rather than a path or URL.",
      inputSchema: z.object({
        base64: z.string().describe("Base64-encoded file contents"),
        filename: z
          .string()
          .optional()
          .describe("Original filename, e.g. report.pdf — helps format detection"),
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
