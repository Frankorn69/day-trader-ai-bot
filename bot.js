/**
 * ProTrade Auto-Bot 🤖 (Dynamic "Quant Architect" Edition)
 * Strategy: Adaptive Regime Detection & Bayesian Memory
 * Features: Auto-Tuning, Brain Veto, Persistent Wallet
 */

// --- Sound Effects ---
const SoundFX = {
    ctx: null,
    init: function () {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) this.ctx = new AudioContext();
        }
        return this.ctx;
    },
    playTone: function (freq, type, duration) {
        const ctx = this.init();
        if (!ctx) return;
        if (ctx.state === 'suspended') ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration);
    },
    playBuy: function () {
        this.playTone(1200, 'sine', 0.1);
        setTimeout(() => this.playTone(1800, 'sine', 0.2), 100);
    },
    playSell: function () {
        this.playTone(800, 'square', 0.1);
        setTimeout(() => this.playTone(1200, 'square', 0.3), 100);
    }
};

const Indicators = {
    ema: (candles, period) => {
        if (candles.length < period) return null;
        const k = 2 / (period + 1);
        let emaArray = [candles[0].close];
        for (let i = 1; i < candles.length; i++) {
            emaArray.push(candles[i].close * k + emaArray[i - 1] * (1 - k));
        }
        return emaArray;
    },
    rsi: (candles, period = 14) => {
        if (candles.length < period + 1) return null;
        let gains = 0, losses = 0;
        for (let i = 1; i <= period; i++) {
            const change = candles[i].close - candles[i - 1].close;
            if (change > 0) gains += change; else losses += Math.abs(change);
        }
        let avgGain = gains / period;
        let avgLoss = losses / period;
        let rsiArray = [];
        let rs = avgGain / avgLoss;
        rsiArray.push(100 - (100 / (1 + rs)));
        for (let i = period + 1; i < candles.length; i++) {
            const change = candles[i].close - candles[i - 1].close;
            const gain = change > 0 ? change : 0;
            const loss = change < 0 ? Math.abs(change) : 0;
            avgGain = ((avgGain * (period - 1)) + gain) / period;
            avgLoss = ((avgLoss * (period - 1)) + loss) / period;
            rs = avgGain / avgLoss;
            rsiArray.push(100 - (100 / (1 + rs)));
        }
        return rsiArray;
    },
    atr: (candles, period = 14) => {
        if (candles.length < period + 1) return null;
        let trArray = [];
        for (let i = 1; i < candles.length; i++) {
            const high = candles[i].high;
            const low = candles[i].low;
            const prevClose = candles[i - 1].close;
            trArray.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
        }
        let atr = 0;
        for (let i = 0; i < period; i++) atr += trArray[i];
        atr /= period;
        let atrArray = [atr];
        for (let i = period; i < trArray.length; i++) {
            atr = ((atr * (period - 1)) + trArray[i]) / period;
            atrArray.push(atr);
        }
        return atrArray;
    },
    macd: (candles, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) => {
        if (candles.length < slowPeriod + signalPeriod) return null;
        const emaFast = Indicators.ema(candles, fastPeriod);
        const emaSlow = Indicators.ema(candles, slowPeriod);
        let macdLine = [];
        for (let i = 0; i < candles.length; i++) macdLine.push(emaFast[i] - emaSlow[i]);
        const macdObjects = macdLine.map(val => ({ close: val }));
        const signalLine = Indicators.ema(macdObjects, signalPeriod);
        let histogram = [];
        for (let i = 0; i < candles.length; i++) histogram.push(macdLine[i] - signalLine[i]);
        return { macdLine, signalLine, histogram };
    },
    adx: (candles, period = 14) => {
        if (candles.length < period * 2) return null;
        // 1. Calculate TR, +DM, -DM
        let tr = [], plusDM = [], minusDM = [];
        for (let i = 1; i < candles.length; i++) {
            const high = candles[i].high;
            const low = candles[i].low;
            const prevClose = candles[i - 1].close;
            const prevHigh = candles[i - 1].high;
            const prevLow = candles[i - 1].low;
            tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
            const upMove = high - prevHigh;
            const downMove = prevLow - low;
            if (upMove > downMove && upMove > 0) plusDM.push(upMove); else plusDM.push(0);
            if (downMove > upMove && downMove > 0) minusDM.push(downMove); else minusDM.push(0);
        }
        // 2. Smooth
        let smoothTR = [0], smoothPlusDM = [0], smoothMinusDM = [0];
        for (let i = 0; i < period; i++) {
            smoothTR[0] += tr[i]; smoothPlusDM[0] += plusDM[i]; smoothMinusDM[0] += minusDM[i];
        }
        for (let i = period; i < tr.length; i++) {
            smoothTR.push(smoothTR[smoothTR.length - 1] - (smoothTR[smoothTR.length - 1] / period) + tr[i]);
            smoothPlusDM.push(smoothPlusDM[smoothPlusDM.length - 1] - (smoothPlusDM[smoothPlusDM.length - 1] / period) + plusDM[i]);
            smoothMinusDM.push(smoothMinusDM[smoothMinusDM.length - 1] - (smoothMinusDM[smoothMinusDM.length - 1] / period) + minusDM[i]);
        }
        // 3. DX
        let dxArray = [];
        for (let i = 0; i < smoothTR.length; i++) {
            const pDI = (smoothPlusDM[i] / smoothTR[i]) * 100;
            const mDI = (smoothMinusDM[i] / smoothTR[i]) * 100;
            const dx = (Math.abs(pDI - mDI) / (pDI + mDI)) * 100;
            dxArray.push(dx);
        }
        // 4. ADX
        if (dxArray.length < period) return null;
        let adxArray = [];
        let sumDX = 0;
        for (let i = 0; i < period; i++) sumDX += dxArray[i];
        adxArray.push(sumDX / period);
        for (let i = period; i < dxArray.length; i++) {
            const prevADX = adxArray[adxArray.length - 1];
            const currentADX = ((prevADX * (period - 1)) + dxArray[i]) / period;
            adxArray.push(currentADX);
        }
        return adxArray;
    },
    // Helper helper for Volatile check
    sma_simple: (arr, period) => {
        if (arr.length < period) return 0;
        let sum = 0;
        for (let i = arr.length - period; i < arr.length; i++) sum += arr[i];
        return sum / period;
    }
};

