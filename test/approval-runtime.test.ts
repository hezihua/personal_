import { describe, expect, it } from "vitest";
import { ApprovalRuntime } from "../src/harness/approval-runtime.js";

describe("ApprovalRuntime", () => {
  it("resolves pending via external POST flow", async () => {
    const audit: unknown[] = [];
    const approvals = new ApprovalRuntime((e) => audit.push(e));

    const wait = approvals.request({
      toolName: "bash",
      reason: "test",
      input: { command: "echo hi" },
    });

    const pending = approvals.listPending();
    expect(pending).toHaveLength(1);

    approvals.resolve(pending[0].id, "approved");
    await expect(wait).resolves.toBe(true);
  });
});
