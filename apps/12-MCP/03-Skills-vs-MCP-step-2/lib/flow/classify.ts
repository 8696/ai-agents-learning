/**
 * 本步核心：分类题。两题场景选错或选对都返回解释（学习点不掩盖错选）。
 * 职责：模拟「做法知识 vs 连接能力」的判桶 + 解释生成。
 * 数据流：scenarioId + optionId → 查 SCENARIOS → 判对错 + 拼 ClassifyResult。
 * 为什么单独成文件：分类题和装配 / 装载是不同主路径，必须独立可读。
 */
import { logger } from "../logger.js";

export type ScenarioId = "apply_latte_policy" | "skill_http_token";

export type ClassifyOption = {
  id: string;
  label: string;
  explanation: string;
};

export type ClassifyScenario = {
  id: ScenarioId;
  prompt: string;
  options: ClassifyOption[];
  correctOptionId: string;
  reasoning: string;
};

export const SCENARIOS: Record<ScenarioId, ClassifyScenario> = {
  apply_latte_policy: {
    id: "apply_latte_policy",
    prompt:
      "有团队提了「apply_latte_policy」这个 MCP 工具，没有副作用，只返回一段长文本说「本店出杯须知…」",
    options: [
      {
        id: "mcpTool",
        label: "写成 MCP 工具（Tool）",
        explanation: "它没有真实副作用（不调吧台、不读资源、不记日志），只是返回一段文字，不该当 MCP 工具。",
      },
      {
        id: "skill",
        label: "写进技能 SKILL.md",
        explanation: "✓ 对。「出杯须知」是做法知识（怎么做出杯），属于按店规怎么做——进技能。",
      },
      {
        id: "resource",
        label: "当成资源 cafe://policy",
        explanation: "资源按 URI 递事实数据（如「拿铁含牛奶」）。「出杯须知」是流程，不是事实条目。",
      },
      {
        id: "systemPrompt",
        label: "塞进系统提示词",
        explanation: "换一轮对话就丢；周报那种不相关的技能也被塞满；应按需加载。",
      },
    ],
    correctOptionId: "skill",
    reasoning:
      "apply_latte_policy 是做法知识——「怎么做出杯」，不是连接能力（怎么用机子）。它没有真实副作用，不该当 MCP 工具。按「MCP 服务端只写怎么调这个吧台」的边界，店规进技能 / 资源；不塞系统提示词。",
  },
  skill_http_token: {
    id: "skill_http_token",
    prompt:
      "技能 SKILL.md 写了「请 POST https://cafe.example.com/latte，Token 放环境变量 CAFE_TOKEN」",
    options: [
      {
        id: "okSkill",
        label: "没问题，技能里出现 HTTP 很正常",
        explanation: "Token 暴露 + 绕开 MCP 按用户鉴权——技能不应替 MCP 实现连接层。",
      },
      {
        id: "mcp",
        label: "应做 MCP（加鉴权 / 按用户隔离）",
        explanation: "✓ 对。HTTP + Token 是连接层的事。上一节 stdio vs Streamable HTTP 已经讲过按用户鉴权。",
      },
      {
        id: "resource",
        label: "改成资源 cafe://remote-latte",
        explanation: "资源按 URI 递事实，不是出杯 HTTP；这条路径不会真做出咖啡。",
      },
      {
        id: "hardcode",
        label: "直接写死 URL 在技能里更稳",
        explanation: "同 1：Token 暴露 + 按用户隔离做不到；连接层归 MCP。",
      },
    ],
    correctOptionId: "mcp",
    reasoning:
      "技能只规定「怎么用连接」，不替连接本身。HTTP + Token 是连接层的事——MCP 服务端按用户鉴权、按用户出杯。SKILL.md 里出现 Token 也是密钥暴露风险（模型 Key 不进 git / 不进共享 env）。",
  },
};

export type ClassifyResult = {
  scenarioId: ScenarioId;
  prompt: string;
  selectedOptionId: string;
  selectedLabel: string;
  isCorrect: boolean;
  selectedExplanation: string;
  reasoning: string;
  correctOptionId: string;
  correctLabel: string;
};

const CLASSIFY_CODE = `function classify(scenarioId, optionId) {
  const s = SCENARIOS[scenarioId];
  const selected = s.options.find(o => o.id === optionId);
  return { isCorrect: optionId === s.correctOptionId, ...selected, reasoning: s.reasoning };
}`;

export function classify(scenarioId: ScenarioId, optionId: string): ClassifyResult {
  const started = Date.now();
  logger.info(
    "调用函数-classify",
    "调用函数开始：classify",
    "为什么写这条日志：分类题是本步核心，每选一个选项都要留证据。当前：按 scenarioId 路由两题之一。",
    { 入参: { scenarioId, optionId }, __code: CLASSIFY_CODE },
  );
  const s = SCENARIOS[scenarioId];
  if (!s) throw new Error(`未知场景：${scenarioId}`);
  const selected = s.options.find(o => o.id === optionId);
  if (!selected) throw new Error(`未知选项：${optionId}`);
  const correct = s.options.find(o => o.id === s.correctOptionId)!;

  const result: ClassifyResult = {
    scenarioId,
    prompt: s.prompt,
    selectedOptionId: selected.id,
    selectedLabel: selected.label,
    isCorrect: selected.id === s.correctOptionId,
    selectedExplanation: selected.explanation,
    reasoning: s.reasoning,
    correctOptionId: correct.id,
    correctLabel: correct.label,
  };

  logger.info(
    "调用函数-classify",
    "调用函数结束：classify",
    "为什么写这条日志：分类题结果连同 reasoning 全文留下，方便学习者回头看为什么这个选项对 / 错。",
    {
      返回值: result,
      耗时ms: Date.now() - started,
      字段释义: {
        isCorrect: "选项是否等于该题的正确答案",
        selectedExplanation: "该选项本身的解释（错选项也有解释，不掩盖）",
        reasoning: "本场景的总解释（正确答案为什么对 + 错答案为什么错）",
        correctOptionId: "该题正确选项 id",
        correctLabel: "该题正确选项文案",
      },
    },
  );
  return result;
}