/**
 * ProTrade Auto-Bot 🤖 (Trend Flow & Momentum Edition)
 * Strategy: Trend Flow & Momentum
 * Features: MACD Filter, Trailing Stop, Dynamic Risk, Sound FX
 */

// --- Sound Effects (Synthesized) ---
const SoundFX = {
    ctx: null,

    init: function () {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.ctx = new AudioContext();
            }
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
        for (let i = 0; i < candles.length; i++) {
            macdLine.push(emaFast[i] - emaSlow[i]);
        }

        const macdObjects = macdLine.map(val => ({ close: val }));
        const signalLine = Indicators.ema(macdObjects, signalPeriod);

        let histogram = [];
        for (let i = 0; i < candles.length; i++) {
            histogram.push(macdLine[i] - signalLine[i]);
        }

        return { macdLine, signalLine, histogram };
    },

    sma: (candles, period) => {
        if (candles.length < period) return null;
        let smaArray = [];
        let sum = 0;
        for (let i = 0; i < period; i++) sum += candles[i].close; // or volume
        smaArray.push(sum / period);
        for (let i = period; i < candles.length; i++) {
            sum = sum - candles[i - period].close + candles[i].close;
            smaArray.push(sum / period);
        }
        // Pad beginning to match candle length
        const padding = new Array(period - 1).fill(null);
        return [...padding, ...smaArray];
    },

    // Helper for Volume SMA (accepts array of numbers or objects)
    smaVolume: (candles, period) => {
        if (candles.length < period) return null;
        let smaArray = [];
        let sum = 0;
        for (let i = 0; i < period; i++) sum += candles[i].volume;
        smaArray.push(sum / period);
        for (let i = period; i < candles.length; i++) {
            sum = sum - candles[i - period].volume + candles[i].volume;
            smaArray.push(sum / period);
        }
        const padding = new Array(period - 1).fill(null);
        return [...padding, ...smaArray];
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

        // 2. Smooth TR, +DM, -DM (Wilder's Smoothing)
        // First value is simple sum
        let smoothTR = [0], smoothPlusDM = [0], smoothMinusDM = [0];
        for (let i = 0; i < period; i++) {
            smoothTR[0] += tr[i];
            smoothPlusDM[0] += plusDM[i];
            smoothMinusDM[0] += minusDM[i];
        }

        // Subsequent values
        for (let i = period; i < tr.length; i++) {
            smoothTR.push(smoothTR[smoothTR.length - 1] - (smoothTR[smoothTR.length - 1] / period) + tr[i]);
            smoothPlusDM.push(smoothPlusDM[smoothPlusDM.length - 1] - (smoothPlusDM[smoothPlusDM.length - 1] / period) + plusDM[i]);
            smoothMinusDM.push(smoothMinusDM[smoothMinusDM.length - 1] - (smoothMinusDM[smoothMinusDM.length - 1] / period) + minusDM[i]);
        }

        // 3. Calculate +DI, -DI, DX
        let adxArray = [];
        let dxArray = [];
        for (let i = 0; i < smoothTR.length; i++) {
            const pDI = (smoothPlusDM[i] / smoothTR[i]) * 100;
            const mDI = (smoothMinusDM[i] / smoothTR[i]) * 100;
            const dx = (Math.abs(pDI - mDI) / (pDI + mDI)) * 100;
            dxArray.push(dx);
        }

        // 4. Calculate ADX (Smoothing DX)
        // First ADX is average of first 'period' DX values
        if (dxArray.length < period) return null;

        let sumDX = 0;
        for (let i = 0; i < period; i++) sumDX += dxArray[i];
        adxArray.push(sumDX / period);

        for (let i = period; i < dxArray.length; i++) {
            const prevADX = adxArray[adxArray.length - 1];
            const currentADX = ((prevADX * (period - 1)) + dxArray[i]) / period;
            adxArray.push(currentADX);
        }

        // Pad to match candle length (approximate)
        // We lost 1 candle for TR, then period for smoothing, then period for ADX
        // Total lag = 1 + period + period? 
        // For simplicity, we just return the array, caller handles indexing from end.
        return adxArray;
    }
};

