//+------------------------------------------------------------------+
//| TradingFlow_NewsGuard.mq5                                       |
//| Native MT5 economic-calendar heartbeat for the Python bridge.   |
//+------------------------------------------------------------------+
#property strict
#property version   "1.00"

input int InpMinutesBefore = 30;
input int InpMinutesAfter  = 15;

void WriteStatus(const bool locked,const string label)
  {
   int handle=FileOpen("TradingFlow_NewsGuard.json",FILE_COMMON|FILE_WRITE|FILE_TXT|FILE_ANSI,0,CP_UTF8);
   if(handle==INVALID_HANDLE)
     {
      Print("TradingFlow NewsGuard: FileOpen failed: ",GetLastError());
      return;
     }
   string clean=label;
   StringReplace(clean,"\\","/");
   StringReplace(clean,"\"","'");
   StringReplace(clean,"\n"," ");
   StringReplace(clean,"\r"," ");
   StringReplace(clean,"\t"," ");
   string json=StringFormat("{\"updated_epoch\":%I64d,\"locked\":%s,\"minutes_before\":%d,\"minutes_after\":%d,\"label\":\"%s\"}",(long)TimeGMT(),locked ? "true" : "false",InpMinutesBefore,InpMinutesAfter,clean);
   FileWriteString(handle,json);
   FileClose(handle);
  }

void RefreshCalendarLock()
  {
   if(!TerminalInfoInteger(TERMINAL_CONNECTED) || TimeTradeServer()<=0)
     {
      WriteStatus(true,"Terminal disconnected - calendar fail closed");
      return;
     }
   datetime now=TimeTradeServer();
   datetime from=now-InpMinutesAfter*60;
   datetime until=now+InpMinutesBefore*60;
   MqlCalendarValue values[];
   ResetLastError();
   int count=CalendarValueHistory(values,from,until,NULL,"USD");
   if(count<0)
     {
      WriteStatus(true,StringFormat("Economic calendar unavailable (%d) - fail closed",GetLastError()));
      return;
     }

   bool locked=false;
   string label="No high-impact USD event in safety window";
   for(int i=0;i<count;i++)
     {
      MqlCalendarEvent event;
      if(!CalendarEventById(values[i].event_id,event))
        {
         WriteStatus(true,"Calendar event metadata unavailable - fail closed");
         return;
        }
      if(event.importance!=CALENDAR_IMPORTANCE_HIGH)
         continue;
      locked=true;
      int minutes=(int)MathRound((double)(values[i].time-now)/60.0);
      label=StringFormat("High-impact USD: %s (%+d min)",event.name,minutes);
      break;
     }
   WriteStatus(locked,label);
  }

int OnInit()
  {
   if(InpMinutesBefore<30 || InpMinutesAfter<15)
      return(INIT_PARAMETERS_INCORRECT);
   if(!EventSetTimer(60))
     {
      WriteStatus(true,"Calendar timer failed - fail closed");
      return(INIT_FAILED);
     }
   RefreshCalendarLock();
   Print("TradingFlow NewsGuard armed: -",InpMinutesBefore,"/+",InpMinutesAfter," minutes");
   return(INIT_SUCCEEDED);
  }

void OnTimer()
  {
   RefreshCalendarLock();
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   WriteStatus(true,"Calendar guard stopped - fail closed");
  }
