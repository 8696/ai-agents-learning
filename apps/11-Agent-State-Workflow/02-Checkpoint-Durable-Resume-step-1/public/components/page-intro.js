/**
 * 职责：五页各自的本页说明和核心教学点卡片。
 * 数据流：App 传入 page（overview / checkpoint / serialize / resume / charge-crash）。
 * 为什么单独成文件：各页教学文案不同，不堆进 layout.js。
 */
window.DemoUI = window.DemoUI || {};

function PageIntro(props) {
  const page = props.page;
  if (page === "checkpoint") {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示：<b>每走完一步就把状态（State）写成磁盘上的检查点（Checkpoint）</b>。图是点单 → 扣会员卡 → 热饮/冰饮制作 → 发取餐短信 → 出餐。摊开的是从磁盘读回来的同一份 JSON。不调大模型（LLM）。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>点「开始这件任务运行」→ POST /api/run/start。磁盘上还没有文件</li>
          <li>反复点「走一步」→ POST /api/run/step。每次覆盖写入同一份文件</li>
          <li>「从磁盘再读一次」→ GET /api/checkpoint/:runId，不走图，只读文件。走一步之前去读应看到 HTTP 404</li>
        </ol>
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
          <div className="text-xs text-gray-800">
            检查点是离开进程的快照。同一件任务运行共用一个文件，每走一步覆盖成最新完整份。走完一步之后，当前节点（currentNode）停在下一站，下一站还没开始跑。
          </div>
          <div className="text-xs text-gray-600">
            怎么观察：走一步之前读文件是 HTTP 404；每走一步后看 currentNode、余额是不是刚写进去的那一版。
          </div>
        </div>
      </section>
    );
  }
  if (page === "serialize") {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示：<b>不能序列化（Serialization）的值不能假装写入成功</b>。函数会被
          JSON.stringify 丢掉；Map 会变成空对象；Date 会变成字符串。存档器看见类型变了，就拒绝调用 writeCheckpoint。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>开始并走一步 → POST /api/run/step。左侧出现一份合法 JSON</li>
          <li>点「故意塞函数再写入」→ POST /api/run/serialize-dirty，kind=function。函数字段消失，文件不被覆盖</li>
          <li>点「故意塞 Map 再写入」→ 同一 URL，kind=map。completedNodes 变成空对象</li>
          <li>点「故意塞 Date 再写入」→ 同一 URL，kind=date。Date 变成字符串，看起来成功其实类型走样</li>
        </ol>
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
          <div className="text-xs text-gray-800">
            stringify 不报错 ≠ 检查点写对了。函数和 Map 会丢数据；Date 会丢类型。对照两侧必须是两次独立请求：合法走一步是 POST /api/run/step，脏类型是 POST /api/run/serialize-dirty。
          </div>
          <div className="text-xs text-gray-600">
            怎么观察：右侧 accepted = false、wroteToDisk = false；左侧磁盘 JSON 的 currentNode 仍是刚才那一站。
          </div>
        </div>
      </section>
    );
  }
  if (page === "resume") {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示：<b>持久恢复（Durable Resume）</b>——内存空了之后，按任务运行编号（runId）从磁盘读回检查点，从当时那一站继续，而不是从点单（takeOrder）重新开始。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>开始后连点「走一步」至少两次，让磁盘上有一份完整快照</li>
          <li>点「清空服务端内存」→ POST /api/run/forget。文件还在，内存表空了</li>
          <li>这时点「走一步」应看到 HTTP 400。再点「从磁盘恢复到内存」→ POST /api/run/resume</li>
          <li>再走一步：当前节点应接着走，不是回到点单站</li>
        </ol>
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
          <div className="text-xs text-gray-800">
            只把状态类型写对，杀进程后照样没了。持久恢复靠磁盘上那份完整快照。加载回来的 currentNode 是停住的那一站。
          </div>
          <div className="text-xs text-gray-600">
            怎么观察：清空内存后走一步失败；恢复后 currentNode 不是 takeOrder。
          </div>
        </div>
      </section>
    );
  }
  if (page === "charge-crash") {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示：<b>扣款已经成功，完整检查点还没写到磁盘</b>。恢复之后调度器会再进扣会员卡（chargeCard）；支付渠道靠幂等（Idempotency）让余额只少一次。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>开始后只走一步，停在扣会员卡。磁盘上此时还没有「已扣过」的痕迹</li>
          <li>点「模拟：扣款成功但检查点还没写到磁盘」→ POST /api/run/charge-crash</li>
          <li>点「从磁盘恢复到内存」。当前节点仍是 chargeCard</li>
          <li>再走一步：渠道调用次数变成 2，真实扣款次数仍是 1，最近一次命中幂等</li>
        </ol>
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
          <div className="text-xs text-gray-800">
            调度器跳过已经做过的，挡不住「钱扣了、检查点还没写成」这一格。这一格只能靠工具自身幂等：同一幂等键第二次进来，真实扣款次数仍是 1。
          </div>
          <div className="text-xs text-gray-600">
            怎么观察：模拟之后磁盘 chargedAmount 仍是 0；再走一步后 deductionCount = 1、余额是 32 不是 14。
          </div>
        </div>
      </section>
    );
  }
  if (page === "two-orders") {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示：<b>两件任务运行用两个 runId，互不覆盖</b>。左边张三的拿铁、右边李四的美式，分别 start 一次、分别走一步。两份检查点落在两个文件里；用错编号加载会拿到别人的快照。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>分别点「开这件」→ POST /api/run/start（左侧）和 POST /api/run/second（右侧），得到两个 runId</li>
          <li>分别点「走一步」→ POST /api/run/step。看两侧的 currentNode / 余额 / 文件路径</li>
          <li>试着把左边的 runId 填到右边的恢复请求里——不演示，但代码层面读到的将是张三的快照</li>
        </ol>
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
          <div className="text-xs text-gray-800">
            检查点的主键是 runId（LangGraph 对照词是 thread_id）。它标识一件任务运行，不是用户、不是 session、不是 HTTP 请求 id。张三的拿铁和李四的美式必须用两个编号；恢复时按编号去找文件。
          </div>
          <div className="text-xs text-gray-600">
            怎么观察：左右两个 runId 不同；两个文件路径不同；同一 runId 反复点「走一步」只动自己的状态。
          </div>
        </div>
      </section>
    );
  }
  if (page === "checkpoint-history") {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示：<b>存档器可以留多份历史快照，但引擎只加载最新完整份；不提供真的重放按钮</b>。每走一步额外写一份 step-NNNN.json，给你看「走到这一步时余额是多少」；变体 H 警告写在页面上。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>开始后点「走一步（同时保留历史副本）」→ POST /api/run/step 携带 keepHistory=true。每次多写一份 data/checkpoints/{"{runId}"}/step-NNNN.json</li>
          <li>走至少两步，再点「读一次历史」→ GET /api/checkpoint-list?runId=...</li>
          <li>看表格：每行一份快照，写入时刻、当前节点、已跑完节点数、是否 JSON.parse 成功</li>
        </ol>
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
          <div className="text-xs text-gray-800">
            历史时间线 ≠ 引擎工作状态。调度器恢复时只读最新一份完整快照，不按 history 顺序再跑。重放（Replay）会把 chargeCard 节点再进一次，支付渠道的调用次数会再加 1——所以本页不提供真重放按钮。
          </div>
          <div className="text-xs text-gray-600">
            怎么观察：表格里 step-0000 / step-0001 / ... 按时序列；最后一行是最新；变体 H 警告卡把「为什么没有一键重放」写明白。
          </div>
        </div>
      </section>
    );
  }
  return (
    <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
      <p className="text-sm text-gray-700">
        本页只演示：<b>这一小节四件事怎么连在一起</b>。同一套咖啡店图、同一个端口，用上面的导航进四页。不调大模型（LLM）。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>「写入检查点」：每走一步覆盖写入同一份 JSON，先看见文件</li>
          <li>「不可序列化」：函数 / Map / Date 不能静默当写入成功</li>
          <li>「从磁盘恢复」：清空内存（模拟进程没了）后再加载，从停住的那一站继续</li>
          <li>「扣款后还没写成」：钱已经扣了、检查点还是旧的，恢复会再进扣款节点，靠幂等只扣一次</li>
          <li>「两单编号隔离」：左边张三的拿铁、右边李四的美式，分别 start、分别走一步；两份检查点落两个文件</li>
          <li>「快照历史」：每走一步留一份 step-NNNN.json，表格里看见时间线；变体 H 警告写明「重放会再进扣款节点」</li>
        </ol>
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
          <div className="text-xs text-gray-800">
            杀进程再起来要保证三件事：找得到同一件任务运行；读到的是上一份写完整的快照；已经对外发生的副作用不要再做一次。快照还必须是纯数据——函数和 Map 写不进去。
          </div>
          <div className="text-xs text-gray-600">
            怎么观察：按导航从左到右点完四页。不要在总览页找「走一步」——交互在各分页面。
          </div>
      </div>
    </section>
  );
}

window.DemoUI.PageIntro = PageIntro;
