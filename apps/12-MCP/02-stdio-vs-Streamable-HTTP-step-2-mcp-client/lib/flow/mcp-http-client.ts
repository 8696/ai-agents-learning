/**
 * 本步核心：Streamable HTTP MCP Client（持久连接 + 请求级 Authorization）。
 *
 * 职责：单例 Client **一条连接走到底**；HTTP 请求的 Authorization 头**每次从
 *       当前 koa 请求带过来的 token 动态拼**（不是模块级状态，是 AsyncLocalStorage）。
 *
 * 数据流：
 *   浏览器 fetch → koa route handler
 *     → runWithRequestContext({ token }, () => callTool(...))
 *       → getCurrentRequestToken() 拿到当前请求的 token
 *     → callTool → SDK callTool({ name, arguments })
 *       → SDK 内部 fetch(url, init) → dynamicAuthFetch(input, init)
 *         → getCurrentRequestToken() 读 ALS store（请求级 token）
 *         → 拼 Authorization 头 → 原生 fetch
 *     → 远端 transport → route checkBearer → runWithUser → Tool handler 按 userId 过滤
 *
 * 为什么用 AsyncLocalStorage：transport 是单例（连接复用），但 token 每次请求不同；
 * 模块级 currentToken 会并发冲突；ALS 是 Node 22 内置的「请求级状态」原语。
 *
 * 为什么单独成文件：Streamable HTTP Transport 的全部主路径都在这里 —— 连接、动态头、调用。
 * route 只做"校验入参 → 调本文件 → 写 ctx.body"，不埋 Client。
 *
 * Client demo 自身**不存任何用户信息**——token 跟着每个 HTTP 请求进来，跟着请求出去。
 */
import { Client } from "@modelcontextprotocol/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { logger } from "../logger.js";
import { getCurrentRequestToken } from "./request-context.js";

// ── 远端 Server endpoint（Server demo 的 koa 同端口，POST /mcp）──
export const SERVER_URL = process.env.SERVER_URL ?? "http://127.0.0.1:50134/mcp";

interface McpTool {
  name: string;
  description?: string;
  inputSchema: unknown;
}

