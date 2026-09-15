/**
 * 职责：单条事实卡片，按 memoryType 染不同色块（语义=蓝、情景=琥珀）。
 * 数据流：fact → 渲染带类型标签 + 原文 + 写入时刻 + key。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  DemoUI.FactCard = function FactCard(props) {
    const f = props.fact;
    const tone = f.memoryType === "情景记忆" ? "border-amber-300 bg-amber-50" : "border-blue-200 bg-blue-50";
    return (
      <div className={"border rounded p-2 text-xs space-y-1 " + tone}>
        <p>
          <span className="font-semibold">{f.memoryType}</span>
          {" · "}
          <span className="font-semibold">{f.term}</span>
        </p>
        <p>{f.sentence}</p>
        <p className="text-gray-500 text-xs">
          写入时刻：{new Date(f.recordedAt).toLocaleString("zh-CN")}
          {" · "}key：<code className="bg-white px-1 rounded">{f.key}</code>
        </p>
      </div>
    );
  };
})();