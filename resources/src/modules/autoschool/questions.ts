import type { ExamKind } from "./session";

export type ExamQuestion = {
  text: string;
  answers: readonly string[];
  correct: number;
};

export const EXAM_RULES =
  "交通规则简要说明：\n" +
  "1. 红灯时必须完全停车。\n" +
  "2. 市区限速60公里/小时。\n" +
  "3. 无信号灯路口须让右侧来车先行。\n" +
  "4. 禁止跨越实线超车。\n" +
  "5. 必须系安全带或佩戴头盔。\n\n" +
  "接下来有5道题，必须全部答对。\n" +
  "考试费用：$500。";

const CAR_QUESTIONS: readonly ExamQuestion[] = [
  {
    text: "遇到红灯应该怎么做？",
    answers: ["停车", "加速通过", "鸣笛通过"],
    correct: 0,
  },
  {
    text: "市区最高限速是多少？",
    answers: ["120公里/小时", "60公里/小时", "200公里/小时"],
    correct: 1,
  },
  {
    text: "在无信号灯路口应让谁先行？",
    answers: ["左侧来车", "无需让行", "右侧来车"],
    correct: 2,
  },
  {
    text: "可以跨越实线超车吗？",
    answers: ["否", "是", "仅限夜间"],
    correct: 0,
  },
  {
    text: "必须系安全带吗？",
    answers: ["否", "仅限高速公路", "是，必须"],
    correct: 2,
  },
];

const MOTO_QUESTIONS: readonly ExamQuestion[] = [
  {
    text: "遇到红灯应该怎么做？",
    answers: ["停车", "从路肩绕行", "无人时直接通过"],
    correct: 0,
  },
  {
    text: "骑摩托车必须佩戴头盔吗？",
    answers: ["否", "是，必须", "仅限市区外"],
    correct: 1,
  },
  {
    text: "可以在车道间穿行吗？",
    answers: ["是，随时可以", "仅限空旷的高速公路", "否"],
    correct: 2,
  },
  {
    text: "市区最高限速是多少？",
    answers: ["60公里/小时", "140公里/小时", "无限制"],
    correct: 0,
  },
  {
    text: "可以跨越实线超车吗？",
    answers: ["是，骑摩托车时可以", "否", "仅限右侧"],
    correct: 1,
  },
];

export function examQuestions(kind: ExamKind): readonly ExamQuestion[] {
  return kind === "car" ? CAR_QUESTIONS : MOTO_QUESTIONS;
}
