/**
 * 职责：残句先写全（变体 5）—— 多轮指代改写：检测 query 是否为残句（短 + 指代词），
 *       是 → 用对话历史调模型补全成独立问句（standalone），再走检索。
 * 数据流：query + history → detectResidual → 残句 → resolveResidual（调模型） → standalone → rewriteAndRetrieve。
 * 本步核心：「这个 / 那个 / 还能吗」必须先结合对话历史改写成完整问句，再去搜；
 *          检索模块不知道「这个」指什么，必须显式补全。
 */
import { getLlm } from "../../../../llm.js";
import { rewriteAndRetrieve, type RewriteAndRetrieveResult } from "./rewrite-and-retrieve.js";
import { logger } from "../logger.js";

export type ResidualDetection = {
  isResidual: boolean;
  reason: string;
};

export type HistoryTurn = { role: "user" | "assistant"; content: string };

/**
 * 残句检测：长度短（≤6 字） 或 命中指代词。
 * 指代词清单常见：「这个 / 那个 / 那个呢 / 还能吗 / 怎么算 / 呢 / 它 / 她 / 他」
 */
const REF_PATTERN = /^(这个|那个|这个呢|那个呢|还能吗|怎么算|呢|它|她|他|然后呢|还有吗)/;

function detectResidual(query: string): ResidualDetection {
  const trimmed = query.trim();
  if (trimmed.length <= 6) {
    return { isResidual: true, reason: "问句 ≤6 字（短）+ 残句" };
  }
  if (REF_PATTERN.test(trimmed)) {
    return { isResidual: true, reason: "含指代词：「" + trimmed.slice(0, 6) + "」" };
  }
  return { isResidual: false, reason: "未命中残句模式" };
}

/**
 * 残句补全：调 LLM 基于 history + current 生成 standalone query。
 * 模型只输出 JSON：{"standalone": "..."}，不替用户回答。
 */
async function resolveResidual(
  query: string,
  history: HistoryTurn[],
): Promise<{ standalone: string; resolveModelCall: { provider: string; model: string; messages: Array<{ role: string; content: string }> } }> {
  const llm = getLlm();
  const messages: Array<{ role: "system" | "user"; content: string }> = [
    {
      role: "system",
      content:
        "你是多轮对话里的「残句补全器」，不是客服。把用户的口语残句（指代 / 短句）" +
        "结合上一轮对话历史改写成独立问句（standalone query）。" +
        "只输出 JSON：{\"standalone\": \"独立完整问句\"}。不要回答用户的问题。",
    },
    {
      role: "user",
      content:
        "上一轮对话：\n" +
        history.map(function (t) { return t.role + "：" + t.content; }).join("\n") +
        "\n\n当前问句：" + query +
        "\n\n请把当前问句改写成独立完整问句，保留原意图。",
    },
  ];
  const request = { model: llm.modelA, temperature: 0, messages };

  logger.info(
    "│ 调用模型-残句补全",
    "调用模型开始：残句补全",
    "为什么写这条日志：残句补全是真发网络请求的那一次，不用它就没有 standalone。当前：在 resolveResidual 里面，第 1 轮。",
    { 入参: request, __code: "const response = await llm.openai.chat.completions.create(request);" },
  );
  const tModel = Date.now();
  const response = await llm.openai.chat.completions.create(request);
  logger.info(
    "│ 调用模型-残句补全",
    "调用模型结束：残句补全",
    "为什么写这条日志：要解析 choices[0].message.content 里的 JSON。当前：模型已返回。",
    {
      返回值: response,
      耗时ms: Date.now() - tModel,
      字段释义: { "choices[0].message.content": "期望是 { standalone: \"...\" } JSON" },
    },
  );

  const content = response.choices[0]?.message?.content ?? "";
  const stripped = content.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("残句补全模型没有返回 JSON 对象");
  }
  const parsed: unknown = JSON.parse(stripped.slice(start, end + 1));
  const standalone = String((parsed as { standalone?: unknown }).standalone || "").trim();
  if (!standalone) throw new Error("standalone 是空字符串");
  return { standalone, resolveModelCall: { provider: llm.provider, model: llm.modelA, messages } };
}

export type ResidualAndRetrieveResult = {
  query: string;
  history: HistoryTurn[];
  residual: ResidualDetection;
  /** 残句时 = 模型补全后的独立问句；非残句时 = null */
  standalone: string | null;
  /** 仅当 isResidual=true + hasLlm 时存在：模型补全调用详情 */
  resolveModelCall?: { provider: string; model: string; messages: Array<{ role: string; content: string }> };
  /** 实际进入检索的问句：残句补全后 = standalone；非残句 = 原句。补全后再走改写模型。 */
  rewritten: RewriteAndRetrieveResult;
};

export async function residualAndRetrieve(
  query: string,
  history: HistoryTurn[],
  hasLlm: boolean,
): Promise<ResidualAndRetrieveResult> {
  const t0 = Date.now();
  logger.info(
    "调用函数-residualAndRetrieve",
    "调用函数开始：residualAndRetrieve",
    "为什么写这条日志：多轮指代「这个 / 那个」必须先补全成独立问句才能搜。当前：刚进入，按 query 检测残句模式。",
    { 入参: { query, historyCount: history.length, hasLlm } },
  );

  const residual = detectResidual(query);
  let standalone: string | null = null;
  let resolveModelCall: ResidualAndRetrieveResult["resolveModelCall"];

  let queryForRewrite: string;
  if (residual.isResidual && hasLlm) {
    const resolved = await resolveResidual(query, history);
    standalone = resolved.standalone;
    resolveModelCall = resolved.resolveModelCall;
    queryForRewrite = standalone;
    logger.info(
      "│ 调用函数-resolveResidual",
      "调用函数结束：resolveResidual",
      "为什么写这条日志：残句补全成功，standalone 已生成。当前：即将用 standalone 调改写。",
      { 返回值: { standalone } },
    );
  } else {
    queryForRewrite = query;
  }

  // 补全后（或非残句）走改写后检索
  const rewritten = await rewriteAndRetrieve(queryForRewrite);
  const result: ResidualAndRetrieveResult = {
    query,
    history,
    residual,
    standalone,
    resolveModelCall,
    rewritten,
  };

  logger.info(
    "调用函数-residualAndRetrieve",
    "调用函数结束：residualAndRetrieve",
    "为什么写这条日志：页面要看见原句 / 残句检测 / 补全后 standalone / 改写句 / 名单。当前：残句补全 + 改写 + 检索都完成。",
    {
      返回值: result,
      耗时ms: Date.now() - t0,
      __code:
        "const residual = detectResidual(query);\n" +
        "if (residual.isResidual && hasLlm) {\n" +
        "  const resolved = await resolveResidual(query, history);\n" +
        "  queryForRewrite = resolved.standalone;\n" +
        "}\n" +
        "const rewritten = await rewriteAndRetrieve(queryForRewrite);",
      字段释义: {
        "residual.isResidual": "true = 命中残句模式（短 / 含指代词）",
        standalone: "残句时 = 模型补全的独立问句；非残句 = null",
        rewritten: "用 standalone（或原句）做的改写 + 检索",
      },
    },
  );
  return result;
}
