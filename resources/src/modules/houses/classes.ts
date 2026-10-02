const HOUSE_CLASS_LABELS: Readonly<Record<number, string>> = {
  0: "经济型",
  1: "中档型",
  2: "标准型",
  3: "舒适型",
  4: "高档型",
  5: "豪华型",
};

export function houseClassLabel(classId: number): string {
  return HOUSE_CLASS_LABELS[classId] ?? `${classId}级`;
}
