import ccxt
import pandas as pd
import pandas_ta as ta
import time
from datetime import datetime, timedelta

# --- CONFIGURATION ---
SYMBOL = 'BTC/USDT'
TIMEFRAME_MICRO = '1m'
TIMEFRAME_MACRO = '4h'
DAYS = 14
CAPITAL = 27.00
FEE_RATE = 0.0012 # 0.12% (Taker + Slippage)
EXCHANGE_ID = 'binance' # or 'bybit'

class BotLogic:
    """
    Replication of bot.js God Mode Logic
    """
    def __init__(self):
        self.candles_h4 = [] # Context
        self.rolling_rsi_baseline = 45.0
    
    def get_dynamic_params(self, regime):
        # Matches bot.js: getDynamicParams(regime)
        params = { 'rsiLimit': 55, 'tpMult': 2.0, 'slMult': 2.0, 'riskScale': 1.0 }
        
        if regime == 'TRENDING':
            params['rsiLimit'] = 65
            params['tpMult'] = 3.0
        elif regime == 'RANGING':
            params['rsiLimit'] = 45
            params['tpMult'] = 1.5
        elif regime == 'VOLATILE':
            params['riskScale'] = 0.5
            params['slMult'] = 3.0
            
        return params

    def detect_regime(self, adx, atr, atr_sma):
        if adx > 25: return 'TRENDING'
        if adx < 20: return 'RANGING'
        if atr_sma > 0 and atr > (atr_sma * 1.5): return 'VOLATILE'
        return 'NORMAL'
        
    def get_htf_bias(self, current_price):
        # Waterfall Logic: Price vs EMA50 on H4
        if len(self.candles_h4) < 50: return 'NEUTRAL'
        
        # We need to compute H4 EMA. 
        # In simulation, we will pass the CURRENT known H4 state.
        # For simplicity in this function, we assume the caller provides the H4 EMA.
        return 'NEUTRAL' 

