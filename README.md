# Personal Harness

飞书里的个人助手：你在飞书给机器人发指令，Harness 在本机通过 Pi Agent 执行任务（Skill / MCP / 代码 / 文件），结果与审批回推到飞书。

技术栈：**TypeScript · Node.js 20+ · pnpm · Pi · 飞书开放平台 · MCP**

## 架构

```text
  飞书（私聊 / 群 @ 机器人）
           │
           POST /channels/feishu
           ▼
  Harness Runtime（Task / Policy / Approval / Sandbox / Skill / MCP）
           ▼
  Pi Agent Session
           ▼
  本机资源（文件、Shell、MCP Server…）
```

| 模块 | 路径 |
|------|------|
| 飞书通道 | `src/channels/feishu.ts`、`feishu-send.ts` |
| 指令解析 | `src/channels/command-parser.ts` |
| Harness 核心 | `src/harness/` |
| Pi 扩展 | `src/pi/` |
| 网关 | `src/gateway/server.ts` |

## 环境要求

- Node.js ≥ 20，pnpm 10
- Pi 模型与 API 已配置（`~/.pi/agent`，与 Pi CLI 相同）
- 飞书企业自建应用 + 公网 HTTPS 回调（本地可用 Cloudflare Tunnel / frp）

## 快速开始

```bash
pnpm install
cp config/assistant.example.env .env   # 按需 export 或 dotenv 工具加载
pnpm gateway                           # 默认 127.0.0.1:8787
```

本机调试任务（不经过飞书）：

```bash
pnpm harness run 列出 skills 目录
pnpm harness status
```

## 飞书配置

1. [飞书开放平台](https://open.feishu.cn/app) 创建**企业自建应用**  
2. **权限**：接收消息、以应用身份发消息（如 `im:message`、`im:message:send_as_bot`）  
3. **事件订阅** → 请求 URL：`https://<公网域名>/channels/feishu`  
4. 订阅 **`im.message.receive_v1`**（2.0）  
5. 填写环境变量：

| 变量 | 说明 |
|------|------|
| `FEISHU_APP_ID` / `FEISHU_APP_SECRET` | 应用凭证 |
| `FEISHU_VERIFICATION_TOKEN` | 事件订阅 Verification Token |
| `HARNESS_FEISHU_CHAT_ID` | 私聊机器人的 `chat_id`（审批推送；从首次事件日志复制） |
| `HARNESS_HOST` / `HARNESS_PORT` | 网关监听 |

6. 发布应用 → 飞书里私聊机器人或群内 @ 机器人

### 飞书内命令

| 输入 | 行为 |
|------|------|
| 任意文字 | 新建任务 |
| `状态` | 待审批与最近任务 |
| `批准 <uuid>` / `拒绝 <uuid>` | 处理工具审批 |

## MCP 与 Skill

- Skill 目录：`skills/<name>/SKILL.md`（含 `assistant` 行为准则）
- MCP：`~/.pi/agent/mcp.json` 与项目 `.pi/mcp.json`，格式同 Pi 官方

按需接入 filesystem、Playwright、邮件等 MCP；在 Harness 策略中限制工具与路径。

## 网关 API（运维 / 调试）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/channels/feishu` | 飞书事件（生产入口） |
| GET | `/health` | 健康检查 |
| GET | `/status` | Skills、MCP、工具、待审批 |
| GET | `/approvals` | 待审批列表 |
| POST | `/approvals/:id` | `{ "action": "approve" \| "deny" }` |
| GET | `/tasks/:id` | 任务状态 |

## 开发

```bash
pnpm test
pnpm build
```

## 路线图

- 飞书消息加解密（安全模式）
- 按 `open_id` 绑定多用户与权限
- 更多 Skill / MCP 模板

## 许可

ISC
