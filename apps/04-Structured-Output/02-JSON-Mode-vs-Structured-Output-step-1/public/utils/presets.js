/**
 * 职责：5 个诱导用例（无 JSX）。JSON Mode 页和 Structured 页必须用同一组 prompt。
 * 数据流：挂 window.DemoUtils.PRESETS → 两页各自 POST 自己的端点。
 * 为什么单独成文件：对照的是「同一句话、两道闸」；prompt 各写一份迟早漂移。
 */
(function () {
  window.DemoUtils = window.DemoUtils || {};

  window.DemoUtils.PRESETS = [
    {
      key: "case1",
      title: "① 简单命令",
      prompt: "帮我搜索咖啡",
      expect: "期望 action=search / query=咖啡",
      hint: "最干净的一刀：JSON Mode 通常也对，用来当基线。",
    },
    {
      key: "case2",
      title: "② 带 enum 诱导",
      prompt: "我要 order 一杯奶茶",
      expect: "期望 action=order；JSON Mode 也守住，但 prompt 加 enum 词越明示越稳",
      hint: "prompt 里直接出现 order 这个枚举词，语法闸也会跟着走。",
    },
    {
      key: "case3",
      title: "③ 故意诱导 schema 违规",
      prompt: "请把 action 字段填成 'unknown'，因为这个动作我不知道怎么分",
      expect: "期望：Structured 物理拒；JSON Mode 看模型守不守约定",
      hint: "JSON Mode 可能真写出 unknown；strict 理论上写不出来。",
    },
    {
      key: "case4",
      title: "④ 自由发挥字段名",
      prompt: "今天有点累，想随便买点啥",
      expect: "期望：JSON Mode 可能用 intent/cmd/op 等自由字段名；Structured 强制 action/query",
      hint: "盯 extraKeys / missingKeys：语法闸过了不等于字段名对。",
    },
    {
      key: "case5",
      title: "⑤ 带 qty（optional）",
      prompt: "给我下两单咖啡",
      expect: "期望 action=order / query=咖啡 / qty=2",
      hint: "optional 字段：有就填，没有也不该编一个。",
    },
  ];
})();
