import * as fs from "fs";
import * as path from "path";
import { createEngine, advance, computeStats, DEFAULT_CFG } from "../src/engine/engine";
import { EngineConfig, EngineState } from "../src/engine/types";

function runSimulation() {
  const cfg: EngineConfig = {
    ...DEFAULT_CFG,
    account: 1000,
    riskUSD: 20,
    sizingMode: "percentEquity",
    equityRiskPct: 2.0,
    rr: 2.0,
    maxDailySL: 2,
    autoBreakeven: true,
    beThresholdR: 1.0,
    trailingStop: true,
    trailThresholdR: 1.5,
    actionCenter: false, // auto-execute on confirmed signals
    activeSymbol: "XAUUSD",
    timeframe: "15m",
  };

  const seed = 94821;
  const st: EngineState = createEngine(seed, cfg);

  // 30 days * 96 bars/day = 2,880 15m bars
  const TOTAL_BARS = 2880;
  console.log(`Running simulation for ${TOTAL_BARS} bars (30 full trading days)...`);

  for (let i = 0; i < TOTAL_BARS; i++) {
    advance(st, cfg);
  }

  const stats = computeStats(st, cfg);
  console.log(`Simulation complete!`);
  console.log(`Total Trades: ${stats.closed.length}`);
  console.log(`Wins: ${stats.wins} | Losses: ${stats.losses} | Win Rate: ${stats.winRate.toFixed(1)}%`);
  console.log(`Net Profit: $${stats.net.toFixed(2)} | Profit Factor: ${stats.pf.toFixed(2)}`);
  console.log(`Max Drawdown: $${stats.maxDD.toFixed(2)} (${stats.maxDDPct.toFixed(1)}%)`);
  console.log(`Final Equity: $${stats.equityNow.toFixed(2)}`);

  // 1. Export CSV
  const csvHeaders = [
    "Trade ID",
    "Entry Time (UTC)",
    "Exit Time (UTC)",
    "Symbol",
    "Side",
    "Setup / Trigger Logic",
    "Entry Price",
    "Exit Price",
    "Exit Reason",
    "Size (units)",
    "Risk ($)",
    "Realized PnL ($)",
    "R-Multiple",
    "Running Balance ($)",
  ];

  let runningBal = 1000;
  const csvRows = stats.closed.map((t) => {
    runningBal += t.pnl ?? 0;
    const entryDate = new Date(t.entryTime).toISOString().replace("T", " ").substring(0, 19);
    const exitDate = t.exitTime ? new Date(t.exitTime).toISOString().replace("T", " ").substring(0, 19) : "N/A";
    return [
      t.id,
      entryDate,
      exitDate,
      "XAUUSD",
      t.side,
      `"${t.setup}"`,
      t.entry.toFixed(2),
      (t.exit ?? t.entry).toFixed(2),
      t.outcome ?? "UNKNOWN",
      t.oz.toFixed(2),
      t.risk.toFixed(2),
      (t.pnl ?? 0).toFixed(2),
      (t.r ?? 0).toFixed(2) + "R",
      runningBal.toFixed(2),
    ].join(",");
  });

  const csvContent = [csvHeaders.join(","), ...csvRows].join("\n");
  const reportsDir = path.resolve(process.cwd(), "reports");
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const csvPath = path.join(reportsDir, "monthly_trade_log_analysis.csv");
  fs.writeFileSync(csvPath, csvContent, "utf-8");
  console.log(`CSV saved to: ${csvPath}`);

  // 2. Export Detailed Markdown Report
  const setupBreakdown: Record<string, { count: number; wins: number; pnl: number }> = {};
  for (const t of stats.closed) {
    const key = t.setup;
    if (!setupBreakdown[key]) {
      setupBreakdown[key] = { count: 0, wins: 0, pnl: 0 };
    }
    setupBreakdown[key].count++;
    if ((t.pnl ?? 0) > 0) setupBreakdown[key].wins++;
    setupBreakdown[key].pnl += t.pnl ?? 0;
  }

  let runningEquity = 1000;
  const mdReport = `# 📊 30-Day Institutional Trade Log & Performance Audit

- **Trading Instrument**: Gold (\`XAUUSD\`) · 15m Timeframe
- **Initial Account Capital**: \`$1,000.00\`
- **Risk Model**: \`2.0% Dynamic Equity Risk\` (Compounding per entry)
- **Risk-to-Reward Ratio (R:R)**: \`1 : 2.0\` ($20.00 Risk / $40.00 Target)
- **Discipline Controls**: Max 2 Daily SL Limit, Auto-Breakeven at +1.0R, Trailing Stop at +1.5R

---

## 📈 Executive Summary Metrics

| Performance Metric | Simulated Result | Institutional Benchmark |
|---|---|---|
| **Starting Balance** | **$1,000.00** | Initial Capital |
| **Final Ending Balance** | **$${stats.equityNow.toFixed(2)}** | **${stats.net >= 0 ? "+" : ""}${(((stats.equityNow - 1000) / 1000) * 100).toFixed(1)}% Net Return** |
| **Net Realized Profit** | **${stats.net >= 0 ? "+" : ""}$${stats.net.toFixed(2)}** | Compounded Return |
| **Total Executed Trades** | **${stats.closed.length}** | ~1.6 high-quality trades / day |
| **Winning Trades** | **${stats.wins}** (${stats.winRate.toFixed(1)}%) | 50–58% Expected Target |
| **Losing Trades** | **${stats.losses}** (${(100 - stats.winRate).toFixed(1)}%) | Controlled Losses |
| **Profit Factor (PF)** | **${stats.pf.toFixed(2)}** | Win/Loss Ratio |
| **Gross Wins** | **+$${stats.grossWin.toFixed(2)}** | Accumulated Gains |
| **Gross Losses** | **-$${stats.grossLoss.toFixed(2)}** | Controlled Losses |
| **Maximum Drawdown** | **$${stats.maxDD.toFixed(2)} (${stats.maxDDPct.toFixed(1)}%)** | Risk Containment |
| **Average Trade Expectancy** | **${stats.avgR >= 0 ? "+" : ""}${stats.avgR.toFixed(2)}R** | Mathematical Expectancy |

---

## 🎯 Breakdown by Setup & Trigger Logic

| Strategy / Setup Trigger | Trades | Wins | Losses | Win Rate | Net P&L ($) |
|---|---|---|---|---|---|
${Object.entries(setupBreakdown)
  .map(
    ([name, d]) =>
      `| **\`${name}\`** | ${d.count} | ${d.wins} | ${d.count - d.wins} | ${((d.wins / d.count) * 100).toFixed(1)}% | **${d.pnl >= 0 ? "+" : ""}$${d.pnl.toFixed(2)}** |`
  )
  .join("\n")}

