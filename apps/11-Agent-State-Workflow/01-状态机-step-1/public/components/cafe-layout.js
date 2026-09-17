/**
 * 职责：咖啡店各页的页头状态条、本页说明、页脚环境信息。
 * 数据流：App 传入 status / env / page；页脚 fallback 端口 50117，真值来自 GET /health。
 * 为什么单独成文件：各页说明不同，不把长文案堆进每个 HTML。
 */
window.DemoUI = window.DemoUI || {};

function StatusPill(props) {
  const map = {
    idle: { cls: "bg-gray-200 text-gray-700", text: "⏸ 待连接" },
    loading: { cls: "bg-blue-100 text-blue-800", text: "🔄 请求中" },
    ok: { cls: "bg-green-100 text-green-800", text: "✅ 完成" },
    error: { cls: "bg-red-100 text-red-800", text: "❌ 错误" },
  };
  const view = map[props.status] || map.idle;
  return (
    <span id="status-pill" className={"text-xs px-2 py-1 rounded " + view.cls}>
      {view.text}
    </span>
  );
}

function ObjectsIntro() {
  return (
    <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
      <p className="text-sm text-gray-700">
        本页对着这一杯咖啡，把<b>七个核心对象</b>点开看。图上已经有分叉和回边；这一页先认对象，邻页再专门走那两条路。
      </p>
      <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
        <li>下单「热拿铁」→ POST /api/cafe/start → 订单停在点单，还没跑第一站</li>
        <li>点对象名：状态 / 节点 / 边 / 条件路由 / 状态转移 / 图 / 调度器；一边是这份订单的字段，一边是伪代码</li>
        <li>点「走一步」→ POST /api/cafe/step → 只转移一次；节点写出业务字段，当前节点由调度器写</li>
      </ol>
      <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
        <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
        <div className="text-xs text-gray-800">
          七个对象不是七张空卡片。点开就能看见这一杯的真实字段：状态（State）是整份事实，节点（Node）只写业务字段，边（Edge）是允许走的路，条件路由（Conditional Routing）读字段挑一条，状态转移（State Transition）是 from→to 加上读/写差，图（Graph）是交通图，调度器（Scheduler）才改 currentNode。
        </div>
        <div className="text-xs text-gray-600">
          怎么观察：下单后 State 里只有 drinkName 有值；走一步后点「节点」看写了 orderSlip / drinkType，点「调度器」看四行里谁写下了当前节点。
        </div>
      </div>
    </section>
  );
}

function RoutingIntro() {
  return (
    <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
      <p className="text-sm text-gray-700">
        本页只演示：<b>同一张图</b>，State 里的 drinkType 变了，路径就变了。热走热饮制作，冰走冰饮制作，菜单没有的走进失败终止。漏网必须有边。
      </p>
      <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
        <li>点「图 / 边」：点单站有三条出边，条件读 drinkType</li>
        <li>分别下单「热拿铁」「冰美式」「抹茶」，各自请求、各自走一步，对照三条路径</li>
        <li>抹茶会写出 drinkType = unknown，走进 failEnd，不会默认送去热饮机</li>
      </ol>
      <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
        <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
        <div className="text-xs text-gray-800">
          条件路由（Conditional Routing）读的是 State 字段，不是再问一遍人。图没变、路径变了。互斥且穷尽：hot / iced / unknown 各有一条边，不能让 next 为空。
        </div>
        <div className="text-xs text-gray-600">
          怎么观察：三杯走完后，路径对照里 drinkType 分别是 hot / iced / unknown；未知那杯的 currentNode 停在 failEnd。
        </div>
      </div>
    </section>
  );
}

function LoopIntro() {
  return (
    <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
      <p className="text-sm text-gray-700">
        本页只演示：<b>图上有回到同一站的边</b>。做坏的热拿铁第 1、2 次制作失败，路由 return 同一座热饮制作；第 3 次仍空，走进失败终止。次数写在 retryCount 里，不是再开一轮 Agent 循环。
      </p>
      <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
        <li>点「图 / 边」：热饮制作有三条出边——杯盖有值走出餐、次数未满回到本站、满 3 次走失败终止</li>
        <li>左边填入「做坏的热拿铁」，下单后连点「走一步」：点单 → 制作 → 制作 → 制作 → 无法制作</li>
        <li>每一次回到制作站，条件路由读到的 retryCount 会 +1，函数 return 仍是 brewHot</li>
        <li>再点一杯下普通「热拿铁」：第一次制作就写出杯盖，走出餐。对照两条路径</li>
      </ol>
      <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
        <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
        <div className="text-xs text-gray-800">
          循环回边（Cycle）画在图上，退出条件写在状态里的重试次数（retryCount）。空结果再做一次，是业务站点再进一次，不是模块 07 再转一圈 Agent 循环。满 3 次必须有事先画的失败边，否则会空转。
        </div>
        <div className="text-xs text-gray-600">
          怎么观察：做坏的热拿铁路径里 brewHot 连续出现三次，retryCount 从 1 到 3，最后 currentNode 是 failEnd。普通热拿铁一次制作就出餐。
        </div>
      </div>
    </section>
  );
}

