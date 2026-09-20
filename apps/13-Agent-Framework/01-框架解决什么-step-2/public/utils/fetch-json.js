/**
 * 职责：各页共用的 JSON 请求小帮手。无 JSX。
 * 数据流：fetch → 解析 JSON；HTTP 非 2xx 时把 body.error 抛给页面红字。
 */
export async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch (error) {
    data = { error: "响应不是 JSON" };
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || "HTTP " + res.status);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

export async function loadHealth() {
  const res = await fetch("/health");
  if (!res.ok) return { port: 50140, provider: null, model: null, hasKey: false };
  return res.json();
}