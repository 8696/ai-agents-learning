/**
 * 职责：页面共用的 fetch 小帮手（无 JSX）。
 * 数据流：fetch → JSON；4xx/5xx 时把服务端 error 字段抛给调用方。
 * 为什么单独成文件：左右两栏都会发请求，不把 fetch 细节写进组件。
 */
window.DemoUtils = window.DemoUtils || {};

window.DemoUtils.parseBody = async function parseBody(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch (_err) {
    return { ok: false, error: text || "响应不是 JSON" };
  }
};

window.DemoUtils.getJson = async function getJson(url) {
  const res = await fetch(url);
  const body = await window.DemoUtils.parseBody(res);
  if (!res.ok) {
    const err = new Error(body.error || "请求失败 " + res.status);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
};

window.DemoUtils.postJson = async function postJson(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await window.DemoUtils.parseBody(res);
  if (!res.ok) {
    const err = new Error(body.error || "请求失败 " + res.status);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
};
