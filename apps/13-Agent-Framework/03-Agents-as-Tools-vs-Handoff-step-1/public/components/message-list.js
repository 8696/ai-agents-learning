/**
 * 职责：渲染一份「消息流」——用户 / 总客服 / 退款专员 三种角色按时间顺序追加。
 * 数据流：吃 props.messages（数组），按 kind 决定边框 / 背景；只渲染，不持有状态。
 *
 * 加载方式：HTM 写，浏览器原生执行，不需 Babel 转译。
 */
import React from "react";
import htm from "https://esm.sh/htm";

const html = htm.bind(React.createElement);

const ROLE_LABEL = {
  user: "用户",
  host: "总客服",
  refund: "退款专员",
};

const ROLE_BADGE = {
  user: "bg-gray-200 text-gray-700",
  host: "bg-blue-100 text-blue-800",
  refund: "bg-purple-100 text-purple-800",
};

const KIND_LABEL = {
  speech: "对用户说",
  "tool-call": "工具调用",
  "tool-result": "工具返回值",
  system: "系统提示",
};

function bubbleStyle(msg) {
  // kind 决定卡片配色：用户说 = 中性灰；agent speech = 绿系终态；tool-call/result = 黄系过程；system = 蓝边
  if (msg.kind === "tool-call") return "border-yellow-300 bg-yellow-50";
  if (msg.kind === "tool-result") return "border-amber-300 bg-amber-50";
  if (msg.kind === "system") return "border-blue-300 bg-blue-50";
  if (msg.from === "user") return "border-gray-300 bg-gray-50";
  return "border-green-300 bg-green-50";
}

export function MessageList(props) {
  const messages = props.messages || [];
  if (messages.length === 0) {
    return html`
      <div className="text-xs text-gray-500 italic">
        还没有消息。先在上面的固定场景读一遍用户原话，再点「发送下一句」。
      </div>
    `;
  }
  return html`
    <ul className="space-y-2">
      ${messages.map(function (msg, i) {
        const roleLabel = ROLE_LABEL[msg.from] || msg.from;
        const badge = ROLE_BADGE[msg.from] || "bg-gray-200 text-gray-700";
        const kindLabel = msg.kind ? KIND_LABEL[msg.kind] : "";
        return html`
          <li
            key=${i}
            className=${"border rounded p-2 space-y-1 " + bubbleStyle(msg)}
          >
            <div className="flex items-center gap-2 text-xs">
              <span className=${"px-2 py-0.5 rounded font-semibold " + badge}>${roleLabel}</span>
              ${kindLabel ? html`<span className="text-gray-600">· ${kindLabel}</span>` : null}
              <span className="text-gray-400 ml-auto">#${i + 1}</span>
            </div>
            <div className="text-sm text-gray-800 whitespace-pre-wrap">${msg.text}</div>
          </li>
        `;
      })}
    </ul>
  `;
}