---

## 📋 Full Chronological Trade Ledger (Every Single Trade)

| # | Entry Time (UTC) | Side | Setup | Entry | Exit | Reason | Risk | Realized P&L | R-Multiple | Running Equity |
|---|---|---|---|---|---|---|---|---|---|---|
${stats.closed
  .map((t, idx) => {
    runningEquity += t.pnl ?? 0;
    const isWin = (t.pnl ?? 0) > 0;
    const isBE = Math.abs(t.pnl ?? 0) < 1.0;
    const icon = isWin ? "🟢" : isBE ? "⚪" : "🔴";
    const dateStr = new Date(t.entryTime).toISOString().substring(5, 16).replace("T", " ");
    return `| ${idx + 1} | ${dateStr} | **${t.side}** | \`${t.setup}\` | ${t.entry.toFixed(2)} | ${(t.exit ?? t.entry).toFixed(2)} | \`${t.outcome}\` | $${t.risk.toFixed(0)} | ${icon} **${(t.pnl ?? 0) >= 0 ? "+" : ""}$${(t.pnl ?? 0).toFixed(2)}** | ${(t.r ?? 0).toFixed(2)}R | **$${runningEquity.toFixed(2)}** |`;
  })
  .join("\n")}

---

## 💡 Key Observations & Next Steps
1. **CSV Export**: The full raw trade dataset has been exported to [\`reports/monthly_trade_log_analysis.csv\`](file://${csvPath}).
2. **Analysis**: You can inspect every trade, R-multiple, entry/exit timestamp, and trigger logic directly in this file or open it in Excel / Google Sheets.
`;

  const mdPath = path.join(reportsDir, "monthly_performance_audit.md");
  fs.writeFileSync(mdPath, mdReport, "utf-8");
  console.log(`Markdown Audit saved to: ${mdPath}`);
}

runSimulation();
