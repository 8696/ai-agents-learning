/**
 * 职责：主管模式共享状态的类型 + 初始值常量。
 * 数据流：external 入 → initialState → SharedState。
 */

export type WorkerName = "menu" | "brew" | "serve" | "finish";

export const WORKER_LABEL: Record<WorkerName, string> = {
  menu: "菜单工人",
  brew: "吧台工人",
  serve: "出餐工人",
  finish: "结束（FINISH）",
};

export type SharedState = {
  /** 客人原话；初始化后不再改 */
  orderSlip: string;
  /** 菜单工人写入；null = 还没派菜单工人 */
  menuNotes: string | null;
  /** 热饮 / 冰饮；菜单工人写入 */
  drinkType: "hot" | "ice" | null;
  /** 杯贴；吧台工人写入 */
  cupLabel: string | null;
  /** 叫号；出餐工人写入 */
  pickupCall: string | null;
  /** 给客人的最后一句；店长在选 finish 时写入 */
  guestReply: string | null;
  /** 已跑了几轮（一步 = 一次 round） */
  round: number;
};

export const initialState = (orderSlip: string): SharedState => ({
  orderSlip,
  menuNotes: null,
  drinkType: null,
  cupLabel: null,
  pickupCall: null,
  guestReply: null,
  round: 0,
});

export type RunOneStepInput = {
  state: SharedState;
};

export type RunOneStepOutput = {
  /** 店长这次选的人（或 finish） */
  nextWorker: WorkerName;
  /** 店长说为什么选这个人 */
  supervisorReasoning: string;
  /** 工人这次写进共享状态的字段补丁；finish 时为 null */
  workerPatch: Partial<SharedState> | null;
  /** 工人说为什么这么写；finish 时为 null */
  workerReasoning: string | null;
  /** 合并后的状态（round +1；finish 时还写入 guestReply） */
  newState: SharedState;
  /** 是否结束；true 后页面不再调下一步 */
  isFinished: boolean;
};
