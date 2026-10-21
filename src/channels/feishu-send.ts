const FEISHU_API = "https://open.feishu.cn/open-apis";

let tokenCache: { token: string; expiresAt: number } | undefined;

export async function getFeishuTenantAccessToken(): Promise<string | undefined> {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  if (!appId || !appSecret) {
    return undefined;
  }
  const now = Date.now();
  if (tokenCache && now < tokenCache.expiresAt) {
    return tokenCache.token;
  }
  const res = await fetch(`${FEISHU_API}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  if (!res.ok) {
    return undefined;
  }
  const data = (await res.json()) as { tenant_access_token?: string; expire?: number; code?: number };
  if (data.code !== 0 && data.code !== undefined) {
    return undefined;
  }
  if (!data.tenant_access_token) {
    return undefined;
  }
  tokenCache = {
    token: data.tenant_access_token,
    expiresAt: now + (data.expire ?? 7200) * 1000 - 60_000,
  };
  return tokenCache.token;
}

/** 向会话发送文本（chat_id 来自消息事件） */
export async function sendFeishuTextToChat(chatId: string, text: string): Promise<boolean> {
  const token = await getFeishuTenantAccessToken();
  if (!token) {
    return false;
  }
  const url = new URL(`${FEISHU_API}/im/v1/messages`);
  url.searchParams.set("receive_id_type", "chat_id");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      receive_id: chatId,
      msg_type: "text",
      content: JSON.stringify({ text: text.slice(0, 4000) }),
    }),
  });
  if (!res.ok) {
    return false;
  }
  const body = (await res.json()) as { code?: number };
  return body.code === 0;
}

/** 回复指定消息（同会话线程） */
export async function replyFeishuMessage(messageId: string, text: string): Promise<boolean> {
  const token = await getFeishuTenantAccessToken();
  if (!token) {
    return false;
  }
  const res = await fetch(`${FEISHU_API}/im/v1/messages/${messageId}/reply`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      msg_type: "text",
      content: JSON.stringify({ text: text.slice(0, 4000) }),
    }),
  });
  if (!res.ok) {
    return false;
  }
  const body = (await res.json()) as { code?: number };
  return body.code === 0;
}
