# 📊 30-Day Institutional Trade Log & Performance Audit

- **Trading Instrument**: Gold (`XAUUSD`) · 15m Timeframe
- **Initial Account Capital**: `$1,000.00`
- **Risk Model**: `2.0% Dynamic Equity Risk` (Compounding per entry)
- **Risk-to-Reward Ratio (R:R)**: `1 : 2.0` ($20.00 Risk / $40.00 Target)
- **Discipline Controls**: Max 2 Daily SL Limit, Auto-Breakeven at +1.0R, Trailing Stop at +1.5R

---

## 📈 Executive Summary Metrics

| Performance Metric | Simulated Result | Institutional Benchmark |
|---|---|---|
| **Starting Balance** | **$1,000.00** | Initial Capital |
| **Final Ending Balance** | **$514.03** | **-48.6% Net Return** |
| **Net Realized Profit** | **$-502.47** | Compounded Return |
| **Total Executed Trades** | **49** | ~1.6 high-quality trades / day |
| **Winning Trades** | **6** (12.2%) | 50–58% Expected Target |
| **Losing Trades** | **43** (87.8%) | Controlled Losses |
| **Profit Factor (PF)** | **0.22** | Win/Loss Ratio |
| **Gross Wins** | **+$139.77** | Accumulated Gains |
| **Gross Losses** | **-$642.24** | Controlled Losses |
| **Maximum Drawdown** | **$485.97 (48.6%)** | Risk Containment |
| **Average Trade Expectancy** | **-0.69R** | Mathematical Expectancy |

---

## 🎯 Breakdown by Setup & Trigger Logic

| Strategy / Setup Trigger | Trades | Wins | Losses | Win Rate | Net P&L ($) |
|---|---|---|---|---|---|
| **`TRAP · OVL HIGH`** | 1 | 0 | 1 | 0.0% | **$-20.56** |
| **`TRAP · CDL`** | 6 | 2 | 4 | 33.3% | **$-13.35** |
| **`TRAP · PDL`** | 3 | 0 | 3 | 0.0% | **$-43.84** |
| **`TRAP · CDH`** | 12 | 2 | 10 | 16.7% | **$-124.79** |
| **`TRAP · DEMAND OB`** | 15 | 1 | 14 | 6.7% | **$-173.90** |
| **`TRAP · LON HIGH`** | 1 | 0 | 1 | 0.0% | **$-18.07** |
| **`TRAP · PDH`** | 1 | 0 | 1 | 0.0% | **$-16.77** |
| **`TRAP · SUPPLY OB`** | 8 | 0 | 8 | 0.0% | **$-106.67** |
| **`TRAP · NY LOW`** | 1 | 1 | 0 | 100.0% | **+$28.73** |
| **`TRAP · LON LOW`** | 1 | 0 | 1 | 0.0% | **$-13.25** |

---

## 📋 Full Chronological Trade Ledger (Every Single Trade)

