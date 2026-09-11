/**
 * 职责：答准时修法提示面板。展示 5 类症状，每张卡含「典型表现 + 推荐修法 + 试试按钮」。
 * 修法矩阵：行级（按文件删旧 / 补文档）/ 全量（切块策略或换嵌入模型）/ 不动库（改 prompt / 调阈值 / query rewrite）。
 */
(function () {
  const DemoUI = window.DemoUI || {};

  const SYMPTOMS = [
    {
      id: "missing",
      name: "症状 1 · 库里没有这类知识",
      sign: "检索命中 0 条，或 Top-1 最高分 < 0.2；模型答「不知道」",
      fix: "行级（补文档 / 补切块）",
      badFix: "全量重建 → 浪费时间，知识本来就不在库",
      demoQuestion: "今晚食堂菜单是什么？",
    },
    {
      id: "dirty",
      name: "症状 2 · 库脏（v1 + v2 并存）",
      sign: "检索命中里出现互相矛盾的内容；用户看到 v1 旧条款",
      fix: "行级（按 source 先删后建）",
      badFix: "全量重建 → 前面已对的文档被浪费",
      demoQuestion: "7 天无理由怎么操作？",
      demoHint: "先上传两份文件名不同但内容冲突的 MD（refund-v1.md 和 refund-v2.md）再问",
    },
    {
      id: "prompt",
      name: "症状 3 · 提示词不够硬",
      sign: "K 条材料对得上主题，但模型没引用材料，自己发挥 / 编",
      fix: "不动库（改 system prompt：只根据材料答、点出来源）",
      badFix: "全量重建 → 库没毛病",
      demoQuestion: "什么是地球上最深的海沟？",
      demoHint: "问库里没有的知识，看模型会不会说「不知道」",
    },
    {
      id: "lowScore",
      name: "症状 4 · 分数看起来低",
      sign: "Top-1 最高分 0.2~0.4；但点开切块原文确实相关",
      fix: "不动库（先看原文 / 调阈值 / 换问法）",
      badFix: "换嵌入模型 → 错误！分数量纲因模型而异",
      demoQuestion: "偏远地方运费多少？",
      demoHint: "库里写「运费」文档，问「偏远地方运费多少」分数可能 0.3 左右但内容相关",
    },
    {
      id: "synonym",
      name: "症状 5 · 同义改写搜不到",
      sign: "问的问题概念上应该有答案，但命中 0 条",
      fix: "不动库（query rewrite · 换种问法）",
      badFix: "全量重建 → 文档里有，库没毛病",
      demoQuestion: "寄东西大概要花多少钱？",
      demoHint: "库里写「运费 / 邮费 / 快递费」，问「寄东西大概要花多少钱」——「寄东西」距离更远，嵌入模型未必能匹配",
    },
  ];

  function DiagnosePanel(props) {
    return (
      <section id="diagnose-pane" className="bg-white shadow rounded p-4 space-y-3 mt-4">
        <h2 className="text-sm font-semibold text-gray-900">答准时修法提示（5 类症状）</h2>
        <p className="text-xs text-gray-600">
          答不准 ≠ 一律重跑整库。先看症状 → 选行级 / 全量 / 不动库。
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {SYMPTOMS.map(function (sym) {
            const isCurrent = props.currentSymptom === sym.id;
            return (
              <div
                key={sym.id}
                className={
                      "border rounded p-3 space-y-2 " +
                      (isCurrent ? "border-blue-500 bg-blue-50" : "border-gray-300 bg-white")
                    }
                  >
                <div className="text-xs font-semibold text-gray-900">{sym.name}</div>
                <div className="text-xs text-gray-700">
                  <b>典型表现</b>：{sym.sign}
                </div>
                <div className="text-xs text-emerald-700">
                  <b>推荐修法</b>：{sym.fix}
                </div>
                <div className="text-xs text-red-600">
                  <b>不要</b>：{sym.badFix}
                </div>
                {sym.demoHint ? (
                  <div className="text-xs text-gray-500">
                    <i>{sym.demoHint}</i>
                  </div>
                ) : null}
                <button
                  type="button"
                  disabled={props.busy || props.noKey}
                  onClick={function () { props.onTrySymptom(sym); }}
                  className="bg-blue-600 text-white px-3 py-1 rounded text-xs disabled:opacity-50"
                >
                  试试此症状
                </button>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  DemoUI.DiagnosePanel = DiagnosePanel;
  DemoUI.SYMPTOMS = SYMPTOMS;
  window.DemoUI = DemoUI;
})();