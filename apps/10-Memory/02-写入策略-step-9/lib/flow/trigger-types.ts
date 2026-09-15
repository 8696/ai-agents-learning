/**
 * 职责：第 1 关「写入时机」的类型契约。
 * 数据流：trigger-write.ts 导出函数实现 + routes/trigger.ts / routes/conversation.ts 引用类型。
 *
 * 为什么单独成文件：trigger-write.ts 控制 ≤280 行（§5.3.8 文件行数硬上限）；类型定义是「旁边小帮手」，
 * 拆出来便于业务逻辑与契约分开看。
 */
import type { Candidate } from "./extract-facts.js";

export type TriggerMode = "eager" | "background" | "session-end";

export interface TriggerArgs {
  userId: string;
  mode: TriggerMode;
  text: string;
  conversationId: string;
}

export interface TriggerResult {
  mode: TriggerMode;
  factsCountBefore: number;
  factsCountAfter: number;
  durationMs: number;
  candidatesCount: number;
  /** background 模式专属：后台 run id，GET /api/trigger/status/:runId 查状态 */
  runId?: string;
  /** session-end 模式专属：触发后待结算队列长度 */
  pendingQueueLength?: number;
  /** eager / background 模式专属：本段实际写入了哪些 key */
  writtenKeys?: string[];
  /** eager 模式专属：本次抽取的完整候选清单（页面要看清「抽了什么出来」） */
  candidates?: Candidate[];
  /** 调用流程步骤（eager / flush 专属；页面要看清「调用流程」） */
  steps?: Array<{ label: string; status: "ok" | "skipped"; detail?: string }>;
}

export interface FlushResult {
  conversationId: string;
  flushedItems: number;
  factsCountBefore: number;
  factsCountAfter: number;
  durationMs: number;
  writtenKeys: string[];
  candidatesCount: number;
  /** flush 专属：每个待结算 text 的抽取结果（页面要看清每段抽了什么 + 来源哪句 text） */
  flushedCandidates?: Array<{ text: string; candidates: Candidate[] }>;
}
