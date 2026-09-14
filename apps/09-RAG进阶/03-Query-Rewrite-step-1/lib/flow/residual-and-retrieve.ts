/**
 * 职责：残句先写全（变体 5）—— 多轮指代改写：检测 query 是否为残句（短 + 指代词），
 *       是 → 用对话历史调模型补全成独立问句（standalone），再走检索。
 * 数据流：query + history → 截断 → detectResidual → 残句 → resolveResidual（top 3 候选）→ standalone → rewriteAndRetrieve。
 * 本步核心：「这个 / 那个 / 还能吗」必须先结合对话历史改写成完整问句，再去搜；
 *          检索模块不知道「这个」指什么，必须显式补全。
 *
 * 生产级特性（2026-09-14 补 · 需求 5）：
 * ① history 截断到最近 MAX_HISTORY_TURNS 轮（避免 history 过长 + token 超限）
 * ② 多轮摘要：historyUsed 长度 ≥ SUMMARIZE_THRESHOLD 时调 LLM 压成 80~120 字摘要（保留实体名）
 * ③ 多候选 + 置信度：模型返回 top 3 candidates + confidence，按 confidence 降序选最高
 * ④ 失败兜底：模型超时 / 吐空 / 解析炸 → catch 后 mode=fallback + queryForRewrite=原句继续
 */
import { rewriteAndRetrieve, type RewriteAndRetrieveResult } from "./rewrite-and-retrieve.js";
import { resolveResidual, type HistoryTurn, type Candidate } from "./residual-resolve.js";
import { logger } from "../logger.js";

export type { HistoryTurn, Candidate } from "./residual-resolve.js";

export type ResidualDetection = {
  isResidual: boolean;
  reason: string;
};

/** 最近保留 N 轮对话历史（防 history 过长 + 减少 token） */
const MAX_HISTORY_TURNS = 5;

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

export type ResidualAndRetrieveResult = {
  query: string;
  history: HistoryTurn[];
  /** 实际喂给模型的 history（截断到 MAX_HISTORY_TURNS 轮）*/
  historyUsed: HistoryTurn[];
  residual: ResidualDetection;
  /** 残句时 = 最高 confidence 候选的独立问句；非残句时 = null */
  standalone: string | null;
  /** 多候选 + 置信度（仅 mode=resolved 时存在）*/
  candidates?: Candidate[];
  /** 仅当 isResidual=true + hasLlm 时存在：模型补全调用详情 */
  resolveModelCall?: { provider: string; model: string; messages: Array<{ role: string; content: string }> };
  /** 仅当 summaryUsed=true 时存在 */
  summaryModelCall?: { provider: string; model: string; messages: Array<{ role: string; content: string }> };
  /** resolved = 残句补全成功；fallback = 残句补全挂了用原句继续；not_residual = 不是残句没调模型 */
  mode: "resolved" | "fallback" | "not_residual";
  /** fallback 时记下原因 */
  resolveFailureReason?: string;
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
  let candidates: Candidate[] | undefined;
  let historyUsed: HistoryTurn[] = history;
  let resolveModelCall: ResidualAndRetrieveResult["resolveModelCall"];
  let summaryModelCall: ResidualAndRetrieveResult["summaryModelCall"];
  let mode: ResidualAndRetrieveResult["mode"];
  let resolveFailureReason: string | undefined;
  let queryForRewrite: string;

  if (!residual.isResidual) {
    mode = "not_residual";
    queryForRewrite = query;
  } else if (!hasLlm) {
    mode = "fallback";
    resolveFailureReason = "未配置 LLM 密钥，跳过残句补全，直接走原句检索";
    queryForRewrite = query;
  } else {
    // ① 截断到最近 N 轮
    historyUsed = history.slice(-MAX_HISTORY_TURNS);
    try {
      const resolved = await resolveResidual(query, historyUsed);
      standalone = resolved.candidates[0].standalone;
      candidates = resolved.candidates;
      resolveModelCall = resolved.resolveModelCall;
      summaryModelCall = resolved.summaryModelCall;
      mode = "resolved";
      queryForRewrite = standalone;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      mode = "fallback";
      resolveFailureReason = "残句补全失败：" + reason + " → 用原句继续检索";
      queryForRewrite = query;
    }
  }

  const rewritten = await rewriteAndRetrieve(queryForRewrite);
  const result: ResidualAndRetrieveResult = {
    query,
    history,
    historyUsed,
    residual,
    standalone,
    candidates,
    resolveModelCall,
    summaryModelCall,
    mode,
    resolveFailureReason,
    rewritten,
  };

  logger.info(
    "调用函数-residualAndRetrieve",
    "调用函数结束：residualAndRetrieve",
    "为什么写这条日志：页面要看见原句 / 残句检测 / historyUsed / 多候选 / mode / 改写句 / 名单。当前：残句补全（或 fallback）+ 改写 + 检索都完成。",
    {
      返回值: result,
      耗时ms: Date.now() - t0,
      __code:
        "const residual = detectResidual(query);\n" +
        "if (residual.isResidual && hasLlm) {\n" +
        "  historyUsed = history.slice(-MAX_HISTORY_TURNS);\n" +
        "  try { resolved = await resolveResidual(query, historyUsed); mode = 'resolved'; }\n" +
        "  catch (err) { mode = 'fallback'; queryForRewrite = query; }\n" +
        "}\n" +
        "const rewritten = await rewriteAndRetrieve(queryForRewrite);",
      字段释义: {
        "residual.isResidual": "true = 命中残句模式（短 / 含指代词）",
        historyUsed: "截断后实际喂给模型的 history（≤ MAX_HISTORY_TURNS 轮）",
        summaryUsed: "historyUsed ≥ SUMMARIZE_THRESHOLD 时触发摘要压缩",
        candidates: "模型返回的 top 3 候选 + 置信度，按 confidence 降序",
        mode: "resolved = 补全成功；fallback = 补全失败用原句；not_residual = 不是残句",
        rewritten: "用 standalone（或原句）做的改写 + 检索",
      },
    },
  );
  return result;
}
