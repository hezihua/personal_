import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import type { HarnessRuntime } from "../harness/harness.js";

export function createHarnessExtension(harness: HarnessRuntime): ExtensionFactory {
  return (pi) => {
    let activeSessionId = "harness-default";

    pi.on("session_start", (event) => {
      activeSessionId = event.previousSessionFile ?? `harness-${Date.now()}`;
      harness.context.bindPiSession(activeSessionId, {
        source: "pi-extension",
        reason: event.reason,
      });
      harness.tools.syncRegisteredMcpServers(pi.getMcpServers());
    });

    pi.on("mcp_servers_change", (event) => {
      harness.tools.syncRegisteredMcpServers(event.servers);
    });

    pi.on("tool_call", async (event) => {
      harness.tools.syncFromPiToolNames([event.toolName]);
      const guard = await harness.guardToolCallAsync({
        toolName: event.toolName,
        input: event.input as Record<string, unknown>,
        sessionId: activeSessionId,
      });
      if (guard.block) {
        return {
          block: true,
          reason: guard.blockReason ?? "Harness 策略拒绝",
          terminate: guard.policy.decision === "deny",
        };
      }
    });

    pi.on("before_agent_start", (event) => {
      const appendix = harness.skills.formatForSystemPrompt();
      if (!appendix) {
        return;
      }
      return {
        systemPrompt: `${event.systemPrompt}\n\n${appendix}`,
      };
    });

    pi.registerCommand("harness-status", {
      description: "显示 Harness Runtime 状态（任务 / 策略 / Skills / MCP）",
      handler: async (_args, ctx) => {
        const tasks = harness.tasks.list();
        const skills = harness.skills.list().map((s) => s.name);
        const mcp = harness.tools.listMcpServers().map((s) => `${s.name}(${s.enabled ? "on" : "off"})`);
        const auditTail = harness.getAuditLog().slice(-5);
        ctx.ui.notify(
          [
            `Harness 工作区: ${harness.config.workspace.id}`,
            `任务数: ${tasks.length}`,
            `Skills: ${skills.join(", ") || "(无)"}`,
            `MCP: ${mcp.join(", ") || "(无)"}`,
            `工具登记: ${harness.tools.list().length}`,
            `最近审计: ${auditTail.map((a) => a.message).join(" | ") || "(无)"}`,
          ].join("\n"),
        );
      },
    });
  };
}
