/**
 * 本步核心：stdio MCP Client —— 父进程 spawn 子进程，跑真 stdio 通信。
 *
 * 职责：单例 MCP Client。第一次请求时 spawn stdio 子进程、握手、列出 tools/resources；
 *       后续请求走同一个 client。Client 死（进程退出）时子进程也死。
 *
 * 数据流：
 *   浏览器 fetch
 *     → routes/*.ts
 *     → callStdio({ method: "tools/list" | "tools/call" | "resources/list" | "resources/read" })
 *     → getOrCreateClient()（首次才 spawn）
 *       → new Client({...}) + new StdioClientTransport({ command: "tsx", args: [absServerPath] })
 *       → client.connect(transport)
 *     → client.listTools() / client.callTool() / client.listResources() / client.readResource()
 *     → 返回 JSON-RPC 响应 → ctx.body
 *
 * 为什么单独成文件：stdio Transport 的全部主路径都在这里 —— spawn、握手、调用。
 * route 只做"校验入参 → 调本文件 → 写 ctx.body"，不埋 Client。
 */
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_SCRIPT = path.resolve(__dirname, "..", "mcp-server", "server.ts");

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
  pid: number | null;
  startedAt: number;
}

let singleton: ConnectedClient | null = null;
let connectingPromise: Promise<ConnectedClient> | null = null;

// ── 启动或拿现成的 Client（首次才 spawn） ──
export async function getOrCreateClient(): Promise<ConnectedClient> {
  if (singleton) return singleton;
  if (connectingPromise) return connectingPromise;

  connectingPromise = (async () => {
    const t0 = Date.now();
    logger.info(
      "调用函数-getOrCreateClient",
      "调用函数开始：getOrCreateClient",
      "为什么写这条日志：stdio Transport 的灵魂在 spawn。第一次进来才真去 fork 子进程 + 走 JSON-RPC 握手。当前：客户端第一次请求。",
      {
        入参: { command: "tsx", args: [SERVER_SCRIPT] },
        __code: "new StdioClientTransport({ command: \"tsx\", args: [SERVER_SCRIPT] })",
      },
    );

    const transport = new StdioClientTransport({
      command: "tsx",
      args: [SERVER_SCRIPT],
      stderr: "pipe", // 子进程异常时收 stderr，避免污染 stdout 协议通道
    });

    const client = new Client(
      {
        name: "demo-cafe-client",
        version: "0.1.0",
      },
      {
        capabilities: {},
      },
    );

    await client.connect(transport);

    // tsx 进程通常会再 fork 一个 node 子进程；transport 拿到的 pid 是 tsx 自己
    // 这里用 setTimeout 0 等 transport 内部 _process 已就绪
    const pid = (transport as unknown as { pid: number | null }).pid ?? null;

    singleton = { client, pid, startedAt: Date.now() };

    logger.info(
      "调用函数-getOrCreateClient",
      "调用函数结束：getOrCreateClient",
      "为什么写这条日志：握手成功才能给用户返能力清单。当前：Client 已 ready，可以接 tools/list、tools/call、resources/list、resources/read。",
      {
        返回值: { pid, startedAt: singleton.startedAt },
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
    "为什么写这条日志：listTools 是 MCP 协议 'tools/list' 的封装，要给页面看见吧台有什么工具。当前：在 Client 已 connect 之后。",
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
    "为什么写这条日志：要把吧台有的工具列出来给前端渲染。当前：结果已拿到，下一步 route 把 result 写入 ctx.body。",
    {
      返回值: { tools },
      耗时ms: Date.now() - t0,
      字段释义: {
        tools: "MCP Server 注册的全部工具；本 step 只有 make_latte",
      },
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
    "为什么写这条日志：callTool 是 MCP 协议 'tools/call' 的封装，要真去让吧台做事。当前：在 Client 已 connect 之后。",
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
    "为什么写这条日志：拿到 result.content 才能给前端看。当前：吧台返回了，下一步 route 把 result 写入 ctx.body。",
    {
      返回值: result,
      耗时ms: Date.now() - t0,
      字段释义: {
        content: "吧台做的事的结果（文本 / 图片 / 资源等）",
        isError: "吧台是否报错；本 step 不演示",
      },
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
    "为什么写这条日志：listResources 是 MCP 协议 'resources/list' 的封装。当前：Client 已 connect。",
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
    "为什么写这条日志：要把吧台提供的资源列给前端。当前：结果已拿到。",
    {
      返回值: { resources },
      耗时ms: Date.now() - t0,
      字段释义: { resources: "MCP Server 注册的全部资源；本 step 只有 menu://today" },
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
    "为什么写这条日志：readResource 是 MCP 协议 'resources/read' 的封装。当前：Client 已 connect。",
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
    "为什么写这条日志：拿到 contents 才能给前端看。当前：吧台返回了。",
    {
      返回值: result,
      耗时ms: Date.now() - t0,
      字段释义: { contents: "资源的实际内容；本 step 是文本（menu://today）" },
    },
  );
  return result;
}

// ── 调试用：当前 Client 状态 ──
export function getStatus(): { connected: boolean; pid: number | null; startedAt: number | null } {
  if (!singleton) return { connected: false, pid: null, startedAt: null };
  return { connected: true, pid: singleton.pid, startedAt: singleton.startedAt };
}

// listPrompts / getPrompt 已拆到 ./stdio-prompts.ts（行数硬约束）
