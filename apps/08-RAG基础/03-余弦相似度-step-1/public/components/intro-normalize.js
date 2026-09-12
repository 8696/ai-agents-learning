/**
 * 职责：page-6 归一化的教学说明。挂 window.DemoUI.PageIntroNormalize。
 *       拆到独立文件，因为 layout.js 接近 §5.3.4 行数上限。
 */
(function () {
  const DemoUI = (window.DemoUI = window.DemoUI || {});

  DemoUI.PageIntroNormalize = function PageIntroNormalize() {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示：<b>归一化（L2 Normalize）</b>——先把每条向量变成长度 1 的单位向量（除以自己的模长），再算分数。
          归一化后 <b>余弦 == 点积</b>，三尺子排序方向统一。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>默认「不归一化」= 跟 raw 页相同：长同向 dot=10 / cos=1.0。</li>
          <li>切「归一化」= 所有向量都除以自己的长度，长同向 [10,0] → [1,0]（跟短同向重合）。</li>
          <li>归一化后「cosine 列」和「dot 列」的数字**完全相同**（教学点：cosine = dot）。</li>
          <li>归一化后欧氏距离有特殊含义：不再是「站得多远」，而是「单位球面上的弦长」。</li>
        </ol>
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-2 mt-2">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
          <p id="compare-line" className="text-sm font-semibold text-gray-900">
            归一化后 cosine == dot：两者都退化成「单位向量的点积」，数字完全相同。点积比余弦少一次除法——这就是为什么向量库内部默认归一化（计算快）。
          </p>
          <div className="grid gap-2 md:grid-cols-3 text-xs">
            <div className="bg-white border border-yellow-200 rounded p-2">长同向 [10,0] 归一化后变 [1,0]，跟短同向重合</div>
            <div className="bg-white border border-yellow-200 rounded p-2">cosine 列 == dot 列（数字一字不差）</div>
            <div className="bg-white border border-yellow-200 rounded p-2">归一化是「向量库内部默认选项」，不是业务代码要管的事</div>
          </div>
          <div className="text-xs text-gray-600">
            副作用：归一化后「长度信息」全没了——长切块和短切块在向量空间里变成同一点。这也是为什么归一化 = 「不要长度」。如果业务关心切块长度（比如想给长政策稳定加分），不要开归一化。
          </div>
          <div className="bg-orange-50 border border-orange-300 rounded p-2 mt-2 text-xs space-y-1">
            <div className="font-semibold text-orange-900">⚠ 「归一化」有两种层，都叫 normalize 但不一样</div>
            <div className="grid gap-2 md:grid-cols-2 mt-1">
              <div className="bg-white rounded p-2">
                <div className="font-medium">① L2 向量归一化（本页做的）</div>
                <div>层：向量层。每个向量**自己**除以自己的长度，变成长度 1。</div>
                <div className="font-mono text-xs">long [10, 0] ÷ 10 = [1, 0]</div>
                <div>作用：cosine == dot（少一次除法，向量库默认行为）</div>
              </div>
              <div className="bg-white rounded p-2">
                <div className="font-medium">② 分数归一化（min-max / z-score）</div>
                <div>层：分数层。把分数按比例重排，让 max=1（min-max）或 mean=0 std=1（z-score）。</div>
                <div className="font-mono text-xs">[1, 1, 0.95, -0.8] → [1, 1, 0.97, 0]</div>
                <div>作用：不同批次的分数拉到 [0, 1] 区间方便比较（**显示层**，不是几何）</div>
              </div>
            </div>
            <div className="text-orange-800">工程里看到「normalize」要先问一句：是改向量层还是改分数层？本页做的是 L2 向量归一化，不是分数归一化。</div>
          </div>
        </div>
      </section>
    );
  };
})();