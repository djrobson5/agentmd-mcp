// Smoke test: drive the stdio MCP shim through initialize + tools/list + a real conversion.
// Usage: AGENTMD_API_KEY=... node test-stdio.mjs
import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["index.mjs"], {
  cwd: import.meta.dirname,
  stdio: ["pipe", "pipe", "inherit"],
  env: process.env,
});

const send = (msg) => child.stdin.write(JSON.stringify(msg) + "\n");
let buf = "";
const seen = [];

child.stdout.on("data", (chunk) => {
  buf += chunk.toString();
  let idx;
  while ((idx = buf.indexOf("\n")) !== -1) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    seen.push(msg);
    if (msg.id === 1) {
      console.log("initialize ->", msg.result.serverInfo);
      send({ jsonrpc: "2.0", method: "notifications/initialized" });
      send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    } else if (msg.id === 2) {
      console.log("tools ->", msg.result.tools.map((t) => t.name).join(", "));
      send({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "convert_url_to_markdown",
          arguments: { url: "https://example.com" },
        },
      });
    } else if (msg.id === 3) {
      const text = msg.result.content[0].text;
      console.log("isError:", Boolean(msg.result.isError));
      console.log("result ->", text.slice(0, 120).replace(/\n/g, " "));
      child.kill();
      process.exit(msg.result.isError ? 1 : 0);
    }
  }
});

send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "smoke-test", version: "1.0" },
  },
});

setTimeout(() => {
  console.error("timed out; messages seen:", JSON.stringify(seen).slice(0, 400));
  child.kill();
  process.exit(1);
}, 45000);
