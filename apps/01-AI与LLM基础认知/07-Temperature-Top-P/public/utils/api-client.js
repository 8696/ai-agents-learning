/**
 * 职责：前端 HTTP 小工具（无 JSX）—— 发 POST、把失败翻译成一句人话。
 * 数据流：fetch → { status, data }；错误文案由 describeFailure 统一生成。挂 window.DemoUtils。
 * 为什么单独成文件：三个场景页调的是三个不同端点，但「怎么发、失败怎么说」必须一模一样，
 *   否则同一个 503 在温度页写「没配 Key」、在重复页写「HTTP 503」，读者以为是两种毛病。
 * 加载：普通 <script src>，必须排在 components 与页面内联块之前。
 */
(function () {
  window.DemoUtils = window.DemoUtils || {};

  /**
   * POST JSON。故意不抛错：HTTP 4xx/5xx 也是这条 Demo 要展示的现象之一，
   * 交给页面按 status 决定 #status-pill 的颜色，而不是在这里 throw 掉。
   * 真正会 reject 的只有「请求发不出去」（服务没起、网络断）——那一类留给页面 catch。
   */
  window.DemoUtils.callEndpoint = async function callEndpoint(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_e) {
      // 网关挂掉时可能回 HTML 错误页，直接 JSON.parse 会抛在这里
      data = { error: "响应不是合法 JSON：" + text.slice(0, 200) };
    }
    return { status: res.status, data: data };
  };

  /** 把后端错误体拼成一行人话：503 缺 Key、400 参数、其余带上上游状态码。 */
  window.DemoUtils.describeFailure = function describeFailure(status, data) {
    const base = (data && data.error) || "HTTP " + status;
    if (status === 503) return "缺 Key：" + base;
    if (status === 400) return "参数被服务端闸门拦下：" + base;
    if (data && data.upstreamStatus) return "上游 " + data.upstreamStatus + "：" + base;
    return "HTTP " + status + " · " + base;
  };
})();
