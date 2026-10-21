import type { AuditEntry } from "./types.js";

export interface HarnessSessionState {
  sessionId: string;
  workspaceId: string;
  userId: string;
  activeSkillId?: string;
  metadata: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export class ContextSessionRuntime {
  private sessions = new Map<string, HarnessSessionState>();

  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly audit: (entry: AuditEntry) => void,
  ) {}

  bindPiSession(sessionId: string, metadata: Record<string, string> = {}): HarnessSessionState {
    const now = new Date().toISOString();
    const state: HarnessSessionState = {
      sessionId,
      workspaceId: this.workspaceId,
      userId: this.userId,
      metadata,
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(sessionId, state);
    this.audit({
      at: now,
      type: "task",
      message: "Pi 会话已绑定 Harness 上下文",
      detail: { sessionId },
    });
    return state;
  }

  get(sessionId: string): HarnessSessionState | undefined {
    return this.sessions.get(sessionId);
  }

  setActiveSkill(sessionId: string, skillId: string | undefined): void {
    const s = this.sessions.get(sessionId);
    if (!s) {
      return;
    }
    s.activeSkillId = skillId;
    s.updatedAt = new Date().toISOString();
  }

  patchMetadata(sessionId: string, patch: Record<string, string>): void {
    const s = this.sessions.get(sessionId);
    if (!s) {
      return;
    }
    Object.assign(s.metadata, patch);
    s.updatedAt = new Date().toISOString();
  }
}
