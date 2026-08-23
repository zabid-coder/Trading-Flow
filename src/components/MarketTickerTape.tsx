import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface TickerItem {
  symbol: string;
  name: string;
  price: string;
  change: string;
  isPositive: boolean;
  sparkline: number[];
}

interface Props {
  goldPrice?: number;
  dxyValue?: number;
}

export const MarketTickerTape: React.FC<Props> = ({ goldPrice = 2714.50, dxyValue = 104.25 }) => {
  const tickers: TickerItem[] = [
    {
      symbol: 'XAUUSD',
      name: 'Spot Gold',
      price: `$${goldPrice.toFixed(2)}`,
      change: '+0.85%',
      isPositive: true,
      sparkline: [2702, 2705, 2708, 2704, 2712, 2714.5],
    },
    {
      symbol: 'DXY',
      name: 'US Dollar Index',
      price: `${dxyValue.toFixed(2)}`,
      change: '-0.32%',
      isPositive: false,
      sparkline: [104.8, 104.6, 104.5, 104.4, 104.3, 104.25],
    },
    {
      symbol: 'US10Y',
      name: '10Y Yield',
      price: '4.218%',
      change: '-0.04%',
      isPositive: false,
      sparkline: [4.28, 4.26, 4.25, 4.23, 4.22, 4.218],
    },
    {
      symbol: 'SPX',
      name: 'S&P 500',
      price: '5,842.10',
      change: '+0.42%',
      isPositive: true,
      sparkline: [5810, 5820, 5815, 5835, 5840, 5842.1],
    },
    {
      symbol: 'BTCUSD',
      name: 'Bitcoin Spot',
      price: '$67,450',
      change: '+2.15%',
      isPositive: true,
      sparkline: [65800, 66200, 66900, 66400, 67100, 67450],
    },
  ];

  return (
    <div className="w-full overflow-x-auto no-scrollbar border-y border-white/5 bg-[#0a0a0a]/90 backdrop-blur-md py-1.5 px-4 font-mono text-[11px] select-none">
      <div className="flex items-center gap-6 min-w-max">
        <span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-[#f59e0b]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#f59e0b] animate-ping" />
          MARKETS
        </span>

        {tickers.map((t) => (
          <div key={t.symbol} className="flex items-center gap-2 border-r border-white/5 pr-6">
            <span className="font-bold text-white text-xs">{t.symbol}</span>
            <span className="text-slate-300 font-semibold">{t.price}</span>
            <span
              className={`flex items-center text-[10px] font-bold ${
                t.isPositive ? 'text-[#10b981]' : 'text-[#ef4444]'
              }`}
            >
              {t.isPositive ? <TrendingUp size={11} className="mr-0.5" /> : <TrendingDown size={11} className="mr-0.5" />}
              {t.change}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MarketTickerTape;
