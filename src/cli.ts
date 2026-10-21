#!/usr/bin/env node
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { createCliApprovalPrompt } from "./approval/cli-approval.js";
import { createHarnessGateway } from "./gateway/server.js";
import { createHarness, defaultHarnessConfig } from "./harness/harness.js";
import { createHarnessPiSession } from "./pi/create-session.js";

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const cwd = process.cwd();
  const agentDir = getAgentDir();

  if (command === "gateway") {
    const port = Number(process.env.HARNESS_PORT ?? rest[0] ?? 8787);
    const host = process.env.HARNESS_HOST ?? "127.0.0.1";
    const harness = createHarness(defaultHarnessConfig(cwd));
    const gateway = createHarnessGateway({ cwd, harness });
    await gateway.listen(host, port);
    console.log(`Harness Gateway http://${host}:${port}`);
    console.log("  GET  /health /status /tools /mcp/servers /approvals /tasks/:id");
    console.log("  POST /tasks  /approvals/:id  { \"action\": \"approve\"|\"deny\" }");
    return;
  }

  if (command === "status") {
    const harness = createHarness(defaultHarnessConfig(cwd));
    await harness.prepare(cwd, agentDir);
    console.log(
      JSON.stringify(
        {
          workspace: harness.config.workspace,
          skills: harness.skills.list().map((s) => s.name),
          tools: harness.tools.list(),
          mcp: harness.mcp.snapshot(),
          mcpServers: harness.tools.listMcpServers(),
          modelRoute: harness.model.route(),
        },
        null,
        2,
      ),
    );
    return;
  }

  if (command === "run") {
    const prompt = rest.join(" ").trim();
    if (!prompt) {
      console.error("用法: pnpm harness run <你的任务描述>");
      process.exit(1);
    }
    const harness = createHarness(defaultHarnessConfig(cwd), createCliApprovalPrompt());
    const task = harness.tasks.create({
      prompt,
      workspaceId: harness.config.workspace.id,
      userId: harness.config.user.id,
    });
    const { session } = await createHarnessPiSession({ cwd, harness });
    const result = await harness.runTaskWithSession(task, session, session.sessionId);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`个人助手 Harness（Pi 底座）

命令:
  pnpm harness status                    查看 Skills / MCP / 工具 / 模型路由
  pnpm harness run <任务>                CLI 审批 + Pi 执行任务
  pnpm gateway [port]                    启动 HTTP 网关（默认 8787）

环境变量:
  HARNESS_AUTO_APPROVE=1                 非交互模式下自动批准 ask
  HARNESS_PORT / HARNESS_HOST            网关监听地址

架构模块: Task / Context / Skill / Tool+MCP / Model / Policy / Sandbox / Approval
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