def fetch_data():
    print(f"[DATA] Connecting to {EXCHANGE_ID}...")
    ex = getattr(ccxt, EXCHANGE_ID)()
    
    # 1. Fetch Micro (1m) - 14 Days
    # 14 days * 1440 mins = ~20160 candles. Limit 1000. Need loop.
    print(f"[DATA] Fetching {DAYS} days of {TIMEFRAME_MICRO} data...")
    micro_ohlcv = []
    since = ex.milliseconds() - (DAYS * 24 * 60 * 60 * 1000)
    
    while since < ex.milliseconds():
        try:
            ohlcv = ex.fetch_ohlcv(SYMBOL, TIMEFRAME_MICRO, since, 1000)
            if not ohlcv: break
            micro_ohlcv.extend(ohlcv)
            since = ohlcv[-1][0] + 60000 
            print(f"   -> Fetched {len(ohlcv)} candles... Last: {datetime.fromtimestamp(ohlcv[-1][0]/1000)}")
            time.sleep(0.5) # Rate limit
        except Exception as e:
            print(f"   [ERROR] {e}")
            break
            
    df_micro = pd.DataFrame(micro_ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
    df_micro['timestamp'] = pd.to_datetime(df_micro['timestamp'], unit='ms')
    
    # 2. Fetch Macro (4h)
    print(f"[DATA] Fetching {DAYS+5} days of {TIMEFRAME_MACRO} data (for context)...")
    macro_ohlcv = ex.fetch_ohlcv(SYMBOL, TIMEFRAME_MACRO, since=(ex.milliseconds() - ((DAYS+5)*24*3600*1000)), limit=200)
    df_macro = pd.DataFrame(macro_ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
    df_macro['timestamp'] = pd.to_datetime(df_macro['timestamp'], unit='ms')
    
    return df_micro, df_macro

def backtest():
    logic = BotLogic()
    
    # 1. Get Data
    try:
        df_m, df_h = fetch_data()
    except Exception as e:
        print(f"Failed to fetch data via CCXT. Ensure internet connection. Error: {e}")
        return

    print("[SIMULATION] Calculating Indicators...")
    # Micro Indicators
    df_m['EMA200'] = ta.ema(df_m['close'], length=200)
    df_m['RSI'] = ta.rsi(df_m['close'], length=21)
    df_m['ATR'] = ta.atr(df_m['high'], df_m['low'], df_m['close'], length=14)
    df_m['ADX'] = ta.adx(df_m['high'], df_m['low'], df_m['close'], length=14)['ADX_14']
    macd = ta.macd(df_m['close'])
    df_m['MACD_HIST'] = macd['MACDh_12_26_9']
    
    # ATR History for Volatility
    df_m['ATR_SMA'] = ta.sma(df_m['ATR'], length=50)

    # Macro Indicators
    df_h['EMA50'] = ta.ema(df_h['close'], length=50)
    
    # Run Loop
    balance = CAPITAL
    trades = []
    active_position = None # {entry, qty, sl, tp, type}
    
    print(f"[SIMULATION] Starting Time Machine... ({len(df_m)} ticks)")
    
    for i in range(200, len(df_m)):
        row = df_m.iloc[i]
        prev_row = df_m.iloc[i-1]
        
        current_price = row['close']
        timestamp = row['timestamp']
        
        # 0. Sync H4 Context (Look up latest H4 closed candle before this timestamp)
        # Inefficient to search every tick, but accurate.
        # Find H4 candle where timestamp < current_row.timestamp
        macro_ctx = df_h[df_h['timestamp'] < timestamp].iloc[-1]
        h4_ema = macro_ctx['EMA50']
        
        htf_bias = 'BULLISH' if macro_ctx['close'] > h4_ema else 'BEARISH'
        
        # 1. Regime
        regime = logic.detect_regime(row['ADX'], row['ATR'], row['ATR_SMA'])
        params = logic.get_dynamic_params(regime)
        
        # 2. Manage Position
        if active_position:
            p = active_position
            # Check Exit
            if row['low'] <= p['sl']:
                # SL Hit
                exit_price = p['sl'] # Assume filled at SL (Sim)
                pnl = (exit_price - p['entry']) * p['qty']
                fee = (exit_price * p['qty']) * FEE_RATE
                net_pnl = pnl - fee
                balance += net_pnl
                trades.append({'time': timestamp, 'type': 'SL', 'pnl': net_pnl, 'balance': balance})
                active_position = None
            elif row['high'] >= p['tp']:
                 # TP Hit
                exit_price = p['tp'] 
                pnl = (exit_price - p['entry']) * p['qty']
                fee = (exit_price * p['qty']) * FEE_RATE
                net_pnl = pnl - fee
                balance += net_pnl
                trades.append({'time': timestamp, 'type': 'TP', 'pnl': net_pnl, 'balance': balance})
                active_position = None
            # Trail Logic (Simplified)
            elif current_price > p['entry'] + (2 * p['atr']):
                 p['sl'] = max(p['sl'], p['entry'] + (0.5 * p['atr']))
                 
            continue # Skip Entry if in position

        # 3. Entry Logic (Long Only)
        if htf_bias == 'BEARISH': continue # Waterfall Block
        
        # Indicators
        ema = row['EMA200']
        rsi = row['RSI']
        hist = row['MACD_HIST']
        
        # Dynamic RSI Entry
        # Bot uses rolling 100-period low avg. Approximating to 45 for sim or calculating it?
        # Let's simple-calc average of last 100 RSI
        rsi_history = df_m['RSI'].iloc[i-100:i]
        rsi_lows = rsi_history[rsi_history < 50]
        rsi_baseline = rsi_lows.mean() if not rsi_lows.empty else 45
        dynamic_rsi = rsi_baseline + 5
        
        if (current_price > ema and 
            hist > 0 and 
            rsi < dynamic_rsi and 
            current_price > prev_row['high']): # Breakout
            
            # FEE GATE
            # Fee logic
            fee_mult = 1.5 if row['ADX'] > 40 else 2.5
            usable_bal = balance * 0.95
            qty = usable_bal / current_price
            est_fee = (qty * current_price) * FEE_RATE
            
            proj_profit = (params['tpMult'] * row['ATR']) * qty
            
            if proj_profit > (est_fee * fee_mult):
                # EXECUTE
                entry_fee = (qty * current_price) * FEE_RATE
                balance -= entry_fee # Deduced immediately? No, paid on settle in this sim logic but let's track net
                
                # We deduct entry fee from potential PnL later? 
                # Standards: Deduct Entry Fee from Balance NOW? 
                # Or just count it in Net PnL on exit. Let's do Standard (Simpler):
                # balance is equity.
                
                sl_dist = params['slMult'] * row['ATR']
                tp_dist = params['tpMult'] * row['ATR']
                
                active_position = {
                    'entry': current_price,
                    'qty': qty,
                    'sl': current_price - sl_dist,
                    'tp': current_price + tp_dist,
                    'atr': row['ATR'],
                    'fee_paid': est_fee # Approx
                }
                # trades.append({'time': timestamp, 'type': 'OPEN', 'price': current_price})

    # REPORT
    wins = len([t for t in trades if t['pnl'] > 0])
    losses = len(trades) - wins
    wr = (wins / len(trades) * 100) if trades else 0
    
    print("\n" + "="*40)
    print(f"[BACKTEST] Duration: {DAYS} Days")
    print(f"[BACKTEST] Total Trades: {len(trades)}")
    print(f"[BACKTEST] Avg Trades/Day: {len(trades)/DAYS:.1f}")
    print(f"[BACKTEST] Win Rate: {wr:.1f}%")
    print(f"[BACKTEST] Final Balance: ${balance:.2f} (Start: ${CAPITAL})")
    print(f"[BACKTEST] Net Profit: ${balance - CAPITAL:.2f}")
    print("="*40)

if __name__ == "__main__":
    backtest()
