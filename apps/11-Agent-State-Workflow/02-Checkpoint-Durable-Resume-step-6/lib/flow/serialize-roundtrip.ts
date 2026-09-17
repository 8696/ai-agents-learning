/**
 * 职责：本步核心：故意往检查点（Checkpoint）里塞不能序列化（Serialization）的值，
 * 对照「写入之前」和 `JSON.stringify` 再 `parse` 之后，然后拒绝写进磁盘。
 * 数据流：取当前状态 → 注入函数 / Map / Date → stringify 走一圈 → 发现类型变了就不调用 writeCheckpoint。
 * 为什么单独成文件：合法写入仍走 checkpoint-after-step.ts；这一页只演示「脏类型不能假装成功」。
 */
import { logger } from "../logger.js";
import { checkpointFilePath, readCheckpoint, type CheckpointRecord } from "./checkpoint-after-step.js";
import { getRun } from "./step-with-checkpoint.js";
import type { CafeState } from "./cafe-graph.js";

export const DIRTY_KINDS = ["function", "map", "date"] as const;
export type DirtyKind = (typeof DIRTY_KINDS)[number];

export interface FieldProbe {
  field: string;
  typeofValue: string;
  constructorName: string;
  functionName?: string;
  mapSize?: number;
  mapEntries?: unknown[];
  dateIso?: string;
  stringValue?: string;
  fieldPresent: boolean;
}

export interface DirtyWriteResult {
  runId: string;
  kind: DirtyKind;
  accepted: false;
  reason: string;
  before: FieldProbe;
  afterStringifyParse: FieldProbe;
  stringifySucceeded: boolean;
  wouldHaveWritten: unknown;
  wroteToDisk: false;
  filePath: string;
  checkpointStillOnDisk: CheckpointRecord | null;
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

function constructorNameOf(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "function") return "Function";
  if (value instanceof Map) return "Map";
  if (value instanceof Date) return "Date";
  const proto = Object.getPrototypeOf(value) as { constructor?: { name?: string } } | null;
  return proto?.constructor?.name || typeof value;
}

function probeField(host: Record<string, unknown>, field: string): FieldProbe {
  const present = Object.prototype.hasOwnProperty.call(host, field);
  const value = host[field];
  const probe: FieldProbe = {
    field,
    typeofValue: typeof value,
    constructorName: constructorNameOf(value),
    fieldPresent: present && value !== undefined,
  };
  if (typeof value === "function") {
    probe.functionName = value.name || "anonymous";
  }
  if (value instanceof Map) {
    probe.mapSize = value.size;
    probe.mapEntries = Array.from(value.entries());
  }
  if (value instanceof Date) {
    probe.dateIso = value.toISOString();
  }
  if (typeof value === "string") {
    probe.stringValue = value;
  }
  return probe;
}

function injectDirty(state: CafeState, kind: DirtyKind): { field: string; dirty: Record<string, unknown> } {
  const dirty: Record<string, unknown> = { ...state };
  if (kind === "function") {
    dirty.cannotSerializeFn = function cannotSerializeFn() {
      return state.drinkName;
    };
    return { field: "cannotSerializeFn", dirty };
  }
  if (kind === "map") {
    dirty.completedNodes = new Map([["takeOrder", true]]);
    return { field: "completedNodes", dirty };
  }
  dirty.servedAt = new Date();
  return { field: "servedAt", dirty };
}

export function roundTripJson(value: unknown): { text: string; parsed: unknown } {
  return logCall(
    "│ 序列化走一圈",
    "roundTripJson",
    "检查点最终要变成 JSON 文件。这里用语言自带的 JSON.stringify / parse，看脏字段会怎样",
    { value },
    roundTripJson.toString(),
    {
      text: "stringify 得到的字符串全文",
      parsed: "再 parse 回来的纯数据",
    },
    () => {
      const text = JSON.stringify(value);
      return { text, parsed: JSON.parse(text) as unknown };
    },
  );
}

export function tryWriteDirtyCheckpoint(runId: string, kind: DirtyKind): DirtyWriteResult {
  return logCall(
    "拒绝写入脏检查点",
    "tryWriteDirtyCheckpoint",
    "本步核心：stringify 表面上成功、读回来类型已经变了，就不能把残缺对象写进磁盘当成功",
    { runId, kind },
    tryWriteDirtyCheckpoint.toString(),
    {
      accepted: "固定为 false：这一次不允许写文件",
      before: "注入之后、stringify 之前的字段探针",
      afterStringifyParse: "stringify 再 parse 之后的同一字段",
      checkpointStillOnDisk: "拒绝之后磁盘上仍是上一份完整快照",
    },
    () => {
      const fromMemory = getRun(runId);
      const fromDisk = readCheckpoint(runId);
      const state = fromMemory ?? fromDisk?.state;
      if (!state) {
        throw Object.assign(
          new Error("找不到这件任务运行。请先开始并至少走一步，磁盘上有一份合法快照后再试脏类型。"),
          { code: "RUN_NOT_FOUND" },
        );
      }
      const { field, dirty } = injectDirty(state, kind);
      const before = probeField(dirty, field);
      const trip = roundTripJson(dirty);
      const parsedHost =
        trip.parsed && typeof trip.parsed === "object" && !Array.isArray(trip.parsed)
          ? (trip.parsed as Record<string, unknown>)
          : {};
      const after = probeField(parsedHost, field);
      const reasonByKind: Record<DirtyKind, string> = {
        function: "函数字段在 stringify 时被丢掉。读回来没有这个键，不能把残缺对象当检查点写进磁盘。",
        map: "Map 被 stringify 成空对象 {}。completedNodes 里的站名会丢光，不能假装写入成功。",
        date: "Date 被 stringify 成字符串。看起来成功，读回来已经不是 Date，类型走样了。",
      };
      return {
        runId,
        kind,
        accepted: false as const,
        reason: reasonByKind[kind],
        before,
        afterStringifyParse: after,
        stringifySucceeded: true,
        wouldHaveWritten: trip.parsed,
        wroteToDisk: false as const,
        filePath: checkpointFilePath(runId),
        checkpointStillOnDisk: readCheckpoint(runId),
      };
    },
  );
}

export function isDirtyKind(value: string): value is DirtyKind {
  return (DIRTY_KINDS as readonly string[]).includes(value);
}
