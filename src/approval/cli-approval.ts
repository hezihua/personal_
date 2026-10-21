import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { ApprovalPrompt, ApprovalRequest } from "../harness/approval-runtime.js";

export function createCliApprovalPrompt(options?: {
  autoApproveEnv?: string;
}): ApprovalPrompt {
  const envKey = options?.autoApproveEnv ?? "HARNESS_AUTO_APPROVE";

  return async (request: ApprovalRequest) => {
    if (process.env[envKey] === "1") {
      return true;
    }
    if (!input.isTTY) {
      console.error(
        `[Harness] 工具 ${request.toolName} 需审批但非交互终端。设置 ${envKey}=1 或改用 HTTP POST /approvals/:id`,
      );
      return false;
    }

    const rl = readline.createInterface({ input, output });
    try {
      const preview = JSON.stringify(request.input ?? {}, null, 0);
      const line = await rl.question(
        `\n[Harness 审批] 工具: ${request.toolName}\n原因: ${request.reason}\n参数: ${preview.slice(0, 500)}\n允许执行? [y/N] `,
      );
      const normalized = line.trim().toLowerCase();
      return normalized === "y" || normalized === "yes";
    } finally {
      rl.close();
    }
  };
}
