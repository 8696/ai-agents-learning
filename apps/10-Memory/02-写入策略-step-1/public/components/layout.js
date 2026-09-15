/**
 * 职责：页头状态、教学说明、页脚环境元信息。
 * 数据流：GET /health → EnvFooter；请求状态 → StatusPill。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  DemoUI.StatusPill = function StatusPill(props) {
    const map = {
      idle: { text: "⏸待连接", cls: "bg-gray-200 text-gray-700" },
      loading: { text: "🔄请求中", cls: "bg-blue-100 text-blue-800" },
      ok: { text: "✅完成", cls: "bg-green-100 text-green-800" },
      error: { text: "❌错误", cls: "bg-red-100 text-red-800" },
    };
    const item = map[props.status] || map.idle;
    return (
      <span id="status-pill" className={"text-xs px-2 py-1 rounded " + item.cls}>
        {item.text}
      </span>
    );
  };

  DemoUI.PageIntro = function PageIntro() {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示写入策略八关里的第二关「提取（Extraction）」：给一段对话原文，调大模型抽出 0 到 N 条结构化候选事实，每条带六个字段（键 key / 事实正文 value / 记忆类型 type / 置信度 confidence / 来源 source / 有效期 validUntil）。把关、去重、冲突、过期这几关是下一步要加的能力，本步先把「一段原文怎么变成几条候选」这件事看清楚。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>在输入框写一段对话原文（或点下面的例句按钮），点「提取候选事实」。</li>
          <li>浏览器 POST /api/extract，服务端把「提取规则 + 今天的日期」拼进 system，把这段原文当 user 消息。</li>
          <li>用协议 A（JSON Mode）调一次对话补全，模型只输出一个含 candidates 数组的 JSON 对象。</li>
          <li>页面把「模型实际收到的请求」和「模型实际返回的响应」原样贴出来，再把 candidates 逐条画成卡片。</li>
          <li>「你好」这类纯寒暄会抽出 0 条候选，页面会用文字明确说明这是正常结果，不是出错了。</li>
          <li>空原文会得到 4xx；「演示后端 5xx」按钮走另一条失败通道。</li>
        </ol>
        <div
          id="core-takeaway"
          className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2"
        >
          <p className="text-sm font-semibold text-yellow-900">本页核心教学点</p>
          <ol className="text-sm text-yellow-900 list-decimal pl-5 space-y-1">
            <li>
              <span className="font-medium">提取的返回类型必须是数组，且必须允许长度为 0</span>：
              「你好」抽不出候选是正常结果，不该报错也不该硬塞一条进去——写死「返回一条事实」的接口，
              第一天就会被寒暄打穿。
            </li>
            <li>
              <span className="font-medium">同一段原文可以同时产出语义记忆和情景记忆两类</span>，
              不是二选一：语义记忆脱离场景仍成立（技术栈、城市），情景记忆带时间和场景（今天讨论了什么）。
            </li>
            <li>
              <span className="font-medium">键（key）是覆盖更新的锚点</span>：没有稳定的 key，
              下一步「冲突与更新」就无从谈起——同一件事第一次叫 framework、第二次叫 tech_stack，
              系统眼里就是两条无关的记录，覆盖代码写得再对也白搭。
            </li>
            <li>
              <span className="font-medium">相对时间必须靠「给模型当前日期」才能算对</span>：
              有效期字段（validUntil）经常是「下周三」这类相对时间，system 提示词里把今天的日期
              （todayBjt）传进去，模型才能换算成具体日期，不然只能瞎猜。
            </li>
          </ol>
        </div>
      </section>
    );
  };

  DemoUI.EnvFooter = function EnvFooter(props) {
    const env = props.env || {};
    const port = env.port || 50104;
    const hasKey = Boolean(env.hasKey);
    const providerLabel = env.provider ? String(env.provider) : "（待连接）";
    const modelLabel = env.model ? String(env.model) : "（待连接）";
    return (
      <footer id="page-footer" className="border-t p-2 text-xs text-gray-500 text-center">
        <span id="env-info">
          端口 {port} · 协议 A（openai Chat Completions） · 模型服务商 {providerLabel} · 模型 {modelLabel} · 密钥{" "}
          {hasKey ? "✅" : "❌（apps/.env 未配置该家密钥）"}
        </span>
      </footer>
    );
  };
})();
