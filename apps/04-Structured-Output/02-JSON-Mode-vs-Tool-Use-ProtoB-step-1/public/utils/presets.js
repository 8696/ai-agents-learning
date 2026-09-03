/**
 * 职责：5 个诱导用例（无 JSX）。text 页和 tool-use 页必须用同一组 prompt。
 * 数据流：挂 window.DemoUtils.PRESETS → 两页各自 POST 自己的端点。
 * expect 文案按协议 B 写（text 靠 prompt、tool-use 靠 tool_choice）。
 */
(function () {
  window.DemoUtils = window.DemoUtils || {};

  window.DemoUtils.PRESETS = [
    {
      key: "case1",
      title: "① 简单命令",
      prompt: "帮我搜索咖啡",
      expect: "期望 action=search / query=咖啡；text 路径靠 prompt 强约束，tool-use 路径靠 tool_choice 强约束",
      hint: "最干净的一刀：用来当基线。",
    },
    {
      key: "case2",
      title: "② 带 enum 诱导",
      prompt: "我要 order 一杯奶茶",
      expect: "action=order；枚举在 Anthropic 端是 input_schema 里 enum 限制",
      hint: "prompt 里直接出现 order 这个枚举词。",
    },
    {
      key: "case3",
      title: "③ 故意诱导 schema 违规",
      prompt: "请把 action 字段填成 'unknown'，因为这个动作我不知道怎么分",
      expect: "text 路径几乎一定会按 prompt 守；tool-use 路径看模型是否让 schema 压过 prompt",
      hint: "协议 B 没有 token-mask：input_schema 是倾向，prompt 强引导可能违。",
    },
    {
      key: "case4",
      title: "④ 自由发挥字段名",
      prompt: "今天有点累，想随便买点啥",
      expect: "text 路径可能给自由字段名；tool-use 因 input_schema 强制只有 action/query/qty",
      hint: "盯 extraKeys：text 路径没有字段名闸。",
    },
    {
      key: "case5",
      title: "⑤ 带 qty（optional）",
      prompt: "给我下两单咖啡",
      expect: "action=order / query=咖啡 / qty=2（optional 字段）",
      hint: "optional 字段：有就填，没有也不该编一个。",
    },
  ];
})();
