/**
 * 本步核心：按问句偏置 α（变体 7）——不需要人手调权重，问句类型自己挑 α。
 *
 * 职责：检测问句是否含「编号 / 货号 / 错误码」模式 → 给出建议 α：
 *   - 纯编号问 → α 小（偏 BM25，因为编号只能 BM25 中）
 *   - 纯口语问 → α 大（偏向量，因为同义只能向量中）
 *   - 两者都有 → α 中（让两侧都救人）
 *
 * 数据流：输入 { query } → 正则检测 → 分类 → 返回 { suggestedAlpha, detected, reason }
 *
 * 为什么用规则不用大模型改写：
 *   教学上「让大模型改写问句」是第 3 条 Query Rewrite 的事；本条只演示「按问句类型自动 α」。
 *   浅规则识别成本低、可观察、好调试。
 */
import { z } from "zod";
import { withCall } from "../http/with-call.js";

const inputSchema = z.object({
  query: z.string().min(1, "query 不能为空"),
});

export type AlphaBias = {
  query: string;
  /** 是不是检测到了编号 / 货号 / 错误码模式 */
  hasNumbered: boolean;
  /** 是不是口语化（不含编号模式，但有中文连续 + 问号 / 怎么 / 退 / 修 等口语词） */
  hasSpoken: boolean;
  /** 分类：numbered（纯编号） / spoken（纯口语） / mixed（两者都有） */
  category: "numbered" | "spoken" | "mixed" | "unknown";
  /** 建议 α：向量侧权重。α 小 → 偏 BM25；α 大 → 偏向量 */
  suggestedAlpha: number;
  /** 触发原因（人话） */
  reason: string;
};

/** 编号 / 货号 / 错误码模式：至少 2 个大写字母 + 连字符 / 下划线 + 数字（允许跨字符） */
const NUMBERED_PATTERN = /[A-Z]{2,}[-_]?\d+/;
/** 口语提示词：问号 / 怎么 / 退 / 修 / 换 / 坏了 / 裂了 等 */
const SPOKEN_HINTS = /(怎么|为什么|如何|退|换|修|坏了|裂了|碎了|投诉|不行|出错|失败)/;

/**
 * 给定问句，分类 + 给出建议 α。
 * 不调网络，纯本地规则。
 */
export async function detectAlpha(input: { query: string }): Promise<AlphaBias> {
  const parsed = inputSchema.parse({ query: input.query });
  const { query } = parsed;

  return await withCall({
    scope: " 调用函数-detectAlpha",
    kind: "函数",
    name: "detectAlpha",
    explain:
      "为什么写这条日志：本步核心 = 按问句偏置。纯本地规则，不调网络。当前：入参已校验，准备正则检测。",
    args: { query },
    code: "detectAlpha({ query })",
    run: async () => {
      const trimmed = query.trim();
      const hasNumbered = NUMBERED_PATTERN.test(trimmed);
      const hasSpoken = SPOKEN_HINTS.test(trimmed);

      let category: AlphaBias["category"];
      let suggestedAlpha: number;
      let reason: string;

      if (hasNumbered && hasSpoken) {
        category = "mixed";
        suggestedAlpha = 0.5;
        reason = "问句同时含编号 + 口语 → 各半（编号定位商品，口语定位政策），两侧都能救人";
      } else if (hasNumbered) {
        category = "numbered";
        suggestedAlpha = 0.2;
        reason = "问句是纯编号（如 SKU-8821 / ERR-4401）→ 编号只能 BM25 中，α 小（偏 BM25）";
      } else if (hasSpoken) {
        category = "spoken";
        suggestedAlpha = 0.8;
        reason = "问句是口语（怎么 / 退 / 修 / 裂了 等）→ 共同词少，靠向量；α 大（偏向量）";
      } else {
        category = "unknown";
        suggestedAlpha = 0.5;
        reason = "问句既不像编号也不像口语 → 默认各半（人后续再调）";
      }

      return {
        query: trimmed,
        hasNumbered,
        hasSpoken,
        category,
        suggestedAlpha,
        reason,
      };
    },
  });
}