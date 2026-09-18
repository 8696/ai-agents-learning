/**
 * 职责：step-3 拆两台虚拟 server（ticket / kb），各自能力独立。
 * 数据流：JSON-RPC request.params.serverId → 选 server 的 tools/resources/prompts。
 *
 * - ticket server：只暴露 tools（make_latte + create_ticket）—— 真做事的吧台。
 * - kb server：只暴露 resources（菜单 / 过敏原 / 政策）+ prompts（退款话术）—— 给材料 / 给话术的吧台。
 *
 * 两台 server 一对一专线——演示需求 1（拓扑 · 客户端一对一）+ 需求 6（解耦 · 工具定义只在服务端）。
 */

export const PROTOCOL_VERSION = "2025-03-26";

export const CLIENT_INFO = {
  name: "default-host",
  version: "0.1.0",
  title: "默认宿主",
};

export type ServerId = "ticket" | "kb";

export type ToolDef = {
  name: string;
  title: string;
  description: string;
  inputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
};

export type ResourceDef = {
  uri: string;
  name: string;
  title: string;
  description: string;
  mimeType: string;
};

export type PromptDef = {
  name: string;
  title: string;
  description: string;
  arguments: Array<{ name: string; description: string; required: boolean }>;
};

export type ServerDef = {
  serverInfo: { name: string; version: string; title: string };
  tools: ToolDef[];
  resources: ResourceDef[];
  prompts: PromptDef[];
};

export const SERVERS: Record<ServerId, ServerDef> = {
  ticket: {
    serverInfo: { name: "ticket-mcp-server", version: "0.1.0", title: "工单服务端" },
    tools: [
      {
        name: "make_latte",
        title: "拿铁",
        description: "吧台去做一杯拿铁。先出现在工具列表里；真做一杯要发 tools/call。",
        inputSchema: {
          type: "object",
          properties: {
            cupSize: { type: "string", description: "杯型，例如 中杯" },
          },
          required: ["cupSize"],
        },
      },
      {
        name: "create_ticket",
        title: "建退款工单",
        description:
          "建一张退款工单。这一步有副作用——本步用内存模拟工单对象（id 自增），真生产要落库。",
        inputSchema: {
          type: "object",
          properties: {
            orderId: { type: "string", description: "订单号，例如 A-1001" },
            reason: { type: "string", description: "退款原因，例如 七天无理由" },
          },
          required: ["orderId", "reason"],
        },
      },
    ],
    resources: [],
    prompts: [],
  },
  kb: {
    serverInfo: { name: "kb-mcp-server", version: "0.1.0", title: "知识库服务端" },
    tools: [],
    resources: [
      {
        uri: "cafe://today-menu",
        name: "today-menu",
        title: "今日菜单",
        description: "吧台今天能做的咖啡 + 价格。下单前客人必须看见。",
        mimeType: "text/plain",
      },
      {
        uri: "cafe://allergy-info",
        name: "allergy-info",
        title: "过敏原说明",
        description: "本店含的过敏原。下单前必须看见，避免出事。",
        mimeType: "text/plain",
      },
      {
        uri: "policy://return-2026",
        name: "return-policy-2026",
        title: "现行退货政策（2026）",
        description: "本店 2026 年的退货政策正文。客服每次处理退款都要按这份材料回话——应用主动拉。",
        mimeType: "text/plain",
      },
    ],
    prompts: [
      {
        name: "refund-script",
        title: "退款话术模板",
        description:
          "客服点菜单后由宿主拿回消息数组（含 Few-shot 的 user + assistant），再塞进这一轮对话。带 arguments 参数化。",
        arguments: [
          { name: "orderId", description: "订单号", required: true },
          { name: "reason", description: "退款原因", required: true },
        ],
      },
    ],
  },
};

export const RESOURCE_BODIES: Record<string, string> = {
  "cafe://today-menu":
    "今日菜单\n" +
    "────────────\n" +
    "· 拿铁（中杯 ¥18 / 大杯 ¥22）\n" +
    "· 美式（中杯 ¥15 / 大杯 ¥19）\n" +
    "· 摩卡（中杯 ¥20 / 大杯 ¥24）\n" +
    "────────────\n" +
    "下单前请确认杯型与温度。\n",
  "cafe://allergy-info":
    "过敏原说明\n" +
    "────────────\n" +
    "· 拿铁、摩卡：含牛奶\n" +
    "· 摩卡：含可可（巧克力）\n" +
    "· 美式：不含奶制品\n" +
    "────────────\n" +
    "如有过敏请提前告知吧台。\n",
  "policy://return-2026":
    "本店 2026 年现行退货政策\n" +
    "────────────\n" +
    "· 七天无理由：未拆封、未影响二次销售，支持全额退款。\n" +
    "· 十五天换货：商品质量问题（非人为损坏），支持同款换货。\n" +
    "· 跨境订单：另按海关与物流规定办理，处理时长 5~10 个工作日。\n" +
    "· 退款时效：原路退回，1~3 个工作日到账。\n" +
    "────────────\n" +
    "客服每次处理退款请按本政策回话；具体订单可在建单时关联本政策 URI。\n",
};

export type PromptArgs = Record<string, string>;

export type PromptMessage = { role: string; content: { type: string; text: string } };

export function renderPromptMessages(name: string, args: PromptArgs): PromptMessage[] | null {
  if (name === "refund-script") {
    const orderId = (args.orderId ?? "").trim();
    const reason = (args.reason ?? "").trim();
    if (!orderId || !reason) return null;
    return [
      {
        role: "user",
        content: {
          type: "text",
          text: `订单 ${orderId} 申请退款，理由：${reason}。请按本店退款话术回答。`,
        },
      },
      {
        role: "assistant",
        content: {
          type: "text",
          text:
            "示例：亲，您好～我看到您这边是想申请退款对吗？先帮您核对一下信息哈～" +
            "请提供下订单号，以及您方便说一下退款原因吗？我帮您尽快处理～",
        },
      },
    ];
  }
  return null;
}