//+------------------------------------------------------------------+
//|                                   ASQ_SafeScalping_CodeBase.mq5  |
//|                AlgoSphere Quant - ASQ Safe Scalping v1.10        |
//|                https://www.mql5.com/en/users/robin2.0            |
//+------------------------------------------------------------------+
//|  Single-file Code Base version (free, open-source).              |
//|  v1.10: Trailing, MTF, DayCap, PartialClose, PeakDD             |
//|                                                                  |
//|  STRATEGY: 6 conditions (+ optional 7th MTF) must align:         |
//|    1. EMA Trend Direction  2. Trend Strength (ATR)               |
//|    3. Price Position       4. Breakout Detection                 |
//|    5. RSI Filter           6. Momentum Confirmation              |
//|    7. [Optional] Higher-TF EMA agreement                         |
//+------------------------------------------------------------------+
#property copyright   "AlgoSphere Quant"
#property link        "https://www.mql5.com/en/users/robin2.0"
#property version     "1.20"
#property description "ASQ Safe Scalping v1.20 - Professional Breakout Scalping System"
#property description "7-condition entry: EMA Trend + Breakout + RSI + MTF confirmation"
#property description "Trailing stop + Partial close (fixed) + Daily limiter + Peak DD tracker"
#property description "v1.20 bug fixes | Free open-source | AlgoSphere Quant"

#include <Trade\Trade.mqh>

enum ENUM_ASQ_LOT_MODE    { ASQ_LOT_FIXED=0, ASQ_LOT_RISK_PCT=1 };
enum ENUM_ASQ_TREND_STRENGTH { ASQ_TREND_WEAK=0, ASQ_TREND_MODERATE=1, ASQ_TREND_STRONG=2 };

input group "====== GENERAL ======"
input int               InpMagicNumber      = 202503;
input string            InpTradeComment     = "ASQv1";
input int               InpMaxSlippage      = 10;

input group "====== RISK ======"
input ENUM_ASQ_LOT_MODE InpLotMode          = ASQ_LOT_FIXED;
input double            InpFixedLots        = 0.01;
input double            InpRiskPercent      = 1.0;
input double            InpMaxDrawdownPct   = 10.0;
input int               InpMaxDayTrades     = 10;          // Max trades/day (0=unlimited)

input group "====== SL/TP ======"
input int               InpStopLoss         = 225;
input int               InpTakeProfit       = 250;
input bool              InpUseBreakeven     = true;
input int               InpBreakevenStart   = 100;
input int               InpBreakevenOffset  = 10;

input group "====== TRAILING ======"
input bool              InpUseTrailing      = false;
input int               InpTrailStart       = 150;
input int               InpTrailStep        = 50;

input group "====== PARTIAL CLOSE ======"
input bool              InpUsePartialClose  = false;
input int               InpTP1Points        = 150;
input double            InpTP1ClosePercent  = 50.0;

input group "====== EMA ======"
input int               InpEmaFast          = 150;
input int               InpEmaSlow          = 510;
input ENUM_ASQ_TREND_STRENGTH InpTrendStrength = ASQ_TREND_MODERATE;

input group "====== MTF ======"
input bool              InpUseMTF           = false;
input ENUM_TIMEFRAMES   InpMTFTimeframe     = PERIOD_H1;
input int               InpMTFEmaFast       = 50;
input int               InpMTFEmaSlow       = 200;

input group "====== RSI ======"
input int               InpRsiPeriod        = 10;
input double            InpRsiBuyMin=40.0, InpRsiBuyMax=65.0;
input double            InpRsiSellMin=35.0, InpRsiSellMax=60.0;

input group "====== BREAKOUT ======"
input int               InpBreakoutLookback = 20;
input double            InpBreakoutBuffer   = 0.5;
input int               InpAtrPeriod        = 125;

input group "====== SESSION ======"
input bool              InpUseSessionFilter = true;
input int               InpSessionStartHour=8, InpSessionEndHour=20;
input bool              InpAvoidFriday      = true;
input int               InpFridayCutoffHour = 16;

