/**
 * 本步核心：Agent 端写一次 JSON-RPC 请求：initialize / tools/list / tools/call /
 *                                          resources/list / resources/read /
 *                                          prompts/list / prompts/get。
 *
 * 职责：写请求 → handleJsonRpc → 把这次请求和这次回答交给页面。
 * 数据流：method → request → 服务端 → { jsonrpcRequest, jsonrpcResponse, agentDid, serverDid }
 */

import { logger } from "../logger.js";
import { CLIENT_INFO, PROTOCOL_VERSION } from "../mcp/catalog.js";
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
  arguments: { cupSize: string };
};

export type ReadResourceParams = {
  uri: string;
};

export type GetPromptParams = {
  name: string;
  arguments: Record<string, string>;
};

export type ExchangeParams = CallParams | ReadResourceParams | GetPromptParams;

export type ExchangeResult = {
  jsonrpcRequest: JsonRpcRequest;
  jsonrpcResponse: JsonRpcResponse;
  agentDid: string;
  serverDid: string;
  protocolOk: boolean;
};

let nextId = 1;

function duties(method: McpMethod, params?: ExchangeParams): { agentDid: string; serverDid: string } {
  if (method === "initialize") {
    return {
      agentDid: "点咖啡小程序报上自己的名字，问吧台：今天开门了吗？能做什么？",
      serverDid: "吧台回答：开门了，我能做咖啡（tools），能读资料（resources），也能取话术（prompts）。",
    };
  }
  if (method === "tools/list") {
    return {
      agentDid: "小程序知道吧台能做咖啡，就要一份今天的工具列表（tools/list）。",
      serverDid: "吧台把工具列表发回来：上面有一杯「拿铁」、一份「建工单」。看见名字还不等于已经做出来。",
    };
  }
  if (method === "tools/call") {
    if (params && "name" in params && params.name === "create_ticket") {
      return {
        agentDid: "小程序按工具列表挑「建工单」这张，发出 tools/call。",
        serverDid: "吧台真去建一张退款工单，把工单号发回来——这一步有副作用。",
      };
    }
    return {
      agentDid: "小程序按工具列表点一杯拿铁，发出 tools/call。",
      serverDid: "吧台真的去做一杯拿铁，把做好的结果发回来。",
    };
  }
  if (method === "resources/list") {
    return {
      agentDid: "小程序问吧台：你还备了什么资料？菜单、过敏原说明、政策都在吗？",
      serverDid: "吧台把资料清单发回来：今日菜单、过敏原说明、现行退货政策各占一条。看见清单还不等于已经把资料正文读到手里。",
    };
  }
  if (method === "resources/read") {
    return {
      agentDid: "小程序替客人取一份资料（用 URI 去拿，比如 cafe://today-menu 或 policy://return-2026）。",
      serverDid: "吧台把这份资料的正文发回来：菜单 / 过敏原说明 / 退货政策的内容。",
    };
  }
  if (method === "prompts/list") {
    return {
      agentDid: "小程序问吧台：你备了哪些话术？比如「退款话术」「投诉安抚」之类的菜单。",
      serverDid: "吧台把话术清单发回来：目前有「退款话术」一份。看见清单还不等于话术已经塞进对话。",
    };
  }
  return {
    agentDid: "小程序按话术清单挑一份，比如「退款话术」，带上参数（订单号、退款原因），发出 prompts/get。",
    serverDid: "吧台把填好的消息数组发回来：含 Few-shot 的 user + assistant 两条。宿主要把这些塞进这一轮的 messages。",
  };
}

function buildParams(method: McpMethod, params?: ExchangeParams): Record<string, unknown> {
  if (method === "initialize") {
    return { protocolVersion: PROTOCOL_VERSION, clientInfo: CLIENT_INFO };
  }
  if (method === "tools/call" && params && "name" in params && "arguments" in params) {
    return { name: params.name, arguments: params.arguments };
  }
  if (method === "resources/read" && params && "uri" in params) {
    return { uri: params.uri };
  }
  if (method === "prompts/get" && params && "name" in params && "arguments" in params) {
    return { name: params.name, arguments: params.arguments };
  }
  return {};
}

const EXCHANGE_CODE = `export function exchangeMcp(method, params) {
  const request = { jsonrpc: "2.0", id: nextId++, method, params: buildParams(method, params) };
  return handleJsonRpc(request);
}`;

export function exchangeMcp(method: McpMethod, params?: ExchangeParams): ExchangeResult {
  const t0 = Date.now();
  const scope = "mcp-client";
  logger.info(scope, "调用函数开始：exchangeMcp", "点咖啡小程序写一次 JSON-RPC 请求。本页不调大模型。", {
    入参: { method, params: params ?? null },
  });
  logger.info(scope, "调用函数入参：exchangeMcp", "当前：准备写这次请求。", {
    入参: { method, params: params ?? null },
  });
  logger.info(scope, "调用函数：exchangeMcp", "当前：交给吧台。", {
    入参: { method, params: params ?? null },
    __code: EXCHANGE_CODE,
  });
  try {
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: nextId,
      method,
      params: buildParams(method, params),
    };
    nextId += 1;
    const response = handleJsonRpc(request);
    const result: ExchangeResult = {
      jsonrpcRequest: request,
      jsonrpcResponse: response,
      ...duties(method, params),
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