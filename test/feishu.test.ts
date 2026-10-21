import { describe, expect, it } from "vitest";
import { extractFeishuText, parseFeishuCallback, stripBotMention } from "../src/channels/feishu.js";

describe("feishu", () => {
  it("parses url verification", () => {
    expect(parseFeishuCallback({ type: "url_verification", challenge: "abc" })).toEqual({
      type: "url_verification",
      challenge: "abc",
    });
  });

  it("parses im.message.receive_v1 schema 2.0", () => {
    const raw = {
      schema: "2.0",
      header: { event_type: "im.message.receive_v1" },
      event: {
        message: {
          chat_id: "oc_chat",
          message_id: "om_msg",
          message_type: "text",
          content: JSON.stringify({ text: "@_user_1 整理桌面" }),
        },
        sender: { sender_id: { open_id: "ou_user" } },
      },
    };
    const parsed = parseFeishuCallback(raw);
    expect(parsed).toMatchObject({
      type: "event",
      text: "整理桌面",
      chatId: "oc_chat",
      openId: "ou_user",
    });
  });

  it("extractFeishuText and strip mention", () => {
    expect(extractFeishuText(JSON.stringify({ text: "hi" }))).toBe("hi");
    expect(stripBotMention("@_user_1 hello")).toBe("hello");
  });
});
