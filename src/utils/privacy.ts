export function maskTemp(temp: number) {
  // 例: 38.2 -> "**.*"
  const s = temp.toFixed(1);
  return s.replace(/[0-9]/g, "*");
}