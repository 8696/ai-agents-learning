/**
 * 职责：四类记忆的盒子可视化 + 历史判类结果列表。
 * 数据流：activeType（最新判类命中的类型）→ 高亮对应盒子；items（历史判类结果）→ 逐条渲染。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  const BOX_INFO = [
    { key: "工作记忆", desc: "当前这一小段对话里正在用的信息，会话结束或被裁剪就没了。" },
    { key: "情景记忆", desc: "带时间和场景的一次性经历——某时某刻发生了什么、做了什么、结果如何。" },
    { key: "语义记忆", desc: "脱离场景、持续成立的事实结论，比如用户的身份和技术偏好。" },
    { key: "程序性记忆", desc: "一条通用的做事规则，不针对某个具体用户，是「该怎么做」。" },
  ];

  DemoUI.MemoryBoxes = function MemoryBoxes(props) {
    const activeType = props.activeType;
    return (
      <div id="memory-boxes" className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {BOX_INFO.map(function (box) {
          const active = box.key === activeType;
          return (
            <div
              key={box.key}
              className={
                "rounded p-3 border text-xs space-y-1 " +
                (active
                  ? "border-green-400 bg-green-50 ring-2 ring-green-300"
                  : "border-gray-300 bg-gray-50")
              }
            >
              <p className={"font-semibold " + (active ? "text-green-800" : "text-gray-700")}>
                {box.key}
                {active ? "　←　这句话掉进这里" : ""}
              </p>
              <p className="text-gray-600">{box.desc}</p>
            </div>
          );
        })}
      </div>
    );
  };

  DemoUI.ClassifyHistory = function ClassifyHistory(props) {
    const items = props.items || [];
    if (items.length === 0) {
      return (
        <p className="text-sm text-gray-500">
          还没有判类过的句子。点上面的例句按钮，或输入自己的一句话试试。
        </p>
      );
    }
    return (
      <div className="space-y-2">
        {items.map(function (item, idx) {
          return (
            <div
              key={idx}
              className="border border-gray-200 rounded p-2 text-xs flex flex-wrap items-center gap-2"
            >
              <span className="font-mono text-gray-400">#{items.length - idx}</span>
              <span className="text-gray-800">「{item.sentence}」</span>
              <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                {item.classification.memoryType}
              </span>
              <span
                className={
                  "px-2 py-0.5 rounded " +
                  (item.classification.term === "长期"
                    ? "bg-purple-100 text-purple-800"
                    : "bg-gray-200 text-gray-700")
                }
              >
                {item.classification.term}
              </span>
              <span className="text-gray-500">{item.classification.reason}</span>
            </div>
          );
        })}
      </div>
    );
  };
})();
