/**
 * 职责：总览页的官方方言表 —— 四家 × 协议 A/B 怎么开、怎么关、思考回哪个字段。
 * 数据流：GET /health 的 providers[].dialect → 表格。本组件不发模型请求。
 *
 * 颜色：未配置 Key 的行变灰，表示「表还在，只是这一列跑不了」。
 * 挂载：window.DemoUI.DialectMatrix
 */
(function () {
  window.DemoUI = window.DemoUI || {};

  var WHERE_LABEL = {
    separate_field: "单独字段",
    in_content: "嵌在正文",
    separate_or_in_content: "可拆可嵌",
    none: "无思考",
  };

  /**
   * 官方方言矩阵。returnField 可能含 think 标记，必须走 JS 表达式渲染，
   * 不能把尖括号写进 JSX 文本节点（Babel 会当成新标签）。
   */
  function DialectMatrix({ providers }) {
    if (!providers || !providers.length) {
      return <p className="text-sm text-gray-500">还没读到 /health，方言表稍后出现。</p>;
    }
    return (
      <div className="overflow-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-100 text-left">
              <th className="border p-2">模型</th>
              <th className="border p-2">协议</th>
              <th className="border p-2">默认</th>
              <th className="border p-2">怎么开</th>
              <th className="border p-2">怎么关</th>
              <th className="border p-2">回哪</th>
              <th className="border p-2">字段</th>
              <th className="border p-2">备注</th>
            </tr>
          </thead>
          <tbody>
            {providers.map(function (p) {
              return ["a", "b"].map(function (proto) {
                var d = p.dialect[proto];
                return (
                  <tr key={p.id + proto} className={p.ready ? "" : "text-gray-400"}>
                    <td className="border p-2 whitespace-nowrap">
                      {p.label}
                      <div className="text-gray-500">{proto === "a" ? p.modelA : p.modelB}</div>
                    </td>
                    <td className="border p-2">{proto === "a" ? "A · OpenAI" : "B · Anthropic"}</td>
                    <td className="border p-2">{d.defaultOn ? "开" : "关"}</td>
                    <td className="border p-2">{d.howOn}</td>
                    <td className="border p-2">{d.howOff}</td>
                    <td className="border p-2">{WHERE_LABEL[d.returnWhere] || d.returnWhere}</td>
                    <td className="border p-2">{d.returnField}</td>
                    <td className="border p-2">{d.notes}</td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>
    );
  }

  window.DemoUI.DialectMatrix = DialectMatrix;
})();
