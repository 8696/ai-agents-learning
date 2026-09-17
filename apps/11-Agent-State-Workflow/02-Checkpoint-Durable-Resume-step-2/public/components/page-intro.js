/**
 * 职责：step-2 自己的本页说明和核心教学点卡片。
 * 数据流：App 传入 page（next-run / memory-vs-disk / overview）。
 * 为什么单独成文件：各页教学文案不同，不堆进 layout.js。
 */
window.DemoUI = window.DemoUI || {};

function PageIntro(props) {
  const page = props.page;
  if (page === "next-run") {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示：<b>上一件任务运行走到终止站 okEnd 后，开新业务 = 新 runId</b>（变体 F · 做法 1 默认；做法 2 挂 parentRunId 引用上一件）。上一件的检查点不被改写。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>点「开第一件」→ POST /api/run/start，生成第一件 runId</li>
          <li>点「一路走到完成（okEnd）」，把第一件推到终止站</li>
          <li>点「开下一件（带 parentRunId）」→ POST /api/run/next 携带 previousRunId = 第一件</li>
          <li>看右栏：新 runId、新 state 从零、parentRunId = 第一件 runId；上一件文件未被改写</li>
          <li>反例：还没走到 okEnd 就点「开下一件」→ 看到 HTTP 400 · NEXT_RUN_BEFORE_DONE</li>
        </ol>
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
          <div className="text-xs text-gray-800">
            上一件到 okEnd = 这件任务运行到终态 = 业务已结束 = 新业务 = 新 runId。挂 parentRunId 只读上一件检查点，不会复活上一件。这是 session 内「默认新业务 = 新 runId」的最小实现。
          </div>
          <div className="text-xs text-gray-600">
            怎么观察：右栏新 runId 与左栏不同；右栏 state 从零；parentRunId = 左栏 runId；上一件文件路径里的 writtenAt 仍是之前的时刻。
          </div>
        </div>
      </section>
    );
  }
  if (page === "memory-vs-disk") {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示：<b>对照「只放 Map（in-memory）」vs「真写磁盘」</b>（变体 B）。同进程下两侧独立请求，模拟 LangGraph `MemorySaver`（杀进程即丢）和真持久化（杀进程还在）。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>分别点「开这件」→ 左侧生成 runId（只放内存），右侧生成 runId（待写盘）</li>
          <li>左点「走一步（不写磁盘）」→ POST /api/run/step-in-memory；右点「走一步（写磁盘）」→ POST /api/run/step</li>
          <li>点「读一次内存状态」→ GET /api/run/memory/:runId，看两侧 inMemory / 磁盘上是否有检查点</li>
          <li>两侧都点「清空内存」→ 同进程模拟「进程没了」：左 inMemory=false + 磁盘**没**有文件；右 inMemory=false + 磁盘**有**文件</li>
        </ol>
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
          <div className="text-xs text-gray-800">
            同进程下「只放 Map」和「真写磁盘」的差别：清空内存后，左侧丢、右侧还能 resume。这就是为什么必须把状态写到进程外面。LangGraph 的 `MemorySaver` 名字带 Memory，杀进程一样丢——它**不是**持久恢复。
          </div>
          <div className="text-xs text-gray-600">
            怎么观察：左侧「磁盘上是否还有检查点 = 没有」；右侧「磁盘上是否还有检查点 = 有」。左侧下一步走一步会失败（RUN_NOT_FOUND）；右侧下一步能走（resume 后）。
          </div>
        </div>
      </section>
    );
  }
  return (
    <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
      <p className="text-sm text-gray-700">
        本页是 step-2 总览。这一步只演示两个新教学点:<b>终态开新业务</b> + <b>内存 vs 磁盘对照</b>。其他 step-1 已经演示过的内容(写入检查点 / 不可序列化 / 从磁盘恢复 / 扣款后还没写成 / 两单编号隔离 / 快照历史)请回 step-1 看。
      </p>
      <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
        <li>step-1 在端口 50121；本页在端口 50122。两套独立 demo、各自的 data/ 和 logs/</li>
        <li>本 step 的两个新能力都用了 step-1 同一张图与同一套存档器，但多了两个新端点</li>
      </ol>
      <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
        <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
        <div className="text-xs text-gray-800">
          step-2 是「加深」——保留 step-1 锁住的「最佳表达」，新能力放在自己目录下(端口 50122,data/ 从零起步)。这是「每加深一次开一个新 step-2」的已知成本:跨 step 的代码不复用，但各 step 内部质量独立。
        </div>
        <div className="text-xs text-gray-600">
          怎么观察:从下面按钮进两个新 page，按「开第一件 → 走到底 → 开下一件」走一遍 next-run；按「左右开件 → 各走一步 → 都 forget」走一遍 memory-vs-disk。
        </div>
      </div>
    </section>
  );
}

window.DemoUI.PageIntro = PageIntro;
