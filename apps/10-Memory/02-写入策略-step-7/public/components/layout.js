/**
 * 职责：页头状态、教学说明（含本页核心教学点卡片）、页脚环境元信息。
 * 数据流：GET /health → EnvFooter；请求状态 → StatusPill。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  // StatusPill 四态：⏸待连接 / 🔄请求中 / ✅完成 / ❌错误。
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

  // PageIntro：本页只演示第 4 关「去重」的第一步——变体 4-A 字面完全相同 → NOOP。
  DemoUI.PageIntro = function PageIntro() {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示写入策略八关里的第四关「去重（Deduplication）」的第一步——
          <b>变体 4-A 字面完全相同 → NOOP（什么都不做）</b>。在 step-6 的「人工确认」之上，
          用户点 [记住] 后不再直接落盘，而是先按 <code>candidate.key</code> 查事实库（SQLite via <code>better-sqlite3</code>）：
          字面完全相同 → 跳过；同 key 但 value 不同 → 交给冲突（变体 5，留给后续 step）；库里没有 → 写入。
          这是从「过滤」到「真正写」的<b>质变</b>——前面 6 步全是候选在内存里挑挑拣拣，从这一步开始落盘。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>在输入框写一段对话原文，调分档阈值，点「提取并把关」走完整六道闸门，中档候选进「待确认」区。</li>
          <li>点 [记住] → POST /api/confirm action: "remember" 触发后调 <code>dedupByKey(verdict)</code>。</li>
          <li>服务端按 candidate.key 调 kvGet 查事实库（data/facts.db）→ 库里没有 → 调 kvSet 写入；库里同 key + 同 value → NOOP；库里同 key + 不同 value → action="conflict"（变体 5，留给后续）。</li>
          <li>页面顶部「事实库已有 N 条」实时显示；点「查看事实库」按钮 → GET /api/facts 列出所有事实。</li>
          <li>同样的原文再跑一遍 + 同样的分档阈值 → 中档候选再次出现 → 点 [记住] → 这次被识别为 NOOP，事实库条数不变（验证去重生效）。</li>
        </ol>
        <div
          id="core-takeaway"
          className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2"
        >
          <p className="text-sm font-semibold text-yellow-900">本页核心教学点</p>
          <ol className="text-sm text-yellow-900 list-decimal pl-5 space-y-1">
            <li>
              <span className="font-medium">接口层通用 KV 抽象 vs 业务 schema</span>：
              lib/db.ts 导出 <code>kvGet / kvSet / kvDel / kvList</code> 四个函数（§5.3.17 通用 KV 抽象）——接口层不绑业务，业务 schema（key / value / type / confidence / source / validUntil）放在 <code>kvSet</code> 调用的 value JSON 里。
              未来换驱动（同步 → 异步如 node:sqlite / libsql）业务代码零改动，只动 lib/db.ts 一个文件。
            </li>
            <li>
              <span className="font-medium">变体 4-A 是去重 4 种情况里最简单的</span>：
              按 candidate.key 查库 + JSON.stringify 比对 value —— 字面完全相同（key + value 一致）→ NOOP。
              这一刀只做字面去重；同 key 不同值（变体 4-B 交给冲突）、措辞不同意思一样（变体 4-C 嵌入相似度）、包含关系（变体 4-D）都留给后续 step。
            </li>
            <li>
              <span className="font-medium">「从过滤到写」的质变是流水线最重要的一道坎</span>：
              前面 6 步全是候选还在内存里挑挑拣拣（关 ② 提取 + 关 ③ 把关）；这一步（关 ④ 去重）是落盘前的最后一道门。
              关 ⑤ 冲突更新、关 ⑧ 审计与安全都是围绕「已写进库的事实」做的——没有这一步它们都没意义。
            </li>
            <li>
              <span className="font-medium">SQLite 默认进 git（沿用本仓库 logs/ 惯例）</span>：
              data/facts.db 跟 logs/ 一样默认进 git——学习者 clone 后看到的是带种子数据的状态，不是空库。
              重启服务事实库不会清空；重启服务 pendingConfirmation（step-6 内存数组）会清空——这是「演示用」的限制，生产要持久化也归到这一步处理（已持久化到 SQLite）。
            </li>
          </ol>
        </div>
      </section>
    );
  };

  // EnvFooter：端口 fallback 50110；协议 A + provider + model + 密钥（apps/.env）。
  DemoUI.EnvFooter = function EnvFooter(props) {
    const env = props.env || {};
    const port = env.port || 50110;
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