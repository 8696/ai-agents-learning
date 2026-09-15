/**
 * 职责：把程序性规则 / 核心画像 / 本轮情景召回转成 system 段里给人看的文本片段。
 * 数据流：rules / coreProfile / recall → 三段字符串；buildSystemContent 只作教学对照，
 *         真正发给模型的 system 以这次请求的 finalMessages[0] 为准。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  DemoUI.buildProgramFragment = function (rules) {
    if (!rules || rules.length === 0) {
      return "【程序性记忆 / 全员规则】\n（当前没有任何全员规则）";
    }
    const body = rules
      .map(function (r, i) {
        return "[全员规则 " + (i + 1) + "] " + r.text;
      })
      .join("\n");
    return "【程序性记忆 / 全员规则】\n" + body;
  };

  DemoUI.buildCoreProfileFragment = function (facts) {
    if (!facts || facts.length === 0) {
      return "【核心用户画像 / 语义记忆】\n（当前没有核心用户画像。问技术栈 / 姓名 / 城市时，模型看不到跨会话事实。）";
    }
    const body = facts
      .map(function (f, i) {
        return "[画像 " + (i + 1) + "] key=" + f.key + "\n原话：" + f.sentence + "\n理由：" + f.reason;
      })
      .join("\n\n");
    return "【核心用户画像 / 语义记忆】\n" + body;
  };

  DemoUI.buildRecallFragment = function (recall) {
    if (!recall) return "";
    if (recall.skipped) {
      return (
        "【本轮相关经历 / 情景记忆】\n（本轮跳过情景召回：" +
        (recall.skipReason || "未说明原因") +
        "。核心用户画像仍在上面那一块。）"
      );
    }
    const topK = recall.topK || [];
    if (topK.length === 0) {
      return "【本轮相关经历 / 情景记忆】\n（这一问没有检索到足够相关的经历。不等于用户从没做过类似的事，只是这一问没召回。）";
    }
    const body = topK
      .map(function (s, i) {
        return (
          "[经历 " +
          (i + 1) +
          "] 余弦相似度=" +
          s.score.toFixed(4) +
          "\n原话：" +
          s.fact.sentence +
          "\n理由：" +
          s.fact.reason
        );
      })
      .join("\n\n");
    return "【本轮相关经历 / 情景记忆】\n" + body;
  };
})();
