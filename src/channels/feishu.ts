/**
 * 飞书开放平台 — 事件订阅（推荐 im.message.receive_v1）
 * https://open.feishu.cn/document/server-docs/event-subscription-guide/overview
 */

export type FeishuCallback =
  | { type: "url_verification"; challenge: string }
  | { type: "event"; eventType: string; text?: string; chatId?: string; messageId?: string; openId?: string }
  | { type: "ignore" };

export function parseFeishuCallback(raw: unknown): FeishuCallback {
  if (!raw || typeof raw !== "object") {
    return { type: "ignore" };
  }
  const body = raw as Record<string, unknown>;

  if (body.type === "url_verification" && typeof body.challenge === "string") {
    return { type: "url_verification", challenge: body.challenge };
  }

  if (body.challenge && body.type === undefined && typeof body.challenge === "string") {
    return { type: "url_verification", challenge: body.challenge };
  }

  const schema = body.schema;
  if (schema === "2.0" && body.header && body.event) {
    return parseFeishuV2(body.header as Record<string, unknown>, body.event as Record<string, unknown>);
  }

  if (body.event && typeof body.event === "object") {
    const event = body.event as Record<string, unknown>;
    const eventType = typeof event.type === "string" ? event.type : "";
    if (eventType === "im.message.receive_v1" || eventType.includes("message")) {
      return parseMessageEvent(event);
    }
  }

  return { type: "ignore" };
}

function parseFeishuV2(header: Record<string, unknown>, event: Record<string, unknown>): FeishuCallback {
  const eventType = typeof header.event_type === "string" ? header.event_type : "";
  if (eventType !== "im.message.receive_v1") {
    return { type: "ignore" };
  }
  return parseMessageEvent(event);
}

function parseMessageEvent(event: Record<string, unknown>): FeishuCallback {
  const message = event.message as Record<string, unknown> | undefined;
  if (!message) {
    return { type: "ignore" };
  }
  const messageType = message.message_type;
  if (messageType !== "text") {
    return { type: "ignore" };
  }
  const text = extractFeishuText(message.content);
  if (!text) {
    return { type: "ignore" };
  }

  const sender = event.sender as Record<string, unknown> | undefined;
  const senderId = sender?.sender_id as Record<string, unknown> | undefined;
  const openId = typeof senderId?.open_id === "string" ? senderId.open_id : undefined;

  return {
    type: "event",
    eventType: "im.message.receive_v1",
    text: stripBotMention(text),
    chatId: typeof message.chat_id === "string" ? message.chat_id : undefined,
    messageId: typeof message.message_id === "string" ? message.message_id : undefined,
    openId,
  };
}

export function extractFeishuText(content: unknown): string | undefined {
  if (typeof content !== "string") {
    return undefined;
  }
  try {
    const parsed = JSON.parse(content) as { text?: string };
    return typeof parsed.text === "string" ? parsed.text.trim() : undefined;
  } catch {
    return content.trim() || undefined;
  }
}

/** 群聊 @ 机器人后的 @_user_1 占位 */
export function stripBotMention(text: string): string {
  return text.replace(/@_user_\d+/g, "").trim();
}

export function verifyFeishuVerificationToken(headerToken: string | undefined): boolean {
  const expected = process.env.FEISHU_VERIFICATION_TOKEN;
  if (!expected) {
    return true;
  }
  return headerToken === expected;
}
