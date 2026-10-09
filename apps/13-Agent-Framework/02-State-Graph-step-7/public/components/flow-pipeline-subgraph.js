/**
 * 职责：把主子图 + 子图上的工位画成两排。父图三站 (takeOrder / makeDrink[子图] / serve) + 子图两站 (subBrewHot)。
 * 数据流：props.doneNodes / currentNode → 每个工位的边框颜色。
 *
 * 为什么单独成文件：step-7 的关键图节点是 makeDrink「包」一整张子图——视觉上要展示父 + 子两层结构。
 */
import React from "react";
import htm from "https://esm.sh/htm";

const html = htm.bind(React.createElement);

// 父图三个工位
const PARENT_STATIONS = [
  { id: "START", label: "入口", writes: "图从这里进" },
  { id: "takeOrder", label: "点单", writes: "写订单条 orderSlip" },
  { id: "makeDrink", label: "制作（含子图）", writes: "一站 = 一整张子图；父图写不进去，子图在内部完成 brewHot" },
  { id: "serve", label: "出餐", writes: "写取餐广播" },
  { id: "END", label: "结束", writes: "图停" },
];

// 子图（被父图 makeDrink 包起来）的工位
const SUBGRAPH_STATIONS = [
  { id: "subStart", label: "子图入口", writes: "父图把同名字段传进来" },
  { id: "subBrewHot", label: "brewHot（子图内）", writes: "写 cupLabel + retryCount；同名字段自动回流父图" },
  { id: "subEnd", label: "子图出口", writes: "子图跑完 → 父图 makeDrink 站完成" },
];

function stationClass(station, doneNodes, currentNode, colorSet) {
  if (currentNode && station.id === currentNode) {
    return colorSet.current;
  }
  const walked = doneNodes.indexOf(station.id) !== -1;
  const ended = station.id === "END" && doneNodes.length > 0;
  if (walked || ended) return colorSet.done;
  return colorSet.todo;
}

const PARENT_COLORS = {
  current: "border-blue-500 bg-blue-50 text-blue-900",
  done: "border-green-300 bg-green-50 text-green-900",
  todo: "border-gray-300 bg-white text-gray-700",
};

const SUBGRAPH_COLORS = {
  current: "border-purple-500 bg-purple-50 text-purple-900",
  done: "border-green-300 bg-green-50 text-green-900",
  todo: "border-gray-300 bg-white text-gray-700",
};

export function FlowPipelineSubgraph(props) {
  const doneNodes = props.doneNodes || [];
  const currentNode = props.currentNode || "";
  const subDoneNodes = props.subDoneNodes || [];
  const subCurrentNode = props.subCurrentNode || "";
  return html`
    <div className="space-y-3">
      <div className="flex flex-wrap items-stretch gap-2">
        ${PARENT_STATIONS.map(function (station, i) {
          const box = stationClass(station, doneNodes, currentNode, PARENT_COLORS);
          return html`
            <div key=${station.id} className="flex items-center gap-2">
              <div className=${"border rounded p-2 min-w-[8rem] " + box}>
                <div className="text-xs font-semibold">${station.label}</div>
                <div className="text-xs font-mono">${station.id}</div>
                <div className="text-xs mt-1">${station.writes}</div>
              </div>
              ${i < PARENT_STATIONS.length - 1
                ? html`<span className="text-gray-400 text-sm">→</span>`
                : null}
            </div>
          `;
        })}
      </div>
      <div className="border border-purple-300 bg-purple-50 rounded p-3 space-y-2">
        <div className="text-xs font-semibold text-purple-900">↑ 父图 makeDrink 这一站 = 整张子图 ↓</div>
        <div className="flex flex-wrap items-stretch gap-2">
          ${SUBGRAPH_STATIONS.map(function (station, i) {
            const box = stationClass(station, subDoneNodes, subCurrentNode, SUBGRAPH_COLORS);
            return html`
              <div key=${station.id} className="flex items-center gap-2">
                <div className=${"border rounded p-2 min-w-[7rem] " + box}>
                  <div className="text-xs font-semibold">${station.label}</div>
                  <div className="text-xs font-mono">${station.id}</div>
                  <div className="text-xs mt-1">${station.writes}</div>
                </div>
                ${i < SUBGRAPH_STATIONS.length - 1
                  ? html`<span className="text-gray-400 text-sm">→</span>`
                  : null}
              </div>
            `;
          })}
        </div>
      </div>
      <p className="text-xs text-gray-500">${props.caption || "父图的 makeDrink 工位实际上是一整张编译好的子图。同名字段自动传；不同名要在父图加 wrapper 翻译。"}</p>
    </div>
  `;
}