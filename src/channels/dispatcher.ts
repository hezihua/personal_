import type { HarnessRuntime } from "../harness/harness.js";
import type { HarnessTask } from "../harness/types.js";
import { createHarnessPiSession } from "../pi/create-session.js";
import { parseUserCommand } from "./command-parser.js";
import { sendFeishuTextToChat } from "./feishu-send.js";
import { OutboundStore } from "./outbox.js";
import type { ChannelId, InboundMessage } from "./types.js";

export interface DispatchResult {
  kind: "task" | "approval" | "status";
  task?: HarnessTask;
  message: string;
}

export class ChannelDispatcher {
  readonly outbox = new OutboundStore();

  constructor(private readonly cwd: string) {}

  bindHarnessEvents(harness: HarnessRuntime, defaultChannel: ChannelId, ownerUserId: string): void {
    harness.approvals.setOnPending((req) => {
      const text = [
        "需要你批准工具调用",
        `工具: ${req.toolName}`,
        `原因: ${req.reason}`,
        `回复「批准 ${req.id}」或「拒绝 ${req.id}」`,
      ].join("\n");
      this.outbox.push(defaultChannel, ownerUserId, {
        kind: "approval_request",
        text,
        payload: { approvalId: req.id, toolName: req.toolName },
      });
      void this.notifyUser(defaultChannel, ownerUserId, `[Harness 审批]\n${text}`);
    });
  }

  private async notifyUser(channel: ChannelId, userId: string, text: string): Promise<void> {
    if (channel === "feishu") {
      await sendFeishuTextToChat(userId, text);
    }
  }

  async handleInbound(
    harness: HarnessRuntime,
    message: InboundMessage,
    runningTasks: Map<string, Promise<HarnessTask>>,
  ): Promise<DispatchResult> {
    const cmd = parseUserCommand(message.text);

    if (cmd.type === "approve") {
      const updated = harness.approvals.resolve(cmd.approvalId, "approved");
      const reply = updated ? `已批准 ${cmd.approvalId}` : "审批不存在或已处理";
      this.outbox.push(message.channel, message.userId, { kind: "info", text: reply });
      return { kind: "approval", message: reply };
    }

    if (cmd.type === "deny") {
      const updated = harness.approvals.resolve(cmd.approvalId, "denied");
      const reply = updated ? `已拒绝 ${cmd.approvalId}` : "审批不存在或已处理";
      this.outbox.push(message.channel, message.userId, { kind: "info", text: reply });
      return { kind: "approval", message: reply };
    }

    if (cmd.type === "status") {
      const pending = harness.approvals.listPending();
      const tasks = harness.tasks.list().slice(-5);
      const reply = [
        `待审批: ${pending.length}`,
        ...pending.map((p) => `- ${p.toolName} (${p.id.slice(0, 8)}…)`),
        `最近任务: ${tasks.map((t) => `${t.id.slice(0, 8)}… ${t.status}`).join(", ") || "(无)"}`,
      ].join("\n");
      this.outbox.push(message.channel, message.userId, { kind: "info", text: reply });
      return { kind: "status", message: reply };
    }

    if (!cmd.prompt) {
      const reply = "请输入任务描述，或发送「状态」查看进度";
      this.outbox.push(message.channel, message.userId, { kind: "error", text: reply });
      return { kind: "task", message: reply };
    }

    const task = harness.tasks.create({
      prompt: cmd.prompt,
      workspaceId: harness.config.workspace.id,
      userId: message.userId,
    });

    const ack = `已接单 ${task.id.slice(0, 8)}…，正在执行`;
    this.outbox.push(message.channel, message.userId, {
      kind: "task_ack",
      text: ack,
      payload: { taskId: task.id },
    });
    void this.notifyUser(message.channel, message.userId, `[Harness] ${ack}\n${cmd.prompt.slice(0, 200)}`);

    const job = this.runTask(harness, task, message.channel, message.userId);
    runningTasks.set(task.id, job);

    return { kind: "task", task, message: ack };
  }

  private async runTask(
    harness: HarnessRuntime,
    task: HarnessTask,
    channel: ChannelId,
    userId: string,
  ): Promise<HarnessTask> {
    try {
      const { session } = await createHarnessPiSession({ cwd: this.cwd, harness });
      const result = await harness.runTaskWithSession(task, session, session.sessionId);
      const summary =
        result.status === "completed"
          ? `任务完成 ${result.id.slice(0, 8)}…`
          : `任务失败 ${result.id.slice(0, 8)}… ${result.error ?? ""}`;
      this.outbox.push(channel, userId, {
        kind: "task_result",
        text: summary,
        payload: { taskId: result.id, status: result.status, error: result.error },
      });
      void this.notifyUser(channel, userId, `[Harness] ${summary}`);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failed = harness.tasks.get(task.id);
      if (failed && failed.status === "running") {
        harness.tasks.transition(task.id, "failed", { error: message });
      }
      this.outbox.push(channel, userId, { kind: "error", text: message, payload: { taskId: task.id } });
      void this.notifyUser(channel, userId, `[Harness 错误] ${message}`);
      throw err;
    }
  }
}
