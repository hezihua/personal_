export type PolicyDecision = "allow" | "deny" | "ask";

export type TaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface HarnessWorkspace {
  id: string;
  rootPath: string;
  allowedSkillIds?: string[];
  allowedToolNames?: string[];
  allowedDataPaths?: string[];
}

export interface HarnessUser {
  id: string;
  role?: "owner" | "member" | "guest";
}

export interface PolicyContext {
  user: HarnessUser;
  workspace: HarnessWorkspace;
  skillId?: string;
  toolName: string;
  toolInput?: Record<string, unknown>;
  credentialScope?: string;
}

export interface PolicyResult {
  decision: PolicyDecision;
  reason?: string;
  chain: Array<{ stage: string; decision: PolicyDecision; detail?: string }>;
}

export interface HarnessTask {
  id: string;
  status: TaskStatus;
  prompt: string;
  workspaceId: string;
  userId: string;
  sessionId?: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface SandboxLimits {
  maxBashDurationMs?: number;
  allowNetwork?: boolean;
  allowedBashPrefixes?: string[];
  workspaceOnlyPaths?: boolean;
}

export interface ModelPreferences {
  provider?: string;
  modelId?: string;
  thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
}

export interface HarnessConfig {
  user: HarnessUser;
  workspace: HarnessWorkspace;
  sandbox: SandboxLimits;
  model?: ModelPreferences;
  skillSearchPaths?: string[];
  /** Tool names/patterns passed to Pi session (read, bash, mcp__*, etc.) */
  defaultTools?: string[];
}

export interface AuditEntry {
  at: string;
  type: "policy" | "task" | "tool" | "model" | "sandbox";
  message: string;
  detail?: Record<string, unknown>;
}
