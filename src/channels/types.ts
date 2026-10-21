/** 消息来源通道（生产入口为 feishu） */
export type ChannelId = "cli" | "http" | "feishu" | "test";

export interface InboundMessage {
  channel: ChannelId;
  /** 飞书会话 chat_id，或 CLI/调试用的本地 id */
  userId: string;
  text: string;
  metadata?: Record<string, string>;
}

export type OutboundKind = "task_ack" | "task_result" | "approval_request" | "error" | "info";

export interface OutboundMessage {
  id: string;
  channel: ChannelId;
  userId: string;
  kind: OutboundKind;
  text: string;
  createdAt: string;
  payload?: Record<string, unknown>;
}
