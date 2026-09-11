/**
 * 职责：step-6 · K 件 · 综合对比收尾——GET /api/summary 返回 step-1 ~ step-5 各 demo 能力回顾。
 * 数据流：浏览器 → routes/summary.ts → 硬编码 SUMMARY → components/summary-table.js 渲染。
 *
 * 不调 LLM：纯本地硬编码展示。
 */
import type { Context } from "koa";
import type Router from "@koa/router";

const SUMMARY = {
  module: "模块 08 · 切块（Chunking）",
  steps: [
    {
      id: "step-1",
      name: "step-1 · 三栏对照 size / overlap / 切法",
      port: 50072,
      command: "yarn app:08-02-chunking-step-1",
      url: "http://127.0.0.1:50072/",
      teaches: ["固定长度切（fixed）", "按结构切（structure）", "FAQ 切（faq）", "半句话开头 = 红字", "overlap 重叠部分 = 黄色高亮"],
      whenToUse: "切块第一站 · 想看清 size / overlap / 三种切法并排效果",
      added: "2026-09-11 · 本条核心对照演示",
    },
    {
      id: "step-2",
      name: "step-2 · 单位 + 兜底截断 + 撞预算",
      port: 50073,
      command: "yarn app:08-02-chunking-step-2",
      url: "http://127.0.0.1:50073/",
      teaches: ["A · 字符 / 词元 / 汉字三种数法对照（不能照抄英文教程的 512）", "B · 兜底截断：超长块自动按固定长度再切（避免超嵌入上限）", "C · size × Top-K 撞预算 · 看材料词元占预算 %"],
      whenToUse: "调参前要先弄清单位 / 兜底 / 预算",
      added: "2026-09-11 · 三件配套一起讲",
    },
    {
      id: "step-3",
      name: "step-3 · 怎么判断切得好不好 + 文档类型选策略",
      port: 50074,
      command: "yarn app:08-02-chunking-step-3",
      url: "http://127.0.0.1:50074/",
      teaches: ["A · 4 维度观察卡（半句话数 / 内容纯度 / 前 K 条重复度 / 模拟最高分）", "B · 5 种文档类型选不同策略（FAQ / 长手册 / 法规 / 会议纪要 / 散文 · 推荐参数自动套用）"],
      whenToUse: "调完参数想确认切得好不好 · 或换文档类型时查推荐策略",
      added: "2026-09-11 · 判断 + 选策略",
    },
    {
      id: "step-4",
      name: "step-4 · PDF 按页切",
      port: 50075,
      command: "yarn app:08-02-chunking-step-4",
      url: "http://127.0.0.1:50075/",
      teaches: ["按页切 = 为页码元数据付的代价（跨页段落一定腰斩）", "PDFParse v2 API 用法", "每页独立卡 + 跨页段落橙色徽标"],
      whenToUse: "需要「RAG 能点名出处 · 第几页」时用",
      added: "2026-09-11 · PDF 专属切块",
    },
    {
      id: "step-5",
      name: "step-5 · 递归切分完整版",
      port: 50076,
      command: "yarn app:08-02-chunking-step-5",
      url: "http://127.0.0.1:50076/",
      teaches: ["## → 段落 → 句号 → 硬切兜底 四级显式降级", "每块 boundary 字段标出「在哪一档被切」", "混合示例一文档触发 4 档降级"],
      whenToUse: "想看清「按结构切」内部降级是怎么一步步走的 · 生产默认切法",
      added: "2026-09-11 · 显式化生产默认切法",
    },
  ],
};

export function mountSummary(router: Router): void {
  router.get("/api/summary", (ctx: Context) => {
    ctx.body = { ok: true, summary: SUMMARY };
  });
}