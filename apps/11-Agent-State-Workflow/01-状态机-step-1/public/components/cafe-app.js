/**
 * 职责：咖啡店各页共用的点单 / 走一步场地。对象卡 + 左柜台 + 右吧台。
 * 数据流：POST /api/cafe/start 或 /api/parallel/start 进图；对应的 step 只转移一次。
 * 为什么单独成文件：咖啡店各页只换说明和默认饮品，不要把同一套请求逻辑复制多份。
 */
window.DemoUI = window.DemoUI || {};

const CAFE_HINT = {
  takeOrder: "处理中：点单",
  brewHot: "处理中：热饮制作",
  brewIced: "处理中：冰饮制作",
  serve: "处理中：出餐",
  fork: "处理中：分流（浓缩 ∥ 打奶）",
  assemble: "处理中：组装",
  okEnd: "",
  failEnd: "",
};

const CAFE_PAGE = window.DemoUI.CafePages;

function CafePlayground(props) {
  const { useState } = React;
  const meta = CAFE_PAGE[props.page] || CAFE_PAGE.loop;
  const setStatus = props.onStatus;
  const [errorText, setErrorText] = useState("");
  const [draft, setDraft] = useState(meta.defaultDraft);
  const [messages, setMessages] = useState([]);
  const [processingHint, setProcessingHint] = useState("");
  const [state, setState] = useState(null);
  const [graph, setGraph] = useState(null);
  const [transition, setTransition] = useState(null);
  const [created, setCreated] = useState(null);
  const [history, setHistory] = useState([]);
  const [lastCall, setLastCall] = useState(null);
  const [objectBoard, setObjectBoard] = useState(null);
  const [selectedObject, setSelectedObject] = useState("graph");
  const [completedPaths, setCompletedPaths] = useState([]);
  const [walked, setWalked] = useState([]);
  const { getJson, postJson } = window.DemoUtils;
  const CafeChatPane = window.DemoUI.CafeChatPane;
  const CafeDeskPane = window.DemoUI.CafeDeskPane;
  const ObjectBoard = window.DemoUI.ObjectBoard;

  function fail(err) {
    setStatus("error");
    setErrorText(err.message || String(err));
  }

  async function onSend() {
    setStatus("loading");
    setErrorText("");
    const startUrl = meta.apiStart || "/api/cafe/start";
    const payload = { drinkName: draft };
    try {
      const body = await postJson(startUrl, payload);
      setLastCall({ method: "POST", url: startUrl, request: payload, response: body });
      setState(body.state);
      setGraph(body.graph);
      setCreated({ state: body.state });
      setTransition(null);
      setMessages([{ role: "user", text: body.state.drinkName }]);
      setProcessingHint(CAFE_HINT[body.state.currentNode] || "");
      setHistory([{
        title: "订单创建 " + body.state.orderId,
        detail: "进图，停在 takeOrder。还没有走一步。",
        read: { drinkName: body.state.drinkName },
        wrote: { currentNode: body.state.currentNode },
      }]);
      setObjectBoard(body.objectBoard);
      setSelectedObject((body.objectBoard && body.objectBoard.focusHint) || "state");
      setWalked([body.state.currentNode]);
      setStatus("ok");
    } catch (err) {
      setLastCall({ method: "POST", url: startUrl, request: payload, response: err.body || null });
      fail(err);
    }
  }

  async function onStep(forceIllegalNext) {
    if (!state) return;
    setStatus("loading");
    setErrorText("");
    const stepUrl = meta.apiStep || "/api/cafe/step";
    const payload = forceIllegalNext
      ? { state: state, forceIllegalNext: forceIllegalNext }
      : { state: state };
    try {
      const body = await postJson(stepUrl, payload);
      setLastCall({ method: "POST", url: stepUrl, request: payload, response: body });
      setState(body.state);
      setGraph(body.graph);
      setCreated(null);
      setTransition(body.transition);
      setProcessingHint(CAFE_HINT[body.state.currentNode] || "");
      const nextPath = walked.concat([body.transition.to]);
      setWalked(nextPath);
      setHistory(function (prev) {
        return prev.concat([{
          title: "第 " + prev.length + " 步　" + body.transition.from + " → " + body.transition.to,
          detail: "条件：" + body.transition.condition,
          read: body.transition.read,
          wrote: body.transition.wrote,
        }]);
      });
      if (body.state.currentNode === "okEnd" || body.state.currentNode === "failEnd") {
        const text = body.state.currentNode === "okEnd"
          ? body.state.pickupCall
          : (body.state.lastError || "无法制作。");
        setMessages(function (prev) { return prev.concat([{ role: "assistant", text: text }]); });
        setCompletedPaths(function (prev) {
          return prev.concat([{
            drinkName: body.state.drinkName,
            drinkType: body.state.drinkType,
            retryCount: body.state.retryCount,
            lastError: body.state.lastError,
            shotReady: body.state.shotReady,
            milkReady: body.state.milkReady,
            path: nextPath.join(" → "),
          }]);
        });
      }
      setObjectBoard(body.objectBoard);
      setSelectedObject((body.objectBoard && body.objectBoard.focusHint) || "transition");
      setStatus("ok");
    } catch (err) {
      setLastCall({ method: "POST", url: stepUrl, request: payload, response: err.body || null });
      fail(err);
    }
  }

  async function onForceError() {
    setStatus("loading");
    setErrorText("");
    try {
      await getJson("/api/force-error");
    } catch (err) {
      setLastCall({ method: "GET", url: "/api/force-error", request: {}, response: err.body || null });
      fail(err);
    }
  }

  function onReset() {
    setErrorText("");
    setMessages([]);
    setProcessingHint("");
    setState(null);
    setGraph(null);
    setTransition(null);
    setCreated(null);
    setHistory([]);
    setLastCall(null);
    setObjectBoard(null);
    setSelectedObject("graph");
    setWalked([]);
    setDraft(meta.nextDraft(completedPaths));
    setStatus("ok");
  }

  const loading = props.status === "loading";
  return (
    <div className="space-y-4">
      <ObjectBoard board={objectBoard} selectedId={selectedObject} onSelect={setSelectedObject} />
      <div className="grid lg:grid-cols-2 gap-4">
        <section id="controls" className="bg-white shadow rounded p-4 space-y-3">
          <CafeChatPane
            draft={draft}
            messages={messages}
            processingHint={processingHint}
            locked={Boolean(state)}
            loading={loading}
            chips={meta.chips}
            hint={meta.chatHint}
            onDraftChange={setDraft}
            onSend={onSend}
            onReset={onReset}
          />
        </section>
        <section id="output" className="bg-white shadow rounded p-4 space-y-4 min-h-[200px]">
          <CafeDeskPane
            state={state}
            graph={graph}
            transition={transition}
            created={created}
            history={history}
            lastCall={lastCall}
            errorText={errorText}
            loading={loading}
            onStep={function () { onStep(); }}
            stepHint={meta.apiStep
              ? "点「走一步」会发出 POST " + meta.apiStep + "，入参是当前整份状态（State）。期望：只变一站，下面四块一起更新。"
              : null}
            onIllegalStep={meta.allowIllegal ? function () { onStep("serve"); } : null}
            canIllegal={Boolean(state && state.currentNode === "takeOrder")}
            onForceError={onForceError}
            completedPaths={completedPaths}
            compareEmpty={meta.compareEmpty}
          />
        </section>
      </div>
    </div>
  );
}

window.DemoUI.CafePlayground = CafePlayground;
