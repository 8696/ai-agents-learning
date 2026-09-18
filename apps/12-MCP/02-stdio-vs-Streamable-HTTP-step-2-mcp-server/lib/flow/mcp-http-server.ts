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
import { randomUUID } from "node:crypto";
import { z } from "zod/v4";
import { logger } from "../logger.js";

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
    return {
      content: [
        {
          type: "text" as const,
          text: `拿铁做好了：${args.cupSize}，约 ${minutes} 分钟。${new Date().getTime()}`,
        },
      ],
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
        text: "拿铁 / 美式 / 卡布奇诺 / 摩卡",
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
    return {
      messages: [
        {
          role: "assistant" as const,
          content: {
            type: "text" as const,
            text: `${name}，我是咖啡店客服。请告诉我您的工单类型（订单 / 退款 / 投诉），我会尽快帮您处理。`,
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
    return {
      messages: [
        {
          role: "assistant" as const,
          content: {
            type: "text" as const,
            text: `关于订单 ${args.orderId} 因「${args.reason}」的退款申请：我们已收到，会在 1-2 个工作日内审核并原路退款。如有疑问，请随时回复此工单。`,
          },
        },
      ],
    };
  },
);

// ── StreamableHTTPServerTransport：有状态模式（用 randomUUID 当 sessionId）──
export const transport = new NodeStreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),
});

// connect 在 mount route 之前完成
export async function connectMcpServer(): Promise<void> {
  await mcpServer.connect(transport);
  logger.info(
    "调用函数-connectMcpServer",
    "调用函数结束：connectMcpServer",
    "为什么写这条日志：McpServer.connect 完成后才能接 HTTP 请求。",
    {
      返回值: { sessionId: transport.sessionId ?? "(尚未生成)" },
      耗时ms: 0,
    },
  );
}

// ── 跨进程状态查询：MCP endpoint URL / Server pid / session ──
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