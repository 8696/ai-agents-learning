/**
 * 职责：页头状态、教学说明（含本页核心教学点卡片）、页脚环境元信息。
 * 数据流：GET /health → EnvFooter；请求状态 → StatusPill。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  // StatusPill 四态：⏸待连接 / 🔄请求中 / ✅完成 / ❌错误。颜色语义固定。
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

  // PageIntro：本页只演示第 3 关「把关」的最后一刀——敏感信息过滤（个人身份信息 PII / 合规）。
  // 数据流 4 步：写原文 + 调阈值/维度开关 → 调 /api/filter-dimensions → 五道闸门顺序判定
  //              → 「通过 / 置信度拦下 / PII 拦下 / 维度 A 拦下 / 维度 B 拦下 / 维度 C 拦下」六栏原样上页。
  DemoUI.PageIntro = function PageIntro() {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示写入策略八关里的第三关「把关（Filtering）」的最后一刀——
          <b>敏感信息过滤（个人身份信息 PII / 合规）</b>。在 step-4 的维度 A / B / C 之上，再加一道：
          <b>isPii（这条事实是不是「千真万确的长期事实但不该存」一类）</b>。
          这道闸门合并进现有那一次模型调用，不多发一次网络请求。
          把关这一关剩的最后一把刀「人工确认」留到 step-(N+1) 承接。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>在输入框写一段对话原文（或点下面的例句按钮），把阈值滑块调好，选好四个维度开关（A / B / C / PII，默认都开）。</li>
          <li>点「提取并把关」按钮，浏览器 POST /api/filter-dimensions，body 带 text + threshold + enableA / enableB / enableC / enablePii。</li>
          <li>服务端走五道闸门：① extractFacts 抽 0~N 条候选 → ② filterByConfidence 按阈值筛（达不到标 BELOW_THRESHOLD）→ ③ filterByContentDimensions 让模型给过置信度的候选**一次性判四道标签**（isFact + isCrossSession + isStorageWorth + isPii + piiType + reasoning）；任一不过标 PROGRAMMATIC_RULE / SESSION_ONLY / PUBLIC_KNOWLEDGE / PII_DETECTED。</li>
          <li>页面把每条候选按它被哪一道闸门拦下分六栏：绿 = 通过、黄 = 置信度拦下、玫红 = PII 拦下、橙 = 维度 A 拦下、红 = 维度 B 拦下、紫 = 维度 C 拦下。</li>
        </ol>
        <div
          id="core-takeaway"
          className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2"
        >
          <p className="text-sm font-semibold text-yellow-900">本页核心教学点</p>
          <ol className="text-sm text-yellow-900 list-decimal pl-5 space-y-1">
            <li>
              <span className="font-medium">PII 拦的是「千真万确的长期事实但不该存」</span>：
              「我有糖尿病」技术上能跨会话、不是全员规则、不是公开常识，维度 A / B / C 都会放行——必须靠 PII 这一道才能拦住。
              「身份证号 110101199001011234」同理。这种不是「提取错了 / 模型没说准」，是「用户亲口说的真话、但合规要求不该留」。
            </li>
            <li>
              <span className="font-medium">PII 这一刀合并进现有那次模型调用，不多发请求</span>：
              笔记 §9 原设计是「代码做」（合规确定性），但维护正则 / 关键词清单成本高、漏判风险大；
              step-5 折中：让模型在同一次 judgment 里加一个 isPii 标签 + piiType 字段，0 额外网络调用、token 多 ~200，但语义理解比关键词准。
              代价：合规风险仍存在（模型可能漏判），所以**同时**让模型在 reasoning 字段里明确说明属于哪一类 PII（身份证 / 银行卡 / 健康 / 宗教 / 地址）。
            </li>
            <li>
              <span className="font-medium">PII 优先级最高（PII > A > B > C），跟其它三道不冲突</span>：
              维度 A / B / C 都是判断「这条该不该进用户个人库」，但 PII 是「该不该存在这个系统」——后者的合规风险比前者大。
              所以 PII 不过直接拦下，reasoning 必须写明 PII 类型；其它三道是否同时不过不再细查（避免合规模糊）。
            </li>
            <li>
              <span className="font-medium">二次精炼/合规兜底留给生产实践</span>：
              本步只演示「模型判 PII」一种方式。生产系统通常**双轨**——模型判（粗筛）+ 关键词清单（兜底），同时配合用户主动撤回 / 审计日志 / 数据脱敏存储；这些是 step-(N+1) 以后的事。
            </li>
          </ol>
        </div>
      </section>
    );
  };

  // EnvFooter：端口 fallback 50108；协议 A + provider + model + 密钥（apps/.env）。
  DemoUI.EnvFooter = function EnvFooter(props) {
    const env = props.env || {};
    const port = env.port || 50108;
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
