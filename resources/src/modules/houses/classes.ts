const HOUSE_CLASS_LABELS: Readonly<Record<number, string>> = {
  0: "Economy",
  1: "Mid-range",
  2: "Standard",
  3: "Comfort",
  4: "Premium",
  5: "Elite",
};

export function houseClassLabel(classId: number): string {
  return HOUSE_CLASS_LABELS[classId] ?? `Class ${classId}`;
}
