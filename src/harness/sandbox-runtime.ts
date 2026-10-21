import type { SandboxLimits } from "./types.js";

export interface SandboxCheckInput {
  toolName: string;
  command?: string;
  path?: string;
  workspaceRoot: string;
}

export interface SandboxCheckResult {
  allowed: boolean;
  reason?: string;
}

export class SandboxRuntime {
  constructor(private readonly limits: SandboxLimits) {}

  check(input: SandboxCheckInput): SandboxCheckResult {
    if (input.toolName === "bash" || input.toolName === "powershell") {
      return this.checkShell(input.command ?? "");
    }
    if (input.path && this.limits.workspaceOnlyPaths) {
      return this.checkPath(input.path, input.workspaceRoot);
    }
    return { allowed: true };
  }

  private checkShell(command: string): SandboxCheckResult {
    const trimmed = command.trim();
    if (!trimmed) {
      return { allowed: false, reason: "空命令" };
    }
    const prefixes = this.limits.allowedBashPrefixes;
    if (prefixes && prefixes.length > 0) {
      const ok = prefixes.some((p) => trimmed.startsWith(p));
      if (!ok) {
        return { allowed: false, reason: `命令不在沙箱白名单: ${trimmed.slice(0, 80)}` };
      }
    }
    if (!this.limits.allowNetwork) {
      const networkHints = /\b(curl|wget|ssh|scp|nc\s|netcat|Invoke-WebRequest|iwr\b)/i;
      if (networkHints.test(trimmed)) {
        return { allowed: false, reason: "沙箱禁止网络相关命令" };
      }
    }
    return { allowed: true };
  }

  private checkPath(path: string, workspaceRoot: string): SandboxCheckResult {
    const norm = (s: string) => s.replace(/\\/g, "/").toLowerCase();
    const p = norm(path);
    const root = norm(workspaceRoot);
    if (!p.startsWith(root)) {
      return { allowed: false, reason: `路径超出工作区: ${path}` };
    }
    return { allowed: true };
  }
}
