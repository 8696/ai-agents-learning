/**
 * 职责：把检查点 + 中断路上的六个点画成一排工位。chargeRequest 是 interrupt 候选站，渲染时高亮。
 * 数据流：props.doneNodes / currentNode → 每个工位的边框颜色。
 *
 * 为什么单独成文件：跟非法转移图的 flow-pipeline-invalid-edge.js 共用同一份渲染逻辑，但站点不一样
 * （多了 chargeRequest / chargeMemberCard 两个扣卡相关站）。
 * 学习者对照看「同一份核心组件 + 不同站点配置」时一眼能区分。
 */
import React from "react";
import htm from "https://esm.sh/htm";

const html = htm.bind(React.createElement);

const STATIONS = [
  { id: "START", label: "入口", writes: "图从这里进" },
  { id: "takeOrder", label: "点单", writes: "写订单条 orderSlip" },
  { id: "chargeRequest", label: "扣卡请求（interrupt 候选）", writes: "memory-saver-interrupt 模式调 interrupt 暂停；其它模式直接 confirm=true" },
  { id: "chargeMemberCard", label: "扣会员卡（幂等）", writes: "用 idempotencyKey 防重扣" },
  { id: "brewHot", label: "热饮制作", writes: "写杯盖" },
  { id: "serve", label: "出餐", writes: "写取餐广播；扣卡失败时提示错误" },
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

export function FlowPipelineCheckpoint(props) {
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
      <p className="text-xs text-gray-500">${props.caption || "检查点 = compile({ checkpointer }) + 运行时 { thread_id }；interrupt 节点会暂停图，第二次 invoke 用 Command({ resume }) 继续；恢复时节点会从头重跑——chargeMemberCard 节点用 idempotencyKey 拦截重复扣。"}</p>
    </div>
  `;
}
