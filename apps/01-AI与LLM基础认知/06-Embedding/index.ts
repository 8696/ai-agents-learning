/**
 * 模块 01 · Embedding · 最小 Demo
 *
 * 职责：用 2 维玩具向量算出「谁离查询词近」，对照 Token ID 减不出来远近。
 * 为什么：本条要能讲清「文本 → 向量；语义近的距离近；和 Token 不是同一层」——必须看见一组余弦数字。
 *
 * 数据流：手写坐标 → 余弦相似度 → 按分数排序打印
 * 不调嵌入 API（真模型是几百～几千维；二维只为能看懂）
 */

type Vec = readonly [number, number];

/** 余弦相似度：只看方向，1 同向、0 无关、-1 反向。不看向量有多长。 */
function cosine(a: Vec, b: Vec): number {
  const dot = a[0] * b[0] + a[1] * b[1];
  const na = Math.sqrt(a[0] * a[0] + a[1] * a[1]);
  const nb = Math.sqrt(b[0] * b[0] + b[1] * b[1]);
  if (na === 0 || nb === 0) {
    throw new Error("零向量没有方向，算不了余弦");
  }
  return dot / (na * nb);
}

// ── Token：词表里的整数代号，只能区分「是不是同一个号」 ──
const tokenId = {
  猫: 5001,
  狗: 3729,
  石头: 880,
  宠物: 2104,
} as const;

// ── Embedding：训练学出来的坐标。这里是教学用的 2 维，不是真模型输出 ──
const embedding: Record<keyof typeof tokenId, Vec> = {
  猫: [0.95, 0.12],
  狗: [0.82, 0.35],
  石头: [0.12, 0.94],
  宠物: [0.9, 0.2],
};

const query = "宠物" as const;
const candidates = ["猫", "狗", "石头"] as const;

console.log("词表：玩具 2 维（真 Embedding 常 768 / 1536 维；这里为了能看见「近/远」）");
console.log("");
console.log("Token ID（离散代号，减一下没有语义）");
for (const name of ["宠物", "猫", "狗", "石头"] as const) {
  const id = tokenId[name];
  const delta = id - tokenId[query];
  console.log(`  ${name} = ${id}    相对「${query}」差值 ${delta}`);
}
console.log("  → 5001 和 3729 差多少，说明不了猫和狗亲不亲。");
console.log("");

console.log(`Embedding：查询「${query}」${JSON.stringify(embedding[query])} 和谁近？`);
const ranked = candidates
  .map((name) => ({ name, score: cosine(embedding[query], embedding[name]) }))
  .sort((a, b) => b.score - a.score);

for (const row of ranked) {
  console.log(`  ${row.name}  余弦 ${row.score.toFixed(3)}    向量 ${JSON.stringify(embedding[row.name])}`);
}
console.log("");
console.log("分数越接近 1 越同向（语义近）。宠物→猫/狗高、→石头低。");
console.log("Token 管「哪个号」；Embedding 管「哪边近」。不是同一层。");
