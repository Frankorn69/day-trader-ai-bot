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

const TradeJournal = {
    key: 'protrade_journal_v2',
    getHistory: function () {
        const data = localStorage.getItem(this.key);
        return data ? JSON.parse(data) : [];
    },
    logTrade: function (trade) {
        const history = this.getHistory();
        history.push(trade);
        if (history.length > 100) history.shift();
        localStorage.setItem(this.key, JSON.stringify(history));
        return history;
    }
};

class TradingBot {
    constructor(walletKey = 'proTrade_wallet_v2') {
        this.walletKey = walletKey;
        this.paperBalance = 27.00; // Micro-Account
        this.totalPnL = 0;
        this.position = null; // { type: 'LONG', entryPrice, sl, tp, qty, atr, isTrailed }
        this.isRunning = true;
        this.lastLogTime = 0;
        this.brainKey = 'bot_brain_v1';
        this.stateKey = 'bot_state_v1';

        // Deep Context Engine - HTF State
        this.candlesH1 = [];
        this.candlesH4 = [];
        this.rollingRsiBaseline = 50; // Dynamic default
        this.volatilityGuardActive = false;

        // Load Persistent Data
        this.loadWallet();
        this.loadState();
        this.brain = this.loadBrain();

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
            tpMult: 2.0,
            slMult: 2.0,
            riskScale: 1.0
        };

        if (regime === 'TRENDING') {
            params.rsiLimit = 65; // Aggressive: Buy even if slightly overbought
            params.tpMult = 3.0;  // Let winners run
            this.log("[AUTO-TUNE] Regime TRENDING -> Extended Limits (RSI<65, TP 3x)", "ADAPT");
        }
        else if (regime === 'RANGING') {
            params.rsiLimit = 45; // Conservative: Only buy deeply oversold
            params.tpMult = 1.5;  // Quick scalps
            this.log("[AUTO-TUNE] Regime RANGING -> Tight Limits (RSI<45, TP 1.5x)", "ADAPT");
        }
        else if (regime === 'VOLATILE') {
            params.riskScale = 0.5; // Half size
            params.slMult = 3.0; // Wide stops to avoid noise
            this.log("[AUTO-TUNE] Regime VOLATILE -> Lower Risk (0.5x Size, Wide SL)", "ADAPT");
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

        // VETO RULE: If > 5 samples and WR < 40%, BLOCK.
        if (total > 5 && winRate < 40) {
            return { approved: false, winRate, samples: total };
        }
        return { approved: true, winRate, samples: total };
    }

