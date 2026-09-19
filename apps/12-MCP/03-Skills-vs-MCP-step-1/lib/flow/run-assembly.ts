/**
 * 本步核心：同一句点单，五种装配走出可观察对照。
 *  - mcp-only / skill-only / both            — 三装配对照（需求 1/2/3）
 *  - system-prompt-full / on-demand          — system prompt 怎么装的对照（需求 4 + 8）
 * 职责：模拟点咖啡小程序宿主怎么装配连接能力 + 做法知识；不调大模型，用固定剧本。
 * 数据流：assembly + guestUtterance → 是否读过敏原 / 是否真调 make_latte / 最终回复
 *         / systemPromptChars / loadedSkills / skillCatalog。
 * 为什么单独成文件：五条对照的主路径必须打开这一个文件就能读完，禁止埋进路由。
 * helper 在 mcp-actions.ts（MCP 工具 / 资源）和 skill-loader.ts（技能目录 + 装 system prompt）。
 */
import { logger } from "../logger.js";
import { makeLatte, readAllergy } from "./mcp-actions.js";
import {
  AGENTS_MD_RULE,
  SKILL_TEXT,
  ALLERGY_BODY,
  loadPromptForAssembly,
} from "./skill-loader.js";

export type AssemblyId =
  | "mcp-only"
  | "skill-only"
  | "both"
  | "system-prompt-full"
  | "on-demand";

export const DEFAULT_GUEST_UTTERANCE = "我牛奶过敏，来一杯拿铁";

export type TraceStep = {
  kind: "skill" | "resource" | "tool" | "reply" | "fabricate" | "prompt";
  title: string;
  detail: string;
};

export type AssemblyResult = {
  assembly: AssemblyId;
  guestUtterance: string;
  loaded: {
    mcpTools: string[];
    skillText: string | null;
    agentsMd: string | null;
  };
  loadedSkills: Array<"出杯" | "过敏" | "周报" | "菜单">;
  skillCatalog: Array<"出杯" | "过敏" | "周报" | "菜单">;
  systemPromptChars: number;
  systemPromptText: string;
  trace: TraceStep[];
  toolCalls: Array<{ name: string; args: { cupSize: string }; result: string }>;
  resourceReads: Array<{ uri: string; text: string }>;
  finalReply: string;
  observed: {
    calledMakeLatte: boolean;
    readAllergy: boolean;
    fabricatedDone: boolean;
    followedSkill: boolean;
    weeklyReportInPrompt: boolean;
  };
};

const RUN_ASSEMBLY_CODE = `function runAssembly(assembly, guestUtterance) {
  if (assembly === "mcp-only")           { 不读技能；直接 make_latte("中杯"); }
  if (assembly === "skill-only")         { 读技能；没有吧台；空口说做好了; }
  if (assembly === "both")               { 先 read cafe://allergy-info；拿铁含奶 → 不调 make_latte，改推美式; }
  if (assembly === "system-prompt-full") { system prompt 塞四册全文；命中→先读过敏原；周报也在; }
  if (assembly === "on-demand")          { system prompt 只带 AGENTS.md + 短目录；按 utterance 命中加载；周报按需; }
}`;

