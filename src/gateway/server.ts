import http from "node:http";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { HarnessRuntime } from "../harness/harness.js";
import type { HarnessTask } from "../harness/types.js";
import { createHarness, defaultHarnessConfig } from "../harness/harness.js";
import { createHarnessPiSession } from "../pi/create-session.js";

export interface GatewayOptions {
  cwd?: string;
  host?: string;
  port?: number;
  harness?: HarnessRuntime;
}

interface JsonResponse {
  status: number;
  body: unknown;
}

export function createHarnessGateway(options: GatewayOptions = {}) {
  const cwd = options.cwd ?? process.cwd();
  const harness = options.harness ?? createHarness(defaultHarnessConfig(cwd));
  const runningTasks = new Map<string, Promise<HarnessTask>>();

  async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const method = req.method ?? "GET";

    try {
      const result = await route(method, url.pathname, url, req, harness, runningTasks, cwd);
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

  return { server, harness, listen };
}

async function route(
  method: string,
  pathname: string,
  url: URL,
  req: http.IncomingMessage,
  harness: HarnessRuntime,
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
    const action = body.action === "approve" ? "approved" : "denied";
    const updated = harness.approvals.resolve(
      approvalMatch[1],
      action === "approved" ? "approved" : "denied",
    );
    if (!updated) {
      return { status: 404, body: { error: "approval not found" } };
    }
    return { status: 200, body: { approval: updated } };
  }

  if (method === "POST" && pathname === "/tasks") {
    const body = await readJson(req);
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      return { status: 400, body: { error: "prompt required" } };
    }
    const task = harness.tasks.create({
      prompt,
      workspaceId: harness.config.workspace.id,
      userId: harness.config.user.id,
    });
    const job = runTaskJob(harness, cwd, task.id);
    runningTasks.set(task.id, job);
    return { status: 202, body: { task, message: "任务已入队" } };
  }

  const taskMatch = pathname.match(/^\/tasks\/([^/]+)$/);
  if (method === "GET" && taskMatch) {
    const task = harness.tasks.get(taskMatch[1]);
    if (!task) {
      return { status: 404, body: { error: "task not found" } };
    }
    const job = runningTasks.get(task.id);
    return {
      status: 200,
      body: {
        task,
        running: Boolean(job),
      },
    };
  }

  return { status: 404, body: { error: "not found", path: pathname } };
}

async function runTaskJob(harness: HarnessRuntime, cwd: string, taskId: string): Promise<HarnessTask> {
  const task = harness.tasks.get(taskId);
  if (!task) {
    throw new Error(`task not found: ${taskId}`);
  }
  const { session } = await createHarnessPiSession({ cwd, harness });
  return harness.runTaskWithSession(task, session, session.sessionId);
}

function sendJson(res: http.ServerResponse, payload: JsonResponse): void {
  const data = JSON.stringify(payload.body);
  res.writeHead(payload.status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(data);
}

function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>);
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}
