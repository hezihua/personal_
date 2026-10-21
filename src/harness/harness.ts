import type { AgentSession, ToolInfo } from "@earendil-works/pi-coding-agent";
import { ApprovalRuntime, type ApprovalPrompt } from "./approval-runtime.js";
import { ContextSessionRuntime } from "./context-session.js";
import { HarnessModelRuntime } from "./model-runtime.js";
import { McpConfigRuntime } from "./mcp-config-runtime.js";
import { PolicyRuntime } from "./policy-runtime.js";
import { SandboxRuntime } from "./sandbox-runtime.js";
import { SkillRuntime } from "./skill-runtime.js";
import { TaskRuntime } from "./task-runtime.js";
import { ToolMcpRuntime } from "./tool-mcp-runtime.js";
import type { AuditEntry, HarnessConfig, HarnessTask, PolicyResult } from "./types.js";

export interface ToolGuardInput {
  toolName: string;
  input?: Record<string, unknown>;
  sessionId?: string;
}

export interface ToolGuardResult {
  policy: PolicyResult;
  sandboxAllowed: boolean;
  sandboxReason?: string;
  needsApproval: boolean;
  block: boolean;
  blockReason?: string;
}

export class HarnessRuntime {
  readonly policy: PolicyRuntime;
  readonly context: ContextSessionRuntime;
  readonly skills: SkillRuntime;
  readonly tools: ToolMcpRuntime;
  readonly model: HarnessModelRuntime;
  readonly sandbox: SandboxRuntime;
  readonly tasks: TaskRuntime;
  readonly approvals: ApprovalRuntime;
  readonly mcp: McpConfigRuntime;

  private auditLog: AuditEntry[] = [];

  constructor(readonly config: HarnessConfig, approvalPrompt?: ApprovalPrompt) {
    const audit = (entry: AuditEntry) => {
      this.auditLog.push(entry);
    };
    this.policy = new PolicyRuntime(config);
    this.context = new ContextSessionRuntime(config.workspace.id, config.user.id, audit);
    this.skills = new SkillRuntime(config.skillSearchPaths);
    this.tools = new ToolMcpRuntime();
    this.model = new HarnessModelRuntime(config.model);
    this.sandbox = new SandboxRuntime(config.sandbox);
    this.tasks = new TaskRuntime(audit);
    this.approvals = new ApprovalRuntime(audit, approvalPrompt);
    this.mcp = new McpConfigRuntime();
  }

  setApprovalPrompt(prompt: ApprovalPrompt | undefined): void {
    this.approvals.setPrompt(prompt);
  }

  getAuditLog(): AuditEntry[] {
    return [...this.auditLog];
  }

  async prepare(cwd: string, agentDir: string): Promise<void> {
    await this.skills.reload(cwd);
    const mcpConfig = this.mcp.load({ agentDir, cwd, projectTrusted: true });
    this.tools.syncMcpConfig(mcpConfig);
    this.tools.registerMany([
      { name: "read", source: "builtin" },
      { name: "bash", source: "builtin" },
      { name: "edit", source: "builtin" },
      { name: "write", source: "builtin" },
    ]);
  }

  syncToolsFromPi(infos: ToolInfo[]): void {
    this.tools.syncFromPiToolInfos(infos);
  }

  guardToolCall(input: ToolGuardInput): ToolGuardResult {
    const session = input.sessionId ? this.context.get(input.sessionId) : undefined;
    const policy = this.policy.evaluateToolCall(
      input.toolName,
      input.input,
      session?.activeSkillId,
    );

    let sandboxAllowed = true;
    let sandboxReason: string | undefined;
    if (input.toolName === "bash" || input.toolName === "powershell" || input.input?.path) {
      const sb = this.sandbox.check({
        toolName: input.toolName,
        command: typeof input.input?.command === "string" ? input.input.command : undefined,
        path: typeof input.input?.path === "string" ? input.input.path : undefined,
        workspaceRoot: this.config.workspace.rootPath,
      });
      sandboxAllowed = sb.allowed;
      sandboxReason = sb.reason;
    }

    const needsApproval = policy.decision === "ask";
    const block = policy.decision === "deny" || needsApproval || !sandboxAllowed;

    const blockReason =
      policy.decision === "deny"
        ? policy.reason
        : needsApproval
          ? policy.reason ?? "需要用户确认"
          : sandboxReason;

    this.auditLog.push({
      at: new Date().toISOString(),
      type: "tool",
      message: block ? "工具调用待拦截/审批" : "工具调用放行",
      detail: { toolName: input.toolName, policy: policy.decision, sandboxAllowed, needsApproval },
    });

    return {
      policy,
      sandboxAllowed,
      sandboxReason,
      needsApproval,
      block,
      blockReason,
    };
  }

  async guardToolCallAsync(input: ToolGuardInput): Promise<ToolGuardResult> {
    const guard = this.guardToolCall(input);
    if (!guard.block || !guard.needsApproval) {
      return guard;
    }
    const approved = await this.approvals.request({
      toolName: input.toolName,
      input: input.input,
      reason: guard.blockReason ?? "需要用户确认",
      sessionId: input.sessionId,
    });
    if (approved) {
      return {
        ...guard,
        block: false,
        needsApproval: false,
        blockReason: undefined,
      };
    }
    return {
      ...guard,
      block: true,
      blockReason: "用户拒绝审批",
    };
  }

  async runTaskWithSession(
    task: HarnessTask,
    session: AgentSession,
    piSessionId: string,
  ): Promise<HarnessTask> {
    this.context.bindPiSession(piSessionId);
    this.tasks.transition(task.id, "running", { sessionId: piSessionId });
    try {
      await session.prompt(task.prompt);
      return this.tasks.transition(task.id, "completed");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.tasks.transition(task.id, "failed", { error: message });
    }
  }
}

export function createHarness(config: HarnessConfig, approvalPrompt?: ApprovalPrompt): HarnessRuntime {
  return new HarnessRuntime(config, approvalPrompt);
}

export function defaultHarnessConfig(cwd: string): HarnessConfig {
  return {
    user: { id: "local-owner", role: "owner" },
    workspace: {
      id: "default",
      rootPath: cwd,
      allowedToolNames: ["read", "grep", "find", "ls", "bash", "edit", "write", "mcp__*"],
    },
    sandbox: {
      workspaceOnlyPaths: true,
      allowNetwork: false,
      allowedBashPrefixes: ["npm ", "pnpm ", "node ", "npx ", "git status", "git diff", "echo "],
    },
    defaultTools: ["read", "grep", "find", "bash", "edit", "write", "mcp__*"],
  };
}