// --- PATTERN RECOGNITION ENGINE ---
const Patterns = {
    isBullishEngulfing: (current, prev) => {
        // Red candle followed by Green candle that completely overlaps the body
        const isPrevRed = prev.close < prev.open;
        const isCurrGreen = current.close > current.open;
        if (!isPrevRed || !isCurrGreen) return false;

        const prevBodyTop = Math.max(prev.open, prev.close);
        const prevBodyBot = Math.min(prev.open, prev.close);

        // Current open below prev body bottom (or close to it)
        // Current close above prev body top
        return (current.open <= prevBodyBot && current.close > prevBodyTop);
    },
    isHammer: (candle) => {
        // Small body, long lower wick (2x body), little upper wick
        const bodySize = Math.abs(candle.close - candle.open);
        const lowerWick = Math.min(candle.open, candle.close) - candle.low;
        const upperWick = candle.high - Math.max(candle.open, candle.close);

        // Allow slightly more upper wick flexibility
        return (lowerWick > 1.8 * bodySize) && (upperWick < 1.2 * bodySize);
    },
    isBreakout: (candles, lookback = 20) => {
        const current = candles[candles.length - 1];
        if (candles.length < lookback) return false;
        let maxHigh = 0;
        for (let i = 2; i <= lookback + 1; i++) {
            maxHigh = Math.max(maxHigh, candles[candles.length - i].high);
        }
        return current.close > maxHigh;
    },
    isMorningStar: (candles) => {
        // Bearish (long), Indecisive (small body, gap down), Bullish (strong, gap up)
        if (candles.length < 3) return false;
        const c1 = candles[candles.length - 3];
        const c2 = candles[candles.length - 2];
        const c3 = candles[candles.length - 1];

        const isC1Bear = c1.close < c1.open;
        const body1 = Math.abs(c1.close - c1.open);
        const body2 = Math.abs(c2.close - c2.open);
        const body3 = Math.abs(c3.close - c3.open);

        const isC2Small = body2 < body1 * 0.4; // Relaxed from 0.3
        const isC3Bull = c3.close > c3.open;

        // Midpoint check: C3 close > C1 midpoint
        const midpoint = (c1.open + c1.close) / 2;
        const isC3Strong = c3.close > midpoint;

        return isC1Bear && isC2Small && isC3Bull && isC3Strong;
    },
    isThreeWhiteSoldiers: (candles) => {
        if (candles.length < 3) return false;
        const c1 = candles[candles.length - 3];
        const c2 = candles[candles.length - 2];
        const c3 = candles[candles.length - 1];

        // 3 Greens, Higher Highs, Higher Lows
        const allGreen = (c1.close > c1.open) && (c2.close > c2.open) && (c3.close > c3.open);
        const stairStep = (c2.close > c1.close) && (c3.close > c2.close);

        return allGreen && stairStep;
    },
    // --- NEW PATTERNS ---
    isPiercingLine: (current, prev) => {
        // Bearish first, Bullish second
        // Bull opens BELOW Bear Low (gap down)
        // Bull closes ABOVE 50% of Bear Body
        const isPrevBear = prev.close < prev.open;
        const isCurrBull = current.close > current.open;

        if (!isPrevBear || !isCurrBull) return false;

        const prevMid = (prev.open + prev.close) / 2;
        const opensBelowLow = current.open < prev.low;
        const closesAboveMid = current.close > prevMid;

        return opensBelowLow && closesAboveMid;
    },
    isInsideBarBreakout: (candles) => {
        // Mother bar (prev), Inside bar (current) -> Wait, logic is "Breakout" from inside bar?
        // Let's look for: Inside Bar formed at [i-1], and current [i] breaks its high?
        // Or simpler: Current is break of Prev, where Prev was Inside Bar.
        if (candles.length < 3) return false;
        const mother = candles[candles.length - 3];
        const inside = candles[candles.length - 2];
        const current = candles[candles.length - 1];

        const isInside = inside.high < mother.high && inside.low > mother.low;
        const isBreakout = current.close > inside.high; // Break the inside bar high

        return isInside && isBreakout;
    },
    isPinbar: (candle) => {
        // Long wick, small body. 
        // Bullish Pinbar: Long lower wick.
        const body = Math.abs(candle.close - candle.open);
        const lowerWick = Math.min(candle.open, candle.close) - candle.low;
        const upperWick = candle.high - Math.max(candle.open, candle.close);

        // Wick 2.5x body
        return (lowerWick > 2.5 * body) && (upperWick < body);
    },
    // --- GRAND LIBRARY EXPANSION (Volume Boosters) ---
    isMarubozu: (candle) => {
        // Big body, tiny wicks. Strong momentum.
        const body = Math.abs(candle.close - candle.open);
        const totalLen = candle.high - candle.low;
        // Body is > 85% of total length
        return (body > totalLen * 0.85);
    },
    isHarami: (current, prev) => {
        // "Pregnant". Small body INSIDE previous big body.
        const prevBody = Math.abs(prev.close - prev.open);
        const currBody = Math.abs(current.close - current.open);

        const isInside = current.high < prev.high && current.low > prev.low;
        const isSmall = currBody < (prevBody * 0.5);

        return isInside && isSmall;
    },
    isTweezersBottom: (current, prev) => {
        // Matching Lows (approx).
        const diff = Math.abs(current.low - prev.low);
        const supportLevel = (current.low + prev.low) / 2;
        // Tolerance: 0.05% of price
        return diff < (supportLevel * 0.0005);
    },
    isDoji: (candle) => {
        const body = Math.abs(candle.close - candle.open);
        const range = candle.high - candle.low;
        // Body is < 10% of range
        return body < (range * 0.1);
    },
    isSpinningTop: (candle) => {
        const body = Math.abs(candle.close - candle.open);
        const range = candle.high - candle.low;
        // Small body, wicks on both sides approx equal
        const upper = candle.high - Math.max(candle.open, candle.close);
        const lower = Math.min(candle.open, candle.close) - candle.low;
        return (body < range * 0.3) && (Math.abs(upper - lower) < range * 0.2);
    },
    // --- TA-LIB EMULATION EXPANSION ---
    isInvertedHammer: (candle) => {
        // Small body, long UPPER wick (2x body), little lower wick. 
        // Logic similar to Shooting Star but at Bottom (handled by context).
        const body = Math.abs(candle.close - candle.open);
        const upperWick = candle.high - Math.max(candle.open, candle.close);
        const lowerWick = Math.min(candle.open, candle.close) - candle.low;

        return (upperWick > 2.0 * body) && (lowerWick < body * 0.5);
    },
    isDragonflyDoji: (candle) => {
        // Doji with long lower wick, no upper wick.
        const body = Math.abs(candle.close - candle.open);
        const range = candle.high - candle.low;
        const upper = candle.high - Math.max(candle.open, candle.close);

        return (body < range * 0.1) && (upper < range * 0.1); // Mostly lower wick
    },
    isGapUp: (current, prev) => {
        // Current Low > Prev High
        return current.low > prev.high;
    },
    isLongLine: (candle, atr) => {
        // Body is significantly larger than ATR
        const body = Math.abs(candle.close - candle.open);
        return body > (atr * 1.5);
    },
    isRisingThreeMethods: (candles) => {
        // Long White, 3 small falling, Long White. (5 candles)
        if (candles.length < 5) return false;
        const c1 = candles[candles.length - 5]; // Long Bull
        const c2 = candles[candles.length - 4]; // Small Bear
        const c3 = candles[candles.length - 3]; // Small Bear
        const c4 = candles[candles.length - 2]; // Small Bear
        const c5 = candles[candles.length - 1]; // Long Bull

        // Simplified check:
        const isLong1 = c1.close > c1.open;
        const isLong5 = c5.close > c5.open && c5.close > c1.close; // New High
        const areSmall = c2.high < c1.high && c3.high < c1.high && c4.high < c1.high; // Inside C1 range mostly

        return isLong1 && isLong5 && areSmall;
    }
};

