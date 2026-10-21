import { randomUUID } from "node:crypto";
import type { AuditEntry, HarnessTask, TaskStatus } from "./types.js";

export class TaskRuntime {
  private tasks = new Map<string, HarnessTask>();

  constructor(private readonly audit: (entry: AuditEntry) => void) {}

  create(input: { prompt: string; workspaceId: string; userId: string }): HarnessTask {
    const now = new Date().toISOString();
    const task: HarnessTask = {
      id: randomUUID(),
      status: "pending",
      prompt: input.prompt,
      workspaceId: input.workspaceId,
      userId: input.userId,
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(task.id, task);
    this.audit({ at: now, type: "task", message: "任务已创建", detail: { taskId: task.id } });
    return task;
  }

  get(taskId: string): HarnessTask | undefined {
    return this.tasks.get(taskId);
  }

  transition(taskId: string, status: TaskStatus, patch?: Partial<Pick<HarnessTask, "sessionId" | "error">>): HarnessTask {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`任务不存在: ${taskId}`);
    }
    task.status = status;
    task.updatedAt = new Date().toISOString();
    if (patch?.sessionId) {
      task.sessionId = patch.sessionId;
    }
    if (patch?.error) {
      task.error = patch.error;
    }
    this.audit({
      at: task.updatedAt,
      type: "task",
      message: `任务状态 → ${status}`,
      detail: { taskId, ...patch },
    });
    return task;
  }

  list(): HarnessTask[] {
    return [...this.tasks.values()];
  }
}
