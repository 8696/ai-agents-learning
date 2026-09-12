/**
 * 职责：内置本 step 的「客服问答对」示例 —— 微调喂的就是这种数据。
 * 数据流：routes/data-shape.ts 读 → 返回给前端 → 渲染在右栏。
 *
 * 与 doc-corpus.ts 的差异：问答对 =「用户原话 + 理想答」成对，每条带口吻；
 *   文档 = 一段陈述事实的原文，无用户视角也无口吻。
 *   这两种数据 **不能互相代替**：
 *     - 把手册直接当微调数据 → 模型学到「复述手册」，不是「按客服流程答」
 *     - 把客服聊天记录不当清洗当检索文档 → 库里进一堆「好的亲」+ 过期承诺
 */
export type QaPair = {
  qaId: string;
  user: string;       // 用户问的那句话
  assistant: string;  // 客服应该怎么答
  /** 标签提示「这条问答适合喂哪种训练」—— 让 UI 一眼看出用法 */
  usedFor: "fine-tuning";
};

export const QA_CORPUS: QaPair[] = [
  {
    qaId: "qa-001",
    user: "我上周买的运动鞋穿了三天就开胶了，想退货。",
    assistant:
      "非常抱歉给您带来困扰 —— 三天就开胶确实是质量问题。按现行政策（refund-v2 / 退货总则 / refund-v2-001），质量问题 3 天内可退。我已为您发起退货单，预计 1~2 个工作日上门取件，运费由我方承担。",
    usedFor: "fine-tuning",
  },
  {
    qaId: "qa-002",
    user: "订单号 202609-001，鞋底脱胶，能换一双吗？",
    assistant:
      "非常抱歉。已查到您的订单 202609-001，订单状态符合换货条件（refund-v2 / 运费承担 / refund-v2-002）。换货单已发起，新鞋发出后预计 3 个工作日内送达；如需退货，运费由我方承担，请回复「换」或「退」。",
    usedFor: "fine-tuning",
  },
  {
    qaId: "qa-003",
    user: "颜色和图片差太多，不想要了，能退吗？",
    assistant:
      "非常抱歉让您失望了。按现行政策（refund-v2 / 退款时效 / refund-v2-003），如商品描述与实物显著不符，可在签收 3 天内无理由退货。退货地址稍后通过短信发您，预计 3 个工作日内退款原路返回。",
    usedFor: "fine-tuning",
  },
  {
    qaId: "qa-004",
    user: "客服你们家东西怎么这么贵啊？",
    assistant:
      "感谢您的反馈。价格反映在品质、售后和会员权益上 —— 我们电子产品保修 1 年、家电 3 年（refund-v2 / FAQ：发票与保修 / refund-v2-003），金卡会员还能 9 折（refund-v2 / FAQ：会员等级 / refund-v2-004）。",
    usedFor: "fine-tuning",
  },
  {
    qaId: "qa-005",
    user: "你们快递也太慢了吧，三天了还没到！",
    assistant:
      "非常抱歉让您久等。请提供订单号，我帮您查一下物流进度。如果超出正常时效，我们会按政策（refund-v2 / 退款时效 / refund-v2-003）走延误处理。",
    usedFor: "fine-tuning",
  },
];