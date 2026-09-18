/**
 * 职责：JSON-RPC 服务端。本步会答 initialize / tools/list / tools/call / resources/list / resources/read / prompts/list / prompts/get。
 * 数据流：JsonRpcRequest（含 serverId）→ 按 method 分发 → JsonRpcResponse。
 *
 * step-3 的核心改动：从 request.params.serverId 读取 serverId（ticket | kb）→ 选 SERVERS[serverId]。
 * 不同 serverId 暴露的能力不同——这是拓扑（需求 1）的基础设施。
 */

import { logger } from "../logger.js";
import { PROTOCOL_VERSION, SERVERS, type ServerId } from "./catalog.js";
import { callTool, getPrompt, readResource } from "./primitives.js";

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
};

export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: number; result: unknown }
  | { jsonrpc: "2.0"; id: number; error: { code: number; message: string; data?: unknown } };

let initialized = false;

function pickServerId(params: Record<string, unknown> | undefined): ServerId {
  const v = params?.serverId;
  if (v === "ticket" || v === "kb") return v;
  return "ticket";
}

function dispatch(request: JsonRpcRequest): JsonRpcResponse {
  const { id, method } = request;
  const serverId = pickServerId(request.params);

  if (method === "initialize") {
    initialized = true;
    const server = SERVERS[serverId];
    const caps: Record<string, unknown> = {};
    if (server.tools.length > 0) caps.tools = {};
    if (server.resources.length > 0) caps.resources = {};
    if (server.prompts.length > 0) caps.prompts = {};
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        serverInfo: server.serverInfo,
        capabilities: caps,
      },
    };
  }

  if (!initialized) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32600,
        message: "还没做初始化。请先发 initialize，再做工具发现、工具调用、资源发现、资源读取、模板发现或模板获取。",
      },
    };
  }

  if (method === "tools/list") {
    const server = SERVERS[serverId];
    return { jsonrpc: "2.0", id, result: { tools: server.tools } };
  }

  if (method === "tools/call") {
    return callTool(id, serverId, request.params);
  }

  if (method === "resources/list") {
    const server = SERVERS[serverId];
    return { jsonrpc: "2.0", id, result: { resources: server.resources } };
  }

  if (method === "resources/read") {
    return readResource(id, serverId, request.params);
  }

  if (method === "prompts/list") {
    const server = SERVERS[serverId];
    return { jsonrpc: "2.0", id, result: { prompts: server.prompts } };
  }

  if (method === "prompts/get") {
    return getPrompt(id, serverId, request.params);
  }

  return {
    jsonrpc: "2.0",
    id,
    error: {
      code: -32601,
      message: `吧台这页只会初始化、列出工具、调用工具、列出资源、读取资源、列出模板、获取模板，没有 ${method}`,
      data: {
        knownMethods: [
          "initialize",
          "tools/list",
          "tools/call",
          "resources/list",
          "resources/read",
          "prompts/list",
          "prompts/get",
        ],
      },
    },
  };
}

const DISPATCH_CODE = `function dispatch(request) {
  const serverId = pickServerId(request.params);
  if (method === "initialize") return { capabilities: capsFor(serverId) };
  if (!initialized) return error("请先初始化");
  if (method === "tools/list") return { tools: SERVERS[serverId].tools };
  if (method === "tools/call") return callTool(serverId, params);
  if (method === "resources/list") return { resources: SERVERS[serverId].resources };
  if (method === "resources/read") return readResource(serverId, params);
  if (method === "prompts/list") return { prompts: SERVERS[serverId].prompts };
  if (method === "prompts/get") return getPrompt(serverId, params);
  return error("吧台不会这道工序");
}`;

export function handleJsonRpc(request: JsonRpcRequest): JsonRpcResponse {
  const t0 = Date.now();
  const scope = "│ jsonrpc-server";
  logger.info(scope, "调用函数开始：handleJsonRpc", "吧台按 method + serverId 回答。", { 入参: request });
  logger.info(scope, "调用函数入参：handleJsonRpc", "当前：刚收到这次请求。", { 入参: request });
  logger.info(scope, "调用函数：handleJsonRpc", "当前：正在分发。", { 入参: request, __code: DISPATCH_CODE });
  try {
    const response = dispatch(request);
    logger.info(scope, "调用函数返回值：handleJsonRpc", "当前：这次回答写好了。", {
      返回值: response,
      字段释义: {
        "result.serverInfo.name": "服务端标识。ticket = ticket-mcp-server；kb = kb-mcp-server。两台服务端是独立进程（这里在同一进程里用 serverId 路由）。",
        "result.capabilities.tools": "本服务端是否暴露 tools。ticket 暴露；kb 不暴露。",
        "result.capabilities.resources": "本服务端是否暴露 resources。kb 暴露；ticket 不暴露。",
        "result.capabilities.prompts": "本服务端是否暴露 prompts。kb 暴露；ticket 不暴露。",
        "result.tools": "本服务端的工具列表。ticket 返回 make_latte + create_ticket；kb 返回空。",
        "result.resources": "本服务端的资源列表。kb 返回 cafe://today-menu 等三条；ticket 返回空。",
        "result.prompts": "本服务端的模板列表。kb 返回 refund-script；ticket 返回空。",
        "result.contents[0].text": "resources/read 才返回：这份资料正文的文字。",
        "result.contents[0].mimeType": "这份资料的格式（text/plain）。",
        "result.content": "调用工具后吧台交回来的内容。tools/call 才会真去做一件事。",
        "result.messages": "prompts/get 才返回：含 Few-shot 的 user + assistant 消息数组。",
        "result.structuredContent": "tools/call 的结构化返回（如工单对象）。",
      },
    });
    logger.info(scope, "调用函数结束：handleJsonRpc", "当前：这次请求处理完。", {
      耗时ms: Date.now() - t0,
      返回值: response,
    });
    return response;
  } catch (error: unknown) {
    logger.error(scope, "调用函数结束：handleJsonRpc（失败）", "分发时抛错，不应发生。", {
      耗时ms: Date.now() - t0,
      错误: error,
    });
    throw error;
  }
}