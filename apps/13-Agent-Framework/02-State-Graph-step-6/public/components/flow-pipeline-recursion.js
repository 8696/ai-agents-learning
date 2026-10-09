/**
 * 职责：把递归上限图上的五个点画成一排工位。brewHot 高亮为「重做站」，自带回边箭头。
 * 数据流：props.doneNodes / currentNode → 每个工位的边框颜色；brewHot 上方展示回边小箭头。
 *
 * 为什么单独成文件：跟 step-5 的 flow-pipeline-checkpoint.js 站点不同（没 chargeRequest / chargeMemberCard），
 * brewHot 是重做站需要被视觉强调。教学上突出「图里有环」和「recursive loop 节点」的关系。
 */
import React from "react";
import htm from "https://esm.sh/htm";

const html = htm.bind(React.createElement);

const STATIONS = [
  { id: "START", label: "入口", writes: "图从这里进" },
  { id: "takeOrder", label: "点单", writes: "写订单条" },
  { id: "brewHot", label: "热饮制作（重做站）", writes: "每跑 retryCount +1；cupLabel 永远 null（机器一直做坏）" },
  { id: "serve", label: "出餐", writes: "写取餐广播" },
  { id: "END", label: "结束", writes: "图停" },
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

export function FlowPipelineRecursion(props) {
  const doneNodes = props.doneNodes || [];
  const currentNode = props.currentNode || "";
  return html`
    <div className="space-y-2">
      <div className="flex flex-wrap items-stretch gap-2">
        ${STATIONS.map(function (station, i) {
          const box = stationClass(station, doneNodes, currentNode);
          const isBrewHot = station.id === "brewHot";
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
              ${isBrewHot ? html`
                <div className="text-xs px-2 py-1 rounded bg-yellow-50 border border-yellow-300 text-yellow-900">
                  ↑ 回边：retry → brewHot
                </div>
              ` : null}
            </div>
          `;
        })}
      </div>
      <p className="text-xs text-gray-500">${props.caption || "compile({ recursionLimit }) 给图一个硬上限：超了抛 GraphRecursionError。well-behaved 路由看 cupLabel 和 retryCount 上限 → 收敛；always-broken / graceful 路由只看 cupLabel → 永远 retry → 跑满上限。"}</p>
    </div>
  `;
}