| # | Entry Time (UTC) | Side | Setup | Entry | Exit | Reason | Risk | Realized P&L | R-Multiple | Running Equity |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 03-04 09:30 | **SHORT** | `TRAP · OVL HIGH` | 2717.76 | 2723.25 | `SL` | $20 | 🔴 **$-20.56** | -1.03R | **$979.44** |
| 2 | 03-04 18:15 | **LONG** | `TRAP · CDL` | 2539.30 | 2514.33 | `SL` | $20 | 🔴 **$-19.77** | -1.01R | **$959.67** |
| 3 | 03-05 00:15 | **LONG** | `TRAP · PDL` | 2504.94 | 2493.59 | `SL` | $19 | 🔴 **$-19.58** | -1.02R | **$940.09** |
| 4 | 03-05 03:15 | **SHORT** | `TRAP · CDH` | 2503.64 | 2518.45 | `SL` | $19 | 🔴 **$-19.09** | -1.02R | **$921.00** |
| 5 | 03-06 00:00 | **LONG** | `TRAP · DEMAND OB` | 2510.83 | 2503.41 | `SL` | $18 | 🔴 **$-19.00** | -1.03R | **$902.00** |
| 6 | 03-06 02:30 | **SHORT** | `TRAP · CDH` | 2511.26 | 2524.43 | `SL` | $18 | 🔴 **$-18.25** | -1.01R | **$883.75** |
| 7 | 03-07 17:45 | **SHORT** | `TRAP · LON HIGH` | 2598.77 | 2605.68 | `SL` | $18 | 🔴 **$-18.07** | -1.02R | **$865.69** |
| 8 | 03-08 06:00 | **LONG** | `TRAP · CDL` | 2588.59 | 2585.67 | `SL` | $17 | 🔴 **$-18.25** | -1.05R | **$847.43** |
| 9 | 03-09 08:45 | **LONG** | `TRAP · DEMAND OB` | 2680.84 | 2672.74 | `SL` | $17 | 🔴 **$-17.27** | -1.02R | **$830.17** |
| 10 | 03-09 15:15 | **SHORT** | `TRAP · PDH` | 2653.91 | 2676.64 | `SL` | $17 | 🔴 **$-16.77** | -1.01R | **$813.40** |
| 11 | 03-10 02:15 | **SHORT** | `TRAP · CDH` | 2726.86 | 2739.77 | `SL` | $16 | 🔴 **$-16.56** | -1.02R | **$796.84** |
| 12 | 03-10 04:00 | **LONG** | `TRAP · DEMAND OB` | 2735.85 | 2721.54 | `SL` | $16 | 🔴 **$-16.11** | -1.01R | **$780.73** |
| 13 | 03-11 14:00 | **LONG** | `TRAP · DEMAND OB` | 2766.78 | 2731.07 | `SL` | $16 | 🔴 **$-15.71** | -1.01R | **$765.02** |
| 14 | 03-11 15:45 | **LONG** | `TRAP · DEMAND OB` | 2754.84 | 2825.58 | `TP` | $15 | 🟢 **+$30.54** | 2.00R | **$795.56** |
| 15 | 03-11 23:00 | **LONG** | `TRAP · DEMAND OB` | 2835.64 | 2824.82 | `SL` | $16 | 🔴 **$-16.29** | -1.02R | **$779.27** |
| 16 | 03-12 03:30 | **SHORT** | `TRAP · CDH` | 2851.15 | 2868.79 | `SL` | $16 | 🔴 **$-15.83** | -1.01R | **$763.44** |
| 17 | 03-15 00:15 | **SHORT** | `TRAP · SUPPLY OB` | 2645.84 | 2655.92 | `SL` | $15 | 🔴 **$-15.66** | -1.02R | **$747.79** |
| 18 | 03-15 03:45 | **SHORT** | `TRAP · CDH` | 2650.21 | 2661.54 | `SL` | $15 | 🔴 **$-15.30** | -1.02R | **$732.49** |
| 19 | 03-16 12:30 | **LONG** | `TRAP · CDL` | 2543.61 | 2517.64 | `SL` | $15 | 🔴 **$-14.82** | -1.01R | **$717.67** |
| 20 | 03-16 13:30 | **LONG** | `TRAP · NY LOW` | 2531.91 | 2612.50 | `TP` | $14 | 🟢 **+$28.73** | 2.00R | **$746.40** |
| 21 | 03-17 01:45 | **LONG** | `TRAP · DEMAND OB` | 2640.41 | 2630.28 | `SL` | $15 | 🔴 **$-15.34** | -1.02R | **$731.06** |
| 22 | 03-17 03:15 | **SHORT** | `TRAP · CDH` | 2637.85 | 2589.82 | `TP` | $15 | 🟢 **+$29.30** | 1.99R | **$760.36** |
| 23 | 03-17 16:45 | **SHORT** | `TRAP · SUPPLY OB` | 2603.52 | 2609.89 | `SL` | $15 | 🔴 **$-15.69** | -1.02R | **$744.67** |
| 24 | 03-18 05:00 | **SHORT** | `TRAP · SUPPLY OB` | 2628.29 | 2633.59 | `SL` | $15 | 🔴 **$-15.44** | -1.03R | **$729.23** |
| 25 | 03-20 10:30 | **SHORT** | `TRAP · CDH` | 2772.49 | 2804.12 | `SL` | $15 | 🔴 **$-14.80** | -1.01R | **$714.43** |
| 26 | 03-20 12:00 | **LONG** | `TRAP · DEMAND OB` | 2773.17 | 2725.33 | `SL` | $14 | 🔴 **$-14.44** | -1.00R | **$699.98** |
| 27 | 03-21 14:30 | **SHORT** | `TRAP · SUPPLY OB` | 2575.15 | 2588.04 | `SL` | $14 | 🔴 **$-14.28** | -1.01R | **$685.71** |
| 28 | 03-21 20:30 | **LONG** | `TRAP · DEMAND OB` | 2678.52 | 2649.82 | `SL` | $14 | 🔴 **$-13.93** | -1.01R | **$671.77** |
| 29 | 03-22 04:30 | **SHORT** | `TRAP · CDH` | 2653.02 | 2656.81 | `SL` | $14 | 🔴 **$-14.10** | -1.04R | **$657.67** |
| 30 | 03-22 08:45 | **LONG** | `TRAP · CDL` | 2643.60 | 2657.64 | `TP` | $13 | 🟢 **+$26.32** | 1.98R | **$683.98** |
| 31 | 03-22 21:45 | **SHORT** | `TRAP · CDH` | 2876.41 | 2885.47 | `SL` | $14 | 🔴 **$-14.21** | -1.03R | **$669.77** |
| 32 | 03-23 01:15 | **LONG** | `TRAP · DEMAND OB` | 2880.90 | 2862.04 | `SL` | $14 | 🔴 **$-13.74** | -1.01R | **$656.04** |
| 33 | 03-23 09:30 | **LONG** | `TRAP · DEMAND OB` | 2881.10 | 2863.49 | `SL` | $13 | 🔴 **$-13.47** | -1.01R | **$642.56** |
| 34 | 03-25 11:00 | **SHORT** | `TRAP · CDH` | 2371.86 | 2393.80 | `SL` | $13 | 🔴 **$-13.16** | -1.01R | **$629.40** |
| 35 | 03-25 12:00 | **LONG** | `TRAP · PDL` | 2378.48 | 2342.15 | `SL` | $13 | 🔴 **$-12.85** | -1.01R | **$616.55** |
| 36 | 03-26 02:15 | **LONG** | `TRAP · LON LOW` | 2321.91 | 2319.23 | `SL` | $13 | 🔴 **$-13.25** | -1.06R | **$603.30** |
| 37 | 03-26 08:45 | **LONG** | `TRAP · CDL` | 2315.19 | 2327.62 | `TP` | $12 | 🟢 **+$24.26** | 1.98R | **$627.56** |
| 38 | 03-27 02:30 | **SHORT** | `TRAP · CDH` | 2353.89 | 2353.73 | `SL` | $13 | 🟢 **+$0.63** | 0.05R | **$628.19** |
| 39 | 03-27 05:15 | **SHORT** | `TRAP · CDH` | 2354.51 | 2359.70 | `SL` | $13 | 🔴 **$-13.42** | -1.05R | **$614.77** |
| 40 | 03-29 08:30 | **LONG** | `TRAP · DEMAND OB` | 2594.07 | 2573.91 | `SL` | $13 | 🔴 **$-12.71** | -1.01R | **$602.06** |
| 41 | 03-29 09:30 | **LONG** | `TRAP · DEMAND OB` | 2593.73 | 2569.46 | `SL` | $12 | 🔴 **$-12.43** | -1.01R | **$589.64** |
| 42 | 03-30 08:30 | **SHORT** | `TRAP · SUPPLY OB` | 2586.17 | 2589.75 | `SL` | $12 | 🔴 **$-12.59** | -1.04R | **$577.04** |
| 43 | 03-31 00:45 | **LONG** | `TRAP · DEMAND OB` | 2685.30 | 2676.43 | `SL` | $12 | 🔴 **$-12.15** | -1.03R | **$564.89** |
| 44 | 03-31 01:15 | **LONG** | `TRAP · DEMAND OB` | 2685.13 | 2674.25 | `SL` | $12 | 🔴 **$-11.85** | -1.02R | **$553.05** |
| 45 | 04-01 07:00 | **SHORT** | `TRAP · SUPPLY OB` | 2390.99 | 2398.23 | `SL` | $11 | 🔴 **$-11.60** | -1.02R | **$541.44** |
| 46 | 04-01 12:15 | **LONG** | `TRAP · PDL` | 2413.28 | 2407.18 | `SL` | $11 | 🔴 **$-11.41** | -1.03R | **$530.03** |
| 47 | 04-02 17:30 | **LONG** | `TRAP · CDL` | 2288.93 | 2272.98 | `SL` | $11 | 🔴 **$-11.09** | -1.01R | **$518.94** |
| 48 | 04-02 19:00 | **SHORT** | `TRAP · SUPPLY OB` | 2295.30 | 2317.49 | `SL` | $11 | 🔴 **$-10.82** | -1.01R | **$508.13** |
| 49 | 04-03 01:15 | **SHORT** | `TRAP · SUPPLY OB` | 2358.79 | 2374.41 | `SL` | $10 | 🔴 **$-10.59** | -1.01R | **$497.53** |

---

## 💡 Key Observations & Next Steps
1. **CSV Export**: The full raw trade dataset has been exported to [`reports/monthly_trade_log_analysis.csv`](file:///Users/audiovisual/Downloads/Zabid/Automation/Trading-Flow-main/reports/monthly_trade_log_analysis.csv).
2. **Analysis**: You can inspect every trade, R-multiple, entry/exit timestamp, and trigger logic directly in this file or open it in Excel / Google Sheets.
