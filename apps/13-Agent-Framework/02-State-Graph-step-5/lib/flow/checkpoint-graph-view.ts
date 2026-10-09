/**
 * 职责：把检查点 + 中断图的声明步骤、节点源代码整理成页面能直接渲染的说明。
 * 数据流：节点函数文案 + 展示代码字面量（来自 checkpoint-graph-source.ts）→ DeclarationStep[]。
 * 为什么单独成文件：跑图的主路径在 checkpoint-graph.ts；本文件只服务「图还没跑时先看见源代码」。
 * 注：本文件是展示层的中间站——从 source 拿展示代码字面量，吐给前端；运行时不经过这里。
 */
import { DEFAULT_DRINK_CHECKPOINT, DEFAULT_THREAD_ID } from "./checkpoint-graph.js";
import {
  CHECKPOINT_BUILD_NO,
  CHECKPOINT_BUILD_YES,
  CHARGE_MEMBER_CARD_CODE,
  CHARGE_REQUEST_CODE,
  IDEMPOTENT_CODE,
  INTERRUPT_USAGE_CODE,
  NODE_CODE_BY_NAME_CHECKPOINT,
  SERVE_CODE_CHECKPOINT,
  STATE_CODE_CHECKPOINT,
  TAKE_ORDER_CODE_CHECKPOINT,
} from "./checkpoint-graph-source.js";

export type CheckpointDeclarationStep = {
  id: string;
  title: string;
  why: string;
  code: string;
};

export type CheckpointGraphView = {
  drinkDefault: string;
  threadIdDefault: string;
  declaration: CheckpointDeclarationStep[];
  nodeCodes: Record<string, string>;
};

export function describeCheckpointGraph(): CheckpointGraphView {
  return {
    drinkDefault: DEFAULT_DRINK_CHECKPOINT,
    threadIdDefault: DEFAULT_THREAD_ID,
    declaration: [
      {
        id: "state",
        title: "① 声明状态标注（多 chargeConfirmed / chargeResult）",
        why: "扣卡请求节点要写「是否确认」+ 扣卡节点要写「扣卡结果」——两格分别记录。",
        code: STATE_CODE_CHECKPOINT,
      },
      {
        id: "nodes",
        title: "② 登记五个节点（addNode）",
        why: "点单 / 扣卡请求（interrupt 候选）/ 扣会员卡（幂等）/ 热饮 / 出餐。chargeRequest 节点按 mode 决定是否触发 interrupt。",
        code: [
          TAKE_ORDER_CODE_CHECKPOINT,
          CHARGE_REQUEST_CODE,
          CHARGE_MEMBER_CARD_CODE,
          SERVE_CODE_CHECKPOINT,
        ].join("\n\n"),
      },
      {
        id: "edges",
        title: "③ 连单链（addEdge）",
        why: "五个节点顺序：takeOrder → chargeRequest → chargeMemberCard → brewHot → serve → END。没有条件边——这张图的核心是「检查点 + interrupt」，不是「按状态选路」。",
        code: `.addEdge(START, "takeOrder")
.addEdge("takeOrder", "chargeRequest")
.addEdge("chargeRequest", "chargeMemberCard")
.addEdge("chargeMemberCard", "brewHot")
.addEdge("brewHot", "serve")
.addEdge("serve", END)`,
      },
      {
        id: "interrupt",
        title: "④ interrupt + resume（变体 G）",
        why: "节点里调 interrupt(value) 暂停图 + 写快照；前端弹确认 → 第二次 invoke 用 Command({ resume }) 继续。**恢复时节点会从头重跑**——interrupt 之前的代码会重复执行；chargeMemberCard 节点用 idempotencyKey 拦截重复扣。",
        code: INTERRUPT_USAGE_CODE,
      },
      {
        id: "compile",
        title: "⑤ compile（变体 F）",
        why: "不传 checkpointer = 跨请求不能恢复（每次 invoke 独立运行）。传 MemorySaver = 同进程内跨请求能恢复（杀进程即丢）。真实生产用 SqliteSaver / Redis-backed Saver。",
        code: [
          "// 模式 1：不传 checkpointer",
          CHECKPOINT_BUILD_NO,
          "",
          "// 模式 2 / 3：传 MemorySaver",
          CHECKPOINT_BUILD_YES,
        ].join("\n"),
      },
      {
        id: "idempotent",
        title: "⑥ idempotencyKey 防重扣（教学点）",
        why: "检查点让 chargeMemberCard 节点重跑——但不能让客户被扣两次。idempotencyKey 用 orderSlip（同一单的 orderSlip 不变），第二次跑时 key 已在 Map 里，工具返回 { ok: false, error }，不重复扣。",
        code: IDEMPOTENT_CODE,
      },
    ],
    nodeCodes: NODE_CODE_BY_NAME_CHECKPOINT,
  };
}