export function runAssembly(assembly: AssemblyId, guestUtterance: string): AssemblyResult {
  const started = Date.now();
  logger.info(
    "调用函数-runAssembly",
    "调用函数开始：runAssembly",
    "为什么写这条日志：本步核心是同一句话五种装配。当前：刚进宿主模拟。",
    { 入参: { assembly, guestUtterance }, __code: RUN_ASSEMBLY_CODE },
  );

  // ① 先摊开这一侧装了什么，再演戏。顺序不能倒：否则分不清「没工具」还是「有工具没用」。
  const hasMcp = assembly !== "skill-only";
  const prompt = loadPromptForAssembly(assembly, guestUtterance, AGENTS_MD_RULE);

  const loaded = {
    mcpTools: hasMcp ? ["make_latte"] : [],
    skillText: (assembly === "skill-only" || assembly === "both") ? SKILL_TEXT : null,
    agentsMd: AGENTS_MD_RULE,
  };

  const trace: TraceStep[] = [];
  const toolCalls: AssemblyResult["toolCalls"] = [];
  const resourceReads: AssemblyResult["resourceReads"] = [];
  let finalReply = "";
  let calledMakeLatte = false;
  let readAllergyDone = false;
  let fabricatedDone = false;
  let followedSkill = false;
  let weeklyReportInPrompt = false;

  // ② full / on-demand 先把「system prompt 怎么装的」写进 trace 第一行（变体 4 / 8 对照点）
  if (assembly === "system-prompt-full" || assembly === "on-demand") {
    trace.push({
      kind: "prompt",
      title: assembly === "system-prompt-full"
        ? "system prompt 已塞四册全文（出杯 / 过敏 / 周报 / 菜单）"
        : `system prompt 只带 AGENTS.md + 技能目录；按 utterance 命中加载 ${prompt.loadedSkills.join("、") || "（无）"}`,
      detail: assembly === "system-prompt-full"
        ? "周报全文也已经在这一轮 system prompt 里——客人只问菜单也背着。"
        : "周报全文不在 system prompt；只有当客人提「周报 / 本周销量」才会被按需加载。",
    });
  }

  if (assembly === "mcp-only") {
    // ③ 只有连接能力：模型按通用习惯猜，最短路径出杯。
    trace.push({
      kind: "tool",
      title: "没有出杯技能，直接调工具（Tool）",
      detail: "宿主只看见 make_latte。过敏原资源即使注册了，也没人规定必须先读。",
    });
    const result = makeLatte("中杯");
    calledMakeLatte = true;
    toolCalls.push({ name: "make_latte", args: { cupSize: "中杯" }, result });
    finalReply = result;
    trace.push({
      kind: "reply",
      title: "最终回复",
      detail: "客人喝到了奶。MCP 日志看起来成功，店规没人执行。",
    });
  } else if (assembly === "skill-only") {
    // ④ 只有做法知识：会背手册，拧不动螺丝；还容易编造「已经做好了」。
    trace.push({
      kind: "skill",
      title: "读到出杯技能，但工具列表是空的",
      detail: SKILL_TEXT,
    });
    fabricatedDone = true;
    finalReply = "好的，已经给您做好中杯拿铁了。";
    trace.push({
      kind: "fabricate",
      title: "没有吧台，空口说做好了（编造风险）",
      detail: "违反仓库底线「不准假装已经做好了」。没有 tools/call 返回值。",
    });
  } else {
    // ⑤ 三装配都是「按店规用真吧台」：both 直接走；system-prompt-full / on-demand 复用同一条业务轨迹。
    if (assembly === "both") {
      trace.push({
        kind: "skill",
        title: "任务相关，加载出杯技能",
        detail: SKILL_TEXT,
      });
    }
    const allergy = readAllergy();
    readAllergyDone = true;
    resourceReads.push(allergy);
    followedSkill = true;
    trace.push({
      kind: "resource",
      title: "先读资源 cafe://allergy-info",
      detail: allergy.text,
    });
    trace.push({
      kind: "reply",
      title: "拿铁含牛奶 → 不调 make_latte，改推美式",
      detail: "业务行为一致；区别只在「system prompt 体积 + 本次加载的技能」。",
    });
    finalReply = "拿铁含牛奶，按出杯技能不能做。已改推荐美式。您确认后我再调 make_latte。";
  }

  // ⑥ 周报是否在 prompt 里：full 永远在；on-demand 按命中；其他装配都不涉及
  if (assembly === "system-prompt-full") weeklyReportInPrompt = true;
  if (assembly === "on-demand") weeklyReportInPrompt = prompt.loadedSkills.includes("周报");

  const result: AssemblyResult = {
    assembly,
    guestUtterance,
    loaded,
    loadedSkills: prompt.loadedSkills,
    skillCatalog: ["出杯", "过敏", "周报", "菜单"],
    systemPromptChars: prompt.text.length,
    systemPromptText: prompt.text,
    trace,
    toolCalls,
    resourceReads,
    finalReply,
    observed: {
      calledMakeLatte,
      readAllergy: readAllergyDone,
      fabricatedDone,
      followedSkill,
      weeklyReportInPrompt,
    },
  };

  logger.info(
    "调用函数-runAssembly",
    "调用函数结束：runAssembly",
    "为什么写这条日志：五条轨迹的可观察差异要全文留下。当前：已经按装配演完。",
    {
      返回值: result,
      耗时ms: Date.now() - started,
      字段释义: {
        calledMakeLatte: "有没有真的 tools/call(make_latte)",
        readAllergy: "有没有先 resources/read 过敏原",
        fabricatedDone: "有没有在没有工具时假装做好了",
        followedSkill: "有没有按技能先读再决定",
        weeklyReportInPrompt: "周报技能全文是否在这一轮 system prompt 里",
        systemPromptChars: "这一轮 system prompt 字符数（模拟 Token 占用观察）",
        loadedSkills: "本次加载的技能 id（on-demand 按命中；full 全加载）",
      },
    },
  );
  return result;
}

// ALLERGY_BODY 仅作类型再导出（不在 runAssembly 直接用，留在 import 兼容老调用方）
export { ALLERGY_BODY };