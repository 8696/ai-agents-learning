/**
 * 职责：step-3 自己的本页说明和核心教学点卡片。
 * 数据流：App 传入 page（pure-vs-sideeffect / half-written / overview）。
 * 为什么单独成文件：各页教学文案不同，不堆进 layout.js。
 */
window.DemoUI = window.DemoUI || {};

function PageIntro(props) {
  const page = props.page;
  if (page === "pure-vs-sideeffect") {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示：<b>纯计算节点可重跑，有副作用的扣款节点不可随便重跑</b>（变体 M）。两侧独立请求：左跑识别饮品的纯计算路径，右跑到 chargeCard 中途故意用「扣款成功但检查点没写」模拟被杀。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>左:开件 → 走一步到 brewHot → 清空内存 → 从磁盘恢复 → 再走一步。drinkType 不变，余额不变，支付渠道账本不动</li>
          <li>右:开件 → 走一步到 brewHot → 「模拟：杀在 chargeCard 中途」→ 清空内存 → 从磁盘恢复 → 再走一步。chargeCard 节点再进一次，支付渠道调用次数 +1，但真实扣款次数仍是 1</li>
          <li>对照两侧:左无对外副作用计数；右靠工具自身幂等挡住第二次扣款</li>
        </ol>
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
          <div className="text-xs text-gray-800">
            识别饮品、算价格、拼提示词这些纯计算节点重跑结果应一致，「钱扣了但文件还没写完」那种时机对它们不可怕。扣款、发短信、改库存、创建工单这些有副作用节点重跑会造成第二份事实。把所有节点都当成可重跑等于把咖啡店当成纯函数——生产里不是。
          </div>
          <div className="text-xs text-gray-600">
            怎么观察:左识别饮品的 drinkType 在 forget + resume + 再走一步后跟之前一致；右支付渠道 callCount 增加、deductionCount 仍是 1、lastHitIdempotency = true。
          </div>
        </div>
      </section>
    );
  }
  if (page === "half-written") {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示：<b>主文件被截断后，readCheckpoint 退回上一份完整历史副本</b>（变体 I · 第四种时机）。写检查点时打开 keepHistory，主文件 + 步骤副本各自独立；主文件 parse 失败时不拿去跑路由。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>开件 → 走一步(打开历史) → 磁盘上有 1 份完整历史副本 step-0000.json</li>
          <li>再走一步 → 磁盘上有 step-0000.json + step-0001.json + 主文件</li>
          <li>「故意写半份」→ POST /api/run/write-half:把主文件截掉一半</li>
          <li>读 history → 主文件标红「损坏」，历史副本都完整</li>
          <li>读最新检查点 → 主文件 parse 失败，按编号降序回退到 step-0001.json</li>
        </ol>
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
          <div className="text-xs text-gray-800">
            写入不是瞬间完成。进程可以在 write 到一半时被杀掉。读到半份 JSON、缺字段、文件长度为 0，必须当成「这次写入不存在」退回上一份完整。readCheckpoint 主文件 parse 失败时按编号降序回退到 step-NNNN.json——损坏文件不能拿去跑路由。
          </div>
          <div className="text-xs text-gray-600">
            怎么观察:故意写半份之后 history 表格里主文件那行变红 + 显示「JSON.parse 失败」;读最新检查点时返回 fellBackTo = step-0001.json 这样的字段名,证明确实是从历史副本回退的。
          </div>
        </div>
      </section>
    );
  }
  return (
    <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
      <p className="text-sm text-gray-700">
        本页是 step-3 总览。这一步只演示两个新教学点:<b>纯计算 vs 扣款对照</b> + <b>半份文件退回</b>。其他 step-1 / step-2 已经演示过的内容(写入检查点 / 不可序列化 / 磁盘恢复 / 扣款不写 / 两单编号隔离 / 快照历史 / 终态开新业务 / 内存 vs 磁盘)请回 50121 / 50122 看。
      </p>
      <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
        <li>step-1 在端口 50121；step-2 在端口 50122；本页在端口 50123。三套独立 demo、各自的 data/ 和 logs/</li>
        <li>本 step 改造了 readCheckpoint:主文件 parse 失败时按编号降序回退到 step-NNNN.json（变体 I · 第四种时机）</li>
        <li>新加 /api/run/write-half:故意截断主文件,模拟写到一半断电</li>
      </ol>
      <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
        <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
        <div className="text-xs text-gray-800">
          step-3 是「加深」——保留 step-1 / step-2 锁住的「最佳表达」,新能力放在自己目录下(端口 50123,data/ 从零起步)。readCheckpoint 升级是本批最关键的改动:让「写到一半断电」这一种时机从「无解」变成「自动退回上一份完整」。
        </div>
        <div className="text-xs text-gray-600">
          怎么观察:从下面按钮进两个新 page;按「左走两步 forget resume 再走一步、右走两步 后 charge-crash forget resume 再走一步」走一遍 pure-vs-sideeffect;按「开件 走两步 故意写半份 读 history 读最新检查点」走一遍 half-written。
        </div>
      </div>
    </section>
  );
}

window.DemoUI.PageIntro = PageIntro;
