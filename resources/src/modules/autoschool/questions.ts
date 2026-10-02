import type { ExamKind } from "./session";

export type ExamQuestion = {
  text: string;
  answers: readonly string[];
  correct: number;
};

export const EXAM_RULES =
  "Brief traffic rules:\n" +
  "1. Come to a full stop at a red light.\n" +
  "2. In the city — no more than 60 km/h.\n" +
  "3. At an uncontrolled intersection, yield to traffic on the right.\n" +
  "4. Overtaking across a solid line is prohibited.\n" +
  "5. Seat belt / helmet required.\n\n" +
  "Next is a 5-question test. You must answer all questions correctly.\n" +
  "Test fee: $500.";

const CAR_QUESTIONS: readonly ExamQuestion[] = [
  {
    text: "What should you do at a red traffic light?",
    answers: ["Stop", "Drive through faster", "Honk and drive"],
    correct: 0,
  },
  {
    text: "What is the maximum speed in the city?",
    answers: ["120 km/h", "60 km/h", "200 km/h"],
    correct: 1,
  },
  {
    text: "Who must you yield to at an uncontrolled intersection?",
    answers: ["Traffic on the left", "No one", "Traffic on the right"],
    correct: 2,
  },
  {
    text: "Can you overtake across a solid line?",
    answers: ["No", "Yes", "Only at night"],
    correct: 0,
  },
  {
    text: "Is a seat belt required?",
    answers: ["No", "Only on highways", "Yes, it is required"],
    correct: 2,
  },
];

const MOTO_QUESTIONS: readonly ExamQuestion[] = [
  {
    text: "What should you do at a red traffic light?",
    answers: ["Stop", "Drive around on the shoulder", "Drive through if no one is around"],
    correct: 0,
  },
  {
    text: "Is a helmet required on a motorcycle?",
    answers: ["No", "Yes, it is required", "Only outside the city"],
    correct: 1,
  },
  {
    text: "Can you ride between lanes of cars?",
    answers: ["Yes, always", "Only on an empty highway", "No"],
    correct: 2,
  },
  {
    text: "What is the maximum speed in the city?",
    answers: ["60 km/h", "140 km/h", "No limit"],
    correct: 0,
  },
  {
    text: "Can you overtake across a solid line?",
    answers: ["Yes, on a motorcycle", "No", "Only on the right"],
    correct: 1,
  },
];

export function examQuestions(kind: ExamKind): readonly ExamQuestion[] {
  return kind === "car" ? CAR_QUESTIONS : MOTO_QUESTIONS;
}