interface McpResource {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

interface ConnectedClient {
  client: Client;
  transport: StreamableHTTPClientTransport;
  sessionId: string | undefined;
  startedAt: number;
  endpoint: string;
}

let singleton: ConnectedClient | null = null;
let connectingPromise: Promise<ConnectedClient> | null = null;

/**
 * 自定义 fetch：每次 SDK 发 HTTP 请求时从 ALS 读当前请求的 token，
 * 动态拼 Authorization 头。连接持久，token 是请求级的。
 */
const dynamicAuthFetch: typeof fetch = async (input, init) => {
  const token = getCurrentRequestToken();
  const headers = new Headers(init?.headers ?? {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  } else {
    headers.delete("Authorization");
  }
  return fetch(input, { ...init, headers });
};

/**
 * 启动或拿现成的 Client（首次才 connect）。**不因请求 token 不同而重建**——
 * 持久 transport 跨多个请求、多个 token 复用同一条连接。
 */
export async function getOrCreateClient(): Promise<ConnectedClient> {
  if (singleton) return singleton;
  if (connectingPromise) return connectingPromise;

  connectingPromise = (async () => {
    const t0 = Date.now();
    logger.info(
      "调用函数-getOrCreateClient",
      "调用函数开始：getOrCreateClient",
      "为什么写这条日志：Streamable HTTP Transport 的灵魂在「连远端 HTTP」。首次进来才真去握手 + 建立 transport。当前：客户端第一次请求（一次性 connect，后续请求复用同一条连接、token 每次都从请求头拿）。",
      {
        入参: { url: SERVER_URL },
        __code: "new StreamableHTTPClientTransport(new URL(SERVER_URL), { fetch: dynamicAuthFetch })",
      },
    );

    const transport = new StreamableHTTPClientTransport(new URL(SERVER_URL), {
      fetch: dynamicAuthFetch,
    });
    const client = new Client(
      { name: "demo-cafe-client-http", version: "0.1.0" },
      { capabilities: {} },
    );

    await client.connect(transport);

    singleton = {
      client,
      transport,
      sessionId: transport.sessionId,
      startedAt: Date.now(),
      endpoint: SERVER_URL,
    };

    logger.info(
      "调用函数-getOrCreateClient",
      "调用函数结束：getOrCreateClient",
      "为什么写这条日志：握手成功才给用户返能力清单。当前：Client 已 ready，连接持久 —— 后续请求都走 dynamicAuthFetch 从 ALS 读当前请求的 token（无模块级状态）。",
      {
        返回值: { sessionId: transport.sessionId, endpoint: SERVER_URL },
        耗时ms: Date.now() - t0,
      },
    );
    return singleton;
  })();

  try {
    return await connectingPromise;
  } finally {
    connectingPromise = null;
  }
}

// ── 公开接口：列工具 ──
export async function listTools(): Promise<McpTool[]> {
  const t0 = Date.now();
  logger.info(
    "│ 调用函数-listTools",
    "调用函数开始：listTools",
    "为什么写这条日志：listTools 是 MCP 协议 tools/list 的封装，要给页面看见远端吧台有什么工具。当前：Client 已 connect 之后。Authorization 头从 dynamicAuthFetch 读当前请求的 token。",
    { __code: "client.listTools()" },
  );

  const { client } = await getOrCreateClient();
  const result = await client.listTools();

  const tools: McpTool[] = result.tools.map((t) => ({
    name: t.name,
    description: t.description ?? "",
    inputSchema: t.inputSchema,
  }));

  logger.info(
    "│ 调用函数-listTools",
    "调用函数结束：listTools",
    "为什么写这条日志：要把远端吧台有的工具列出来给前端渲染。当前：结果已拿到，下一步 route 把 result 写入 ctx.body。",
    {
      返回值: { tools },
      耗时ms: Date.now() - t0,
      字段释义: { tools: "远端 MCP Server 注册的全部工具" },
    },
  );
  return tools;
}

// ── 公开接口：调用工具 ──
export async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const t0 = Date.now();
  logger.info(
    "│ 调用函数-callTool",
    "调用函数开始：callTool",
    "为什么写这条日志：callTool 是 MCP 协议 tools/call 的封装，要真去远端吧台做事。Authorization 头从 dynamicAuthFetch 读当前请求的 token。当前：在 Client 已 connect 之后。",
    {
      入参: { name, arguments: args },
      __code: "client.callTool({ name, arguments })",
    },
  );

  const { client } = await getOrCreateClient();
  const result = await client.callTool({ name, arguments: args });

  logger.info(
    "│ 调用函数-callTool",
    "调用函数结束：callTool",
    "为什么写这条日志：拿到 result.content 才能给前端看。当前：远端吧台返回了。",
    {
      返回值: result,
      耗时ms: Date.now() - t0,
      字段释义: { content: "远端吧台做的事的结果（文本 / 图片 / 资源等）" },
    },
  );
  return result;
}

// ── 公开接口：列资源 ──
export async function listResources(): Promise<McpResource[]> {
  const t0 = Date.now();
  logger.info(
    "│ 调用函数-listResources",
    "调用函数开始：listResources",
    "为什么写这条日志：listResources 是 MCP 协议 resources/list 的封装。当前：Client 已 connect。",
    { __code: "client.listResources()" },
  );

  const { client } = await getOrCreateClient();
  const result = await client.listResources();

  const resources: McpResource[] = result.resources.map((r) => ({
    uri: r.uri,
    name: r.name ?? "",
    description: r.description ?? "",
    mimeType: r.mimeType ?? "",
  }));

  logger.info(
    "│ 调用函数-listResources",
    "调用函数结束：listResources",
    "为什么写这条日志：要把远端资源列给前端。当前：结果已拿到。",
    {
      返回值: { resources },
      耗时ms: Date.now() - t0,
      字段释义: { resources: "远端 MCP Server 注册的资源" },
    },
  );
  return resources;
}

// ── 公开接口：读资源 ──
export async function readResource(uri: string): Promise<unknown> {
  const t0 = Date.now();
  logger.info(
    "│ 调用函数-readResource",
    "调用函数开始：readResource",
    "为什么写这条日志：readResource 是 MCP 协议 resources/read 的封装。当前：Client 已 connect。",
    {
      入参: { uri },
      __code: "client.readResource({ uri })",
    },
  );

  const { client } = await getOrCreateClient();
  const result = await client.readResource({ uri });

  logger.info(
    "│ 调用函数-readResource",
    "调用函数结束：readResource",
    "为什么写这条日志：拿到 contents 才能给前端看。当前：远端吧台返回了。",
    {
      返回值: result,
      耗时ms: Date.now() - t0,
      字段释义: { contents: "远端资源的实际内容" },
    },
  );
  return result;
}

// ── 调试用：当前 Client 状态 ──
export function getStatus(): {
  connected: boolean;
  sessionId: string | undefined;
  endpoint: string | null;
  startedAt: number | null;
} {
  if (!singleton) {
    return { connected: false, sessionId: undefined, endpoint: null, startedAt: null };
  }
  return {
    connected: true,
    sessionId: singleton.sessionId,
    endpoint: singleton.endpoint,
    startedAt: singleton.startedAt,
  };
}
