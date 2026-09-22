/**
 * 职责：导出三个本地 async 工具，模拟「点单 / 制作 / 出餐」每一站 await 一个外部服务的节奏。
 * 真实业务里把 URL 换成真 HTTP / RPC / SDK 即可。
 * 数据流：节点函数 → 工具函数 → setTimeout 模拟延迟 → 返回业务结果。
 */
function sleepRandomMs(min: number, max: number): Promise<void> {
  const delay = min + Math.floor(Math.random() * (max - min));
  return new Promise((resolve) => setTimeout(resolve, delay));
}

export async function placeOrder(input: { drinkName: string }) {
  await sleepRandomMs(200, 450);
  return {
    slipId: `SLIP-${Date.now().toString().slice(-6)}`,
    orderSlip: `${input.drinkName.replace(/[。.]$/, "")} → 双份浓缩，热`,
    recordedAt: new Date().toISOString(),
  };
}

export async function brewHotDrink(input: { orderSlip: string }) {
  await sleepRandomMs(400, 800);
  return {
    cupLabel: `热杯。杯盖写着「${input.orderSlip}」。放在热饮区。`,
    brewedAt: new Date().toISOString(),
  };
}

export async function notifyPickup(input: { orderSlip: string; cupLabel: string }) {
  await sleepRandomMs(100, 250);
  return {
    pickupCall: `A07 号请到取餐口，${input.orderSlip} 好了。`,
    channel: "取餐屏-南",
    notifiedAt: new Date().toISOString(),
  };
}