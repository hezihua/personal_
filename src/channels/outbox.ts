import { randomUUID } from "node:crypto";
import type { ChannelId, OutboundKind, OutboundMessage } from "./types.js";

function queueKey(channel: ChannelId, userId: string): string {
  return `${channel}:${userId}`;
}

export class OutboundStore {
  private queues = new Map<string, OutboundMessage[]>();

  push(channel: ChannelId, userId: string, input: { kind: OutboundKind; text: string; payload?: Record<string, unknown> }): OutboundMessage {
    const msg: OutboundMessage = {
      id: randomUUID(),
      channel,
      userId,
      kind: input.kind,
      text: input.text,
      createdAt: new Date().toISOString(),
      payload: input.payload,
    };
    const key = queueKey(channel, userId);
    const list = this.queues.get(key) ?? [];
    list.push(msg);
    this.queues.set(key, list);
    return msg;
  }

  drain(channel: ChannelId, userId: string): OutboundMessage[] {
    const key = queueKey(channel, userId);
    const list = this.queues.get(key) ?? [];
    this.queues.set(key, []);
    return list;
  }

  peekAll(): OutboundMessage[] {
    const all: OutboundMessage[] = [];
    for (const list of this.queues.values()) {
      all.push(...list);
    }
    return all;
  }
}