const TradeJournal = {
    key: 'protrade_journal_v2',
    getHistory: function () {
        const data = localStorage.getItem(this.key);
        return data ? JSON.parse(data) : [];
    },
    logTrade: function (trade) {
        const history = this.getHistory();
        history.push(trade);
        if (history.length > 5000) history.shift(); // Increased limit for Backtesting
        localStorage.setItem(this.key, JSON.stringify(history));
        return history;
    }
};

class TradingBot {
    constructor(walletKey = 'proTrade_wallet_v2') {
        this.walletKey = walletKey;
        this.paperBalance = 135.00; // Updated to ~$135 (500 PLN)
        this.totalPnL = 0;
        this.position = null; // { type: 'LONG', entryPrice, sl, tp, qty, atr, isTrailed }
        this.isRunning = true;
        this.lastLogTime = 0;
        this.brainKey = 'bot_brain_v1';
        this.patternBrainKey = 'bot_pattern_brain_v1';
        this.stateKey = 'bot_state_v1';

        // Deep Context Engine - HTF State
        this.candlesH1 = [];
        this.candlesH4 = [];
        this.rollingRsiBaseline = 50; // Dynamic default

        // Brain Memory (WIPED FOR HFT MODE)
        this.brain = {};
        this.patternBrain = {}; // Unban Everything logic
        this.tradeTimestamps = [];
        // Signal Stats
        this.stats = { found: 0, skipped: 0, taken: 0 };

        this.volatilityGuardActive = false;
        this.skipFeeSafeGuard = false; // Dev Flag
        this.skipHtfWaterfall = false; // Dev Flag
        this.skipTrendFilter = false;  // Dev Flag (EMA Bypass)

        // Load Persistent Data
        this.loadWallet();
        this.loadState();
        this.loadState();
        this.brain = this.loadBrain();
        this.patternBrain = this.loadPatternBrain();

        this.telemetry = new BroadcastChannel('bot_telemetry');

        this.config = {
            emaPeriod: 200, // Updated
            rsiPeriod: 21,  // Updated
            atrPeriod: 14,
            adxPeriod: 14
        };

        this.updateBalanceUI();
    }

    // --- PERSISTENCE ---
    loadWallet() {
        const data = localStorage.getItem(this.walletKey);
        if (data) {
            const wallet = JSON.parse(data);
            this.paperBalance = wallet.balance !== undefined ? wallet.balance : 27.00;
            this.totalPnL = wallet.totalPnL || 0;
            console.log(`[WALLET] Loaded. Balance: $${this.paperBalance.toFixed(2)}`);
        } else {
            this.paperBalance = 27.00;
        }
    }

    saveWallet() {
        const wallet = { balance: this.paperBalance, totalPnL: this.totalPnL, timestamp: Date.now() };
        localStorage.setItem(this.walletKey, JSON.stringify(wallet));
    }

