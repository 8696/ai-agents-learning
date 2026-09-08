/**
 * 职责：产品开关 → tool_choice 映射表（变体 5：谁写这根旋钮 · 用户显式意图）。
 * 数据流：UI 选开关 id → resolveSwitch → API tool_choice。
 */
import type { ChatCompletionToolChoiceOption } from "openai/resources/chat/completions";

export type SwitchId = "chat_only" | "allow_tools" | "force_lookup";

export type SwitchDef = {
  id: SwitchId;
  /** 产品文案（用户看见的） */
  label: string;
  /** 一句话：点了会发生什么 */
  hint: string;
  /** 映射到的协议字段 */
  toolChoice: ChatCompletionToolChoiceOption;
  /** 人话解释映射 */
  mapsTo: string;
};

export const SWITCHES: SwitchDef[] = [
  {
    id: "chat_only",
    label: "只聊天",
    hint: "禁止调任何 Tool；适合问候、澄清、纯闲聊。",
    toolChoice: "none",
    mapsTo: 'tool_choice = "none"',
  },
  {
    id: "allow_tools",
    label: "允许工具",
    hint: "模型自己决定调不调；默认助手模式。",
    toolChoice: "auto",
    mapsTo: 'tool_choice = "auto"',
  },
  {
    id: "force_lookup",
    label: "强制查库",
    hint: "本轮必须至少调 1 个 Tool（本 Demo = required）。",
    toolChoice: "required",
    mapsTo: 'tool_choice = "required"',
  },
];

export function resolveSwitch(id: SwitchId): SwitchDef {
  const found = SWITCHES.find((s) => s.id === id);
  if (!found) throw new Error(`未知开关: ${id}`);
  return found;
}
