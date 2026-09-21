/**
 * 职责：顶部跨页导航。step-2 内部页面（基础聊天 / 推理提取 / 结构化输出 / 工具调用循环）。
 * 数据流：props.current 高亮；props.base 拼 href。
 *
 * 加载方式：本文件用 HTM 写（`html\`...\`` 是 tagged template literal），
 *   浏览器原生执行，不需要 Babel 转译；
 *   agent-loop.html 里以 <script type="module" src=...> 加载即可。
 */
import React from "react";
import htm from "https://esm.sh/htm";

const html = htm.bind(React.createElement);

const PAGES = [
  { key: "basic-chat", label: "基础聊天（basic-chat）", href: "index.html" },
  { key: "reasoning-extract", label: "推理内容统一处理（extractReasoningMiddleware）", href: "pages/reasoning-extract.html" },
  { key: "structured", label: "结构化输出（generateObject + zodSchema）", href: "pages/structured.html" },
  { key: "generate-vs-stream", label: "非流式 vs 流式（generateText vs streamText）", href: "pages/generate-vs-stream.html" },
  { key: "agent-loop", label: "工具调用循环（streamText + tools + stopWhen）", href: "pages/agent-loop.html" },
  { key: "agent-prepare-step", label: "工具渐进（streamText + prepareStep）", href: "pages/agent-prepare-step.html" },
];

const NAV_CLASS_ACTIVE = "px-3 py-1 rounded border border-blue-500 bg-blue-50 text-blue-700 font-semibold";
const NAV_CLASS_IDLE = "px-3 py-1 rounded border border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100";

export function PageNav(props) {
  return html`
    <nav className="bg-white border border-gray-200 rounded p-3 flex flex-wrap gap-2 text-sm">
      ${PAGES.map(function (item) {
        const active = item.key === props.current;
        return html`
          <a
            key=${item.key}
            href=${(props.base || "") + item.href}
            className=${active ? NAV_CLASS_ACTIVE : NAV_CLASS_IDLE}
          >${item.label}</a>
        `;
      })}
    </nav>
  `;
}