input group "====== SPREAD ======"
input bool              InpUseSpreadFilter  = true;
input int               InpMaxSpread        = 30;

input group "====== NEWS ======"
input bool              InpUseNewsFilter    = true;
input string            InpNewsTime1="", InpNewsTime2="", InpNewsTime3="";
input int               InpNewsMinsBefore=30, InpNewsMinsAfter=15;

CTrade   g_trade;
int      g_hEmaFast,g_hEmaSlow,g_hRsi,g_hAtr;
int      g_hHTFEmaFast,g_hHTFEmaSlow;
datetime g_lastBarTime=0;
double   g_peakBalance=0, g_peakDD=0;
ulong g_tp1Tickets[];
int g_tp1Count=0;
int      g_todayTrades=0;
datetime g_todayDate=0;
string   g_gvPeakDD;

int OnInit()
  {
   if(InpStopLoss<=0||InpTakeProfit<=0) return INIT_PARAMETERS_INCORRECT;
   if(InpEmaFast>=InpEmaSlow) return INIT_PARAMETERS_INCORRECT;
   g_trade.SetExpertMagicNumber(InpMagicNumber);
   g_trade.SetDeviationInPoints(InpMaxSlippage); g_trade.SetMarginMode();
   long fp=SymbolInfoInteger(_Symbol,SYMBOL_FILLING_MODE);
   if((fp&SYMBOL_FILLING_IOC)!=0) g_trade.SetTypeFilling(ORDER_FILLING_IOC);
   else if((fp&SYMBOL_FILLING_FOK)!=0) g_trade.SetTypeFilling(ORDER_FILLING_FOK);
   else g_trade.SetTypeFilling(ORDER_FILLING_RETURN);
   ENUM_TIMEFRAMES tf=(ENUM_TIMEFRAMES)Period();
   g_hEmaFast=iMA(_Symbol,tf,InpEmaFast,0,MODE_EMA,PRICE_CLOSE);
   g_hEmaSlow=iMA(_Symbol,tf,InpEmaSlow,0,MODE_EMA,PRICE_CLOSE);
   g_hRsi=iRSI(_Symbol,tf,InpRsiPeriod,PRICE_CLOSE);
   g_hAtr=iATR(_Symbol,tf,InpAtrPeriod);
   if(g_hEmaFast==INVALID_HANDLE||g_hEmaSlow==INVALID_HANDLE||g_hRsi==INVALID_HANDLE||g_hAtr==INVALID_HANDLE)
     return INIT_FAILED;
   g_hHTFEmaFast=INVALID_HANDLE; g_hHTFEmaSlow=INVALID_HANDLE;
   if(InpUseMTF)
     { g_hHTFEmaFast=iMA(_Symbol,InpMTFTimeframe,InpMTFEmaFast,0,MODE_EMA,PRICE_CLOSE);
       g_hHTFEmaSlow=iMA(_Symbol,InpMTFTimeframe,InpMTFEmaSlow,0,MODE_EMA,PRICE_CLOSE); }
   g_peakBalance=AccountInfoDouble(ACCOUNT_BALANCE);
   g_gvPeakDD="ASQ_PeakDD_"+_Symbol+"_"+IntegerToString(InpMagicNumber);
   if(!MQLInfoInteger(MQL_TESTER)&&GlobalVariableCheck(g_gvPeakDD)) g_peakDD=GlobalVariableGet(g_gvPeakDD);
   else { g_peakDD=0; if(!MQLInfoInteger(MQL_TESTER)) GlobalVariableSet(g_gvPeakDD,0); }
   CountTodayTrades();
   Print("[ASQ] Safe Scalping v1.10 | ",_Symbol," | ",EnumToString(tf)," | SL=",InpStopLoss," TP=",InpTakeProfit);
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  { if(g_hEmaFast!=INVALID_HANDLE) IndicatorRelease(g_hEmaFast);
    if(g_hEmaSlow!=INVALID_HANDLE) IndicatorRelease(g_hEmaSlow);
    if(g_hRsi!=INVALID_HANDLE) IndicatorRelease(g_hRsi);
    if(g_hAtr!=INVALID_HANDLE) IndicatorRelease(g_hAtr);
    if(g_hHTFEmaFast!=INVALID_HANDLE) IndicatorRelease(g_hHTFEmaFast);
    if(g_hHTFEmaSlow!=INVALID_HANDLE) IndicatorRelease(g_hHTFEmaSlow); }

void OnTick()
  {
   if(InpUseBreakeven) ManageBreakeven();
   if(InpUseTrailing) ManageTrailing();
   if(InpUsePartialClose) ManagePartialClose();

   datetime barTime=iTime(_Symbol,PERIOD_CURRENT,0);
   if(barTime==g_lastBarTime) return;
   g_lastBarTime=barTime;

   // DD check
   double bal=AccountInfoDouble(ACCOUNT_BALANCE);
   if(bal>g_peakBalance) g_peakBalance=bal;
   double eq=AccountInfoDouble(ACCOUNT_EQUITY);
   double dd=g_peakBalance>0?(g_peakBalance-eq)/g_peakBalance*100.0:0;
   if(dd>g_peakDD) { g_peakDD=dd; if(!MQLInfoInteger(MQL_TESTER)) GlobalVariableSet(g_gvPeakDD,g_peakDD); }
   if(g_peakBalance>0&&dd>=InpMaxDrawdownPct) return;

   // Day cap
   CheckDayReset();
   if(InpMaxDayTrades>0&&g_todayTrades>=InpMaxDayTrades) return;

   if(HasPosition()) return;
   if(InpUseSessionFilter&&!PassSession()) return;
   if(InpUseSpreadFilter&&(int)SymbolInfoInteger(_Symbol,SYMBOL_SPREAD)>InpMaxSpread) return;
   if(InpUseNewsFilter&&!PassNews()) return;

   // Indicators
   double emaF[],emaS[],rsi[],atr[];
   ArraySetAsSeries(emaF,true); ArraySetAsSeries(emaS,true);
   ArraySetAsSeries(rsi,true); ArraySetAsSeries(atr,true);
   int need=MathMax(InpBreakoutLookback+5,InpEmaSlow+5);
   if(CopyBuffer(g_hEmaFast,0,0,need,emaF)<need) return;
   if(CopyBuffer(g_hEmaSlow,0,0,need,emaS)<need) return;
   if(CopyBuffer(g_hRsi,0,0,5,rsi)<5) return;
   if(CopyBuffer(g_hAtr,0,0,5,atr)<5) return;
   double c1=iClose(_Symbol,PERIOD_CURRENT,1), c2=iClose(_Symbol,PERIOD_CURRENT,2);

   bool bullTrend=(emaF[1]>emaS[1]), bearTrend=(emaF[1]<emaS[1]);
   double sep=MathAbs(emaF[1]-emaS[1]), minSep=0;
   if(InpTrendStrength==ASQ_TREND_WEAK) minSep=atr[1]*0.1;
   if(InpTrendStrength==ASQ_TREND_MODERATE) minSep=atr[1]*0.3;
   if(InpTrendStrength==ASQ_TREND_STRONG) minSep=atr[1]*0.6;
   if(sep<minSep) return;

   bool aboveBoth=(c1>emaF[1]&&c1>emaS[1]), belowBoth=(c1<emaF[1]&&c1<emaS[1]);
   double hiH=0,loL=DBL_MAX;
   for(int i=2;i<=InpBreakoutLookback+1;i++)
     { double h=iHigh(_Symbol,PERIOD_CURRENT,i),l=iLow(_Symbol,PERIOD_CURRENT,i);
       if(h>hiH) hiH=h; if(l<loL) loL=l; }
   double buf=atr[1]*InpBreakoutBuffer;
   bool bullBreak=(c1>hiH-buf)&&(c2<=hiH), bearBreak=(c1<loL+buf)&&(c2>=loL);
   bool rsiBuy=(rsi[1]>=InpRsiBuyMin&&rsi[1]<=InpRsiBuyMax);
   bool rsiSell=(rsi[1]>=InpRsiSellMin&&rsi[1]<=InpRsiSellMax);
   bool bullMom=(c1>c2), bearMom=(c1<c2);

   // MTF check
   bool mtfBuy=true, mtfSell=true;
   if(InpUseMTF&&g_hHTFEmaFast!=INVALID_HANDLE)
     { double htfF[],htfS[]; ArraySetAsSeries(htfF,true); ArraySetAsSeries(htfS,true);
       if(CopyBuffer(g_hHTFEmaFast,0,0,3,htfF)>=3&&CopyBuffer(g_hHTFEmaSlow,0,0,3,htfS)>=3)
         { mtfBuy=(htfF[1]>htfS[1]); mtfSell=(htfF[1]<htfS[1]); } }

   double lot=CalcLot();
   if(lot<=0) return;   // insufficient margin — skip signal
   double pt=SymbolInfoDouble(_Symbol,SYMBOL_POINT);
   int dg=(int)SymbolInfoInteger(_Symbol,SYMBOL_DIGITS);

   if(bullTrend&&aboveBoth&&bullBreak&&rsiBuy&&bullMom&&mtfBuy)
     { double ask=SymbolInfoDouble(_Symbol,SYMBOL_ASK);
       g_trade.Buy(lot,_Symbol,ask,NormalizeDouble(ask-InpStopLoss*pt,dg),NormalizeDouble(ask+InpTakeProfit*pt,dg),InpTradeComment); }

   if(bearTrend&&belowBoth&&bearBreak&&rsiSell&&bearMom&&mtfSell)
     { double bid=SymbolInfoDouble(_Symbol,SYMBOL_BID);
       g_trade.Sell(lot,_Symbol,bid,NormalizeDouble(bid+InpStopLoss*pt,dg),NormalizeDouble(bid-InpTakeProfit*pt,dg),InpTradeComment); }
  }

void OnTrade() { CountTodayTrades(); }

//=== HELPERS ===
bool HasPosition()
  { for(int i=PositionsTotal()-1;i>=0;i--)
      if(PositionGetSymbol(i)==_Symbol&&PositionGetInteger(POSITION_MAGIC)==InpMagicNumber) return true;
    return false; }

double CalcLot()
  { double lot=InpFixedLots;
    if(InpLotMode==ASQ_LOT_RISK_PCT&&InpRiskPercent>0&&InpStopLoss>0)
      { double bal=AccountInfoDouble(ACCOUNT_BALANCE),risk=bal*MathMin(InpRiskPercent,5.0)/100.0;
        double tv=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_VALUE),ts=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE);
        double pt=SymbolInfoDouble(_Symbol,SYMBOL_POINT);
        if(tv>0&&ts>0){double slm=InpStopLoss*pt/ts*tv; if(slm>0) lot=NormalizeDouble(risk/slm,2);} }
    double mn=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN),mx=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MAX);
    double st=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP);
    if(lot<mn)lot=mn; if(lot>mx)lot=mx; if(st>0)lot=MathFloor(lot/st)*st;
    lot=NormalizeDouble(lot,2);
    // ── margin guard ──────────────────────────────────────────────
    double margin=0;
    if(!OrderCalcMargin(ORDER_TYPE_BUY,_Symbol,lot,SymbolInfoDouble(_Symbol,SYMBOL_ASK),margin))
       return 0;
    if(margin>AccountInfoDouble(ACCOUNT_FREEMARGIN)*0.95)
      { lot=NormalizeDouble(AccountInfoDouble(ACCOUNT_FREEMARGIN)*0.95/margin*lot,2);
        if(st>0) lot=MathFloor(lot/st)*st;
        lot=NormalizeDouble(lot,2); }
    if(lot<mn) return 0;
    return NormalizeDouble(lot,2); }

