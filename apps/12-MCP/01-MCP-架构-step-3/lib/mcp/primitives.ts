/**
 * 职责：把每种原语「按 serverId + params 计算响应」单独成文件。
 * 数据流：serverId（ticket | kb）+ params + SERVERS[serverId] → JsonRpcResponse。
 *
 * 每种原语先判断当前 serverId 是否提供该原语——没有就 -32601。
 * ticket server 只提供 tools；kb server 提供 resources + prompts。这两个边界让"一对一专线"有意义。
 */

import {
  RESOURCE_BODIES,
  SERVERS,
  renderPromptMessages,
  type PromptArgs,
  type ServerId,
} from "./catalog.js";
import type { JsonRpcResponse } from "./jsonrpc-server.js";

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

let ticketSeq = 1;

export function callTool(id: number, serverId: ServerId, params: Record<string, unknown> | undefined): JsonRpcResponse {
  const server = SERVERS[serverId];
  if (server.tools.length === 0) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32601,
        message: `服务端 ${serverId} 不提供 tools（它只暴露 resources / prompts）。`,
        data: { serverId, knownMethods: ["resources/list", "resources/read", "prompts/list", "prompts/get"] },
      },
    };
  }
  const name = typeof params?.name === "string" ? params.name : "";
  const args = asObject(params?.arguments) ?? {};
  const known = server.tools.find((tool) => tool.name === name);
  if (!known) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32602,
        message: `服务端 ${serverId} 没有这道工序：${name || "（没写工具名）"}`,
        data: { knownTools: server.tools.map((tool) => tool.name) },
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
    error: { code: -32602, message: `服务端 ${serverId} 还不会做 ${name}` },
  };
}

export function readResource(id: number, serverId: ServerId, params: Record<string, unknown> | undefined): JsonRpcResponse {
  const server = SERVERS[serverId];
  if (server.resources.length === 0) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32601,
        message: `服务端 ${serverId} 不提供 resources（它只暴露 tools）。`,
        data: { serverId, knownMethods: ["tools/list", "tools/call"] },
      },
    };
  }
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
        message: `服务端 ${serverId} 没有这份资料：${uri}`,
        data: { knownResources: server.resources.map((r) => r.uri) },
      },
    };
  }
  const meta = server.resources.find((r) => r.uri === uri);
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

export function getPrompt(id: number, serverId: ServerId, params: Record<string, unknown> | undefined): JsonRpcResponse {
  const server = SERVERS[serverId];
  if (server.prompts.length === 0) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32601,
        message: `服务端 ${serverId} 不提供 prompts（它只暴露 tools / resources）。`,
        data: { serverId, knownMethods: ["tools/list", "tools/call", "resources/list", "resources/read"] },
      },
    };
  }
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
  const known = server.prompts.find((p) => p.name === name);
  if (!known) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32602,
        message: `服务端 ${serverId} 没有这份话术：${name}`,
        data: { knownPrompts: server.prompts.map((p) => p.name) },
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