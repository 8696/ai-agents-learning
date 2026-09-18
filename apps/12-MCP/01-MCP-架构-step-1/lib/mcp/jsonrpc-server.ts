/**
 * 职责：工具提供方。吃一条 JSON-RPC，吐同 id 的响应。
 * 本步会答 initialize / tools/list / tools/call / resources/list / resources/read / prompts/list / prompts/get。
 * 数据流：JsonRpcRequest → 按 method 分发 → JsonRpcResponse。
 *
 * 本步核心：dispatch + 五条日志的 handleJsonRpc。三种原语各自的实现 → ./primitives.ts。
 */

import { logger } from "../logger.js";
import { PROTOCOL_VERSION, PROMPTS, RESOURCES, SERVER_INFO, TOOLS } from "./catalog.js";
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

function dispatch(request: JsonRpcRequest): JsonRpcResponse {
  const { id, method } = request;

  if (method === "initialize") {
    initialized = true;
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        serverInfo: SERVER_INFO,
        capabilities: { tools: {}, resources: {}, prompts: {} },
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
    return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
  }

  if (method === "tools/call") {
    return callTool(id, request.params);
  }

  if (method === "resources/list") {
    return { jsonrpc: "2.0", id, result: { resources: RESOURCES } };
  }

  if (method === "resources/read") {
    return readResource(id, request.params);
  }

  if (method === "prompts/list") {
    return { jsonrpc: "2.0", id, result: { prompts: PROMPTS } };
  }

  if (method === "prompts/get") {
    return getPrompt(id, request.params);
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
  if (method === "initialize") return { capabilities: { tools: {}, resources: {}, prompts: {} } };
  if (!initialized) return error("请先初始化");
  if (method === "tools/list") return { tools };
  if (method === "tools/call") return callTool(params);
  if (method === "resources/list") return { resources };
  if (method === "resources/read") return readResource(params);
  if (method === "prompts/list") return { prompts };
  if (method === "prompts/get") return getPrompt(params);
  return error("吧台不会这道工序");
}`;

export function handleJsonRpc(request: JsonRpcRequest): JsonRpcResponse {
  const t0 = Date.now();
  const scope = "│ jsonrpc-server";
  logger.info(scope, "调用函数开始：handleJsonRpc", "吧台按 method 回答。", { 入参: request });
  logger.info(scope, "调用函数入参：handleJsonRpc", "当前：刚收到这次请求。", { 入参: request });
  logger.info(scope, "调用函数：handleJsonRpc", "当前：正在分发。", { 入参: request, __code: DISPATCH_CODE });
  try {
    const response = dispatch(request);
    logger.info(scope, "调用函数返回值：handleJsonRpc", "当前：这次回答写好了。", {
      返回值: response,
      字段释义: {
        "result.capabilities.tools": "吧台声明：我能做咖啡。本步也声明我有资料可读（resources）、有话术模板（prompts）。",
        "result.capabilities.resources": "吧台声明：能读 cafe:// 开头的资料。",
        "result.capabilities.prompts": "吧台声明：能取像「退款话术」这种提示词模板。",
        "result.tools": "工具列表。看见名字还不等于已经做出来。",
        "result.resources": "资源列表。看见 URI 还不等于已经把资料正文读到手。",
        "result.prompts": "提示词模板列表。看见清单还不等于已经把消息数组塞进对话。",
        "result.contents[0].text": "resources/read 才返回：这份资料正文的文字。",
        "result.contents[0].mimeType": "这份资料的格式（text/plain）。",
        "result.content": "调用工具后吧台交回来的内容。tools/call 才会真去做一杯。",
        "result.messages": "prompts/get 才返回：含 Few-shot 的 user + assistant 消息数组，宿主要再塞进这一轮对话。",
        "result.isError": "false 表示这杯做成了。",
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