void ManageBreakeven()
  { double pt=SymbolInfoDouble(_Symbol,SYMBOL_POINT); int dg=(int)SymbolInfoInteger(_Symbol,SYMBOL_DIGITS);
    for(int i=PositionsTotal()-1;i>=0;i--)
      { if(PositionGetSymbol(i)!=_Symbol||PositionGetInteger(POSITION_MAGIC)!=InpMagicNumber) continue;
        double op=PositionGetDouble(POSITION_PRICE_OPEN),sl=PositionGetDouble(POSITION_SL);
        ulong tk=PositionGetInteger(POSITION_TICKET);
        if(PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY)
          { double be=NormalizeDouble(op+InpBreakevenOffset*pt,dg);
            if(SymbolInfoDouble(_Symbol,SYMBOL_BID)>=op+InpBreakevenStart*pt&&sl<be)
              g_trade.PositionModify(tk,be,PositionGetDouble(POSITION_TP)); }
        else
          { double be=NormalizeDouble(op-InpBreakevenOffset*pt,dg);
            if(SymbolInfoDouble(_Symbol,SYMBOL_ASK)<=op-InpBreakevenStart*pt&&(sl>be||sl==0))
              g_trade.PositionModify(tk,be,PositionGetDouble(POSITION_TP)); }
      } }

