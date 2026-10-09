/**
 * 职责：把回边路上的五个点画成一排工位。brewHot 站可能反复亮（每次重做各亮一次）。
 * 数据流：props.doneNodes / currentNode / retryCount → 每个工位的边框颜色 + 重做计数。
 *
 * 为什么单独成文件：跟条件分流图的 flow-pipeline-conditional.js 共用同一份渲染逻辑，但站点不一样
 * （少了 classifyDrink / brewIce；brewHot 会反复亮；reject 也存在）。
 * 学习者对照看「同一份核心组件 + 不同站点配置」时一眼能区分。
 */
import React from "react";
import htm from "https://esm.sh/htm";

const html = htm.bind(React.createElement);

const STATIONS = [
  { id: "START", label: "入口", writes: "图从这里进，不是业务站" },
  { id: "takeOrder", label: "点单", writes: "只写订单条 orderSlip" },
  { id: "brewHot", label: "热饮制作（重做站）", writes: "写 retryCount + cupLabel；空杯时回自己" },
  { id: "serve", label: "出餐", writes: "success → 只写取餐广播 pickupCall" },
  { id: "reject", label: "无法制作", writes: "exceeded → 直接 END；不经过 serve" },
  { id: "END", label: "结束", writes: "serve 和 reject 都汇到这里" },
];

function stationClass(station, doneNodes, currentNode) {
  if (currentNode && station.id === currentNode) {
    return "border-blue-500 bg-blue-50 text-blue-900";
  }
  const walked = doneNodes.indexOf(station.id) !== -1;
  const ended = station.id === "END" && doneNodes.length > 0;
  if (walked || ended) return "border-green-300 bg-green-50 text-green-900";
  return "border-gray-300 bg-white text-gray-700";
}

export function FlowPipelineBackEdge(props) {
  const doneNodes = props.doneNodes || [];
  const currentNode = props.currentNode || "";
  const retryCount = props.retryCount || 0;
  return html`
    <div className="space-y-2">
      <div className="flex flex-wrap items-stretch gap-2">
        ${STATIONS.map(function (station, i) {
          const box = stationClass(station, doneNodes, currentNode);
          return html`
            <div key=${station.id} className="flex items-center gap-2">
              <div className=${"border rounded p-2 min-w-[8.5rem] " + box}>
                <div className="text-xs font-semibold">${station.label}</div>
                <div className="text-xs font-mono">${station.id}</div>
                <div className="text-xs mt-1">${station.writes}</div>
              </div>
              ${i < STATIONS.length - 1
                ? html`<span className="text-gray-400 text-sm">→</span>`
                : null}
            </div>
          `;
        })}
      </div>
      <p className="text-xs text-gray-500">${props.caption || ""}</p>
    </div>
  `;
}
