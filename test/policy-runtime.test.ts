import { describe, expect, it } from "vitest";
import { PolicyRuntime } from "../src/harness/policy-runtime.js";
import type { HarnessConfig } from "../src/harness/types.js";

const baseConfig: HarnessConfig = {
  user: { id: "u1", role: "owner" },
  workspace: {
    id: "ws1",
    rootPath: "/proj",
    allowedToolNames: ["read", "bash"],
    allowedDataPaths: ["/proj/"],
  },
  sandbox: {},
};

describe("PolicyRuntime", () => {
  it("denies tool not in allowlist", () => {
    const policy = new PolicyRuntime(baseConfig);
    const result = policy.evaluateToolCall("write", { path: "/proj/a.txt" });
    expect(result.decision).toBe("deny");
    expect(result.chain.some((c) => c.stage === "tool")).toBe(true);
  });

  it("denies path outside workspace data scope", () => {
    const policy = new PolicyRuntime(baseConfig);
    const result = policy.evaluateToolCall("read", { path: "/etc/passwd" });
    expect(result.decision).toBe("deny");
  });

  it("allows read inside workspace", () => {
    const policy = new PolicyRuntime(baseConfig);
    const result = policy.evaluateToolCall("read", { path: "/proj/src/index.ts" });
    expect(result.decision).toBe("allow");
  });
});
