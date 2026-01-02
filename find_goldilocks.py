import numpy as np
import pandas as pd

def calculate_rsi(prices, period=14):
    deltas = np.diff(prices)
    seed = deltas[:period+1]
    up = seed[seed >= 0].sum()/period
    down = -seed[seed < 0].sum()/period
    rs = up/down
    rsi = np.zeros_like(prices)
    rsi[:period] = 100. - 100./(1. + rs)

    for i in range(period, len(prices)):
        delta = prices[i] - prices[i-1]
        if delta > 0:
            upval = delta
            downval = 0.
        else:
            upval = 0.
            downval = -delta

        up = (up*(period-1) + upval)/period
        down = (down*(period-1) + downval)/period
        rs = up/down
        rsi[i] = 100. - 100./(1. + rs)
    return rsi

def calculate_ema(prices, period):
    return pd.Series(prices).ewm(span=period, adjust=False).mean().values

def calculate_macd(prices):
    ema12 = calculate_ema(prices, 12)
    ema26 = calculate_ema(prices, 26)
    macd_line = ema12 - ema26
    signal_line = pd.Series(macd_line).ewm(span=9, adjust=False).mean().values
    histogram = macd_line - signal_line
    return histogram, ema12, ema26

print("Searching for Goldilocks parameters...")
print("(Target: RSI < 58, MACD > 0, Price > EMA50)")

for trend_slope in [5, 10, 15, 20]:
    for pullback_slope in [-1, -2, -3, -4, -5, -8]:
        for pullback_len in range(4, 20):
            
            # Generate Data
            prices = []
            p = 50000
            # 140 bars trend
            for _ in range(140):
                p += trend_slope
                prices.append(p)
            
            # Pullback
            for _ in range(pullback_len):
                p += pullback_slope
                prices.append(p)
            
            # Check Metrics at end of pullback
            prices_arr = np.array(prices)
            rsi = calculate_rsi(prices_arr)[-1]
            hist, _, _ = calculate_macd(prices_arr)
            macd_val = hist[-1]
            ema50 = calculate_ema(prices_arr, 50)[-1]
            last_price = prices_arr[-1]

            if rsi < 59 and rsi > 45 and macd_val > 1.0 and last_price > ema50:
                print(f"FOUND MATCH! Trend={trend_slope}, PullbackSlope={pullback_slope}, Len={pullback_len}")
                print(f"   -> RSI: {rsi:.2f}, MACD: {macd_val:.2f}, Price: {last_price} (> {ema50:.2f})")