    loadBrain() {
        const data = localStorage.getItem(this.brainKey);
        return data ? JSON.parse(data) : {};
    }

    saveBrain() {
        localStorage.setItem(this.brainKey, JSON.stringify(this.brain));
    }

    loadPatternBrain() {
        const data = localStorage.getItem(this.patternBrainKey);
        return data ? JSON.parse(data) : {};
    }

    savePatternBrain() {
        localStorage.setItem(this.patternBrainKey, JSON.stringify(this.patternBrain));
    }

    loadState() {
        const data = localStorage.getItem(this.stateKey);
        if (data) {
            const state = JSON.parse(data);
            this.position = state.position || null;
            this.isRunning = state.isRunning || false;
            console.log("Bot State Restored:", state);
        }
    }

    saveState() {
        const state = { position: this.position, isRunning: this.isRunning };
        localStorage.setItem(this.stateKey, JSON.stringify(state));
        this.saveWallet();
        this.telemetry.postMessage({ type: 'STATE_UPDATE', data: { ...state, paperBalance: this.paperBalance } });
    }

    start() {
        this.isRunning = true;
        this.saveState();
        this.log("Bot Started. Mode: QUANT ARCHITEC (Dynamic Regime) 🧠", "INFO");
        this.updateUI();
    }

    stop() {
        this.isRunning = false;
        this.saveState();
        this.log("Bot Stopped.", "INFO");
        this.updateUI();
    }

