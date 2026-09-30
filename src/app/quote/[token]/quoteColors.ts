/** Stable quote identity colors, independent of which alternative is open. */
const alternativeColors = ["#2263aa", "#7b47a4", "#12746d", "#ad5917", "#a13f68", "#4655a5"];

export function quoteColor(label: string): string {
  const normalized = label.trim().toUpperCase();
  if (!/^[A-Z]+$/.test(normalized) || normalized === "A") return "#0b0b0b";
  let index = 0;
  for (const letter of normalized) index = (index * 26 + letter.charCodeAt(0) - 64) % alternativeColors.length;
  return alternativeColors[(index - 2 + alternativeColors.length) % alternativeColors.length];
}
