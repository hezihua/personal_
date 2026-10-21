import http from "node:http";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { ChannelDispatcher } from "../channels/dispatcher.js";
import { parseFeishuCallback, verifyFeishuVerificationToken } from "../channels/feishu.js";
import { replyFeishuMessage, sendFeishuTextToChat } from "../channels/feishu-send.js";
import type { HarnessRuntime } from "../harness/harness.js";
import type { HarnessTask } from "../harness/types.js";
import { createHarness, defaultHarnessConfig } from "../harness/harness.js";

export interface GatewayOptions {
  cwd?: string;
  host?: string;
  port?: number;
  harness?: HarnessRuntime;
  dispatcher?: ChannelDispatcher;
}

interface JsonResponse {
  status: number;
  body: unknown;
}

export function createHarnessGateway(options: GatewayOptions = {}) {
  const cwd = options.cwd ?? process.cwd();
  const harness = options.harness ?? createHarness(defaultHarnessConfig(cwd));
  const dispatcher = options.dispatcher ?? new ChannelDispatcher(cwd);
  const ownerChatId = process.env.HARNESS_FEISHU_CHAT_ID ?? process.env.HARNESS_OWNER_USER_ID ?? "";
  if (ownerChatId) {
    dispatcher.bindHarnessEvents(harness, "feishu", ownerChatId);
  }

  const runningTasks = new Map<string, Promise<HarnessTask>>();

  async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const pathname = url.pathname;

    try {
      if (pathname === "/channels/feishu" || pathname === "/feishu/event") {
        await handleFeishu(req, res, harness, dispatcher, runningTasks);
        return;
      }
      const result = await route(req.method ?? "GET", pathname, url, req, harness, dispatcher, runningTasks, cwd);
      sendJson(res, result);
    } catch (err) {
      sendJson(res, {
        status: 500,
        body: { error: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  const server = http.createServer((req, res) => {
    void handle(req, res);
  });

  const listen = (host = options.host ?? "127.0.0.1", port = options.port ?? 8787) =>
    new Promise<http.Server>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => resolve(server));
    });

  return { server, harness, dispatcher, listen };
}

async function handleFeishu(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  harness: HarnessRuntime,
  dispatcher: ChannelDispatcher,
  runningTasks: Map<string, Promise<HarnessTask>>,
): Promise<void> {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "method not allowed" }));
    return;
  }

  const verificationToken = req.headers["x-lark-request-token"] as string | undefined;
  if (!verifyFeishuVerificationToken(verificationToken)) {
    res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "invalid verification token" }));
    return;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await readBody(req));
  } catch {
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "invalid json" }));
    return;
  }

  const parsed = parseFeishuCallback(raw);
  if (parsed.type === "url_verification") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ challenge: parsed.challenge }));
    return;
  }

  if (parsed.type !== "event" || !parsed.text || !parsed.chatId) {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  const result = await dispatcher.handleInbound(
    harness,
    {
      channel: "feishu",
      userId: parsed.chatId,
      text: parsed.text,
      metadata: {
        openId: parsed.openId ?? "",
        messageId: parsed.messageId ?? "",
        chatId: parsed.chatId,
      },
    },
    runningTasks,
  );

  if (parsed.messageId) {
    await replyFeishuMessage(parsed.messageId, result.message);
  } else {
    await sendFeishuTextToChat(parsed.chatId, result.message);
  }

  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ ok: true }));
}

async function route(
  method: string,
  pathname: string,
  _url: URL,
  req: http.IncomingMessage,
  harness: HarnessRuntime,
  _dispatcher: ChannelDispatcher,
  runningTasks: Map<string, Promise<HarnessTask>>,
  cwd: string,
): Promise<JsonResponse> {
  if (method === "GET" && pathname === "/health") {
    return { status: 200, body: { ok: true } };
  }

  if (method === "GET" && pathname === "/status") {
    await harness.prepare(cwd, getAgentDir());
    return {
      status: 200,
      body: {
        workspace: harness.config.workspace,
        skills: harness.skills.list().map((s) => s.name),
        tools: harness.tools.list(),
        mcp: harness.mcp.snapshot(),
        mcpServers: harness.tools.listMcpServers(),
        modelRoute: harness.model.route(),
        pendingApprovals: harness.approvals.listPending(),
      },
    };
  }

  if (method === "GET" && pathname === "/tools") {
    return { status: 200, body: { tools: harness.tools.list() } };
  }

  if (method === "GET" && pathname === "/mcp/servers") {
    return {
      status: 200,
      body: {
        config: harness.mcp.snapshot(),
        registered: harness.tools.listMcpServers(),
      },
    };
  }

  if (method === "GET" && pathname === "/approvals") {
    return { status: 200, body: { pending: harness.approvals.listPending() } };
  }

  const approvalMatch = pathname.match(/^\/approvals\/([^/]+)$/);
  if (method === "POST" && approvalMatch) {
    const body = await readJson(req);
    const updated = harness.approvals.resolve(
      approvalMatch[1],
      body.action === "approve" ? "approved" : "denied",
    );
    if (!updated) {
      return { status: 404, body: { error: "approval not found" } };
    }
    return { status: 200, body: { approval: updated } };
  }

  const taskMatch = pathname.match(/^\/tasks\/([^/]+)$/);
  if (method === "GET" && taskMatch) {
    const task = harness.tasks.get(taskMatch[1]);
    if (!task) {
      return { status: 404, body: { error: "task not found" } };
    }
    return {
      status: 200,
      body: { task, running: runningTasks.has(task.id) },
    };
  }

  return { status: 404, body: { error: "not found", path: pathname } };
}

function sendJson(res: http.ServerResponse, payload: JsonResponse): void {
  res.writeHead(payload.status, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(payload.body));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return readBody(req).then((body) => (body ? (JSON.parse(body) as Record<string, unknown>) : {}));
}
