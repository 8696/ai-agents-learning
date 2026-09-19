/**
 * 职责：技能目录装载 + 按 utterance 命中 + 装 system prompt（full / on-demand）。run-assembly.ts 引用。
 * 为什么单独成文件：技能目录是一组相关小帮手（按 §5.3.8「核心旁边的小帮手可以同文件」之外的「MCP 那一组」之外的另一组职责），不放在主流程里免得文件超 280 行。
 * 数据流：buildPrompt(assembly, utterance) → { text, loadedSkills }；pickSkillsForUtterance 是普通 helper。
 */
import { logger } from "../logger.js";

export type SkillId = "出杯" | "过敏" | "周报" | "菜单";

export type SkillCatalogEntry = {
  id: SkillId;
  text: string;
  triggers: string[];
};

// ── 技能全文（与 SKILL_CATALOG 里 .text 同源） ──

export const AGENTS_MD_RULE = "仓库底线：不准假装已经做好了；不准编造菜单上没有的饮品。";

export const SKILL_TEXT =
  "出杯技能：① 客人提到过敏，必须先读资源 cafe://allergy-info。" +
  "② 拿铁含牛奶 → 不能做拿铁，改推荐美式。" +
  "③ 客人确认前不要调用工具 make_latte。" +
  "④ 不准假装已经做好了。";

export const ALLERGY_SKILL_TEXT =
  "过敏技能：客人提到「过敏」「含奶」「不能喝奶」才加载。" +
  "① 读 cafe://allergy-info；② 给出「这杯含 X」的事实。";

export const WEEKLY_REPORT_SKILL_TEXT =
  "周报技能：客人提到「本周销量」「周报」「复盘」才加载。" +
  "① 统计出杯数；② 按杯型排版；③ 严禁把出杯全文照搬。";

export const MENU_SKILL_TEXT =
  "菜单技能：客人提到「今天有」「菜单」「有没有」「推荐」才加载。" +
  "① 读 cafe://today-menu；② 推荐只能在菜单里有的饮品。";

export const SKILL_CATALOG: SkillCatalogEntry[] = [
  { id: "出杯", text: SKILL_TEXT,                triggers: ["过敏", "出杯", "做一杯", "拿铁", "美式", "摩卡"] },
  { id: "过敏", text: ALLERGY_SKILL_TEXT,        triggers: ["过敏", "含奶"] },
  { id: "周报", text: WEEKLY_REPORT_SKILL_TEXT,  triggers: ["周报", "本周销量", "复盘"] },
  { id: "菜单", text: MENU_SKILL_TEXT,           triggers: ["今天有", "菜单", "有没有", "推荐"] },
];

export const ALLERGY_BODY =
  "过敏原说明\n· 拿铁、摩卡：含牛奶\n· 美式：不含奶制品";

// 普通 helper：按 utterance 命中技能目录（不写五条日志；普通函数简写）
function pickSkillsForUtterance(utterance: string): SkillId[] {
  return SKILL_CATALOG
    .filter(s => s.triggers.some(t => utterance.includes(t)))
    .map(s => s.id);
}

// 普通 helper：装 system prompt——full 塞四册全文；on-demand 只带 AGENTS.md + 短目录 + 命中技能全文；其他走原三装配形态。
function buildPrompt(assembly: string, utterance: string, agentsMd: string): {
  text: string;
  loadedSkills: SkillId[];
} {
  if (assembly === "system-prompt-full") {
    const all = SKILL_CATALOG.map(s => s.id);
    const text = [agentsMd, ...SKILL_CATALOG.map(s => s.text)].join("\n\n");
    return { text, loadedSkills: all };
  }
  if (assembly === "on-demand") {
    const loaded = pickSkillsForUtterance(utterance);
    const matchedTexts = SKILL_CATALOG
      .filter(s => loaded.includes(s.id))
      .map(s => s.text);
    const catalogLine =
      "技能目录（仅短目录，全文按需加载）：" + SKILL_CATALOG.map(s => s.id).join("、");
    const text = [agentsMd, catalogLine, ...matchedTexts].join("\n\n");
    return { text, loadedSkills: loaded };
  }
  if (assembly === "skill-only" || assembly === "both") {
    return { text: [agentsMd, SKILL_TEXT].join("\n\n"), loadedSkills: ["出杯"] };
  }
  return { text: agentsMd, loadedSkills: [] };
}

/**
 * 普通 helper：返回 systemPromptChars / loadedSkills 给主流程。
 * 仍由主流程在「调用函数开始 / 结束」打五条日志；本函数只跑一句解释日志，避免重复。
 */
export function loadPromptForAssembly(assembly: string, utterance: string, agentsMd: string): {
  text: string;
  loadedSkills: SkillId[];
} {
  logger.info(
    "│ 调用函数-loadPromptForAssembly",
    "调用函数开始：loadPromptForAssembly",
    "为什么写这条日志：把 system prompt 装载与主流程的轨迹分开记，方便只看装载行为。当前：按 assembly 路由 full / on-demand / 其他。",
    { 入参: { assembly, utterance, agentsMdChars: agentsMd.length } },
  );
  const out = buildPrompt(assembly, utterance, agentsMd);
  logger.info(
    "│ 调用函数-loadPromptForAssembly",
    "调用函数结束：loadPromptForAssembly",
    "为什么写这条日志：把 system prompt 装载与主流程的轨迹分开记，方便只看装载行为。当前：已返回 text + loadedSkills。",
    {
      返回值: { chars: out.text.length, loadedSkills: out.loadedSkills },
      字段释义: { chars: "system prompt 字符数", loadedSkills: "本次加载的技能 id" },
    },
  );
  return out;
}