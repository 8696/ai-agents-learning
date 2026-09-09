/**
 * 职责：共享页头 / 说明 / 页脚。默认口 fallback 50035。
 */
(function () {
  const { useState, useEffect } = React;

  function StatusPill({ status }) {
    const map = {
      idle: { text: "⏸ 待连接", cls: "bg-gray-200 text-gray-700" },
      loading: { text: "🔄 请求中", cls: "bg-blue-100 text-blue-800" },
      ok: { text: "✅ 完成", cls: "bg-green-100 text-green-800" },
      error: { text: "❌ 错误", cls: "bg-red-100 text-red-800" },
    };
    const s = map[status] || map.idle;
    return (
      <span id="status-pill" className={"text-xs px-2 py-1 rounded " + s.cls}>
        {s.text}
      </span>
    );
  }

  function PageIntro() {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示：<strong>变体 2 · create_order 幂等（调 LLM 协议 B）</strong>。
          同一个 <code className="bg-gray-100 px-1 rounded">idempotency_key</code> 调 3 次 <code className="bg-gray-100 px-1 rounded">/api/chat</code> —— 模型发 <code className="bg-gray-100 px-1 rounded">create_order</code> tool_use → 走幂等 cache + 内存 DB → DB 只插 1 行，后两次缓存命中。
          <br />· 客户端生成 key（同一意图同一 key；不同意图不同 key）
          <br />· 服务端 cache（TTL=24h）+ 内存 DB（演示用；生产生产是 DB 唯一索引 + ON CONFLICT）
          <br />· **调 LLM**：前端点按钮 → 3 次 POST /api/chat（每次都走协议 B 两完整轮 + tool_use 回灌）
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>填 items + idempotency_key</li>
          <li>点「同 key 调 3 次」 → 前端 fetch /api/chat × 3（每次都走「LLM 两轮 + create_order 幂等」）</li>
          <li>输出区看：call_1 dbInserted=true · call_2/3 cacheHit=true · 三次 order_id 完全相同</li>
        </ol>
        {/* 核心教学点卡片（§5.3.11.b 强制） */}
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
          <div className="text-xs text-gray-800">幂等(Idempotency)的物理形态:同一 `idempotency_key` 调 N 次,DB 只插 1 行,后 N-1 次缓存命中返同 order_id。客户端按「同一意图同一 key」生成(同一订单 retry 用同 key,不同订单不同 key);服务端 cache(TTL=24h)+ DB 唯一索引 + ON CONFLICT 三层防御——生产里靠 DB 唯一约束兜底,cache 是性能优化。</div>
          <div className="text-xs text-gray-600">怎么观察:同一 idempotency_key 跑 3 次,看输出区:① call_1 的 dbInserted=true(真的写了 DB);② call_2/3 的 cacheHit=true(没碰 DB,直接返 cache);③ 三次 order_id 完全相同——证明「同一 key 同一结果」。换个 key 再跑,看 dbInserted=true 且新 order_id。</div>
        </div>
      </section>
    );
  }

  function EnvFooter() {
    const [env, setEnv] = useState(null);
    const [err, setErr] = useState(null);
    useEffect(() => {
      fetch("/health")
        .then((r) => r.json())
        .then(setEnv)
        .catch((e) => setErr(String(e)));
    }, []);
    const port = (env && env.port) || 50035;
    let text = "端口 " + port + " · 加载中";
    if (err) text = "端口 " + port + " · /health 失败：" + err;
    else if (env) {
      text =
        "端口 " +
        port +
        " · 协议 B · provider " +
        (env.provider || "?") +
        " · model " +
        (env.model || "?") +
        " · Key " +
        (env.hasKey ? "✅" : "❌（主按钮 disabled）") +
        " · 工具 " +
        ((env.tools || []).map((t) => t.name).join("/"));
    }
    return (
      <footer id="page-footer" className="border-t p-2 text-xs text-gray-500 text-center">
        <span id="env-info">{text}</span>
      </footer>
    );
  }

  window.DemoUI = { StatusPill, PageIntro, EnvFooter };
})();