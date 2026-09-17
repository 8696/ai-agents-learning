/**
 * 职责：step-5 自己的本页说明和核心教学点卡片。
 * 数据流：App 传入 page（node-fail / overview）。
 * 为什么单独成文件：各页教学文案不同，不堆进 layout.js。
 */
window.DemoUI = window.DemoUI || {};

function PageIntro(props) {
  const page = props.page;
  if (page === "node-fail") {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示：<b>节点失败 ≠ 进程被杀掉</b>。brewHot 节点函数见 brewFailOnStep 标志，写 lastError、路由沿失败边走 brewFailed。**进程还在**，内存里这件任务运行还在，磁盘上写一份新检查点。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>点「开这件」→ POST /api/run/start，生成 runId</li>
          <li>点「走一步」→ 走到 chargeCard 站（热拿铁会继续往 brewHot 走，再走一步就会触发）</li>
          <li>点「让 brewHot 失败（设标志）」→ POST /api/run/brew-fail 在内存里把 brewFailOnStep 设上，**不**写磁盘</li>
          <li>点「走一步（触发失败）」→ 跑到 brewHot 节点，节点写 lastError、路由沿失败边走 brewFailed，磁盘上写新检查点</li>
          <li>看：currentNode = brewFailed；state.lastError = "brewHot 节点失败：..."；进程**没**死，内存里还在，磁盘上有 brewFailed 站的检查点</li>
        </ol>
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
          <div className="text-xs text-gray-800">
            节点失败时进程还活着，节点函数优雅地写 lastError、路由挑失败边走 brewFailed。**这跟进程被杀掉根本不是同一件事**——进程没了，内存表清空，磁盘上留下最后一份写完整的快照。两种失败模式要分别处理：节点失败画失败边 + 写错误字段；进程没了走恢复 + 跳过 + 工具幂等 + 原子写入。
          </div>
          <div className="text-xs text-gray-600">
            怎么观察：走完触发失败那一步后 currentNode 变 brewFailed、state.lastError 非空；进程仍可继续走一步到 brewFailed 节点的「停」（这个图里 brewFailed 是终止站）。
          </div>
        </div>
      </section>
    );
  }
  return (
    <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
      <p className="text-sm text-gray-700">
        本页是 step-5 总览。这一步只演示一个新教学点:<b>节点失败 ≠ 进程被杀掉</b>。其他 step-1 / step-2 / step-3 / step-4 那几页(端口 50121 / 50122 / 50123 / 50124)不在这里复刻。
      </p>
      <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
        <li>step-1 / step-2 / step-3 / step-4 锁住的「最佳表达」保留;step-5 在 cafe-graph.ts 加 `brewFailed` 失败边 + `lastError` 字段 + `brewFailOnStep` 标志</li>
        <li>新加 POST `/api/run/brew-fail`:在内存里设 brewFailOnStep 标志,不动 currentNode</li>
      </ol>
      <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
        <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
        <div className="text-xs text-gray-800">
          step-5 是「加深」——补完 02 小节缺失的最后一项:易混 13「节点失败 ≠ 进程被杀掉」的独立对照。补完后 02 小节 23 项(§5.4.A 8 项 + §5.4.B 15 项)全部已实现,可在模块 README 02 进度行打钩。
        </div>
        <div className="text-xs text-gray-600">
          怎么观察:从下面按钮进节点失败页,按「开件 → 走一步 → 让 brewHot 失败 → 走一步」走一遍,看 currentNode 变 brewFailed + lastError 非空 + 进程还在。
        </div>
      </div>
    </section>
  );
}

window.DemoUI.PageIntro = PageIntro;