    learn(hash, result) {
        if (!this.brain[hash]) this.brain[hash] = { wins: 0, losses: 0 };
        if (result === 'WIN') this.brain[hash].wins++; else this.brain[hash].losses++;
        this.saveBrain();
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
        // Let's use user's logic: "Average_RSI_Low of last 100 periods"
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
        const emaArray = Indicators.ema(candles, 200); // Was 50
        const rsiArray = Indicators.rsi(candles, 21);  // Was 14
        const atrArray = Indicators.atr(candles, 14);
        const adxArray = Indicators.adx(candles, 14);
        const macdData = Indicators.macd(candles);

        if (!emaArray || !rsiArray || !atrArray || !adxArray || !macdData) return;

        // Latest Values
        const ema = emaArray[emaArray.length - 1];
        const rsi = rsiArray[rsiArray.length - 1];
        const atr = atrArray[atrArray.length - 1];
        const adx = adxArray[adxArray.length - 1];
        const macdHist = macdData.histogram[macdData.histogram.length - 1];

        // 1. Detect Regime & HTF Bias
        const regime = this.detectRegime(adx, atr, atrArray);

        // 2. Auto-Tune Parameters (Moved Up for Telemetry)
        const params = this.getDynamicParams(regime);

        // HTF Waterfall Logic
        let htfBias = 'NEUTRAL';
        let h4Ema = null;
        if (this.candlesH4.length > 50) {
            const h4EmaArray = Indicators.ema(this.candlesH4, 50);
            h4Ema = h4EmaArray[h4EmaArray.length - 1];
            if (currentPrice > h4Ema) htfBias = 'BULLISH';
            else if (currentPrice < h4Ema) htfBias = 'BEARISH';
        }

        this.updateStatusDisplay(ema, rsi, macdHist, regime, adx);

        // Heartbeat & Telemetry
        const now = Date.now();
        // Broadcast Deep State every tick (or throttled)
        this.broadcastDeepState(regime, htfBias, params, { currentPrice, rsi, macdHist, adx, ema });

        if (!this.lastLogTime || now - this.lastLogTime > 5000) {
            this.log(`[LIVE] $${currentPrice} [${regime}] HTF:${htfBias}`, "INFO");
            this.lastLogTime = now;
        }

        // Manage Open Position
        if (this.position) {
            this.managePosition(currentPrice, rsi, candleTime);
            return;
        }

        // (Auto-Tune was here, moved up)

        // Dynamic Rolling RSI Threshold

        // Dynamic Rolling RSI Threshold
        const rsiBaseline = this.getRollingRsiBaseline(candles);
        const dynamicEntryRsi = rsiBaseline + 5; // User Rule: < AvgLow + 5

        // Volatility Guard (Consecutive Losses -> Tighten requirements or Boost SL?)
        // User asked to Boost SL Multiplier from 2.0 to 3.0
        if (this.volatilityGuardActive) {
            params.slMult = 3.0; // Survival Mode
        }

        // 3. Signal Logic (LONG ONLY)
        // Waterfall Filter: If HTF IS BEARISH -> BLOCK LONGS
        if (htfBias === 'BEARISH') {
            // this.log("Skipping Long. H4 Bias is Bearish.", "FILTER");
            return;
        }

        // Entry: Price > EMA, MACD > 0, RSI < DynamicLimit, Close > PrevHigh (Momentum)
        const isLong = (currentPrice > ema) &&
            (macdHist > 0) &&
            (rsi < dynamicEntryRsi) && // Dynamic relative threshold!
            (currentPrice > prevCandle.high); // Breakout check

        if (isLong) {
            // 4. Brain Check (Deep Context)
            const hash = this.getMarketHash(regime, rsi, htfBias); // NEW HASH SIG
            const brainCheck = this.consultBrain(hash);

            if (!brainCheck.approved) {
                this.log(`[VETO] Brain Rejected [${hash}] (WR: ${brainCheck.winRate.toFixed(0)}%)`, "BRAIN");
                return;
            }

            // 5. Fee Protection Layer (Micro-Account Safeguard)
            // Estimate Fee: 0.12% round trip (0.06% entry + 0.06% exit + slippage)
            // Relax fees if Trend is STRONG (ADX > 40)
            const feeMultiplier = (adx > 40) ? 1.5 : 2.5;

            const feeRate = 0.0012;
            const balanceUsable = this.paperBalance * 0.95; // 95% of equity
            // Approx Qty based on price (ignoring leverage limits for sim)
            const approxQty = balanceUsable / currentPrice;
            const estimatedFee = (approxQty * currentPrice) * feeRate;

            // Projected Profit (ATR * TP Multiplier)
            const tpDist = params.tpMult * atr;
            const projectedProfit = tpDist * approxQty;

            // Rule: Profit must be > 2.5x Fees
            if (projectedProfit < (estimatedFee * feeMultiplier)) {
                this.log(`[FILTER] Skipped. ROI too small. (ADX:${adx.toFixed(0)})`, "ADAPT");
                return;
            }

            this.openPosition('LONG', currentPrice, atr, rsi, regime, params, hash, candleTime);
        }
    }

    managePosition(currentPrice, rsi, candleTime) {
        if (!this.position) return;
        const p = this.position;

        // Trailing Stop Logic (Move SL to Break Even if Price move > 2 ATR)
        if (!p.isTrailed && currentPrice > p.entryPrice + (2 * p.atr)) {
            p.sl = p.entryPrice + (0.5 * p.atr); // Secure some profit
            p.isTrailed = true;
            this.log(`[TRAIL] Moving SL to Profit Zone`, "ADAPT");
            this.saveState();
        }

        // Exit Checks
        if (currentPrice <= p.sl) this.closePosition(currentPrice, 'SL', rsi, candleTime, p.hash);
        else if (currentPrice >= p.tp) this.closePosition(currentPrice, 'TP', rsi, candleTime, p.hash);
    }

    openPosition(type, price, atr, rsi, regime, params, hash, candleTime) {
        const slDist = params.slMult * atr;
        const tpDist = params.tpMult * atr;
        const sl = price - slDist;
        const tp = price + tpDist;

        // Size
        // Micro-Account Mode: Use 95% of Balance (High Efficiency)
        const usableBalance = this.paperBalance * 0.95;
        const qty = usableBalance / price;

        this.position = { type, entryPrice: price, sl, tp, qty, atr, isTrailed: false, hash, entryRsi: rsi };
        this.saveState();

        this.log(`OPEN LONG @ ${price} (Qty: ${qty.toFixed(3)}) [${regime}]`, "BUY");
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

        this.log(`CLOSE ${p.type} (${reason}) PnL: $${pnl.toFixed(2)}`, result === 'WIN' ? 'BUY' : 'SELL');

        // Learn
        this.learn(p.hash, result);
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

    updateStatusDisplay(ema, rsi, macd, regime, adx) {
        const el = document.getElementById('bot-indicators');
        if (el) {
            let c = '#fff';
            if (regime === 'TRENDING') c = '#00E676';
            else if (regime === 'RANGING') c = '#FFD600';
            else c = '#FF1744'; // Volatile
            el.innerHTML = `<span style="color:${c};font-weight:bold">${regime}</span> (ADX:${adx.toFixed(0)}) | EMA:${ema.toFixed(0)} | RSI:${rsi.toFixed(1)}`;
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
