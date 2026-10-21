import type { ToolInfo } from "@earendil-works/pi-coding-agent";
import type { HarnessMcpConfig, McpServerRecord } from "./mcp-config-runtime.js";

export interface ToolDescriptor {
  name: string;
  source: "builtin" | "extension" | "mcp" | "custom";
  namespace?: string;
  description?: string;
  exposure?: string;
  mcpServer?: string;
}

export class ToolMcpRuntime {
  private tools = new Map<string, ToolDescriptor>();
  private mcpServers: McpServerRecord[] = [];

  register(tool: ToolDescriptor): void {
    this.tools.set(tool.name, tool);
  }

  registerMany(tools: ToolDescriptor[]): void {
    for (const t of tools) {
      this.register(t);
    }
  }

  list(): ToolDescriptor[] {
    return [...this.tools.values()];
  }

  listMcpServers(): McpServerRecord[] {
    return [...this.mcpServers];
  }

  classifyToolName(name: string): ToolDescriptor["source"] {
    if (name.startsWith("mcp__")) {
      return "mcp";
    }
    const known = new Set(["read", "write", "edit", "bash", "grep", "find", "ls", "powershell"]);
    if (known.has(name)) {
      return "builtin";
    }
    return "extension";
  }

  syncMcpConfig(config: HarnessMcpConfig): void {
    this.mcpServers = config.servers;
  }

  syncRegisteredMcpServers(
    servers: Array<{ name: string; config: { description?: string; enabled?: boolean } }>,
  ): void {
    for (const server of servers) {
      const existing = this.mcpServers.find((s) => s.name === server.name);
      if (existing) {
        existing.description = server.config.description ?? existing.description;
        existing.enabled = server.config.enabled !== false;
        existing.scope = "extension";
        continue;
      }
      this.mcpServers.push({
        name: server.name,
        enabled: server.config.enabled !== false,
        scope: "extension",
        source: "pi-extension",
        transport: "unknown",
        description: server.config.description,
      });
    }
  }

  syncFromPiToolNames(names: string[]): void {
    for (const name of names) {
      this.register(this.descriptorFromName(name));
    }
  }

  syncFromPiToolInfos(infos: ToolInfo[]): void {
    for (const info of infos) {
      const source = this.classifyToolName(info.name);
      const mcpServer = source === "mcp" ? parseMcpServerName(info.name) : undefined;
      this.register({
        name: info.name,
        source,
        namespace: info.namespace?.name ?? (info.name.includes("__") ? info.name.split("__")[0] : undefined),
        description: info.description,
        exposure: info.exposure,
        mcpServer,
      });
    }
  }

  private descriptorFromName(name: string): ToolDescriptor {
    const source = this.classifyToolName(name);
    return {
      name,
      source,
      namespace: name.includes("__") ? name.split("__")[0] : undefined,
      mcpServer: source === "mcp" ? parseMcpServerName(name) : undefined,
    };
  }
}

function parseMcpServerName(toolName: string): string | undefined {
  if (!toolName.startsWith("mcp__")) {
    return undefined;
  }
  const parts = toolName.split("__");
  return parts.length >= 3 ? parts[1] : undefined;
}
