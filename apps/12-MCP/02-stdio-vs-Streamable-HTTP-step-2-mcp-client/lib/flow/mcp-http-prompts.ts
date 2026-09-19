/**
 * 职责：Streamable HTTP Transport 下 MCP 协议 prompts/* 的两个公开接口封装。
 *       listPrompts / getPrompt 走的是同一个 client 单例（lib/flow/mcp-http-client.ts 的 getOrCreateClient）。
 *       单独成文件是因为 §5.3.8 行数硬约束（lib/flow/*.ts ≤ 280 行）。
 *
 * 数据流：
 *   浏览器 fetch
 *     → routes/http-list-prompts.ts / http-get-prompt.ts
 *     → 本文件的 listPrompts() / getPrompt()
 *     → getOrCreateClient()（复用 mcp-http-client.ts 的单例）
 *     → client.listPrompts() / client.getPrompt({ name, arguments })
 *     → 返 JSON-RPC 响应 → ctx.body
 */
import { logger } from "../logger.js";
import { getOrCreateClient } from "./mcp-http-client.js";

interface McpPrompt {
  name: string;
  description?: string;
  arguments?: unknown;
}

// ── 公开接口：列提示词模板 ──
export async function listPrompts(): Promise<McpPrompt[]> {
  const t0 = Date.now();
  logger.info(
    "│ 调用函数-listPrompts",
    "调用函数开始：listPrompts",
    "为什么写这条日志：listPrompts 是 MCP 协议 prompts/list 的封装，要给页面看见远端吧台有哪些预设话术模板。",
    { __code: "client.listPrompts()" },
  );

  const { client } = await getOrCreateClient();
  const result = await client.listPrompts();

  const prompts: McpPrompt[] = result.prompts.map((p) => ({
    name: p.name,
    description: p.description ?? "",
    arguments: p.arguments,
  }));

  logger.info(
    "│ 调用函数-listPrompts",
    "调用函数结束：listPrompts",
    "为什么写这条日志：把预设话术模板列给前端渲染。",
    {
      返回值: { prompts },
      耗时ms: Date.now() - t0,
      字段释义: { prompts: "远端 MCP Server 注册的全部提示词模板；本 demo 有 greeting + refund_response" },
    },
  );
  return prompts;
}

// ── 公开接口：获取提示词模板（按名字 + 参数） ──
export async function getPrompt(name: string, args: Record<string, unknown>): Promise<unknown> {
  const t0 = Date.now();
  logger.info(
    "│ 调用函数-getPrompt",
    "调用函数开始：getPrompt",
    "为什么写这条日志：getPrompt 是 MCP 协议 prompts/get 的封装，让远端吧台按参数吐出实际的话术文本。",
    {
      入参: { name, arguments: args },
      __code: "client.getPrompt({ name, arguments })",
    },
  );

  const { client } = await getOrCreateClient();
  // SDK getPrompt 要求 arguments 值为 string；本 demo 全部入参都是字符串
  const result = await client.getPrompt({ name, arguments: args as Record<string, string> });

  logger.info(
    "│ 调用函数-getPrompt",
    "调用函数结束：getPrompt",
    "为什么写这条日志：拿到 messages 才能给前端看实际渲染出来的话术。",
    {
      返回值: result,
      耗时ms: Date.now() - t0,
      字段释义: { messages: "远端 Server 按参数拼出来的话术消息数组（role + content）" },
    },
  );
  return result;
}