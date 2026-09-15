/**
 * 职责：把 Top-K 召回结果转成 system 段里的实际文本片段（前端复现后端拼装逻辑）。
 * 数据流：topK: ScoredFact[] → 按后端格式拼接「【语义 / 情景记忆 / 召回结果】[1] 类型=... / 原话：... / 理由：...」字符串。
 *
 * 为什么单独成文件：让"拼装过程可视化"和 4 步流水线组件分离，便于后续 ①/② 复用同一拼装逻辑。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  // ── ① 程序性片段：固定文本（每次请求都带同样这一段） ──
  DemoUI.buildProgramFragment = function (rules) {
    if (!rules || rules.length === 0) {
      return "（当前没有任何全员规则）";
    }
    const body = rules
      .map(function (r, i) {
        return `[全员规则 ${i + 1}] ${r.text}`;
      })
      .join("\n");
    return "【程序性记忆 / 全员规则】\n" + body;
  };

  // ── ② 召回片段：动态文本（每次按当前 user 重算） ──
  DemoUI.buildRecallFragment = function (recall) {
    if (!recall) return "";
    if (recall.skipped) {
      return "【语义 / 情景记忆 / 召回结果】\n（本次跳过了召回步骤，按 toggle 不读记忆库）";
    }
    const topK = recall.topK || [];
    if (topK.length === 0) {
      return "【语义 / 情景记忆 / 召回结果】\n（事实库里没有任何一条与这个问题相关的内容）";
    }
    const body = topK
      .map(function (s, i) {
        return (
          `[${i + 1}] 类型=${s.fact.memoryType} / 期限=${s.fact.term} / 余弦相似度=${s.score.toFixed(4)}\n` +
          `原话：${s.fact.sentence}\n` +
          `理由：${s.fact.reason}`
        );
      })
      .join("\n\n");
    return "【语义 / 情景记忆 / 召回结果】\n" + body;
  };

  // ── 完整 system 段：固定部分（程序性）+ 动态部分（召回）+ 行为约定 ──
  DemoUI.buildSystemContent = function (rules, recall) {
    return (
      "你是公司内部前端代码助手。下面分三块拼成 system 段：\n\n" +
      "【程序性记忆 / 全员规则】\n" +
      DemoUI.buildProgramFragment(rules) + "\n\n" +
      "【语义 / 情景记忆 / 召回结果】\n" +
      DemoUI.buildRecallFragment(recall) + "\n\n" +
      "【行为约定】\n" +
      "- 只能从上面召回的事实里找答案；没召回到的直接说「我的长期记忆里没有这条信息」。\n" +
      "- 不要编造召回事实里没写的内容。\n" +
      "- 引用了哪几条按出现顺序简短列出。"
    );
  };
})();