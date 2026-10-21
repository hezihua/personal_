import { describe, expect, it } from "vitest";
import { parseUserCommand } from "../src/channels/command-parser.js";

describe("parseUserCommand", () => {
  it("parses task prompt", () => {
    expect(parseUserCommand("整理下载文件夹")).toEqual({ type: "task", prompt: "整理下载文件夹" });
  });

  it("parses approve", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    expect(parseUserCommand(`批准 ${id}`)).toEqual({ type: "approve", approvalId: id });
  });

  it("parses status", () => {
    expect(parseUserCommand("状态")).toEqual({ type: "status" });
  });
});
