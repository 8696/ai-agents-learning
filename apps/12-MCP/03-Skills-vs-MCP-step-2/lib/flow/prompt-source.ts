/**
 * 本步核心：三种提示词入口（MCP 提示词模板 / 技能 / 系统提示词）各自装配 messages 的形态。
 * 职责：模拟同一家店、同一句话，走三种入口之一，输出 messages 形态 + 三栏对照。
 * 数据流：promptSourceId + guestUtterance → 查 PROMPT_SOURCES → 拼 exampleMessages。
 * 为什么单独成文件：三种入口是独立可观察对照，必须打开这一个文件就能读完。
 */
import { logger } from "../logger.js";

export type PromptSourceId = "mcp-prompt" | "skill" | "system-prompt";

export type PromptSource = {
  id: PromptSourceId;
  source: string;
  whoDecides: string;
  where: string;
  cafeExample: string;
  exampleMessages: Array<{ role: "system" | "user"; content: string }>;
  note: string;
};

export const PROMPT_SOURCES: Record<PromptSourceId, PromptSource> = {
  "mcp-prompt": {
    id: "mcp-prompt",
    source: "MCP 提示词模板（Prompt 原语）",
    whoDecides: "用户点选（菜单 / 斜杠命令）",
    where: "MCP 服务端（上一节的 customer_service_greeting）",
    cafeExample: "客人点「客服开场白」，服务端填好称呼再返回 messages",
    exampleMessages: [
      { role: "system", content: "（MCP 提示词模板返回的 system：自动填好「客服开场白」「称呼=客人」）" },
      { role: "user",   content: "" },
    ],
    note: "MCP 提示词模板 ≠ 技能 ≠ 系统提示词。三种入口、三种控制权。"
  },
  "skill": {
    id: "skill",
    source: "技能（Skill）",
    whoDecides: "任务相关时由宿主加载（按需）",
    where: "技能包 / 仓库文件 SKILL.md",
    cafeExample: "「过敏客人怎么出杯」全流程——任务命中才加载",
    exampleMessages: [
      { role: "system", content: "出杯技能：① 客人提到过敏，必须先读资源 cafe://allergy-info。② 拿铁含牛奶 → 不能做拿铁，改推荐美式。③ 客人确认前不要调用工具 make_latte。④ 不准假装已经做好了。" },
      { role: "user",   content: "" },
    ],
    note: "技能只规定「怎么做」，不替连接层。"
  },
  "system-prompt": {
    id: "system-prompt",
    source: "系统提示词（System Prompt）",
    whoDecides: "宿主每一轮都带，或产品写死",
    where: "这一次请求的 messages 数组首条 system",
    cafeExample: "「你是点咖啡小程序助手」——这一轮角色",
    exampleMessages: [
      { role: "system", content: "你是点咖啡小程序助手。" },
      { role: "user",   content: "" },
    ],
    note: "系统提示词只放角色 + 短底线；长流程进技能。"
  },
};

export type PromptSourceResult = PromptSource & { guestUtterance: string };

const LOAD_PROMPT_SOURCE_CODE = `function loadPromptSource(id, utterance) {
  const s = PROMPT_SOURCES[id];
  return {
    ...s,
    guestUtterance: utterance,
    exampleMessages: s.exampleMessages.map(function (m, i) {
      if (m.role === "user") return { role: "user", content: utterance };
      return m;
    }),
  };
}`;

export function loadPromptSource(id: PromptSourceId, guestUtterance: string): PromptSourceResult {
  const started = Date.now();
  logger.info(
    "调用函数-loadPromptSource",
    "调用函数开始：loadPromptSource",
    "为什么写这条日志：三种入口各自装配 messages 必须留证据，方便学习者对照「同句不同入口的 system 段长什么样」。当前：按 id 路由三种入口之一。",
    { 入参: { id, guestUtterance }, __code: LOAD_PROMPT_SOURCE_CODE },
  );
  const s = PROMPT_SOURCES[id];
  if (!s) throw new Error(`未知入口：${id}`);
  const result: PromptSourceResult = {
    ...s,
    guestUtterance,
    exampleMessages: s.exampleMessages.map(function (m) {
      if (m.role === "user") return { role: "user", content: guestUtterance };
      return m;
    }),
  };
  logger.info(
    "调用函数-loadPromptSource",
    "调用函数结束：loadPromptSource",
    "为什么写这条日志：三种入口的对照点全部留下。",
    {
      返回值: result,
      耗时ms: Date.now() - started,
      字段释义: {
        source: "入口名（MCP 提示词模板 / 技能 / 系统提示词）",
        whoDecides: "谁决定用（用户 / 宿主按需 / 每轮必带）",
        where: "住在哪（MCP 服务端 / SKILL.md / 当次 messages）",
        cafeExample: "在点咖啡里的对照例子",
        exampleMessages: "实际 messages 形态（user 段 = 客人原话）",
      },
    },
  );
  return result;
}