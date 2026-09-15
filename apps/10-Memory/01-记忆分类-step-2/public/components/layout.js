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
          本页只演示：<b>分类 + 写入 + 重启验证一步到位</b>。给一句用户原话，先调模型判类，再按选项 C
          规则决定落不写入，最后看事实库列表。关掉服务重启后再打开，长期事实还在。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>输入一句话 → 点「分类并写入」（POST /api/classify，persist: true）</li>
          <li>服务端先调大模型判类，再按「工作记忆 / 短期 → 不写；其他 → 写」规则决定落不写入</li>
          <li>写入的事实进 data/facts.json；事实库列表实时刷新（GET /api/facts）</li>
          <li>关掉服务再启动 → 重开本页 → 列表里那条长期事实还在；短期 / 工作记忆从未写入，不会出现</li>
        </ol>
        <div
          id="core-takeaway"
          className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2"
        >
          <p className="text-sm font-semibold text-yellow-900">本页核心教学点</p>
          <ol className="text-sm text-yellow-900 list-decimal pl-5 space-y-1">
            <li>
              <span className="font-medium">「写不写」≠ 模型怎么判</span>：写盘侧要自己再加一道把关，
              工作记忆 / 短期一律不写，哪怕模型把「今天有点累」判成了「长期」。
            </li>
            <li>
              <span className="font-medium">同 key 覆盖是语义记忆「可更新」的最朴素实现</span>：
              key = 用户原话归一化（去前后空格、压连续空白、转小写），同一句话反复出现会被识别成同一事实。
            </li>
            <li>
              <span className="font-medium">重启后还能读到 = 进了真实存储</span>：
              「杀掉进程再起来还在不在」就是短期 vs 长期的判定口径，本步把这条判定口径落到事实库上。
            </li>
          </ol>
        </div>
      </section>
    );
  };

  DemoUI.EnvFooter = function EnvFooter(props) {
    const env = props.env || {};
    const port = env.port || 50101;
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