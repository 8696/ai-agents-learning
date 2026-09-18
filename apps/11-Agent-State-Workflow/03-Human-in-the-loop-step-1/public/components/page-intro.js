/**
 * 职责：本页说明、数据流步骤、核心教学点卡片（针对通过闭环 + 改参数闭环）。
 * 数据流：无入参；写死本步文案。
 * 为什么单独成文件：说明区不堆进 index.html 内联块。
 *
 * 覆盖场景：approve 页「提议 → 改参数（可选） → 通过」三步；reject / read 各自的内联 Intro 不复用本文件。
 */
window.DemoUI = window.DemoUI || {};

function PageIntro() {
  return (
    <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
      <p className="text-sm text-gray-700">
        本页只演示：<b>提议 → （改参数） → 通过</b>三步。点「发起转账提议」之后，假账本余额不变、扣款函数调用次数仍是 0。点「通过」之后，余额才按 pending.args 当前那份（可能是改过的）减少，次数才变成 1。
      </p>
      <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
        <li>页面加载时 GET /api/snapshot，看见初始余额 10000、待审批为空。</li>
        <li>点「发起转账提议」→ POST /api/propose。服务端写入待审批（pending approval），<b>不</b>调用扣款函数。</li>
        <li>看输出区：收款人 / 金额摊开在待审批卡；余额仍是 10000；扣款函数调用次数（transferCallCount）仍是 0。</li>
        <li>可选：点「保存修改（改参数）」→ POST /api/edit。<b>改参数 ≠ 批准</b>：pending.status 仍是 waiting，executeTransfer 不进；只有 pending.args 改了。改完 pending 卡片自动刷新成新值。</li>
        <li>点「通过」→ POST /api/approve。这时才调用 executeTransfer，按 pending.args 当前那份扣款。改过的 5000 → 500 也按 500 扣；改过的收款人也按改过的扣。</li>
        <li>本页不做拒绝、杀进程再批、超时。拒绝走 reject 页；查余额走 readonly 页。</li>
      </ol>
      <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
        <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
        <div className="text-xs text-gray-800">
          人机回圈（Human-in-the-loop）不是页面弹窗，是调度器走进等待节点时<b>还没有</b>调用有副作用的工具。请求已经提出 ≠ 已经执行；<b>改参数 ≠ 批准</b>。改数字和盖章是两下——改了没盖章，出纳不能付款。
        </div>
        <div className="text-xs text-gray-600">
          怎么观察：提议之后看「扣款函数调用次数」仍是 0、余额未变；改参数之后 pending.status 仍是 waiting、调用次数仍 0、只是 pending.args 变了；通过之后次数变成 1、余额按 pending.args 当前那份减少。如果改参数那一下次数就已经是 1，那是改参数顺手批准，不是这一节。
        </div>
      </div>
    </section>
  );
}

window.DemoUI.PageIntro = PageIntro;
