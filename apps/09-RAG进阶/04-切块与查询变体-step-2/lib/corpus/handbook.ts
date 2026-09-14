/**
 * 职责：售后手册的父子切块（Parent-Child）语料。只给本 Demo 用。
 * 数据流：父块（Parent）按节存全文；子块（Child）带 parentId，只用于检索打分。
 * 为什么单独成文件：语料和检索流程分开，改文案不必动主流程。
 *
 * 默认问句现在只在前端 hardcode（`public/index.html`），后端不再导出，
 * 避免两处字面值重复（用户首次看到这一行没改两个地方的不一致）。
 */

export type ParentChunk = {
  id: string;
  title: string;
  text: string;
};

export type ChildChunk = {
  id: string;
  parentId: string;
  title: string;
  text: string;
};

export const PARENTS: ParentChunk[] = [
  {
    id: "parent-damage",
    title: "运输破损怎么处理",
    text:
      "运输破损怎么处理（整节）。开箱当时发现包装破损：当场拒收，并在签收单注明破损，不要先拆封使用。" +
      "运输途中杯子等易碎品裂了：属于物流破损，请先联系承运商，申报时必须填写物流保单号。" +
      "举证：拍摄外箱、内衬、商品各一张，作为破损凭证；48 小时内提交，超时可能被拒。" +
      "审核通过后由仓库安排补发或退款，处理时限 5 个工作日。本节不覆盖七天无理由和保修。",
  },
  {
    id: "parent-return",
    title: "七天无理由退货",
    text:
      "七天无理由退货（整节）。未拆封且签收未满七日：可走无理由退货，运费由买家承担。" +
      "已拆封但商品不影响二次销售：需走质检，质检不通过则不予退货。" +
      "超过七日：普通无理由通道关闭；未拆封超期见特例审核，不在本节展开。",
  },
  {
    id: "parent-warranty",
    title: "保修从哪天算",
    text:
      "保修从哪天算（整节）。保温杯保修两年，自签收之日起算，不含运输时间。" +
      "电热壶保修一年。人为摔裂、进液不在保修范围。保修与运输破损是两条通道，不要混用物流保单号去走保修。",
  },
];

export const CHILDREN: ChildChunk[] = [
  {
    id: "child-damage-unbox",
    parentId: "parent-damage",
    title: "开箱当场破损",
    text: "开箱当时发现包装破损：当场拒收，并在签收单注明破损，不要先拆封使用。",
  },
  {
    id: "child-damage-transit",
    parentId: "parent-damage",
    title: "运输途中碎裂",
    text: "运输途中杯子裂了：属于物流破损。请先联系承运商。",
  },
  {
    id: "child-damage-photo",
    parentId: "parent-damage",
    title: "破损要拍什么",
    text: "杯子裂了要拍照：外箱、内衬、商品各一张，作为破损凭证。",
  },
  {
    id: "child-return-sealed",
    parentId: "parent-return",
    title: "未拆封七日",
    text: "未拆封且签收未满七日：可走无理由退货，运费由买家承担。",
  },
  {
    id: "child-return-opened",
    parentId: "parent-return",
    title: "已拆封质检",
    text: "已拆封但商品不影响二次销售：需走质检，质检不通过则不予退货。",
  },
  {
    id: "child-warranty-cup",
    parentId: "parent-warranty",
    title: "保温杯保修两年",
    text: "保温杯保修两年，自签收之日起算，不含运输时间。",
  },
];

export function parentById(id: string): ParentChunk | undefined {
  return PARENTS.find((item) => item.id === id);
}
