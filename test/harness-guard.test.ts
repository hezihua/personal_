import { describe, expect, it } from "vitest";
import { createHarness, defaultHarnessConfig } from "../src/harness/harness.js";

describe("HarnessRuntime.guardToolCall", () => {
  it("blocks bash when command prefix not allowed", () => {
    const harness = createHarness({
      ...defaultHarnessConfig("E:/proj"),
      workspace: {
        id: "default",
        rootPath: "E:/proj",
        allowedToolNames: ["bash"],
      },
      sandbox: {
        allowNetwork: false,
        allowedBashPrefixes: ["echo "],
      },
    });

    const guard = harness.guardToolCall({
      toolName: "bash",
      input: { command: "curl https://example.com" },
    });

    expect(guard.block).toBe(true);
    expect(guard.sandboxAllowed).toBe(false);
  });
});