void ManageTrailing()
  { if(InpTrailStart<=0||InpTrailStep<=0) return;
    double pt=SymbolInfoDouble(_Symbol,SYMBOL_POINT); int dg=(int)SymbolInfoInteger(_Symbol,SYMBOL_DIGITS);
    for(int i=PositionsTotal()-1;i>=0;i--)
      { if(PositionGetSymbol(i)!=_Symbol||PositionGetInteger(POSITION_MAGIC)!=InpMagicNumber) continue;
        double op=PositionGetDouble(POSITION_PRICE_OPEN),sl=PositionGetDouble(POSITION_SL);
        ulong tk=PositionGetInteger(POSITION_TICKET);
        if(PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY)
          { double bid=SymbolInfoDouble(_Symbol,SYMBOL_BID);
            if((bid-op)/pt>=InpTrailStart)
              { double nsl=NormalizeDouble(bid-InpTrailStep*pt,dg);
                if(nsl>sl+pt) g_trade.PositionModify(tk,nsl,PositionGetDouble(POSITION_TP)); } }
        else
          { double ask=SymbolInfoDouble(_Symbol,SYMBOL_ASK);
            if((op-ask)/pt>=InpTrailStart)
              { double nsl=NormalizeDouble(ask+InpTrailStep*pt,dg);
                if(nsl<sl-pt||sl==0) g_trade.PositionModify(tk,nsl,PositionGetDouble(POSITION_TP)); } }
      } }

