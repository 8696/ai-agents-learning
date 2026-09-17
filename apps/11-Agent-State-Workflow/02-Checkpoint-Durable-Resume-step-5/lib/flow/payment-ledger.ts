/**
 * 职责：本地支付渠道账本。按幂等键（Idempotency Key）记账，进程被杀掉之后账本文件还在。
 * 数据流：chargeMemberCard → 先查键，命中则只增加调用次数、不再扣余额；未命中才扣一次并记下这笔。
 * 为什么单独成文件：支付渠道活在工作流进程外面；检查点（Checkpoint）丢了，钱已经扣过这件事仍以账本为准。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../logger.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const LEDGER_FILE = path.resolve(here, "..", "..", "data", "payment-ledger.json");
const INITIAL_BALANCE = 50;

export interface PaymentCallRecord {
  at: string;
  idempotencyKey: string;
  amount: number;
  hitIdempotency: boolean;
}

export interface FirstSuccessRecord {
  amount: number;
  at: string;
}

export interface PaymentLedgerFile {
  initialBalance: number;
  calls: PaymentCallRecord[];
  firstSuccessByKey: Record<string, FirstSuccessRecord>;
}

export interface PaymentSnapshot {
  idempotencyKey: string;
  amount: number;
  callCount: number;
  deductionCount: number;
  lastHitIdempotency: boolean;
  ledgerBalance: number;
  lastCall: PaymentCallRecord | null;
  callsForThisKey: PaymentCallRecord[];
}

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

function emptyLedger(): PaymentLedgerFile {
  return { initialBalance: INITIAL_BALANCE, calls: [], firstSuccessByKey: {} };
}

function readLedgerFile(): PaymentLedgerFile {
  if (!fs.existsSync(LEDGER_FILE)) return emptyLedger();
  const raw = fs.readFileSync(LEDGER_FILE, "utf8");
  return JSON.parse(raw) as PaymentLedgerFile;
}

function writeLedgerFile(ledger: PaymentLedgerFile): void {
  fs.mkdirSync(path.dirname(LEDGER_FILE), { recursive: true });
  fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2), "utf8");
}

function ledgerBalanceOf(ledger: PaymentLedgerFile): number {
  let spent = 0;
  for (const row of Object.values(ledger.firstSuccessByKey)) {
    spent += row.amount;
  }
  return ledger.initialBalance - spent;
}

export function chargeIdempotencyKey(runId: string): string {
  return `charge:${runId}`;
}

export function snapshotPayment(runId: string): PaymentSnapshot {
  const idempotencyKey = chargeIdempotencyKey(runId);
  const ledger = readLedgerFile();
  const callsForThisKey = ledger.calls.filter((row) => row.idempotencyKey === idempotencyKey);
  const lastCall = callsForThisKey.length ? callsForThisKey[callsForThisKey.length - 1] : null;
  return {
    idempotencyKey,
    amount: ledger.firstSuccessByKey[idempotencyKey]?.amount ?? 0,
    callCount: callsForThisKey.length,
    deductionCount: ledger.firstSuccessByKey[idempotencyKey] ? 1 : 0,
    lastHitIdempotency: Boolean(lastCall?.hitIdempotency),
    ledgerBalance: ledgerBalanceOf(ledger),
    lastCall,
    callsForThisKey,
  };
}

export function chargeMemberCard(input: { runId: string; amount: number }): PaymentSnapshot {
  return logCall(
    "│ 支付渠道",
    "chargeMemberCard",
    "真的对外扣款发生在这里。同一幂等键第二次进来只回第一次的结果，余额不再少",
    input,
    chargeMemberCard.toString(),
    {
      callCount: "这一单的幂等键被调用了几次（含重放）",
      deductionCount: "这一单真正扣款成功的次数，幂等时应始终为 1",
      lastHitIdempotency: "最近一次是不是命中已有记录、没有再扣",
      ledgerBalance: "支付渠道账本上的会员卡余额",
    },
    () => {
      const idempotencyKey = chargeIdempotencyKey(input.runId);
      const ledger = readLedgerFile();
      const already = ledger.firstSuccessByKey[idempotencyKey];
      const hitIdempotency = Boolean(already);
      const at = new Date().toISOString();
      if (!already) {
        ledger.firstSuccessByKey[idempotencyKey] = { amount: input.amount, at };
      }
      ledger.calls.push({
        at,
        idempotencyKey,
        amount: input.amount,
        hitIdempotency,
      });
      writeLedgerFile(ledger);
      return snapshotPayment(input.runId);
    },
  );
}

export function paymentLedgerFilePath(): string {
  return LEDGER_FILE;
}
