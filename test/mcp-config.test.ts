import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { McpConfigRuntime } from "../src/harness/mcp-config-runtime.js";

describe("McpConfigRuntime", () => {
  it("merges global and project mcp.json", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "harness-mcp-"));
    const agentDir = path.join(root, "agent");
    const cwd = path.join(root, "proj");
    mkdirSync(agentDir, { recursive: true });
    mkdirSync(path.join(cwd, ".pi"), { recursive: true });

    writeFileSync(
      path.join(agentDir, "mcp.json"),
      JSON.stringify({
        mcpServers: {
          docs: { url: "https://example.com/mcp", enabled: true },
        },
      }),
    );
    writeFileSync(
      path.join(cwd, ".pi", "mcp.json"),
      JSON.stringify({
        mcpServers: {
          docs: { enabled: false },
        },
      }),
    );

    const runtime = new McpConfigRuntime();
    const config = runtime.load({ agentDir, cwd, projectTrusted: true });
    const docs = config.servers.find((s) => s.name === "docs");
    expect(docs?.enabled).toBe(false);
    expect(docs?.scope).toBe("project");
  });
});
