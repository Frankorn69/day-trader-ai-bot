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
    constructor() {
        this.isRunning = false;
        this.position = null;
        this.lastLogTime = 0;
        this.paperBalance = 10000.00;
        this.totalPnL = 0;
        this.brainKey = 'bot_brain_v1';
        this.stateKey = 'bot_state_v1';
        this.walletKey = 'bot_wallet_v1';

        // Load Persistent Data
        this.loadWallet();
        this.loadState();
        this.brain = this.loadBrain();

        this.telemetry = new BroadcastChannel('bot_telemetry');

        this.config = {
            emaPeriod: 50,
            rsiPeriod: 14,
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
            this.paperBalance = wallet.balance || 10000.00;
            this.totalPnL = wallet.totalPnL || 0;
            console.log(`[WALLET] Loaded. Balance: $${this.paperBalance.toFixed(2)}`);
        } else {
            this.paperBalance = 10000.00;
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

    // --- STEP C: EXECUTION ENGINE ---
    processTick(candles, currentPrice) {
        if (!this.isRunning) return;
        // Require ADX warmup (28 bars) + EMA50 warmup (50 bars) -> Safe ~60-70 bars
        if (candles.length < 70) return;

        const lastCandle = candles[candles.length - 1];
        const prevCandle = candles[candles.length - 2];
        const candleTime = lastCandle.time;

        // Calc Indicators
        const emaArray = Indicators.ema(candles, 50);
        const rsiArray = Indicators.rsi(candles, 14);
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

        // 1. Detect Regime
        const regime = this.detectRegime(adx, atr, atrArray);
        this.updateStatusDisplay(ema, rsi, macdHist, regime, adx);

        // Heartbeat
        const now = Date.now();
        if (!this.lastLogTime || now - this.lastLogTime > 5000) {
            this.log(`[LIVE] Price:${currentPrice} RSI:${rsi.toFixed(1)} MACD:${macdHist.toFixed(2)} [${regime}]`, "INFO");
            this.lastLogTime = now;
        }

        // Manage Open Position
        if (this.position) {
            this.managePosition(currentPrice, rsi, candleTime);
            return;
        }

        // 2. Auto-Tune Parameters
        const params = this.getDynamicParams(regime);

        // 3. Signal Logic (LONG ONLY for simplicity in this version, symmetric for SHORT)
        // Entry: Price > EMA, MACD > 0, RSI < DynamicLimit, Close > PrevHigh (Momentum)
        const isLong = (currentPrice > ema) &&
            (macdHist > 0) &&
            (rsi < params.rsiLimit) &&
            (currentPrice > prevCandle.high); // Breakout check

        if (isLong) {
            // 4. Brain Check
            const hash = this.getMarketHash(regime, rsi);
            const brainCheck = this.consultBrain(hash);

            if (!brainCheck.approved) {
                this.log(`[VETO] Signal Valid, but Brain Rejected [${hash}] (WR: ${brainCheck.winRate.toFixed(0)}%)`, "BRAIN");
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
        if (currentPrice <= p.sl) this.closePosition(currentPrice, 'SL', rsi, candleTime);
        else if (currentPrice >= p.tp) this.closePosition(currentPrice, 'TP', rsi, candleTime);
    }

    openPosition(type, price, atr, rsi, regime, params, hash, candleTime) {
        const slDist = params.slMult * atr;
        const tpDist = params.tpMult * atr;
        const sl = price - slDist;
        const tp = price + tpDist;

        // Size
        const riskPerTrade = this.paperBalance * 0.01 * params.riskScale; // 1% * scale
        const riskPerShare = price - sl;
        const qty = riskPerTrade / riskPerShare;

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
