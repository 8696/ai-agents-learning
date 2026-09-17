/**
 * 职责：本步核心——支付渠道已经扣款成功，完整检查点（Checkpoint）还没写到磁盘，然后内存被清空。
 *
 * 数据流：
 *   当前必须停在扣会员卡（chargeCard）这一站
 *   chargeMemberCard → 钱在支付渠道账本上被扣掉
 *   不改 currentNode、不写 executedToolCallIds、不调用 writeCheckpoint
 *   forgetRun → 模拟进程没了
 *   磁盘上仍是上一份完整快照（通常是点单走完、下一站还是 chargeCard）
 *
 * 为什么单独成文件：这一步要看见的是「钱扣了、痕迹还没进检查点」。不要埋进路由，也不要和「走完一步再写入」混成一个函数。
 */
import { logger } from "../logger.js";
import { NODE_LABELS } from "./cafe-graph.js";
import { checkpointFilePath, readCheckpoint } from "./checkpoint-after-step.js";
import { forgetRun, getRun, hasRun } from "./step-with-checkpoint.js";
import { chargeMemberCard, snapshotPayment } from "./payment-ledger.js";

function logCall<T>(
  scope: string,
  name: string,
  explainWhy: string,
  args: unknown,
  code: string,
  fieldGuide: Record<string, string>,
  run: () => T,
): T {
  const started = Date.now();
  logger.info(scope, `调用函数开始：${name}`, `为什么写这条日志：${explainWhy}。当前：刚进入 ${name}。`, {});
  logger.info(scope, `调用函数：${name}`, `为什么写这条日志：记下完整入参。当前：尚未执行函数体。`, { 入参: args });
  logger.info(scope, `调用函数：${name}`, `为什么写这条日志：对照函数体。当前：即将执行。`, { __code: code });
  try {
    const result = run();
    logger.info(scope, `调用函数结束：${name}`, `为什么写这条日志：这一调用结束。当前：即将返回调用方。`, {
      返回值: result,
      耗时ms: Date.now() - started,
      字段释义: fieldGuide,
    });
    return result;
  } catch (error: unknown) {
    logger.error(scope, `调用函数结束：${name}（失败）`, `为什么写这条日志：调用失败也要留下结束。当前：${name} 抛错。`, {
      返回值: error,
      耗时ms: Date.now() - started,
    });
    throw error;
  }
}

export function chargeThenCrashBeforeCheckpoint(runId: string) {
  return logCall(
    "扣款后不写检查点",
    "chargeThenCrashBeforeCheckpoint",
    "本步核心：先让支付渠道扣款，再故意不写检查点、清空内存，模拟进程死在「钱已扣、文件还是旧的」这一格",
    { runId },
    chargeThenCrashBeforeCheckpoint.toString(),
    {
      currentNodeOnDisk: "磁盘上仍应停在扣会员卡站，证明检查点没写成新的",
      payment: "支付渠道已经扣过一次",
      inMemoryAfter: "内存应已空",
    },
    () => {
      const before = getRun(runId);
      if (!before) {
        throw Object.assign(
          new Error("内存里找不到这件任务运行。请先开始、再走一步到扣会员卡站。"),
          { code: "RUN_NOT_FOUND" },
        );
      }
      if (before.currentNode !== "chargeCard") {
        throw Object.assign(
          new Error(
            `现在停在 ${NODE_LABELS[before.currentNode]}，不是扣会员卡（chargeCard）。请先只走一步到扣卡站，再模拟「扣款成功但检查点还没写完」。`,
          ),
          { code: "NOT_AT_CHARGE_CARD" },
        );
      }

      const paymentAfterCharge = chargeMemberCard({ runId, amount: 18 });
      forgetRun(runId);
      const checkpoint = readCheckpoint(runId);

      return {
        runId,
        before,
        inMemoryAfter: hasRun(runId),
        filePath: checkpointFilePath(runId),
        checkpoint,
        payment: paymentAfterCharge,
        paymentAfterForget: snapshotPayment(runId),
      };
    },
  );
}
