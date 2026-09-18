/**
 * 职责：把每种原语「按 params 计算响应」单独成文件。主路径（dispatch + handleJsonRpc + 五条日志）在 jsonrpc-server.ts。
 * 数据流：params + catalog → JsonRpcResponse。
 *
 * 三种原语各管一摊：
 *   callTool  —— tools/call：模型控制，按 name + arguments 真去执行
 *   readResource —— resources/read：应用控制，按 URI 拿正文
 *   getPrompt —— prompts/get：用户控制，按 name + arguments 拿消息数组
 *
 * 它们都是 JSON-RPC -32602 的参数错误；外层 dispatch / handleJsonRpc 负责 -32600/-32601/正常返回。
 */

import {
  PROMPTS,
  RESOURCE_BODIES,
  RESOURCES,
  TOOLS,
  type PromptArgs,
  renderPromptMessages,
} from "./catalog.js";
import type { JsonRpcResponse } from "./jsonrpc-server.js";

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function callTool(id: number, params: Record<string, unknown> | undefined): JsonRpcResponse {
  const name = typeof params?.name === "string" ? params.name : "";
  const args = asObject(params?.arguments) ?? {};
  const known = TOOLS.find((tool) => tool.name === name);
  if (!known) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32602,
        message: `吧台没有这道工序：${name || "（没写工具名）"}`,
        data: { knownTools: TOOLS.map((tool) => tool.name) },
      },
    };
  }
  if (name === "make_latte") {
    const cupSize = typeof args.cupSize === "string" ? args.cupSize.trim() : "";
    if (!cupSize) {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32602, message: "做拿铁需要杯型（cupSize），例如 中杯。" },
      };
    }
    return {
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text: `一杯${cupSize}拿铁做好了，请到吧台取。` }],
        isError: false,
      },
    };
  }
  if (name === "create_ticket") {
    const orderId = typeof args.orderId === "string" ? args.orderId.trim() : "";
    const reason = typeof args.reason === "string" ? args.reason.trim() : "";
    if (!orderId || !reason) {
      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: -32602,
          message: "建工单需要 orderId + reason（订单号 + 退款原因），例如 { orderId: 'A-1001', reason: '七天无理由' }。",
        },
      };
    }
    const ticketId = `T-${String(ticketSeq++).padStart(4, "0")}`;
    const ticket = { ticketId, orderId, reason, status: "created", createdAt: "now" };
    return {
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text: `工单 ${ticketId} 已创建（订单 ${orderId}，原因 ${reason}）。` }],
        isError: false,
        structuredContent: ticket,
      },
    };
  }
  return {
    jsonrpc: "2.0",
    id,
    error: { code: -32602, message: `吧台还不会做 ${name}` },
  };
}

let ticketSeq = 1;

export function readResource(id: number, params: Record<string, unknown> | undefined): JsonRpcResponse {
  const uri = typeof params?.uri === "string" ? params.uri.trim() : "";
  if (!uri) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32602,
        message: "读资源需要 uri（咖啡店用 cafe:// 开头），例如 cafe://today-menu",
      },
    };
  }
  if (!(uri in RESOURCE_BODIES)) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32602,
        message: `吧台没有这份资料：${uri}`,
        data: { knownResources: RESOURCES.map((r) => r.uri) },
      },
    };
  }
  const meta = RESOURCES.find((r) => r.uri === uri);
  return {
    jsonrpc: "2.0",
    id,
    result: {
      contents: [
        {
          uri,
          mimeType: meta?.mimeType ?? "text/plain",
          text: RESOURCE_BODIES[uri],
        },
      ],
    },
  };
}

export function getPrompt(id: number, params: Record<string, unknown> | undefined): JsonRpcResponse {
  const name = typeof params?.name === "string" ? params.name.trim() : "";
  if (!name) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32602,
        message: "取模板需要 name（提示词模板的名字），例如 refund-script",
      },
    };
  }
  const known = PROMPTS.find((p) => p.name === name);
  if (!known) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32602,
        message: `吧台没有这份话术：${name}`,
        data: { knownPrompts: PROMPTS.map((p) => p.name) },
      },
    };
  }
  const args = (asObject(params?.arguments) ?? {}) as PromptArgs;
  const messages = renderPromptMessages(name, args);
  if (!messages) {
    const required = (known.arguments ?? [])
      .filter((a) => a.required)
      .map((a) => a.name);
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32602,
        message:
          required.length > 0
            ? `提示词模板 ${name} 需要参数：${required.join(", ")}`
            : `提示词模板 ${name} 参数不齐`,
        data: { requiredArguments: required },
      },
    };
  }
  return {
    jsonrpc: "2.0",
    id,
    result: {
      description: known.description,
      messages,
    },
  };
}