/**
 * 本步核心：Streamable HTTP MCP Server（合到 koa 一个端口）。
 *
 * 职责：本文件只持有 McpServer 实例 + StreamableHTTPServerTransport 实例 + Server 状态查询。
 *       **不再 listen 原生 http.Server**——MCP endpoint 走 koa 的 `POST /mcp` route（routes/mcp-endpoint.ts）。
 *
 * 数据流：
 *   浏览器 → http://127.0.0.1:50134/ （koa） → 状态页（pid / endpoint URL / 工具列表）
 *   远端 Client → POST http://127.0.0.1:50134/mcp （koa 同进程，route 处理）
 *              → transport.handleRequest(req, res, body)
 *              → McpServer 处理 → 返 JSON-RPC / SSE 响应
 *
 * 为什么单独成文件：本步核心 = McpServer 注册 + StreamableHTTPServerTransport 配置 + 跨进程状态查询。
 * route 只做"校验 + 调本文件的 transport"，不埋 McpServer。
 */
import { McpServer } from "@modelcontextprotocol/server";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { z } from "zod/v4";
import { logger } from "../logger.js";
import { getCurrentUserId } from "./request-context.js";
import { listTicketsForUser } from "./tickets-store.js";

// ── McpServer 实例（共享同一个 make_latte / menu://today，跟 step-1 同款）──
export const mcpServer = new McpServer(
  { name: "demo-cafe-mcp-http", version: "0.1.0" },
  { capabilities: { tools: {}, resources: {}, prompts: {} } },
);

mcpServer.registerTool(
  "make_latte",
  {
    description: "做一杯拿铁，按杯型返回结果。",
    inputSchema: z.object({
      cupSize: z.enum(["小杯", "中杯", "大杯"]).describe("杯型"),
    }),
  },
  async (args: { cupSize: "小杯" | "中杯" | "大杯" }) => {
    const minutes = args.cupSize === "小杯" ? 2 : args.cupSize === "中杯" ? 3 : 4;
    const userId = getCurrentUserId() ?? "未识别";
    return {
      content: [
        {
          type: "text" as const,
          text: `拿铁做好了：${args.cupSize}，约 ${minutes} 分钟。${new Date().getTime()}\n[调用方] ${userId}`,
        },
      ],
    };
  },
);

// ── list_my_tickets · 按用户隔离的工单列表 ──
// 本步核心教学点：tool handler 拿到 userId 后强制按 userId 过滤业务结果。
// userId 来自 routes/mcp-endpoint.ts 的 runWithUser(userId, ...) —— Node AsyncLocalStorage。
// 上帝令牌（userId === "god"）绕过过滤 = 生产上的反例，页面上标红字提醒。
mcpServer.registerTool(
  "list_my_tickets",
  {
    description: "列出当前用户自己的工单（按 userId 过滤）；上帝令牌（god）能看到全部",
    inputSchema: z.object({}),
  },
  async () => {
    const t0 = Date.now();
    const userId = getCurrentUserId();

    logger.info(
      "│ 调用函数-list_my_tickets-handler",
      "调用函数开始：list_my_tickets handler",
      "为什么写这条日志：按用户隔离的关键证据点；userId 是从 AsyncLocalStorage 读出来的，不是从入参来的 —— handler 看不到 token / 看不到 Authorization 头，只能看到 runWithUser 注入的 userId。当前：MCP Server 收到 tools/call list_my_tickets 请求。",
      {
        入参: { userIdFromContext: userId ?? "(未设)" },
        __code: "const userId = getCurrentUserId(); const { tickets, isGod } = listTicketsForUser(userId);",
      },
    );

    if (!userId) {
      logger.error(
        "│ 调用函数-list_my_tickets-handler",
        "调用函数结束：list_my_tickets handler（失败）",
        "为什么写这条日志：route 层一定会 setCurrentUserId；走到这里发现没值 = route 没包 runWithUser = 必崩。当前：理论上不可能；兜底。",
        { 耗时ms: Date.now() - t0 },
      );
      return {
        content: [{ type: "text" as const, text: "内部错误：未识别调用方身份" }],
        isError: true,
      };
    }

    const { tickets, isGod, viewerUserId } = listTicketsForUser(userId);

    logger.info(
      "│ 调用函数-list_my_tickets-handler",
      "调用函数结束：list_my_tickets handler",
      "为什么写这条日志：alice 看自己 2 张、bob 看自己 1 张、god 看全部 3 张 —— 这三态对照就靠这一行返回的 tickets 数组。当前：过滤完毕，下一步 SDK 把结果序列化进 JSON-RPC 响应。",
      {
        返回值: { ticketCount: tickets.length, isGod, viewerUserId },
        耗时ms: Date.now() - t0,
        字段释义: {
          ticketCount: "返回的工单数；alice=2 / bob=1 / god=3",
          isGod: "true = 上帝令牌绕过 userId 过滤（生产反例）",
          viewerUserId: "当前调用方身份（从 AsyncLocalStorage 读）",
        },
      },
    );

    // 把数据塞进 structuredContent，让客户端既能拿到 content 文本也能拿到原始 JSON
    return {
      content: [
        {
          type: "text" as const,
          text: `${viewerUserId}（${isGod ? "上帝令牌：看到全部" : "普通用户"}）看到 ${tickets.length} 张工单`,
        },
      ],
      structuredContent: { tickets, viewerUserId, isGod },
    };
  },
);

