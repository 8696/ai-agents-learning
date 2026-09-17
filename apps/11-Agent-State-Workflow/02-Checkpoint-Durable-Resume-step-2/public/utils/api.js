/**
 * 职责：页面请求封装。无 JSX。
 * 数据流：fetch → JSON；非 2xx 把服务端 error.message 抛给控件。
 * 为什么单独成文件：开始 / 走一步 / 读检查点共用同一套错误形状。
 */
window.DemoUtils = window.DemoUtils || {};

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  let body = null;
  try {
    body = await res.json();
  } catch (_err) {
    body = null;
  }
  if (!res.ok) {
    const message =
      (body && body.error && body.error.message) ||
      "HTTP " + res.status;
    const err = new Error(message);
    err.status = res.status;
    err.code = body && body.error && body.error.code;
    err.body = body;
    throw err;
  }
  return body;
}

window.DemoUtils.fetchJson = fetchJson;
window.DemoUtils.startRun = function (drinkName) {
  return fetchJson("/api/run/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ drinkName: drinkName }),
  });
};
window.DemoUtils.stepOnce = function (runId, options) {
  const body = { runId: runId };
  if (options && options.keepHistory) body.keepHistory = true;
  return fetchJson("/api/run/step", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
};
window.DemoUtils.stepOnceInMemory = function (runId) {
  return fetchJson("/api/run/step-in-memory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ runId: runId }),
  });
};
window.DemoUtils.nextRun = function (previousRunId, drinkName) {
  const body = { drinkName: drinkName };
  if (previousRunId) body.previousRunId = previousRunId;
  return fetchJson("/api/run/next", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
};
window.DemoUtils.secondRun = function (drinkName) {
  return fetchJson("/api/run/second", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ drinkName: drinkName }),
  });
};
window.DemoUtils.listCheckpoints = function (runId) {
  return fetchJson("/api/checkpoint-list?runId=" + encodeURIComponent(runId));
};
window.DemoUtils.readCheckpoint = function (runId) {
  return fetchJson("/api/checkpoint/" + encodeURIComponent(runId));
};
window.DemoUtils.forgetRun = function (runId) {
  return fetchJson("/api/run/forget", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ runId: runId }),
  });
};
window.DemoUtils.resumeRun = function (runId) {
  return fetchJson("/api/run/resume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ runId: runId }),
  });
};
window.DemoUtils.chargeCrash = function (runId) {
  return fetchJson("/api/run/charge-crash", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ runId: runId }),
  });
};
window.DemoUtils.readPayment = function (runId) {
  return fetchJson("/api/payment/" + encodeURIComponent(runId));
};
window.DemoUtils.serializeDirty = function (runId, kind) {
  return fetchJson("/api/run/serialize-dirty", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ runId: runId, kind: kind }),
  });
};
window.DemoUtils.loadHealth = function () {
  return fetchJson("/health");
};
