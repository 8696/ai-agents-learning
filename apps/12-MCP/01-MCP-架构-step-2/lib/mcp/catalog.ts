/**
 * 职责：本店唯一一杯咖啡：拿铁。initialize 声明吧台能做咖啡；tools/list 列出这杯；tools/call 才真去做一杯。
 * 数据流：jsonrpc-server 读取本文件。
 */

export const PROTOCOL_VERSION = "2025-03-26";

export const SERVER_INFO = {
  name: "cafe-mcp-teaching",
  version: "0.1.0",
  title: "吧台",
};

export const CLIENT_INFO = {
  name: "coffee-app-host",
  version: "0.1.0",
  title: "点咖啡小程序",
};

export const TOOLS = [
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
];

// 资源：应用控制。宿主（小程序）问吧台要，吧台按 URI 把正文发回来。模型不会自己读。
// 与工具对比：工具是「动作」，是模型决定要不要调；资源是「数据」，是宿主决定要不要塞上下文。
export const RESOURCES = [
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
];

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

// 提示词模板：用户控制。客服点菜单，宿主拿回消息数组再塞进对话——不是模型自己决定调。
// 与资源对比：资源是「宿主主动塞数据」，模板是「用户主动选话术，宿主再塞消息」。
// 与工具对比：工具是「模型调」，模板是「用户选」，模型都不决定用不用。
export const PROMPTS = [
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
];

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