// --- Trade Journal (Memory) ---
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
    },
    getLastTrades: function (n = 10) {
        const history = this.getHistory();
        return history.slice(-n);
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
        this.walletKey = 'bot_wallet_v1'; // Dedicated Wallet persistence

        // Load Data
        this.loadWallet(); // Priority: Load money first
        this.loadState();
        this.brain = this.loadBrain();

        // Telemetry Channel
        this.telemetry = new BroadcastChannel('bot_telemetry');

        // Base Config
        this.config = {
            emaPeriod: 50,
            rsiPeriod: 14,
            atrPeriod: 14,
            adxPeriod: 14,
            volSmaPeriod: 20
        };

        this.updateBalanceUI();
    }

    loadWallet() {
        const data = localStorage.getItem(this.walletKey);
        if (data) {
            const wallet = JSON.parse(data);
            this.paperBalance = wallet.balance || 10000.00;
            this.totalPnL = wallet.totalPnL || 0;
            console.log(`[WALLET] Loaded. Balance: $${this.paperBalance.toFixed(2)}`);
        } else {
            this.paperBalance = 10000.00; // Default
        }
    }

    saveWallet() {
        const wallet = {
            balance: this.paperBalance,
            totalPnL: this.totalPnL,
            timestamp: Date.now()
        };
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
            // Note: Balance handled by loadWallet now
            console.log("Bot State Restored:", state);
        }
    }

    saveState() {
        const state = {
            position: this.position,
            isRunning: this.isRunning
        };
        localStorage.setItem(this.stateKey, JSON.stringify(state));
        this.saveWallet(); // Always save wallet when state changes

        // Broadcast state update
        this.telemetry.postMessage({ type: 'STATE_UPDATE', data: { ...state, paperBalance: this.paperBalance } });
    }

    start() {
        this.isRunning = true;
        this.saveState();
        this.log("Bot Started. Mode: Ultimate AI (Regime+Brain) 🧠🚀");
        this.updateUI();
    }

    stop() {
        this.isRunning = false;
        this.saveState();
        this.log("Bot Stopped.");
        this.updateUI();
    }

    log(msg, type = 'INFO') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = `[${timestamp}] ${type}: ${msg}`;
        console.log(logEntry);

        // UI Log
        const logContainer = document.getElementById('bot-logs');
        if (logContainer) {
            const div = document.createElement('div');
            div.className = 'log-line';
            if (type === 'BUY') div.style.color = '#00C853';
            else if (type === 'SELL') div.style.color = '#FF3D00';
            else if (type === 'ADAPT') div.style.color = '#2979FF';
            else if (type === 'BRAIN') div.style.color = '#E040FB';
            else div.style.color = '#ccc';
            div.style.fontSize = '11px';
            div.style.marginBottom = '4px';
            div.innerText = logEntry;
            logContainer.prepend(div);
        }

        // Broadcast Log
        this.telemetry.postMessage({ type: 'LOG', data: { timestamp, type, msg } });
    }

    // --- LAYER 1: The Eyes (Market Regime) ---
    detectRegime(adx, atr, avgAtr) {
        if (adx > 25) return 'TRENDING';
        if (atr > avgAtr * 1.5) return 'VOLATILE';
        if (adx < 20) return 'RANGING';
        return 'NORMAL';
    }

    // --- LAYER 3: The Brain (Contextual Memory) ---
    getMarketHash(regime, rsi) {
        const rsiZone = rsi < 30 ? 'OVERSOLD' : (rsi > 70 ? 'OVERBOUGHT' : 'NEUTRAL');
        return `REGIME:${regime}_RSI:${rsiZone}`;
    }

    consultBrain(hash) {
        if (!this.brain[hash]) return { approved: true, winRate: 0, samples: 0 };

        const stats = this.brain[hash];
        const total = stats.wins + stats.losses;
        const winRate = total > 0 ? (stats.wins / total) * 100 : 0;

        // Veto if samples > 5 and WR < 40%
        if (total > 5 && winRate < 40) {
            return { approved: false, winRate, samples: total };
        }
        return { approved: true, winRate, samples: total };
    }

    learn(hash, result) {
        if (!this.brain[hash]) this.brain[hash] = { wins: 0, losses: 0 };

        if (result === 'WIN') this.brain[hash].wins++;
        else this.brain[hash].losses++;

        this.saveBrain();
        this.log(`[BRAIN] Updated Memory for [${hash}]. Wins: ${this.brain[hash].wins}, Losses: ${this.brain[hash].losses}`, 'BRAIN');
    }

    processTick(candles, currentPrice) {
        if (!this.isRunning) return;

        // Need enough data for ADX (approx 28+ candles) + EMA50
        if (candles.length < 105) {
            const now = Date.now();
            if (!this.lastLogTime || now - this.lastLogTime > 5000) {
                this.log(`[WAITING] Gathering data... (${candles.length}/105)`, 'INFO');
                this.lastLogTime = now;
            }
            return;
        }

        const lastCandle = candles[candles.length - 1]; // Live candle
        const prevCandle = candles[candles.length - 2]; // Previous completed
        const candleTime = lastCandle.time; // SNAP TIMESTAMP

        // Indicators
        const emaArray = Indicators.ema(candles, this.config.emaPeriod);
        const rsiArray = Indicators.rsi(candles, this.config.rsiPeriod);
        const atrArray = Indicators.atr(candles, this.config.atrPeriod);
        const adxArray = Indicators.adx(candles, this.config.adxPeriod);
        const macdData = Indicators.macd(candles);

        if (!emaArray || !rsiArray || !atrArray || !adxArray || !macdData) return;

        // Use LIVE values (last element)
        const ema = emaArray[emaArray.length - 1];
        const rsi = rsiArray[rsiArray.length - 1];
        const atr = atrArray[atrArray.length - 1];
        const adx = adxArray[adxArray.length - 1];
        const macdHist = macdData.histogram[macdData.histogram.length - 1];
        const close = lastCandle.close;

        // Calculate Average ATR for Volatility check (last 20 candles)
        const avgAtr = atr; // Approximation for now

        // 1. DETECT REGIME
        const regime = this.detectRegime(adx, atr, avgAtr);

        this.updateStatusDisplay(ema, rsi, macdHist, regime, adx);

        // Heartbeat
        const now = Date.now();
        if (!this.lastLogTime || now - this.lastLogTime > 5000) {
            this.log(`[LIVE UPDATE] Price: ${currentPrice} | RSI: ${rsi.toFixed(1)} | MACD: ${macdHist.toFixed(2)}`, 'INFO');
            this.lastLogTime = now;
        }

        // Manage Position
        if (this.position) {
            this.managePosition(currentPrice, rsi, candleTime);
            return;
        }

        // 2. DYNAMIC STRATEGY PARAMETERS
        let rsiLong = 60, rsiShort = 40, slMult = 2.0, tpMult = 3.0;

        if (regime === 'TRENDING') {
            rsiLong = 60; rsiShort = 40; tpMult = 3.0;
        } else if (regime === 'RANGING') {
            rsiLong = 45; rsiShort = 55; tpMult = 1.5; slMult = 1.5;
        } else if (regime === 'VOLATILE') {
            slMult = 3.0; // Widen stop
            // Reduce position size logic handled in openPosition
        }

        // 3. GET SIGNAL (Momentum Flow)
        const isLong = (close > ema) && (macdHist > 0) && (rsi < rsiLong) && (close > prevCandle.close);
        const isShort = (close < ema) && (macdHist < 0) && (rsi > rsiShort) && (close < prevCandle.close);

        if (isLong || isShort) {
            const type = isLong ? 'LONG' : 'SHORT';
            const hash = this.getMarketHash(regime, rsi);

            // 4. CONSULT BRAIN
            const brainCheck = this.consultBrain(hash);

            if (!brainCheck.approved) {
                this.log(`[AI VETO] Signal ${type} ignored. Context: ${hash} has WR ${brainCheck.winRate.toFixed(1)}%`, 'BRAIN');
                return;
            }

            this.log(`[SIGNAL] ${type} Detected. Regime: ${regime}. Brain: Approved (WR: ${brainCheck.winRate.toFixed(0)}%)`, 'INFO');
            this.openPosition(type, currentPrice, atr, rsi, regime, slMult, tpMult, hash, candleTime);
        }
    }

    managePosition(currentPrice, rsi, candleTime) {
        if (!this.position) return;

        const dist = 2.0 * this.position.atr; // Trailing trigger

        if (this.position.type === 'LONG') {
            if (!this.position.isTrailed && currentPrice >= (this.position.entryPrice + dist)) {
                this.position.sl = this.position.entryPrice + (dist * 0.1);
                this.position.isTrailed = true;
                this.log(`[TRAIL] Moving SL to Break Even`, 'ADAPT');
                this.saveState(); // Save updated SL
            }
            if (currentPrice <= this.position.sl) this.closePosition(currentPrice, 'SL', rsi, candleTime);
            else if (currentPrice >= this.position.tp) this.closePosition(currentPrice, 'TP', rsi, candleTime);
        }
        else if (this.position.type === 'SHORT') {
            if (!this.position.isTrailed && currentPrice <= (this.position.entryPrice - dist)) {
                this.position.sl = this.position.entryPrice - (dist * 0.1);
                this.position.isTrailed = true;
                this.log(`[TRAIL] Moving SL to Break Even`, 'ADAPT');
                this.saveState(); // Save updated SL
            }
            if (currentPrice >= this.position.sl) this.closePosition(currentPrice, 'SL', rsi, candleTime);
            else if (currentPrice <= this.position.tp) this.closePosition(currentPrice, 'TP', rsi, candleTime);
        }
    }

    openPosition(type, price, atr, rsiVal, regime, slMult, tpMult, hash, candleTime) {
        const slDist = slMult * atr;
        const tpDist = tpMult * atr;

        let sl, tp;
        if (type === 'LONG') {
            sl = price - slDist;
            tp = price + tpDist;
        } else {
            sl = price + slDist;
            tp = price - tpDist;
        }

        // Position Sizing
        let riskPercent = 0.01; // 1%
        if (regime === 'VOLATILE') riskPercent = 0.005; // Reduce by 50%

        const riskPerShare = Math.abs(price - sl);
        const riskAmount = this.paperBalance * riskPercent;
        const qty = riskAmount / riskPerShare;

        this.position = {
            type,
            entryPrice: price,
            sl,
            tp,
            qty,
            entryRsi: rsiVal,
            atr: atr,
            isTrailed: false,
            hash: hash // Store context for learning
        };

        this.saveState(); // PERSIST OPEN POSITION

        this.log(`OPEN ${type} @ ${price.toFixed(2)} | Qty: ${qty.toFixed(4)} | Regime: ${regime}`, type === 'LONG' ? 'BUY' : 'SELL');
        document.getElementById('bot-status-indicator').style.background = type === 'LONG' ? '#00C853' : '#FF3D00';
        SoundFX.playBuy();

        if (typeof ChartManager !== 'undefined') {
            // SNAP FIX: Use candleTime
            console.log(`[MARKER FIX] Snapped entry time to ${candleTime} (Candle Start)`);
            const markerType = type === 'LONG' ? 'BUY' : 'SELL';
            ChartManager.addMarker(candleTime, price, markerType, `${type} (${regime})`);
        }
    }

    closePosition(price, reason, exitRsi, candleTime) {
        const pnlPerShare = this.position.type === 'LONG' ? (price - this.position.entryPrice) : (this.position.entryPrice - price);
        const totalPnl = pnlPerShare * this.position.qty;
        const result = totalPnl > 0 ? 'WIN' : 'LOSS';

        this.paperBalance += totalPnl;
        this.totalPnL += totalPnl;
        this.updateBalanceUI();

        this.log(`CLOSE ${this.position.type} (${reason}) | PnL: $${totalPnl.toFixed(2)}`, result === 'WIN' ? 'BUY' : 'SELL');

        // LEARN
        this.learn(this.position.hash, result);

        TradeJournal.logTrade({
            timestamp: Date.now(),
            type: this.position.type,
            result: result,
            pnl: totalPnl,
            entryRsi: this.position.entryRsi,
            exitRsi: exitRsi,
            hash: this.position.hash
        });

        if (typeof ChartManager !== 'undefined') {
            // SNAP FIX: Use candleTime passed from processTick/managePosition
            // If undefined (manual close?), fallback to Date.now() / 1000
            const t = candleTime || Math.floor(Date.now() / 1000);
            console.log(`[MARKER FIX] Snapped exit time to ${t}`);

            // Closing LONG = SELL, Closing SHORT = BUY
            const markerType = this.position.type === 'LONG' ? 'SELL' : 'BUY';
            ChartManager.addMarker(t, price, markerType, `PnL: ${totalPnl.toFixed(1)}`);
        }

        this.position = null;
        this.saveState(); // PERSIST CLOSE

        document.getElementById('bot-status-indicator').style.background = '#666';

        if (result === 'WIN') SoundFX.playSell();
    }

    updateBalanceUI() {
        const balEl = document.getElementById('bot-balance');
        const pnlEl = document.getElementById('bot-pnl');
        if (balEl && pnlEl) {
            balEl.innerText = `${this.paperBalance.toFixed(2)} USDT`;
            const sign = this.totalPnL >= 0 ? '+' : '';
            const color = this.totalPnL >= 0 ? '#00C853' : '#FF3D00';
            pnlEl.innerHTML = `PnL: <span style="color: ${color}">${sign}$${this.totalPnL.toFixed(2)}</span>`;
        }
    }

    updateStatusDisplay(ema, rsi, macd, regime, adx) {
        const el = document.getElementById('bot-indicators');
        if (el && ema !== undefined) {
            let regimeColor = '#fff';
            if (regime === 'TRENDING') regimeColor = '#00C853';
            else if (regime === 'RANGING') regimeColor = '#FFD600';
            else if (regime === 'VOLATILE') regimeColor = '#FF3D00';

            el.innerHTML = `
                <span style="color: ${regimeColor}; font-weight: bold;">${regime}</span> (ADX: ${adx.toFixed(0)}) | 
                EMA: ${ema.toFixed(0)} | 
                RSI: ${rsi.toFixed(1)} |
                MACD: ${macd.toFixed(2)}
            `;
        }
    }

    updateUI() {
        const btn = document.getElementById('btn-bot-toggle');
        if (btn) {
            btn.textContent = this.isRunning ? 'STOP BOT 🛑' : 'START BOT ▶️';
            btn.style.background = this.isRunning ? '#FF3D00' : '#00C853';
        }

        const btnSound = document.getElementById('btn-test-sound');
        if (btnSound) {
            btnSound.onclick = () => {
                SoundFX.playBuy();
                this.log("Audio Test: Ding! 🔔", "INFO");
            };
        }
    }
}

let autoBot;
try {
    autoBot = new TradingBot();
    console.log("AutoBot initialized successfully.");
} catch (e) {
    console.error("Critical Error initializing AutoBot:", e);
}
