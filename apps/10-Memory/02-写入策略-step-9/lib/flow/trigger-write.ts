/**
 * 本步核心：第 1 关「写入时机(Write Trigger / Memory Formation)」——笔记 §0 八关流水线最前面那一关。
 *
 * 职责：拿前端传来的 (mode, text, conversationId) + userId，按 mode 决定这条流水线什么时候跑：
 *   - mode = 'eager'        · 热路径：同步跑完整流程（调模型抽候选 + 直接写库），等所有步骤完成才返结果
 *   - mode = 'background'   · 后台异步：立刻返 202 + runId，后台异步跑同一套流程；中途可以查状态
 *   - mode = 'session-end'  · 会话结束才写：把 text 入「待结算队列」，立刻返；等 closeConversation 才一次性结算
 *
 * 数据流（三种模式汇合处）：text
 *   → ① extractFacts(text) 抽 0~N 条候选（同步部分；只有这一步真正调模型）
 *   → ② 对每条 candidate 直接 kvSet(userId, candidate.key, candidate)（不把关 / 不去重 / 不冲突——
 *     这三件事是 step-2~8 的教学点；step-9 只关心「什么时候写」）
 *   → ③ 统计库条数变化 + 返回
 *
 * 三种模式只是「② ③ 在什么时机触发」不同：
 *   - eager        ①→②→③ 全部同步；
 *   - background   立刻返「触发响应」+ 入后台队列；后台 setImmediate 跑 ①→②→③；
 *   - session-end  立刻返「触发响应」+ 入「待结算队列」；closeConversation 才跑队列里所有 ①→②→③。
 *
 * 为什么单独成文件：本步教学点是「写入时机」这一关的主流程——同样一段 text 在三种触发方式下的可观察差别
 * （耗时 / 库条数变化 / 紧接 recall 是否召回得到 / 关闭窗口是否结算），必须在一个文件里集中。
 * route 层 routes/trigger.ts 只校验入参、调它、返回。
 *
 * 设计简化：
 *   - 不调模型判意图（step-8 已演示 intent 字段）；step-9 直接 kvSet 整覆盖——意图是「新建事实」
 *   - 后台 run 状态 + session-end 待结算队列走 trigger-state.ts 内存 Map（演示用，不持久化——重启清空）
 *   - background 模式后台延迟 = 2 秒（固定），让「紧接 recall 召回不到新事实」这件事肉眼可观察
 */
import { extractFacts } from "./extract-facts.js";
import { kvList, kvSet } from "../db.js";
import { logger } from "../logger.js";
import {
  BACKGROUND_DELAY_MS,
  DEFAULT_USER_ID,
  getOrCreatePending,
  newRunId,
  setBackgroundRun,
  takePending,
} from "./trigger-state.js";
import type { FlushResult, TriggerArgs, TriggerMode, TriggerResult } from "./trigger-types.js";

export type { FlushResult, TriggerArgs, TriggerMode, TriggerResult };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface WriteOutcome {
  writtenKeys: string[];
  candidates: import("./extract-facts.js").Candidate[];
}

async function runExtractAndWrite(userId: string, text: string, scopeSuffix: string): Promise<WriteOutcome> {
  const writtenKeys: string[] = [];
  const t0 = Date.now();
  const { candidates } = await extractFacts(text);
  logger.info(
    `│ 调用函数-triggerWrite-${scopeSuffix}`,
    "提取完成",
    `为什么写这条日志：拿到候选清单之后才能决定要写哪些 key。当前：extractFacts 已返，候选数 = ${candidates.length}。`,
    { 候选数: candidates.length, 候选key: candidates.map((c) => c.key) },
  );
  for (const c of candidates) {
    await kvSet(userId, c.key, {
      value: c.value,
      type: c.type,
      confidence: c.confidence,
      source: c.source,
      validUntil: c.validUntil,
    });
    writtenKeys.push(c.key);
  }
  logger.info(
    `│ 调用函数-triggerWrite-${scopeSuffix}`,
    "本段写库完成",
    `为什么写这条日志：要让调用方知道本次写了哪些 key + 用了多久。当前：所有候选 kvSet 完成，共 ${writtenKeys.length} 条。`,
    { writtenKeys, 耗时ms: Date.now() - t0 },
  );
  return { writtenKeys, candidates };
}