function IllegalIntro() {
  return (
    <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
      <p className="text-sm text-gray-700">
        本页只演示：<b>非法转移（Illegal Transition）</b>。点单之后合法下一站只有热饮制作 / 冰饮制作 / 无法制作。若有人把当前节点直接改成「出餐」，调度器对边表验一次，拦住，写入 lastError，走进失败终止。HTTP 仍是 200，不是把图摔成 5xx。
      </p>
      <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
        <li>下单「热拿铁」，点「走一步」：点单 → 热饮制作。这是边表里有的路</li>
        <li>再点一杯，点「故意走到出餐」：请求带 forceIllegalNext=serve。serve 不在 takeOrder 的出边名单里</li>
        <li>看状态：currentNode 变成 failEnd，lastError 写明拦住的原因；对照「演示后端 5xx」那个才是图外摔死</li>
        <li>点「调度器」：③ 验边是拦住，不是通过</li>
      </ol>
      <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
        <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
        <div className="text-xs text-gray-800">
          条件路由是从已经画过的边里挑一条。非法转移是下一站根本不在出边名单里。节点函数不得自己改 currentNode；调度器丢掉这份字段，再验边。拦住之后图还在，当前节点和 State 全文都看得见。
        </div>
        <div className="text-xs text-gray-600">
          怎么观察：合法那杯路径经过 brewHot；故意跳的那杯是 takeOrder → failEnd，请求参数里有 forceIllegalNext，响应 ok: true，不是 500。
        </div>
      </div>
    </section>
  );
}

function NodeFailIntro() {
  return (
    <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
      <p className="text-sm text-gray-700">
        本页只演示：<b>节点失败走边（Node Failure as Edge）</b>。热饮机制作时挂了，节点写出 lastError，不把错误摔出图。路由读到这份错误，走事先画的失败边。这不是循环回边：retryCount 不加，也不回到制作站。
      </p>
      <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
        <li>下单「热饮机坏了」，连点走一步：点单 → 热饮制作 → 无法制作。retryCount 仍是 0</li>
        <li>点「条件路由」：return 是 failEnd，条件读 lastError，不是 retryCount</li>
        <li>再点一杯「做坏的热拿铁」：空杯会回到本站，retryCount 往上加。两杯各自请求对照</li>
        <li>「演示后端 5xx」才是图外摔死；本页失败路径 HTTP 仍是 200</li>
      </ol>
      <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
        <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
        <div className="text-xs text-gray-800">
          空结果再做一次是业务回边。这一站执行失败则写 lastError 走失败边，图还在，当前节点和 State 全文都看得见。不要用「再试三次」去吞掉「机器挂了」，也不要把图摔成一次 5xx。
        </div>
        <div className="text-xs text-gray-600">
          怎么观察：机器故障那杯路径是 takeOrder → brewHot → failEnd，retryCount=0；做坏那杯 brewHot 会重复出现，retryCount 到 3。
        </div>
      </div>
    </section>
  );
}

function ParallelIntro() {
  return (
    <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
      <p className="text-sm text-gray-700">
        本页只演示：<b>图上的并行分叉再汇合（Parallel Fan-out / Join）</b>。点完单之后，出浓缩和打奶没有互相依赖，可以同时做。两边都把字段写回同一份状态（State），才去组装。这不是模块 07 同一圈多个工具调用。
      </p>
      <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
        <li>下单「热拿铁」，连点走一步：点单 → 分流 → 组装 → 完成。分流那一步 shotReady 和 milkReady 一起出现</li>
        <li>点「调度器」：看两份补丁怎么合并。合得对时两字段都在</li>
        <li>再点一杯「合错的拿铁」：两臂 return 里带着另一臂的空字段，后合并的把浓缩盖掉，走进失败终止</li>
        <li>点单不能和打奶并行：打奶要读订单条，那时候还是空的</li>
      </ol>
      <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
        <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
        <div className="text-xs text-gray-800">
          节点只 return 自己改的字段，调度器合并。谁 return 整份旧对象，后结束的那份就会把别人刚写的盖掉。有数据依赖的两站必须画成先后，不能画成并行。
        </div>
        <div className="text-xs text-gray-600">
          怎么观察：合得对的路径是 takeOrder → fork → assemble → okEnd；合错的是 takeOrder → fork → failEnd，lastError 写明字段被盖掉。
        </div>
      </div>
    </section>
  );
}

function PageIntro(props) {
  if (props.page === "objects") return <ObjectsIntro />;
  if (props.page === "routing") return <RoutingIntro />;
  if (props.page === "illegal") return <IllegalIntro />;
  if (props.page === "nodeFail") return <NodeFailIntro />;
  if (props.page === "parallel") return <ParallelIntro />;
  return <LoopIntro />;
}

function EnvFooter(props) {
  const env = props.env;
  const port = (env && env.port) || 50117;
  let text = "端口 " + port + " · 本地计算 · 不调 LLM · （待连接）";
  if (env) {
    const keyText = env.hasKey
      ? "密钥 ✅"
      : "密钥 ❌（apps/.env 未配置该家 Key）";
    text =
      "端口 " +
      port +
      " · 本地计算 · 不调 LLM · 模型服务商 " +
      (env.provider || "—") +
      " · 模型 " +
      (env.model || "—") +
      " · " +
      keyText;
  }
  return (
    <footer id="page-footer" className="border-t p-2 text-xs text-gray-500 text-center">
      <span id="env-info">{text}</span>
    </footer>
  );
}

window.DemoUI.StatusPill = StatusPill;
window.DemoUI.PageIntro = PageIntro;
window.DemoUI.EnvFooter = EnvFooter;
