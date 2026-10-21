import type { HarnessConfig, PolicyContext, PolicyDecision, PolicyResult } from "./types.js";

const DESTRUCTIVE_TOOLS = new Set(["bash", "powershell", "write", "edit"]);

export class PolicyRuntime {
  constructor(private readonly config: HarnessConfig) {}

  evaluate(ctx: PolicyContext): PolicyResult {
    const chain: PolicyResult["chain"] = [];

    const userDecision = this.checkUser(ctx);
    chain.push({ stage: "user", decision: userDecision.decision, detail: userDecision.reason });
    if (userDecision.decision === "deny") {
      return { decision: "deny", reason: userDecision.reason, chain };
    }

    const workspaceDecision = this.checkWorkspace(ctx);
    chain.push({
      stage: "workspace",
      decision: workspaceDecision.decision,
      detail: workspaceDecision.reason,
    });
    if (workspaceDecision.decision === "deny") {
      return { decision: "deny", reason: workspaceDecision.reason, chain };
    }

    if (ctx.skillId) {
      const skillDecision = this.checkSkill(ctx);
      chain.push({ stage: "skill", decision: skillDecision.decision, detail: skillDecision.reason });
      if (skillDecision.decision === "deny") {
        return { decision: "deny", reason: skillDecision.reason, chain };
      }
    }

    const toolDecision = this.checkTool(ctx);
    chain.push({ stage: "tool", decision: toolDecision.decision, detail: toolDecision.reason });
    if (toolDecision.decision === "deny") {
      return { decision: "deny", reason: toolDecision.reason, chain };
    }

    const dataDecision = this.checkDataPaths(ctx);
    chain.push({ stage: "data", decision: dataDecision.decision, detail: dataDecision.reason });
    if (dataDecision.decision === "deny") {
      return { decision: "deny", reason: dataDecision.reason, chain };
    }

    if (ctx.credentialScope) {
      const credDecision = this.checkCredential(ctx.credentialScope);
      chain.push({ stage: "credential", decision: credDecision.decision, detail: credDecision.reason });
      if (credDecision.decision === "deny") {
        return { decision: "deny", reason: credDecision.reason, chain };
      }
    }

    const risky = DESTRUCTIVE_TOOLS.has(ctx.toolName) || ctx.toolName.startsWith("mcp__");
    const final: PolicyDecision =
      toolDecision.decision === "ask" || (risky && this.config.user.role === "guest") ? "ask" : "allow";
    chain.push({ stage: "policy_engine", decision: final });

    return {
      decision: final,
      reason: final === "ask" ? "需要用户确认后执行" : undefined,
      chain,
    };
  }

  evaluateToolCall(toolName: string, input?: Record<string, unknown>, skillId?: string): PolicyResult {
    return this.evaluate({
      user: this.config.user,
      workspace: this.config.workspace,
      toolName,
      toolInput: input,
      skillId,
      credentialScope: toolName.startsWith("mcp__") ? toolName : undefined,
    });
  }

  private checkUser(ctx: PolicyContext): { decision: PolicyDecision; reason?: string } {
    if (!ctx.user?.id) {
      return { decision: "deny", reason: "未识别用户" };
    }
    return { decision: "allow" };
  }

  private checkWorkspace(ctx: PolicyContext): { decision: PolicyDecision; reason?: string } {
    if (ctx.workspace.id !== this.config.workspace.id) {
      return { decision: "deny", reason: "工作区不匹配" };
    }
    return { decision: "allow" };
  }

  private checkSkill(ctx: PolicyContext): { decision: PolicyDecision; reason?: string } {
    const allowed = this.config.workspace.allowedSkillIds;
    if (!allowed || allowed.length === 0) {
      return { decision: "allow" };
    }
    if (!ctx.skillId || !allowed.includes(ctx.skillId)) {
      return { decision: "deny", reason: `Skill 未授权: ${ctx.skillId ?? "(none)"}` };
    }
    return { decision: "allow" };
  }

  private checkTool(ctx: PolicyContext): { decision: PolicyDecision; reason?: string } {
    const allowed = this.config.workspace.allowedToolNames;
    if (!allowed || allowed.length === 0) {
      return { decision: "allow" };
    }
    const name = ctx.toolName;
    const ok = allowed.some((pattern) => {
      if (pattern.endsWith("*")) {
        return name.startsWith(pattern.slice(0, -1));
      }
      return pattern === name;
    });
    if (!ok) {
      return { decision: "deny", reason: `工具未授权: ${name}` };
    }
    if (DESTRUCTIVE_TOOLS.has(name) && this.config.user.role === "guest") {
      return { decision: "ask", reason: "访客对破坏性工具需确认" };
    }
    return { decision: "allow" };
  }

  private checkDataPaths(ctx: PolicyContext): { decision: PolicyDecision; reason?: string } {
    const allowedPaths = this.config.workspace.allowedDataPaths;
    if (!allowedPaths || allowedPaths.length === 0) {
      return { decision: "allow" };
    }
    const paths = extractPathsFromToolInput(ctx.toolName, ctx.toolInput);
    if (paths.length === 0) {
      return { decision: "allow" };
    }
    for (const p of paths) {
      const normalized = p.replace(/\\/g, "/");
      const ok = allowedPaths.some((base) => normalized.startsWith(base.replace(/\\/g, "/")));
      if (!ok) {
        return { decision: "deny", reason: `数据路径未授权: ${p}` };
      }
    }
    return { decision: "allow" };
  }

  private checkCredential(scope: string): { decision: PolicyDecision; reason?: string } {
    if (scope.includes("secret") || scope.includes("admin")) {
      return { decision: "ask", reason: `敏感凭证作用域需确认: ${scope}` };
    }
    return { decision: "allow" };
  }
}

function extractPathsFromToolInput(toolName: string, input?: Record<string, unknown>): string[] {
  if (!input) {
    return [];
  }
  const keys = ["path", "file_path", "filePath", "directory", "cwd"];
  const out: string[] = [];
  for (const key of keys) {
    const v = input[key];
    if (typeof v === "string" && v.length > 0) {
      out.push(v);
    }
  }
  if (toolName === "bash" || toolName === "powershell") {
    const command = input.command;
    if (typeof command === "string") {
      const match = command.match(/(?:^|\s)([\w./\\:-]+)/);
      if (match?.[1] && (match[1].includes("/") || match[1].includes("\\"))) {
        out.push(match[1]);
      }
    }
  }
  return out;
}
