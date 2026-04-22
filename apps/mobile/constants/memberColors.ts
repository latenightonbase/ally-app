export const MEMBER_COLORS = [
  "#C96A3B",
  "#7BA7C9",
  "#9B7BC9",
  "#5B9B6B",
  "#C9A03B",
  "#C96A8A",
] as const;

export function getMemberColor(index: number): string {
  return MEMBER_COLORS[index % MEMBER_COLORS.length];
}

export function colorForId(id: string | number | null | undefined): string {
  if (id === null || id === undefined) return MEMBER_COLORS[0];
  const str = String(id);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return MEMBER_COLORS[Math.abs(hash) % MEMBER_COLORS.length];
}
