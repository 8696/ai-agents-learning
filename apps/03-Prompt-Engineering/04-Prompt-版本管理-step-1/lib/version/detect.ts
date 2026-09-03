/**
 * 职责：从模型原文里抽出「有没有在推理」的粗信号，以及给对照卡用的首段 preview。
 * 数据流：raw → hasReasoning / preview。只做标记匹配，不试图做准确语义识别。
 */
const REASONING_MARKERS: RegExp[] = [
  /第一步/,
  /首先/,
  /其次/,
  /让我们/,
  /let's think/i,
  /step by step/i,
  /<think\b/i,
];

export function detectReasoning(raw: string): boolean {
  return REASONING_MARKERS.some((re) => re.test(raw));
}

export function previewLine(raw: string): string {
  const firstParagraph = raw.split(/\n\s*\n/)[0] ?? raw;
  const trimmed = firstParagraph.trim();
  return trimmed.length > 120 ? trimmed.slice(0, 120) + "…" : trimmed;
}
