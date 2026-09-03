/**
 * 职责：前端 HTTP 小工具（无 JSX）—— 发 POST、把失败翻译成一句人话。
 * 数据流：fetch → { status, data }；错误文案由 describeFailure 统一生成。挂 window.DemoUtils。
 */
(function () {
  window.DemoUtils = window.DemoUtils || {};

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
      data = { error: "响应不是合法 JSON：" + text.slice(0, 200) };
    }
    return { status: res.status, data: data };
  };

  window.DemoUtils.describeFailure = function describeFailure(status, data) {
    const base = (data && data.error) || "HTTP " + status;
    if (status === 503) return "缺 Key：" + base;
    if (status === 400) return "参数被服务端闸门拦下：" + base;
    if (data && data.upstreamStatus) return "上游 " + data.upstreamStatus + "：" + base;
    return "HTTP " + status + " · " + base;
  };
})();
