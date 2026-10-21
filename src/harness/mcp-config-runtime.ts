import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

export interface McpServerRecord {
  name: string;
  enabled: boolean;
  scope: "global" | "project" | "extension";
  source: string;
  transport: "stdio" | "http" | "unknown";
  command?: string;
  url?: string;
  description?: string;
  exposure?: string;
}

export interface HarnessMcpConfig {
  servers: McpServerRecord[];
  errors: string[];
  globalConfigPath?: string;
  projectConfigPath?: string;
}

type RawMcpJson = {
  mcpServers?: Record<string, Record<string, unknown>>;
  autoEnableCodemode?: boolean;
};

export class McpConfigRuntime {
  private config: HarnessMcpConfig = { servers: [], errors: [] };

  load(options: { agentDir: string; cwd: string; projectTrusted?: boolean }): HarnessMcpConfig {
    const errors: string[] = [];
    const globalPath = path.join(options.agentDir, "mcp.json");
    const projectPath = path.join(options.cwd, ".pi", "mcp.json");
    const merged = new Map<string, McpServerRecord>();

    const globalRaw = readMcpFile(globalPath, errors);
    for (const [name, entry] of Object.entries(globalRaw?.mcpServers ?? {})) {
      merged.set(name, toRecord(name, entry, "global", globalPath));
    }

    if (options.projectTrusted !== false && existsSync(projectPath)) {
      const projectRaw = readMcpFile(projectPath, errors);
      for (const [name, entry] of Object.entries(projectRaw?.mcpServers ?? {})) {
        const prev = merged.get(name);
        merged.set(name, mergeRecord(name, prev, entry, projectPath));
      }
    }

    this.config = {
      servers: [...merged.values()],
      errors,
      globalConfigPath: existsSync(globalPath) ? globalPath : undefined,
      projectConfigPath: existsSync(projectPath) ? projectPath : undefined,
    };
    return this.config;
  }

  snapshot(): HarnessMcpConfig {
    return this.config;
  }
}

function readMcpFile(filePath: string, errors: string[]): RawMcpJson | undefined {
  if (!existsSync(filePath)) {
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as RawMcpJson;
  } catch (err) {
    errors.push(`${filePath}: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }
}

function toRecord(
  name: string,
  raw: Record<string, unknown>,
  scope: McpServerRecord["scope"],
  source: string,
): McpServerRecord {
  const url = typeof raw.url === "string" ? raw.url : undefined;
  const command = typeof raw.command === "string" ? raw.command : undefined;
  const transport: McpServerRecord["transport"] = command ? "stdio" : url ? "http" : "unknown";
  return {
    name,
    enabled: raw.enabled !== false,
    scope,
    source,
    transport,
    command,
    url,
    description: typeof raw.description === "string" ? raw.description : undefined,
    exposure: typeof raw.exposure === "string" ? raw.exposure : undefined,
  };
}

function mergeRecord(
  name: string,
  base: McpServerRecord | undefined,
  override: Record<string, unknown>,
  projectPath: string,
): McpServerRecord {
  if (!base) {
    return toRecord(name, override, "project", projectPath);
  }
  const hasOwnTransport =
    typeof override.command === "string" || typeof override.url === "string" || typeof override.type === "string";
  if (!hasOwnTransport) {
    return {
      ...base,
      scope: "project",
      source: projectPath,
      enabled: override.enabled !== undefined ? override.enabled !== false : base.enabled,
      exposure: typeof override.exposure === "string" ? override.exposure : base.exposure,
    };
  }
  return toRecord(name, { ...base, ...override }, "project", projectPath);
}
