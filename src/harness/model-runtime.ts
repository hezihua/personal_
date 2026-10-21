import type { ModelPreferences } from "./types.js";

export interface ModelRouteRequest {
  taskKind?: "chat" | "code" | "plan";
  preferCost?: boolean;
}

export interface ModelRouteResult {
  provider?: string;
  modelId?: string;
  thinkingLevel?: ModelPreferences["thinkingLevel"];
  reason: string;
}

export class HarnessModelRuntime {
  constructor(private readonly prefs: ModelPreferences = {}) {}

  route(_req: ModelRouteRequest = {}): ModelRouteResult {
    if (this.prefs.modelId) {
      return {
        provider: this.prefs.provider,
        modelId: this.prefs.modelId,
        thinkingLevel: this.prefs.thinkingLevel ?? "medium",
        reason: "使用 Harness 配置的固定模型",
      };
    }
    return {
      thinkingLevel: this.prefs.thinkingLevel ?? "medium",
      reason: "未指定模型，交由 Pi ModelRuntime / 用户设置解析",
    };
  }
}
