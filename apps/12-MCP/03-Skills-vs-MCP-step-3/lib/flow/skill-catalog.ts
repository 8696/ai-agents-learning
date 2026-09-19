/**
 * 本步核心：10 个技能的「短目录常驻 + 全文按需加载」三种模式对照。
 * 职责：模拟 Agent Skills 范式下的三种装配——短目录 vs 全文按需。
 * 数据流：mode + utterance → 三种装配之一 → { 短目录、加载的全文列表、system prompt 字符数 }。
 * 为什么单独成文件：本步核心对照必须独立可读；不共享 step-1 的 run-assembly / skill-loader（10 个技能 + 三模式是新职责）。
 */
import { logger } from "../logger.js";

export type SkillId =
  | "点咖啡" | "周报" | "退款" | "补货" | "排班"
  | "客诉"   | "菜单" | "库存" | "培训" | "营销";

export type Skill = {
  id: SkillId;
  description: string;
  triggers: string[];
  body: string;
};

export const SKILLS: Skill[] = [
  {
    id: "点咖啡",
    description: "制作 / 出杯 / 过敏改推",
    triggers: ["过敏", "出杯", "做一杯", "拿铁", "美式", "摩卡"],
    body: "出杯技能：① 客人提到过敏，必须先读资源 cafe://allergy-info。② 拿铁含牛奶 → 不能做拿铁，改推荐美式。③ 客人确认前不要调用工具 make_latte。④ 不准假装已经做好了。",
  },
  {
    id: "周报",
    description: "本周销量统计 / 按杯型排版",
    triggers: ["周报", "本周销量", "复盘"],
    body: "周报技能：① 统计出杯数。② 按杯型排版。③ 严禁把出杯全文照搬。",
  },
  {
    id: "退款",
    description: "退款流程 / 与支付 MCP 联动",
    triggers: ["退款", "退钱", "原路返回"],
    body: "退款技能：① 查订单。② 调支付 MCP 退款。③ 通知客人。",
  },
  {
    id: "补货",
    description: "库存不足时触发补货单",
    triggers: ["补货", "没货了", "库存"],
    body: "补货技能：① 查 cafe://inventory。② 生成补货单。",
  },
  {
    id: "排班",
    description: "员工排班 / 与人事 MCP 联动",
    triggers: ["排班", "换班", "请假"],
    body: "排班技能：① 查班次。② 调人事 MCP 改。",
  },
  {
    id: "客诉",
    description: "处理客人投诉 / 升级流程",
    triggers: ["投诉", "不满意", "生气"],
    body: "客诉技能：① 道歉。② 查单。③ 给补偿方案。",
  },
  {
    id: "菜单",
    description: "今日菜单 / 推荐饮品",
    triggers: ["今天有", "菜单", "有没有", "推荐"],
    body: "菜单技能：① 读 cafe://today-menu。② 推荐只能在菜单里有的饮品。",
  },
  {
    id: "库存",
    description: "查库存 / 补货触发",
    triggers: ["库存", "还剩多少", "还有"],
    body: "库存技能：① 读 cafe://inventory。② 列缺货项。",
  },
  {
    id: "培训",
    description: "新员工入职手册",
    triggers: ["培训", "新员工", "入职"],
    body: "培训技能：① 介绍店规。② 介绍吧台。",
  },
  {
    id: "营销",
    description: "优惠券 / 活动推送",
    triggers: ["优惠券", "活动", "促销"],
    body: "营销技能：① 发券。② 推活动。",
  },
];

export type SkillMode = "full" | "catalog-only" | "on-demand";

export type SkillCatalogResult = {
  mode: SkillMode;
  guestUtterance: string;
  shortCatalog: string;
  fullSkillsLoaded: SkillId[];
  matchedSkills: SkillId[];
  systemPromptText: string;
  systemPromptChars: number;
  matchedTriggerMap: Record<SkillId, string[]>;
};

const AGENTS_MD_RULE = "仓库底线：不准假装已经做好了；不准编造菜单上没有的饮品。";

