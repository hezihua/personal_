import { randomUUID } from "node:crypto";
import type { AuditEntry } from "./types.js";

export type ApprovalStatus = "pending" | "approved" | "denied" | "expired";

export interface ApprovalRequest {
  id: string;
  toolName: string;
  input?: Record<string, unknown>;
  reason: string;
  sessionId?: string;
  status: ApprovalStatus;
  createdAt: string;
  resolvedAt?: string;
}

export type ApprovalPrompt = (request: ApprovalRequest) => Promise<boolean>;

export class ApprovalRuntime {
  private pending = new Map<string, ApprovalRequest>();
  private waiters = new Map<string, { resolve: (approved: boolean) => void }>();

  constructor(
    private readonly audit: (entry: AuditEntry) => void,
    private prompt?: ApprovalPrompt,
    private readonly ttlMs = 5 * 60 * 1000,
  ) {}

  setPrompt(prompt: ApprovalPrompt | undefined): void {
    this.prompt = prompt;
  }

  listPending(): ApprovalRequest[] {
    this.expireStale();
    return [...this.pending.values()].filter((r) => r.status === "pending");
  }

  get(id: string): ApprovalRequest | undefined {
    return this.pending.get(id);
  }

  async request(input: {
    toolName: string;
    input?: Record<string, unknown>;
    reason: string;
    sessionId?: string;
  }): Promise<boolean> {
    const now = new Date().toISOString();
    const request: ApprovalRequest = {
      id: randomUUID(),
      toolName: input.toolName,
      input: input.input,
      reason: input.reason,
      sessionId: input.sessionId,
      status: "pending",
      createdAt: now,
    };
    this.pending.set(request.id, request);
    this.audit({
      at: now,
      type: "policy",
      message: "等待用户审批工具调用",
      detail: { approvalId: request.id, toolName: input.toolName },
    });

    if (this.prompt) {
      const approved = await this.prompt(request);
      this.resolve(request.id, approved ? "approved" : "denied");
      return approved;
    }

    return new Promise<boolean>((resolve) => {
      this.waiters.set(request.id, { resolve });
      setTimeout(() => {
        const current = this.pending.get(request.id);
        if (current?.status === "pending") {
          this.resolve(request.id, "expired");
          resolve(false);
        }
      }, this.ttlMs);
    });
  }

  resolve(id: string, status: Exclude<ApprovalStatus, "pending">): ApprovalRequest | undefined {
    const req = this.pending.get(id);
    if (!req || req.status !== "pending") {
      return req;
    }
    req.status = status;
    req.resolvedAt = new Date().toISOString();
    this.pending.set(id, req);
    this.audit({
      at: req.resolvedAt,
      type: "policy",
      message: `审批 ${status}`,
      detail: { approvalId: id, toolName: req.toolName },
    });
    const waiter = this.waiters.get(id);
    if (waiter) {
      this.waiters.delete(id);
      waiter.resolve(status === "approved");
    }
    return req;
  }

  private expireStale(): void {
    const now = Date.now();
    for (const req of this.pending.values()) {
      if (req.status !== "pending") {
        continue;
      }
      const age = now - Date.parse(req.createdAt);
      if (age > this.ttlMs) {
        this.resolve(req.id, "expired");
      }
    }
  }
}
