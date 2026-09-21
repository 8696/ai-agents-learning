/**
 * 职责：运行期按站摊开。每一站用工位图标出走到哪，用四格夹子标出改了哪一格。
 * 数据流：props.input / runtime / finalState / drinkName（空态预览用）。
 */
import React from "react";
import htm from "https://esm.sh/htm";
import { FlowPipeline } from "./flow-pipeline.js";
import { SourceBlock } from "./source-block.js";
import { StateBoard } from "./state-board.js";

const html = htm.bind(React.createElement);

function changedKeysOf(patch) {
  return Object.keys(patch || {});
}

function doneBefore(runtime, index) {
  const names = ["START"];
  for (let i = 0; i < index; i += 1) names.push(runtime[i].node);
  return names;
}

export function RuntimeList(props) {
  const runtime = props.runtime || [];
  if (runtime.length === 0) {
    const preview = {
      drinkName: props.drinkName || "",
      orderSlip: null,
      cupLabel: null,
      pickupCall: null,
    };
    return html`
      <div className="space-y-3">
        <p className="text-sm text-gray-500">还没走。点上面的「按这张图走一单」之后，这里会按站填这四格。</p>
        <${StateBoard}
          title="走之前的订单夹（入口状态）"
          hint="现在只有客人口述有字。另外三格是空的。也没有「当前站」这一格——框架自己记走到哪。"
          state=${preview}
          changedKeys=${[]}
        />
      </div>
    `;
  }
  const allDone = ["START"].concat(runtime.map(function (step) { return step.node; }));
  return html`
    <div className="space-y-4">
      <${FlowPipeline}
        doneNodes=${allDone}
        currentNode="END"
        caption="绿 = 已经走过。整单走完，停在 END。"
      />
      <div className="border border-gray-300 rounded p-3 bg-gray-50 space-y-2">
        <div className="text-xs font-semibold text-gray-700">请求参数（我发出去的入口状态）</div>
        <${StateBoard}
          title="进门时的订单夹"
          hint="只有客人口述有值。点单 / 热饮 / 出餐还没写过。"
          state=${props.input}
          changedKeys=${[]}
        />
      </div>
      ${runtime.map(function (step, i) {
        const changed = changedKeysOf(step.patch);
        const doneNodes = doneBefore(runtime, i).concat([step.node]);
        const fieldHint = changed.join("、");
        return html`
          <div key=${step.node + "-" + i} className="border border-gray-300 rounded p-3 bg-white space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-gray-900">
                第 ${i + 1} 站 · ${step.label}
                <span className="ml-2 text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-mono">${step.node}</span>
              </div>
              <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-900">这一站只交回 ${fieldHint || "（空补丁）"}</span>
            </div>
            <p className="text-xs text-gray-700">${step.why}</p>
            <${FlowPipeline}
              doneNodes=${doneNodes}
              currentNode=${step.node}
              caption=${"蓝框是当前这一站。它不自己选下一站，交回补丁后由框架按已经画死的箭头往下喊。"}
            />
            <${SourceBlock}
              title=${"这一站的节点函数源代码"}
              why="框架调用的就是下面这个函数。它只 return 自己改的字段，不会改「当前站」。"
              code=${step.code}
            />
            <div className="border border-gray-300 rounded p-2 bg-gray-50 space-y-1">
              <div className="text-xs font-semibold text-gray-700">这一站交回的小纸条（补丁 patch）</div>
              <p className="text-xs text-gray-600">只有自己改的那一格。其它格根本不出现在这一张纸条上。贴回夹子之后看下面四格：绿格是新写的，灰格是原样带着。</p>
              <pre className="whitespace-pre-wrap text-xs bg-white text-gray-700 p-2 rounded max-h-32 overflow-auto">${JSON.stringify(step.patch, null, 2)}</pre>
            </div>
            <${StateBoard}
              title=${"第 " + (i + 1) + " 站结束后的订单夹"}
              hint="看绿格：这一站实际改了哪一格。其它格要么还是空，要么是前面站留下的。"
              state=${step.stateAfter}
              changedKeys=${changed}
            />
          </div>
        `;
      })}
      <div className="border border-green-300 rounded p-3 bg-green-50 space-y-2">
        <div className="text-xs font-semibold text-green-900">最终状态（走到 END · 响应结果）</div>
        <p className="text-xs text-gray-700">四格都满了。仍然没有 currentNode。框架自己管当前站，不会把它写进你的状态对象。</p>
        <${StateBoard}
          title="出餐之后的订单夹"
          hint="这就是 graph.stream 走完之后你拿到的那一份状态。"
          state=${props.finalState}
          changedKeys=${[]}
        />
      </div>
    </div>
  `;
}