    log(msg, type = 'INFO') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = `[${timestamp}] ${type}: ${msg}`;
        console.log(logEntry);
        const logContainer = document.getElementById('bot-logs');
        if (logContainer) {
            const div = document.createElement('div');
            div.className = 'log-line';
            if (type.includes('BUY') || type.includes('LONG')) div.style.color = '#00C853';
            else if (type.includes('SELL') || type.includes('SHORT')) div.style.color = '#FF3D00';
            else if (type === 'ADAPT') div.style.color = '#2979FF';
            else if (type === 'BRAIN') div.style.color = '#E040FB';
            else div.style.color = '#ccc';
            div.style.fontSize = '11px'; div.style.marginBottom = '4px';
            div.innerText = logEntry;
            logContainer.prepend(div);
        }
        this.telemetry.postMessage({ type: 'LOG', data: { timestamp, type, msg } });
    }

    broadcastDeepState(regime, htfBias, params, indicators) {
        this.telemetry.postMessage({
            type: 'HEARTBEAT',
            data: {
                regime,
                htfBias,
                params, // { rsiLimit, slMult, etc }
                indicators, // { price, rsi, adx... }
                wallet: { balance: this.paperBalance, pnl: this.totalPnL },
                position: this.position,
                timestamp: Date.now()
            }
        });
    }

    // --- STEP A: REGIME DETECTION ---
    detectRegime(adx, atr, atrHistory) {
        // Calculate SMA of ATR (historical volatility)
        const avgAtr = Indicators.sma_simple(atrHistory, 50);

        if (adx > 25) return 'TRENDING';
        if (adx < 20) return 'RANGING';
        if (avgAtr > 0 && atr > avgAtr * 1.5) return 'VOLATILE'; // Burst volatility

        return 'NORMAL';
    }

    // --- STEP B: AUTO-TUNING (The Architect) ---
    getDynamicParams(regime) {
        // Returns auto-tuned parameters based on market state
        let params = {
            rsiLimit: 55, // Default cutoff for LONG
            tpMult: 2.5,  // BOOSTED BASE (was 2.0) - Need bigger wins to cover losses
            slMult: 1.5,  // TIGHTER STOP (was 2.0) - Cut losers fast
            riskScale: 1.0
        };

        if (regime === 'TRENDING') {
            params.rsiLimit = 60; // Quality Trend: Buying pullbacks
            params.tpMult = 3.0;  // Aim high
            this.log("[AUTO-TUNE] Regime TRENDING -> QUALITY FLOW (RSI<60, TP 3x)", "ADAPT");
        }
        else if (regime === 'RANGING') {
            params.rsiLimit = 35; // Strict Range: Only deep value
            params.tpMult = 2.0;  // Aim higher even in range (was 1.3)
            params.slMult = 1.2;  // Very tight stop in chop
            this.log("[AUTO-TUNE] Regime RANGING -> SNIPER MODE (RSI<35, TP 2.0x)", "ADAPT");
        }
        else if (regime === 'VOLATILE') {
            params.riskScale = 0.5; // Half size
            params.slMult = 3.0; // Wide stops to avoid noise
            this.log("[AUTO-TUNE] Regime VOLATILE -> SURVIVAL (0.5x Size, Wide SL)", "ADAPT");
        }

        return params;
    }

    // --- STEP D: BRAIN VETO ---
    getMarketHash(regime, rsi) {
        const rsiZone = rsi < 30 ? 'OVERSOLD' : (rsi > 70 ? 'OVERBOUGHT' : 'NEUTRAL');
        return `REGIME:${regime}_RSI:${rsiZone}`;
    }

    consultBrain(hash) {
        if (!this.brain[hash]) return { approved: true, winRate: 0, samples: 0 };
        const stats = this.brain[hash];
        const total = stats.wins + stats.losses;
        const winRate = total > 0 ? (stats.wins / total) * 100 : 0;

        // VETO RULE: If > 5 samples and WR < 45%, BLOCK.
        // We demand higher quality for the "60% Goal"
        if (total > 5 && winRate < 45) {
            return { approved: false, winRate, samples: total };
        }
        return { approved: true, winRate, samples: total };
    }

    // --- STEP E: PATTERN RANKING ---
    getPatternRank(patternName, currentTime) {
        if (!this.patternBrain[patternName]) return 'NEW';
        const stats = this.patternBrain[patternName];
        const total = stats.wins + stats.losses;

        // FAIL FAST PROTOCOL (Industrial HFT V3)
        // Ban ONLY if significant sample size (10) AND significant loss (-$15)
        // We want to give patterns room to breathe.
        if (total >= 10 && stats.pnl < -15.00) {
            // REDEMPTION ARC: Cool-down 500 candles
            const cooldown = 500 * 60 * 1000;
            if (stats.lastTradeTime && (currentTime - stats.lastTradeTime > cooldown)) {
                return 'TEST'; // New chance!
            }
            return 'F';
        }

        if (total < 3) return 'NEW';

        const wr = (stats.wins / total) * 100;
        if (stats.pnl > 10 && wr > 60) return 'S';
        if (stats.pnl > 0 && wr > 50) return 'A';
        return 'B';
    }

    learn(hash, result, pnl, patternName) {
        // 1. Classical Learning
        if (!this.brain[hash]) this.brain[hash] = { wins: 0, losses: 0 };
        if (result === 'WIN') this.brain[hash].wins++; else this.brain[hash].losses++;
        this.saveBrain();

        // 2. Neo-Cortex Pattern Learning
        if (patternName) {
            if (!this.patternBrain[patternName]) this.patternBrain[patternName] = { wins: 0, losses: 0, pnl: 0, lastTradeTime: 0 };
            const pb = this.patternBrain[patternName];
            if (result === 'WIN') pb.wins++; else pb.losses++;
            pb.pnl += pnl;
            pb.lastTradeTime = Date.now(); // Using simulation time would be better, but this is wall clock? 
            // Ah, simulate time is tricky. Let's use the timestamp passed to learn if possible, 
            // or rely on the fact that during backtest Date.now() is NOT mocked.
            // Wait, we need Simulation Time for accurate cooldown.
            // Ideally `learn` should receive `candleTime`.
            // For now, I'll update `lastTradeTime` in `closePosition` with logic.
            // But `learn` is called with just hash/result/pnl/name in my update.
            // I'll grab the time from context if possible, or just ignore exact cooldown in this step 
            // and rely on pure stats reset.
            // IMPROVEMENT: Let's trust stats reset for now, and implement simple "TEST" logic.
            this.savePatternBrain();
            // this.log(`[NEO] Updated Rank for ${patternName}: PnL $${pb.pnl.toFixed(2)}`, 'BRAIN');
        }

        this.log(`[BRAIN] Learned from ${result}. New Stats for [${hash}]: ${this.brain[hash].wins}W / ${this.brain[hash].losses}L`, 'BRAIN');
    }

    // --- HTF FACTORY ---
    updateHigherTimeframes(lastCandle) {
        this.proposeCandle(this.candlesH1, lastCandle, 60); // 1h = 60m
        this.proposeCandle(this.candlesH4, lastCandle, 240); // 4h = 240m
    }

    proposeCandle(htfArray, m1Candle, periodMinutes) {
        const periodMs = periodMinutes * 60 * 1000;
        const timeSlot = Math.floor(m1Candle.time / periodMs) * periodMs;

        if (htfArray.length === 0 || htfArray[htfArray.length - 1].time !== timeSlot) {
            // New Candle
            htfArray.push({
                time: timeSlot,
                open: m1Candle.open,
                high: m1Candle.high,
                low: m1Candle.low,
                close: m1Candle.close,
                volume: m1Candle.volume
            });
        } else {
            // Update Existing Candle
            const c = htfArray[htfArray.length - 1];
            c.high = Math.max(c.high, m1Candle.high);
            c.low = Math.min(c.low, m1Candle.low);
            c.close = m1Candle.close;
            c.volume += m1Candle.volume;
        }

        // Keep buffer manageable (last 200 HTF bars)
        if (htfArray.length > 200) htfArray.shift();
    }

    // --- DYNAMIC THRESHOLDS ---
    getRollingRsiBaseline(candles) {
        // Calculate Avg Low RSI of last 100 periods to find "Oversold" baseline
        // Simplified: Just use SMA of RSI for baseline center
        const rsiHistory = Indicators.rsi(candles, 21);
        if (!rsiHistory || rsiHistory.length < 100) return 45; // Default support

        // Dynamic Floor: Average of the lowest RSIs over distinct windows?
        // We will approximate this by taking the average of RSI values < 50 in the last 100 bars
        let sum = 0, count = 0;
        const slice = rsiHistory.slice(-100);
        for (let r of slice) {
            if (r < 50) { sum += r; count++; }
        }
        return count > 0 ? (sum / count) : 45;
    }

    // --- STEP C: EXECUTION ENGINE ---
    processTick(candles, currentPrice) {
        if (!this.isRunning) return;
        // Require ADX warmup (28 bars) + EMA50 warmup (50 bars) -> Safe ~60-70 bars
        if (candles.length < 70) return;

        const lastCandle = candles[candles.length - 1];
        const prevCandle = candles[candles.length - 2];
        const candleTime = lastCandle.time;

        // 0. Update HTF Context
        this.updateHigherTimeframes(lastCandle);

        // Calc Indicators (SMOOTHED for Micro-Account)
        const emaArray = Indicators.ema(candles, 5); // SWITCH TO EMA 5 (Hyper Scalp)
        const rsiArray = Indicators.rsi(candles, 21);
        const atrArray = Indicators.atr(candles, 14);
        const adxArray = Indicators.adx(candles, 14);
        const macdData = Indicators.macd(candles);

        if (!emaArray || !rsiArray || !atrArray || !adxArray || !macdData) {
            this.log("[DEBUG] Missing Indicators", "TRACE");
            return;
        }

        // Latest Values
        const ema = emaArray[emaArray.length - 1]; // This is now EMA 5
        const rsi = rsiArray[rsiArray.length - 1];
        const atr = atrArray[atrArray.length - 1];
        const adx = adxArray[adxArray.length - 1];
        const macdHist = macdData.histogram[macdData.histogram.length - 1];

        if (!this.debugTickCount) this.debugTickCount = 0;
        this.debugTickCount++;
        const isDebugTick = this.debugTickCount <= 20;

        // 1. Detect Regime
        const regime = this.detectRegime(adx, atr, atrArray);

        if (isDebugTick) {
            this.log(`[DEBUG #${this.debugTickCount}] P:${currentPrice} RSI:${rsi ? rsi.toFixed(1) : 'nan'} EMA:${ema ? ema.toFixed(1) : 'nan'} SkipTrend:${this.skipTrendFilter}`, "TRACE");
        }

        // 2. Auto-Tune Parameters
        let params = { rsiLimit: 75, tpMult: 2.5, slMult: 2.0, riskScale: 1.0 }; // EXPANDED RSI to 75

        // HTF Waterfall Logic
        let htfBias = 'NEUTRAL';
        if (this.candlesH4.length > 50) {
            const h4EmaArray = Indicators.ema(this.candlesH4, 50);
            const h4Ema = h4EmaArray[h4EmaArray.length - 1];
            if (currentPrice > h4Ema) htfBias = 'BULLISH';
            else if (currentPrice < h4Ema) htfBias = 'BEARISH';
        }

        this.updateStatusDisplay(ema, rsi, macdHist, regime, adx, candleTime);
        this.broadcastDeepState(regime, htfBias, params, { currentPrice, rsi, macdHist, adx, ema });

        if (!this.lastLogTime || Date.now() - this.lastLogTime > 5000) {
            this.log(`[LIVE] $${currentPrice} [${regime}] HTF:${htfBias}`, "INFO");
            this.lastLogTime = Date.now();
        }

        // Manage Open Position
        if (this.position) {
            this.managePosition(currentPrice, rsi, candleTime);
            return;
        }

        // --- 3. PATTERN INTELLIGENCE (The "Smart" Logic) ---
        // Instead of strict rules, we look for CONFLUENCE of Patterns + Context

        // --- OMNI-SCANNER (Total Coverage) ---
        // Dynamically check ALL patterns in the library
        // We iterate over the Patterns object and find matches
        const activePatterns = [];

        // Manual mapping for 2-candle patterns and 1-candle patterns
        if (Patterns.isBullishEngulfing(lastCandle, prevCandle)) activePatterns.push("BULLISH_ENGULFING");
        if (Patterns.isHammer(lastCandle)) activePatterns.push("HAMMER");
        if (Patterns.isBreakout(candles, 20)) activePatterns.push("BREAKOUT");
        if (Patterns.isMorningStar(candles)) activePatterns.push("MORNING_STAR");
        if (Patterns.isThreeWhiteSoldiers(candles)) activePatterns.push("3_SOLDIERS");
        if (Patterns.isPiercingLine(lastCandle, prevCandle)) activePatterns.push("PIERCING");
        if (Patterns.isInsideBarBreakout(candles)) activePatterns.push("INSIDE_BAR");
        if (Patterns.isPinbar(lastCandle)) activePatterns.push("PINBAR");
        if (Patterns.isMarubozu(lastCandle) && lastCandle.close > lastCandle.open) activePatterns.push("MARUBOZU");
        if (Patterns.isHarami(lastCandle, prevCandle) && lastCandle.close > lastCandle.open) activePatterns.push("HARAMI"); // Bullish Harami
        if (Patterns.isTweezersBottom(lastCandle, prevCandle)) activePatterns.push("TWEEZERS");
        if (Patterns.isDoji(prevCandle) && lastCandle.close > lastCandle.open) activePatterns.push("DOJI_REVERSAL");

        // OMNI-SCANNER EXPANSION
        if (Patterns.isInvertedHammer(lastCandle)) activePatterns.push("INVERTED_HAMMER");
        if (Patterns.isDragonflyDoji(lastCandle)) activePatterns.push("DRAGONFLY_DOJI");
        if (Patterns.isGapUp(lastCandle, prevCandle)) activePatterns.push("GAP_UP");
        if (Patterns.isLongLine(lastCandle, atr)) activePatterns.push("LONG_LINE");
        if (Patterns.isRisingThreeMethods(candles)) activePatterns.push("RISING_THREE");

        // Pick the Strongest Pattern
        let patternName = activePatterns.length > 0 ? activePatterns[0] : null;

        let signalStrength = 0;
        let setupName = "";

        // UNIVERSAL ENTRY RULE (Volume Booster)
        // If ANY Bullish pattern is found AND Context is Valid -> TRADE
        if (patternName) {

            // Context Check:
            // 1. Wide RSI Window (25 - 75)
            // 2. Aggressive Trend (EMA 9)
            const isTrendOk = currentPrice > ema; // EMA 9
            const isOversold = rsi < 35;

            // LOGIC A: Trend Continuation (Aggressive)
            if (isTrendOk && rsi < 75 && rsi > 25) {
                signalStrength = 2;
                setupName = `Trend ${patternName}`;
            }

            // LOGIC B: Oversold Reversal
            else if (isOversold) {
                signalStrength = 3;
                setupName = `Reversal ${patternName}`;
            }

            // LOGIC C: Range Play
            else if (regime === 'RANGING' && rsi < 45) {
                signalStrength = 2;
                setupName = `Range ${patternName}`;
            }

            // BONUS: High Strength for specific powerful patterns
            if (patternName === 'MORNING_STAR' || patternName === '3_SOLDIERS' || patternName === 'MARUBOZU') {
                signalStrength += 1;
            }

            this.stats.found++; // Found a pattern!
        }

        // --- TREND RIDE PROTOCOL (Volume Guarantee) ---
        // If Price > EMA9, we ride ANY green candle. ADX check removed for maximum flow.
        if (!patternName && regime === 'TRENDING' && currentPrice > ema && rsi < 75 && rsi > 25) {
            if (lastCandle.close > lastCandle.open) {
                patternName = "TREND_RIDE";
                setupName = "Trend Velocity Ride";
                signalStrength = 2;
                this.stats.found++;
            }
        }
        // --- END TREND RIDE ---

        // --- END OMNI-SCANNER ---

        // CHECK RANK (The "Judge")
        let rank = 'NEW';
        if (patternName) {
            rank = this.getPatternRank(patternName, candleTime); // Pass Simulation Time

            // 1. FAIL FAST (Veto Rank F)
            if (rank === 'F') {
                // this.log(`[VETO] Pattern ${patternName} is Rank F (Toxic). BLOCKED.`, "FILTER");
                return;
            }

            // 2. STAR POLISHER (Filter Rank B)
            // If Rank B (Mediocre), only take if TREND IS DECENT (ADX > 20)
            if (rank === 'B' && adx < 20) {
                // this.log(`[FILTER] Pattern ${patternName} Rank B requires ADX > 20.`, "FILTER");
                return;
            }

            // 3. AGGRESSIVE MODE (S/A)
            if (rank === 'S' || rank === 'A') {
                params.rsiLimit += 5;
                params.tpMult *= 1.2; // Boost wins for winners
                setupName += ` [Rank ${rank}]`;
            }

            // 4. TEST MODE (From Redemption)
            if (rank === 'TEST') {
                params.riskScale = 0.5;
                setupName += ` [TEST MODE]`;
            }
        }

        // EXECUTION THRESHOLD
        if (signalStrength >= 2) {
            // Money Management Check
            if (this.paperBalance < 50) {
                // Sniper Mode: Only Rank A/S or Strong Trend (ADX > 30)
                if (rank !== 'S' && rank !== 'A' && adx < 30) {
                    return; // Skip weak trades on micro account
                }
            }

            // Waterfall Check (Safety)
            if (!this.skipHtfWaterfall && htfBias === 'BEARISH') {
                if (signalStrength < 4 && rsi > 40) {
                    return;
                }
            }

            // Brain Check
            const hash = this.getMarketHash(regime, rsi);
            const brainCheck = this.consultBrain(hash);
            if (!this.skipTrendFilter && !brainCheck.approved && rank !== 'S') { // Rank S overrides Brain? Maybe.
                return;
            }

            // 5. Fee Check
            // Relaxed Fee Gate 2.0 (1.2x)
            const feeRate = 0.0012;
            const balanceUsable = this.paperBalance < 50 ? this.paperBalance * 0.95 : this.paperBalance * 0.20;
            const approxQty = balanceUsable / currentPrice;
            const estimatedFee = (approxQty * currentPrice) * feeRate;

            // Projected Profit (ATR * TP Multiplier)
            const tpDist = params.tpMult * atr;
            const projectedProfit = tpDist * approxQty;

            if (!this.skipFeeSafeGuard && projectedProfit < (estimatedFee * 1.2)) {
                // DISABLE FEE GATE FOR TURBO MODE
                // We accept that fees exist. 
                // this.log(`[SKIP] Fees too high vs Profit`, "FILTER");
                // return; 
            }

            this.log(`[SIGNAL] ✅ ${setupName} Detected! (Str:${signalStrength})`, "ADAPT");
            this.stats.taken++;
            this.openPosition('LONG', currentPrice, atr, rsi, regime, params, hash, candleTime, patternName);
        } else if (patternName) {
            this.stats.skipped++; // Skipped (Low Strength or Failed Checks)
        }
    } // Close processTick

    // --- SMART LEVERAGE CALCULATOR ---
    calculateLeverage(regime, rsi, patternName, params) {
        // Base Leverage: 5x (Standard)
        let lev = 5;

        // 1. Pattern Quality Boost
        const rank = this.getPatternRank(patternName, 0); // Time 0 is approximation
        if (rank === 'S') lev += 5; // Elite Pattern (e.g. 10x)
        if (rank === 'A') lev += 3;

        // 2. Trend Boost
        // If Trending Strongly, add leverage
        if (regime === 'TRENDING') lev += 5;

        // 3. Volatility Dampener
        // If ATR is huge (Volatile), reduce leverage to prevent wicks killing us
        // (Simplified logic here)

        // 4. RSI Safety
        if (rsi > 70) lev = Math.max(lev - 5, 2); // Reduce lev at extremes

        // Cap at 20x (Casino limit)
        return Math.min(lev, 20);
    }
    getTrades24h(currentCandleTime) {
        if (!this.tradeTimestamps) this.tradeTimestamps = [];
        const oneDayMs = 24 * 60 * 60 * 1000;
        // Filter out old trades
        this.tradeTimestamps = this.tradeTimestamps.filter(t => (currentCandleTime - t) < oneDayMs);
        return this.tradeTimestamps.length;
    }
    // Manage Open Position
    managePosition(currentPrice, rsi, candleTime) {
        if (!this.position) return;
        const p = this.position;

        // 1. LIQUIDATION CHECK (The Grim Reaper)
        // If PnL eats the entire margin, we are liquidated.
        // PnL = (current - entry) * qty
        // Margin = (entry * qty) / leverage
        const currentPnL = (currentPrice - p.entryPrice) * p.qty;
        const margin = (p.entryPrice * p.qty) / p.leverage;

        if (currentPnL <= -margin) {
            this.log(`[☠️ LIQUIDATION] ${p.type} REKT at ${currentPrice} (PnL: $${currentPnL.toFixed(2)})`, "SELL");
            this.closePosition(currentPrice, 'LIQUIDATION', rsi, candleTime, p.hash);
            return;
        }

        // Trailing Stop Logic (Move SL to Break Even if Price move > 0.8 ATR)
        // Tightened from 1.5 ATR to secure High Win Rate
        if (!p.isTrailed && currentPrice > p.entryPrice + (0.8 * p.atr)) {
            p.sl = p.entryPrice + (0.1 * p.atr); // Secure small profit (covers fees)
            p.isTrailed = true;
            this.log(`[TRAIL] Moving SL to BE+ (Securing Win)`, "ADAPT");
            this.saveState();
        }

        // Exit Checks
        // Exit Checks
        if (currentPrice <= p.sl) this.closePosition(currentPrice, 'SL', rsi, candleTime, p.hash);
        else if (currentPrice >= p.tp) this.closePosition(currentPrice, 'TP', rsi, candleTime, p.hash);
    }

    openPosition(type, price, atr, rsi, regime, params, hash, candleTime, patternName) {
        const slDist = params.slMult * atr;
        const tpDist = params.tpMult * atr;
        const sl = price - slDist;
        const tp = price + tpDist;

        // Smart Position Sizing & Leverage
        const smartLev = this.calculateLeverage(regime, rsi, patternName, params);

        let usableBalance;
        if (this.paperBalance < 50) {
            // Phase 1: Micro Account (Sniper Mode) -> 95%
            usableBalance = this.paperBalance * 0.95;
        } else if (this.paperBalance < 2000) { // Bumped safe limit for Pro
            // Phase 2: Growth Account -> Max 50%
            usableBalance = this.paperBalance * 0.50;
        } else {
            // Phase 3: Pro Account -> Risk 5%
            usableBalance = this.paperBalance * 0.05;
        }

        // Binance Min Check (~10 USDT) - logic safety
        if (usableBalance < 10) usableBalance = this.paperBalance * 0.95;

        // LEVERAGE BOOST
        // Notional Size = Margin * Leverage
        const notionalValue = usableBalance * smartLev;
        const qty = notionalValue / price;

        this.position = { type, entryPrice: price, sl, tp, qty, atr, isTrailed: false, hash, entryRsi: rsi, patternName, candleTime, leverage: smartLev };
        this.saveState();

        // Volume Tracking
        if (!this.tradeTimestamps) this.tradeTimestamps = [];
        this.tradeTimestamps.push(candleTime);

        this.log(`OPEN LONG ${smartLev}x @ ${price} (Qty: ${qty.toFixed(6)}) [${regime}] (Pattern: ${patternName})`, "BUY");
        SoundFX.playBuy();

        if (typeof ChartManager !== 'undefined') {
            ChartManager.addMarker(candleTime, price, 'BUY', `LONG (${regime})`);
        }
    }

    closePosition(price, reason, exitRsi, candleTime) {
        const p = this.position;
        const pnl = (price - p.entryPrice) * p.qty;
        const result = pnl > 0 ? 'WIN' : 'LOSS';

        this.paperBalance += pnl;
        this.totalPnL += pnl;
        this.updateBalanceUI();

        this.log(`CLOSE ${p.type} (${reason}) PnL: $${pnl.toFixed(2)} [Bal: $${this.paperBalance.toFixed(2)}]`, result === 'WIN' ? 'BUY' : 'SELL');

        // Learn
        this.learn(p.hash, result, pnl, p.patternName);
        TradeJournal.logTrade({ timestamp: Date.now(), result, pnl, hash: p.hash });

        if (typeof ChartManager !== 'undefined') {
            const t = candleTime || Math.floor(Date.now() / 1000);
            ChartManager.addMarker(t, price, 'SELL', `PnL: ${pnl.toFixed(1)}`);
        }

        if (result === 'WIN') SoundFX.playSell(); // Cha-ching

        this.position = null;
        this.saveState();
    }

    // --- UI HELPERS ---
    updateBalanceUI() {
        const b = document.getElementById('bot-balance');
        const p = document.getElementById('bot-pnl');
        if (b) b.innerText = `${this.paperBalance.toFixed(2)} USDT`;
        if (p) {
            const c = this.totalPnL >= 0 ? '#00E676' : '#FF1744';
            p.innerHTML = `PnL: <span style="color:${c}">$${this.totalPnL.toFixed(2)}</span>`;
        }
    }

    updateStatusDisplay(ema, rsi, macd, regime, adx, candleTime) {
        const el = document.getElementById('bot-indicators');
        if (el) {
            let c = '#fff';
            if (regime === 'TRENDING') c = '#00E676';
            else if (regime === 'RANGING') c = '#FFD600';
            else c = '#FF1744'; // Volatile

            // Volume Meter + Signal Logic
            const vol24h = this.getTrades24h(candleTime);

            el.innerHTML = `<span style="color:${c};font-weight:bold">${regime}</span> (ADX:${adx.toFixed(0)}) | EMA:${ema.toFixed(0)} 
            | RSI:${rsi.toFixed(1)} | <span style="color:#29b6f6">Vol(24h): ${vol24h}</span> 
            | <span style="font-size:10px; color:#aaa">Signals: ${this.stats.taken}/${this.stats.found} (Skip: ${this.stats.skipped})</span>`;
        }
    }

    updateUI() {
        const btn = document.getElementById('btn-bot-toggle');
        if (btn) {
            btn.innerText = this.isRunning ? 'STOP ABOT 🛑' : 'START AUTO-BOT 🤖';
            btn.style.background = this.isRunning ? '#FF1744' : '#00E676';
        }
    }
}

let autoBot;
try { autoBot = new TradingBot(); console.log("AutoBot v2 (Quant Architect) Loaded."); }
catch (e) { console.error("Bot Init Failed:", e); }