void ManagePartialClose()
  { if(InpTP1Points<=0||InpTP1ClosePercent<=0) return;
    double pt=SymbolInfoDouble(_Symbol,SYMBOL_POINT);
    double lotMin=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN);
    for(int i=PositionsTotal()-1;i>=0;i--)
      { if(PositionGetSymbol(i)!=_Symbol||PositionGetInteger(POSITION_MAGIC)!=InpMagicNumber) continue;
        double op=PositionGetDouble(POSITION_PRICE_OPEN),vol=PositionGetDouble(POSITION_VOLUME);
        ulong tk=PositionGetInteger(POSITION_TICKET);
        { bool found=false; for(int k=0;k<g_tp1Count;k++) if(g_tp1Tickets[k]==tk) {found=true;break;} if(found) continue; }
        double closeLot=NormalizeDouble(vol*InpTP1ClosePercent/100.0,2);
        if(closeLot<lotMin||vol-closeLot<lotMin) continue;
        if(PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY)
          { if(SymbolInfoDouble(_Symbol,SYMBOL_BID)>=op+InpTP1Points*pt)
              { g_trade.PositionClosePartial(tk,closeLot); g_tp1Count++; ArrayResize(g_tp1Tickets,g_tp1Count); g_tp1Tickets[g_tp1Count-1]=tk; } }
        else
          { if(SymbolInfoDouble(_Symbol,SYMBOL_ASK)<=op-InpTP1Points*pt)
              { g_trade.PositionClosePartial(tk,closeLot); g_tp1Count++; ArrayResize(g_tp1Tickets,g_tp1Count); g_tp1Tickets[g_tp1Count-1]=tk; } }
      } }

