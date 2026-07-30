export function parseBet(text) {
  const lines = text
    .split("\n")
    .map(v => v.trim())
    .filter(Boolean);

  const bets = [];

  for (const line of lines) {
    const m = line.match(/^(.+?)=(\d+)$/);

    if (!m) continue;

    bets.push({
      bet: m[1].trim(),
      amount: Number(m[2])
    });
  }

  return bets;
}