mcpServer.registerResource(
  "today-menu",
  "menu://today",
  { description: "今天能点的饮品", mimeType: "text/plain" },
  async () => ({
    contents: [
      {
        uri: "menu://today",
        mimeType: "text/plain",
        text: `拿铁 / 美式 / 卡布奇诺 / 摩卡\n[调用方] ${getCurrentUserId() ?? "未识别"}`,
      },
    ],
  }),
);

// ── Prompt: 客服开场白 ──
mcpServer.registerPrompt(
  "customer_service_greeting",
  {
    description: "客服开场白：自我介绍 + 询问工单类型。",
    argsSchema: {
      customerName: z.string().describe("客户称呼，可空字符串"),
    },
  },
  async (args: { customerName?: string }) => {
    const name = args.customerName?.trim() || "您好";
    const userId = getCurrentUserId() ?? "未识别";
    return {
      messages: [
        {
          role: "assistant" as const,
          content: {
            type: "text" as const,
            text: `${name}，我是咖啡店客服。请告诉我您的工单类型（订单 / 退款 / 投诉），我会尽快帮您处理。\n[调用方] ${userId}`,
          },
        },
      ],
    };
  },
);

// ── Prompt: 退款话术模板 ──
mcpServer.registerPrompt(
  "refund_response",
  {
    description: "工单退款的标准回复模板（按订单号 + 原因）。",
    argsSchema: {
      orderId: z.string().describe("订单号"),
      reason: z.string().describe("退款原因"),
    },
  },
  async (args: { orderId: string; reason: string }) => {
    const userId = getCurrentUserId() ?? "未识别";
    return {
      messages: [
        {
          role: "assistant" as const,
          content: {
            type: "text" as const,
            text: `关于订单 ${args.orderId} 因「${args.reason}」的退款申请：我们已收到，会在 1-2 个工作日内审核并原路退款。如有疑问，请随时回复此工单。\n[调用方] ${userId}`,
          },
        },
      ],
    };
  },
);

// ── StreamableHTTPServerTransport：stateless 模式（不生成 sessionId）──
// 为什么 stateless：stateful 模式下 _initialized 标记在 transport 实例上（单例）；
// alice 第一次 initialize 后 bob 进来会撞 "Server already initialized"（同一个 transport 已 _initialized=true）。
// stateless 模式下 sessionId=undefined，check 永远 false → 每个请求都是独立会话。
// 代价：没有 mcp-session-id 跨请求保持；但 A6 是「按用户隔离」，userId 走 Authorization 头每次都带，不需要 session 持续。
export const transport = new NodeStreamableHTTPServerTransport({
  sessionIdGenerator: undefined,
});

// connect 在 mount route 之前完成
export async function connectMcpServer(): Promise<void> {
  await mcpServer.connect(transport);
  logger.info(
    "调用函数-connectMcpServer",
    "调用函数结束：connectMcpServer",
    "为什么写这条日志：McpServer.connect 完成后才能接 HTTP 请求。当前：stateless 模式 → 没有 sessionId。",
    {
      返回值: { mode: "stateless", sessionId: null },
      耗时ms: 0,
    },
  );
}

// ── 跨进程状态查询：MCP endpoint URL / Server pid / sessionId（stateless → 永远 null）──
// port 来自 runtime-ctx.ts（koa 监听的同一个口）；不再有第二个原生 http 端口。
export function getServerInfo(): {
  mcpEndpoint: string;
  serverPid: number;
  sessionId: string | undefined;
} {
  return {
    mcpEndpoint: `http://127.0.0.1:${process.env.PORT ?? "50134"}/mcp`,
    serverPid: process.pid,
    sessionId: transport.sessionId,
  };
}