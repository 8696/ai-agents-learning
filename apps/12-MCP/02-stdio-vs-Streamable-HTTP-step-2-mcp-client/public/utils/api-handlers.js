/**
 * 职责：通用 fetch + 计时 + 错误分支。
 *       浏览器所有按钮的 handler 走这里发请求 + 写 React state。
 *
 * 数据流：button click → callJson(url, body, token, setters, onOk)
 *   → fetch POST with Authorization: Bearer <token> → res.json → onOk(data, elapsedMs) → setLastXxx
 *
 * 设计：每个请求单独带 token，Client demo 端**不存任何用户信息**——
 *       token 由调用方（React state）传入，跟着请求走。
 *
 * 为什么单独成文件：handler 内的 fetch + 错误分支 + 计时 + 头拼接占了 30+ 行；
 * 不抽 index.html 就破 400 行硬约束。
 */
(function () {
  const DemoUtils = window.DemoUtils || (window.DemoUtils = {});

  DemoUtils.callJson = async function callJson(url, body, token, setters, onOk) {
    const { setBusy, setStatus, setErrMsg } = setters;
    setBusy(true);
    setErrMsg("");
    setStatus("🔄 请求中");
    const t0 = Date.now();
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body ?? {}),
      });
      const data = await res.json();
      onOk(data, Date.now() - t0);
      setStatus(data.ok ? "✅ 完成" : "❌ 错误");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setErrMsg(message);
      setStatus("❌ 错误");
      return { error: message };
    } finally {
      setBusy(false);
    }
    return null;
  };
})();