const LOAD_SKILLS_CODE = `function loadSkillsForMode(mode, utterance) {
  // 三种模式:
  //   full: 短目录 + 10 个技能全文全加载（最坏情况）
  //   catalog-only: 短目录常驻 + 全文都不加载（推荐做法）
  //   on-demand: 短目录常驻 + 命中技能加载全文（按 utterance 触发词匹配）
}`;

function pickMatchedSkills(utterance: string): SkillId[] {
  return SKILLS.filter(s => s.triggers.some(t => utterance.includes(t))).map(s => s.id);
}

function pickTriggerMap(utterance: string): Record<SkillId, string[]> {
  const map: Record<string, string[]> = {};
  for (const s of SKILLS) {
    const hits = s.triggers.filter(t => utterance.includes(t));
    if (hits.length > 0) map[s.id] = hits;
  }
  return map as Record<SkillId, string[]>;
}

function buildShortCatalog(): string {
  return SKILLS.map(s => `· ${s.id} · ${s.description} · 触发词：${s.triggers.join("、")}`).join("\n");
}

function buildFullTextBlock(ids: SkillId[]): string {
  if (ids.length === 0) return "（无）";
  return SKILLS.filter(s => ids.includes(s.id))
    .map(s => `【${s.id}】\n${s.body}`)
    .join("\n\n");
}

export function loadSkillsForMode(mode: SkillMode, utterance: string): SkillCatalogResult {
  const started = Date.now();
  logger.info(
    "调用函数-loadSkillsForMode",
    "调用函数开始：loadSkillsForMode",
    "为什么写这条日志：本步核心是 10 个技能目录 + 三种装载模式对照。每种模式都要留证据，方便学习者对照同一句 utterance 在三种装配下的 system prompt 体积差异。",
    { 入参: { mode, utterance }, __code: LOAD_SKILLS_CODE },
  );

  const shortCatalog = buildShortCatalog();
  const matchedSkills = pickMatchedSkills(utterance);
  const matchedTriggerMap = pickTriggerMap(utterance);

  let fullSkillsLoaded: SkillId[];
  if (mode === "full") {
    fullSkillsLoaded = SKILLS.map(s => s.id);
  } else if (mode === "catalog-only") {
    fullSkillsLoaded = [];
  } else {
    fullSkillsLoaded = matchedSkills;
  }

  const fullText = buildFullTextBlock(fullSkillsLoaded);
  const systemPromptText =
    `【角色】你是点咖啡小程序助手。\n` +
    `【AGENTS.md 底线】${AGENTS_MD_RULE}\n\n` +
    `【技能短目录（${SKILLS.length} 项，常驻）】\n${shortCatalog}\n\n` +
    `【技能全文加载（${fullSkillsLoaded.length} 项）】\n${fullText}\n`;

  const result: SkillCatalogResult = {
    mode,
    guestUtterance: utterance,
    shortCatalog,
    fullSkillsLoaded,
    matchedSkills,
    systemPromptText,
    systemPromptChars: systemPromptText.length,
    matchedTriggerMap,
  };

  logger.info(
    "调用函数-loadSkillsForMode",
    "调用函数结束：loadSkillsForMode",
    "为什么写这条日志：三种模式的可观察差异要全文留下。",
    {
      返回值: result,
      耗时ms: Date.now() - started,
      字段释义: {
        mode: "装载模式（full 全加载 / catalog-only 仅短目录 / on-demand 命中加载）",
        shortCatalog: "10 项技能的 name + description + triggers 元数据头，常驻",
        fullSkillsLoaded: "本轮加载进 system prompt 的技能全文 id 列表",
        matchedSkills: "按 utterance 触发词命中但未加载（on-demand 才用 fullSkillsLoaded）",
        systemPromptChars: "这一轮 system prompt 字符数（模拟 Token 占用观察）",
        matchedTriggerMap: "命中的技能 id → 触发词列表（用于解释命中来源）",
      },
    },
  );
  return result;
}