void CountTodayTrades()
  { CheckDayReset(); g_todayTrades=0;
    HistorySelect(0,TimeCurrent());
    MqlDateTime dt; TimeCurrent(dt); dt.hour=0; dt.min=0; dt.sec=0;
    datetime dayStart=StructToTime(dt);
    for(int i=HistoryDealsTotal()-1;i>=0;i--)
      { ulong tk=HistoryDealGetTicket(i); if(tk==0) continue;
        if(HistoryDealGetInteger(tk,DEAL_MAGIC)!=InpMagicNumber) continue;
        if(HistoryDealGetString(tk,DEAL_SYMBOL)!=_Symbol) continue;
        if(HistoryDealGetInteger(tk,DEAL_ENTRY)!=DEAL_ENTRY_IN) continue;
        if((datetime)HistoryDealGetInteger(tk,DEAL_TIME)>=dayStart) g_todayTrades++; } }

void CheckDayReset()
  { MqlDateTime dt; TimeCurrent(dt); dt.hour=0; dt.min=0; dt.sec=0;
    datetime today=StructToTime(dt);
    if(today!=g_todayDate) { g_todayDate=today; g_todayTrades=0; } }

bool PassSession()
  { MqlDateTime dt; TimeToStruct(TimeCurrent(),dt);
    if(dt.day_of_week==0||dt.day_of_week==6) return false;
    if(InpAvoidFriday&&dt.day_of_week==5&&dt.hour>=InpFridayCutoffHour) return false;
    return (dt.hour>=InpSessionStartHour&&dt.hour<InpSessionEndHour); }

bool PassNews()
  { datetime now=TimeCurrent();
    if(ChkNews(InpNewsTime1,now)) return false;
    if(ChkNews(InpNewsTime2,now)) return false;
    if(ChkNews(InpNewsTime3,now)) return false; return true; }

bool ChkNews(string ts,datetime now)
  { if(ts==""||StringLen(ts)<4) return false;
    int cp=StringFind(ts,":"); if(cp<0) return false;
    int nh=(int)StringToInteger(StringSubstr(ts,0,cp)),nm=(int)StringToInteger(StringSubstr(ts,cp+1));
    MqlDateTime d; TimeToStruct(now,d); d.hour=nh; d.min=nm; d.sec=0;
    datetime nt=StructToTime(d);
    return (now>=nt-InpNewsMinsBefore*60&&now<=nt+InpNewsMinsAfter*60); }

double OnTester()
  { double profit=TesterStatistics(STAT_PROFIT),trades=TesterStatistics(STAT_TRADES);
    double maxDD=TesterStatistics(STAT_EQUITY_DDREL_PERCENT),pf=TesterStatistics(STAT_PROFIT_FACTOR);
    double sharpe=TesterStatistics(STAT_SHARPE_RATIO),recovery=TesterStatistics(STAT_RECOVERY_FACTOR);
    double wr=trades>0?TesterStatistics(STAT_PROFIT_TRADES)/trades*100:0;
    if(trades<30||profit<=0||maxDD>InpMaxDrawdownPct||wr<40||pf<1.2) return 0;
    double fit=profit/MathMax(maxDD,0.1);
    if(wr>50) fit*=(1.0+(wr-50)/100.0); if(pf>1.5) fit*=(1.0+(pf-1.5)/10.0);
    if(sharpe>0) fit*=(1.0+sharpe/10.0); if(recovery>1) fit*=(1.0+MathMin(recovery,5.0)/10.0);
    return fit; }
//+------------------------------------------------------------------+
