/**
 * 本步核心：Agent 端写一次 JSON-RPC 请求：initialize / tools/list / tools/call /
 *                                          resources/list / resources/read /
 *                                          prompts/list / prompts/get。
 *
 * 职责：写请求 → handleJsonRpc → 把这次请求和这次回答交给页面。
 * 数据流：method + serverId + hostId + params → 服务端 → { jsonrpcRequest, jsonrpcResponse, agentDid, serverDid }
 *
 * step-3 多了一维：serverId 决定路由到哪台服务端（ticket 或 kb）；hostId 让服务端日志区分两个宿主接入。
 */

import { logger } from "../logger.js";
import { CLIENT_INFO, type ServerId } from "../mcp/catalog.js";
import { handleJsonRpc, type JsonRpcRequest, type JsonRpcResponse } from "../mcp/jsonrpc-server.js";

export type McpMethod =
  | "initialize"
  | "tools/list"
  | "tools/call"
  | "resources/list"
  | "resources/read"
  | "prompts/list"
  | "prompts/get";

export type CallParams = {
  name: string;
  arguments: { cupSize: string } | { orderId: string; reason: string };
};

export type ReadResourceParams = {
  uri: string;
};

export type GetPromptParams = {
  name: string;
  arguments: Record<string, string>;
};

export type ExchangeParams = CallParams | ReadResourceParams | GetPromptParams;

export type ExchangeOptions = {
  serverId: ServerId;
  hostId: string;
  params?: ExchangeParams;
  clientInfoOverride?: { name: string; version: string; title: string };
};

export type ExchangeResult = {
  jsonrpcRequest: JsonRpcRequest;
  jsonrpcResponse: JsonRpcResponse;
  agentDid: string;
  serverDid: string;
  protocolOk: boolean;
};

let nextId = 1;

function duties(method: McpMethod, opts: ExchangeOptions): { agentDid: string; serverDid: string } {
  const { serverId, hostId } = opts;
  const where = `[host=${hostId} → server=${serverId}]`;
  if (method === "initialize") {
    return {
      agentDid: `${where} 宿主报上名字，问吧台：今天开门了吗？能做什么？`,
      serverDid: `${where} 吧台回答：开门了，按 serverId 决定暴露哪些能力（ticket=tools；kb=resources+prompts）。`,
    };
  }
  if (method === "tools/list") {
    return {
      agentDid: `${where} 宿主问吧台：你有什么工具？`,
      serverDid: `${where} 吧台返回工具列表。ticket 返回 make_latte + create_ticket；kb 返空。`,
    };
  }
  if (method === "tools/call") {
    return {
      agentDid: `${where} 宿主按工具名调一道工序，发出 tools/call。`,
      serverDid: `${where} 吧台真去做——ticket 才会真做；kb 直接拒。`,
    };
  }
  if (method === "resources/list") {
    return {
      agentDid: `${where} 宿主问吧台：你备了哪些资料？`,
      serverDid: `${where} 吧台返回资源列表。kb 返回 cafe://today-menu 等三条；ticket 返空。`,
    };
  }
  if (method === "resources/read") {
    return {
      agentDid: `${where} 宿主替客人取一份资料（用 URI 去拿，比如 cafe://today-menu 或 policy://return-2026）。`,
      serverDid: `${where} 吧台把这份资料的正文发回来——kb 才返；ticket 直接拒。`,
    };
  }
  if (method === "prompts/list") {
    return {
      agentDid: `${where} 宿主问吧台：你备了哪些话术？`,
      serverDid: `${where} 吧台返回话术清单。kb 返 refund-script；ticket 返空。`,
    };
  }
  return {
    agentDid: `${where} 宿主按话术清单挑一份，带上参数（订单号、退款原因），发出 prompts/get。`,
    serverDid: `${where} 吧台把填好的消息数组发回来——kb 才返；ticket 直接拒。`,
  };
}

function buildParams(method: McpMethod, opts: ExchangeOptions): Record<string, unknown> {
  const { params, clientInfoOverride } = opts;
  const base: Record<string, unknown> = {
    serverId: opts.serverId,
    hostId: opts.hostId,
  };
  if (method === "initialize") {
    return {
      ...base,
      protocolVersion: "2025-03-26",
      clientInfo: clientInfoOverride ?? CLIENT_INFO,
    };
  }
  if (method === "tools/call" && params && "name" in params && "arguments" in params) {
    return { ...base, name: params.name, arguments: params.arguments };
  }
  if (method === "resources/read" && params && "uri" in params) {
    return { ...base, uri: params.uri };
  }
  if (method === "prompts/get" && params && "name" in params && "arguments" in params) {
    return { ...base, name: params.name, arguments: params.arguments };
  }
  return base;
}

const EXCHANGE_CODE = `export function exchangeMcp(method, opts) {
  const request = { jsonrpc: "2.0", id: nextId++, method, params: buildParams(method, opts) };
  return handleJsonRpc(request);
}`;

export function exchangeMcp(method: McpMethod, opts: ExchangeOptions): ExchangeResult {
  const t0 = Date.now();
  const scope = "mcp-client";
  logger.info(scope, "调用函数开始：exchangeMcp", `宿主→服务端 JSON-RPC。本页不调大模型。当前：${JSON.stringify(opts)}`, {
    入参: { method, opts: opts ?? null },
  });
  logger.info(scope, "调用函数入参：exchangeMcp", "当前：准备写这次请求。", {
    入参: { method, opts: opts ?? null },
  });
  logger.info(scope, "调用函数：exchangeMcp", "当前：交给吧台。", {
    入参: { method, opts: opts ?? null },
    __code: EXCHANGE_CODE,
  });
  try {
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: nextId,
      method,
      params: buildParams(method, opts),
    };
    nextId += 1;
    const response = handleJsonRpc(request);
    const result: ExchangeResult = {
      jsonrpcRequest: request,
      jsonrpcResponse: response,
      ...duties(method, opts),
      protocolOk: !("error" in response),
    };
    logger.info(scope, "调用函数返回值：exchangeMcp", "当前：请求和响应都拿到了。", { 返回值: result });
    logger.info(scope, "调用函数结束：exchangeMcp", "当前：这一次交换结束。", {
      耗时ms: Date.now() - t0,
      返回值: result,
    });
    return result;
  } catch (error: unknown) {
    logger.error(scope, "调用函数结束：exchangeMcp（失败）", "写请求或分发时抛错。", {
      耗时ms: Date.now() - t0,
      错误: error,
    });
    throw error;
  }
}