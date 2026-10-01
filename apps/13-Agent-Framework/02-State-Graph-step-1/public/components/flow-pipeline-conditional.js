/**
 * 职责：把条件分流路上的七个点画成一排工位。灰 = 还没走到；蓝 = 当前这张卡；绿 = 已经走过。
 * 数据流：props.doneNodes / currentNode → 每个工位的边框颜色。
 *
 * 为什么单独成文件：跟线性图的 flow-pipeline.js 共用同一份渲染逻辑，但站点不一样
 * （多了 classifyDrink / brewIce / reject 三站，且 reject 不走 serve 直接 END）。
 * 学习者对照看「同一份核心组件 + 不同站点配置」时一眼能区分。
 */
import React from "react";
import htm from "https://esm.sh/htm";

const html = htm.bind(React.createElement);

const STATIONS = [
  { id: "START", label: "入口", writes: "图从这里进，不是业务站" },
  { id: "takeOrder", label: "点单", writes: "只写订单条 orderSlip" },
  { id: "classifyDrink", label: "饮品分类", writes: "只写 drinkType（路由函数读它）" },
  { id: "brewHot", label: "热饮制作", writes: "路由 hot → 只写杯盖 cupLabel" },
  { id: "brewIce", label: "冰饮制作", writes: "路由 ice → 只写杯盖 cupLabel" },
  { id: "serve", label: "出餐", writes: "只写取餐广播 pickupCall" },
  { id: "reject", label: "无法制作", writes: "路由 unknown → 直接 END，不经过 serve" },
  { id: "END", label: "结束", writes: "图停。brewHot/brewIce/reject 三站都汇到这里" },
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

export function FlowPipelineConditional(props) {
  const doneNodes = props.doneNodes || [];
  const currentNode = props.currentNode || "";
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
