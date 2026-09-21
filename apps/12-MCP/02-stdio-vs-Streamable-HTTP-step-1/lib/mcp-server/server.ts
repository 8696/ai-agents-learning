/**
 * 职责：stdio MCP Server 入口。由 koa 主进程当子进程 spawn 起来，
 *       通过 stdin/stdout 走 JSON-RPC。演示三种原语都挂上：
 *       Tool（make_latte）+ Resource（menu://today）+ Prompt（开场白 / 退款话术）。
 * 数据流：parent (koa) → spawn() → 子进程 stdin/stdout ↔ MCP SDK ↔ McpServer
 * 调用：`tsx apps/12-MCP/02-stdio-vs-Streamable-HTTP-step-1/lib/mcp-server/server.ts`
 *
 * 为什么单独成文件：parent 必须能 spawn 这个子进程；
 * 它的"主路径"= 启动 StdioServerTransport + connect，被父进程反复触发。
 */
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
// 注：MCP SDK 2.0 硬依赖 zod v4。顶层 zod 是 3.25（v3/v4 的 ZodType 是不同 prototype），
// 这里 import 独立的 zod-v4 包（别名 npm:zod@4.6.5，跟 SDK 自带 zod 版本完全一致），
// 绕开顶层 zod 3，类型 + 运行时都对得上 SDK。
import { z } from "zod-v4";

const server = new McpServer(
  {
    name: "demo-cafe-mcp-stdio",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  },
);

// ── Tool: 做一杯拿铁 ──
// 注：MCP SDK 2.0 硬依赖 zod v4 类型。zod 3.25+ 内置 zod/v4 路径。
// 这里用 zod/v4 的 z.object({...}) 包裹，走 SDK 的 "Standard Schema" overload。
server.registerTool(
  "make_latte",
  {
    description: "做一杯拿铁，按杯型返回结果。。",
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
          text: `拿铁做好了：${args.cupSize}，约 ${minutes} 分钟。`,
        },
      ],
    };
  },
);

// ── Resource: 今日菜单 ──
server.registerResource(
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
server.registerPrompt(
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
server.registerPrompt(
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

// ── 接 StdioServerTransport，走 stdin/stdout ──
const transport = new StdioServerTransport();
await server.connect(transport);

// 子进程跑在后台；Client 进程死了它也死
// stderr 只在异常时打，避免污染 JSON-RPC 协议通道（stdio 规范要求 stdout 只能走协议消息）
process.on("SIGTERM", () => {
  process.exit(0);
});