async function countFacts(userId: string): Promise<number> {
  const facts = await kvList(userId);
  return Object.keys(facts).length;
}

export async function triggerWrite(args: TriggerArgs): Promise<TriggerResult> {
  const { userId = DEFAULT_USER_ID, mode, text, conversationId } = args;

  logger.info(
    "调用函数-triggerWrite",
    "调用函数开始：triggerWrite",
    `为什么写这条日志：第 1 关「写入时机」本步核心——按 mode 决定这条流水线什么时候跑。当前：拿到入参，mode = ${mode}，conversationId = ${conversationId}。`,
    { 入参: { mode, text, conversationId }, __code: "const result = await triggerWrite(args);" },
  );

  const t0 = Date.now();
  const factsCountBefore = await countFacts(userId);

  let result: TriggerResult;

  if (mode === "eager") {
    const outcome = await runExtractAndWrite(userId, text, "eager");
    const factsCountAfter = await countFacts(userId);
    result = {
      mode,
      factsCountBefore,
      factsCountAfter,
      durationMs: Date.now() - t0,
      candidatesCount: outcome.candidates.length,
      writtenKeys: outcome.writtenKeys,
      candidates: outcome.candidates,
      steps: [
        { label: "① extractFacts(text) 调模型抽 0~N 条候选", status: "ok", detail: "抽到 " + outcome.candidates.length + " 条" },
        { label: "② 对每条 candidate kvSet 写库（覆盖同 key）", status: "ok", detail: "写入了 " + outcome.writtenKeys.length + " 条：" + (outcome.writtenKeys.join(", ") || "(无)") },
        { label: "③ 统计库条数变化", status: "ok", detail: factsCountBefore + " → " + factsCountAfter },
      ],
    };
  } else if (mode === "background") {
    const runId = newRunId();
    setBackgroundRun({
      runId,
      status: "pending",
      startedAt: Date.now(),
      factsCountBefore,
    });
    // 后台异步跑完整流程（先 sleep 2 秒让「紧接 recall 召回不到」肉眼可观察）
    void (async () => {
      try {
        await sleep(BACKGROUND_DELAY_MS);
        const outcome = await runExtractAndWrite(userId, text, "background");
        const factsCountAfter = await countFacts(userId);
        setBackgroundRun({
          runId,
          status: "done",
          startedAt: Date.now() - BACKGROUND_DELAY_MS,
          finishedAt: Date.now(),
          factsCountBefore,
          factsCountAfter,
          candidatesCount: outcome.candidates.length,
          writtenKeys: outcome.writtenKeys,
          candidates: outcome.candidates,
        });
        logger.info(
          "调用函数-triggerWrite-background",
          "后台 run 完成",
          `为什么写这条日志：让外部（GET /api/trigger/status/:runId）能查到这个 run 已 done。当前：runId = ${runId}，写入 keys = ${outcome.writtenKeys.join(",") || "(无)"}。`,
          { runId, 写入keys: outcome.writtenKeys },
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setBackgroundRun({
          runId,
          status: "failed",
          startedAt: Date.now() - BACKGROUND_DELAY_MS,
          finishedAt: Date.now(),
          factsCountBefore,
          error: message,
        });
        logger.error(
          "调用函数-triggerWrite-background",
          "后台 run 失败",
          "为什么写这条日志：让外部知道这个 run 失败 + 错误信息。当前：setImmediate 跑完整流程时抛错。",
          { runId, 异常信息: message },
        );
      }
    })();
    result = {
      mode,
      factsCountBefore,
      factsCountAfter: factsCountBefore, // 触发瞬间库还没变
      durationMs: Date.now() - t0,
      candidatesCount: 0,
      runId,
    };
  } else if (mode === "session-end") {
    const pending = getOrCreatePending(conversationId);
    pending.items.push({ text, queuedAt: Date.now() });
    result = {
      mode,
      factsCountBefore,
      factsCountAfter: factsCountBefore, // 会话中库条数不变
      durationMs: Date.now() - t0,
      candidatesCount: 0,
      pendingQueueLength: pending.items.length,
      steps: [
        { label: "① 触发响应立刻返（库条数不变）", status: "ok", detail: "库条数 " + factsCountBefore + " → " + factsCountBefore },
        { label: "② text 入「待结算队列」", status: "ok", detail: "当前队列长度 = " + pending.items.length },
        { label: "③ extractFacts / kvSet 推迟到 closeConversation 才跑", status: "skipped", detail: "本步未触发；点「结束会话」→ flushConversation 跑" },
      ],
    };
  } else {
    throw new Error(`未知 mode：${mode}`);
  }

  logger.info(
    "调用函数-triggerWrite",
    "调用函数结束：triggerWrite",
    `为什么写这条日志：让路由层知道触发响应的耗时 + 库变化 + runId / 队列长度。当前：triggerWrite 已返，mode = ${mode}，耗时 = ${Date.now() - t0}ms。`,
    {
      返回值: result,
      耗时ms: Date.now() - t0,
      字段释义: {
        mode: "eager = 同步全流程 / background = 异步入队立刻返 + runId / session-end = 入待结算队列立刻返",
        factsCountBefore: "触发瞬间事实库条数（排除软删除）",
        factsCountAfter: "eager = 写完后的条数；background / session-end = 触发瞬间的条数（等于 before）",
        durationMs: "eager = 全流程耗时；background / session-end = 仅触发响应耗时",
        runId: "background 模式专属；GET /api/trigger/status/:runId 查后台 run 状态",
        pendingQueueLength: "session-end 模式专属；当前会话待结算队列长度",
      },
    },
  );

  return result;
}

// ── 会话结束结算 ──
export async function flushConversation(conversationId: string): Promise<FlushResult> {
  const pending = takePending(conversationId);
  if (!pending || pending.items.length === 0) {
    return {
      conversationId,
      flushedItems: 0,
      factsCountBefore: await countFacts(DEFAULT_USER_ID),
      factsCountAfter: await countFacts(DEFAULT_USER_ID),
      durationMs: 0,
      writtenKeys: [],
      candidatesCount: 0,
    };
  }
  const items = pending.items;

  logger.info(
    "调用函数-flushConversation",
    "调用函数开始：flushConversation",
    `为什么写这条日志：会话结束才写——关闭会话时一次性结算该会话所有待写 text。当前：拿到会话 ${conversationId} 的待结算队列，长度 = ${items.length}。`,
    { conversationId, 待结算数: items.length },
  );

  const t0 = Date.now();
  const factsCountBefore = await countFacts(DEFAULT_USER_ID);
  const allWrittenKeys: string[] = [];
  const flushedCandidates: Array<{ text: string; candidates: import("./extract-facts.js").Candidate[] }> = [];
  let totalCandidates = 0;
  for (const item of items) {
    const outcome = await runExtractAndWrite(DEFAULT_USER_ID, item.text, "flush");
    allWrittenKeys.push(...outcome.writtenKeys);
    totalCandidates += outcome.candidates.length;
    flushedCandidates.push({ text: item.text, candidates: outcome.candidates });
  }
  const factsCountAfter = await countFacts(DEFAULT_USER_ID);
  const result: FlushResult = {
    conversationId,
    flushedItems: items.length,
    factsCountBefore,
    factsCountAfter,
    durationMs: Date.now() - t0,
    writtenKeys: allWrittenKeys,
    candidatesCount: totalCandidates,
    flushedCandidates,
  };

  logger.info(
    "调用函数-flushConversation",
    "调用函数结束：flushConversation",
    `为什么写这条日志：让路由层知道这次结算写入了多少条 + 库变化。当前：结算完成，flushedItems = ${items.length}，factsCountBefore → factsCountAfter = ${factsCountBefore} → ${factsCountAfter}。`,
    { 返回值: result, 耗时ms: Date.now() - t0 },
  );

  return result;
}
