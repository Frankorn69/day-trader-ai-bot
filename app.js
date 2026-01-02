// --- Debug Manager (Must be first) ---
const DebugManager = {
    init: function () {
        this.consoleEl = document.getElementById('debug-console');
        this.logsEl = document.getElementById('debug-logs');

        // Override console methods
        const originalLog = console.log;
        const originalWarn = console.warn;
        const originalError = console.error;

        console.log = (...args) => {
            originalLog.apply(console, args);
            this.addLog('info', args);
        };

        console.warn = (...args) => {
            originalWarn.apply(console, args);
            this.addLog('warn', args);
        };

        console.error = (...args) => {
            originalError.apply(console, args);
            this.addLog('error', args);
        };

        window.onerror = (msg, url, line) => {
            this.addLog('error', [`Uncaught Error: ${msg} at line ${line}`]);
        };

        this.addLog('info', ['Debug Manager Initialized.']);
        this.show(); // Show by default for now
    },

    addLog: function (type, args) {
        if (!this.logsEl) return;
        const msg = args.map(arg =>
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');

        const div = document.createElement('div');
        div.className = `log-entry log-${type}`;
        div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        this.logsEl.appendChild(div);
        this.logsEl.scrollTop = this.logsEl.scrollHeight;
    },

    show: function () {
        if (this.consoleEl) this.consoleEl.style.display = 'flex';
    },

    hide: function () {
        if (this.consoleEl) this.consoleEl.style.display = 'none';
    }
};

// --- Account System ---
const Account = {
    balance: 10000.00,
    positions: [],
    orders: [],

    init: function () {
        this.updateUI();
        console.log(`Account initialized. Balance: ${this.balance} USDT`);
    },

    updateUI: function () {
        // Find elements
        const balanceEls = document.querySelectorAll('.account-info span:last-child');
        balanceEls.forEach(el => {
            if (el.textContent.includes('USDT')) {
                el.textContent = `${this.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDT`;
            }
        });
    }
};

// --- AI Trader System ---
const AITrader = {
    apiKey: '',
    isAnalyzing: false,

    init: function () {
        const btn = document.getElementById('btn-analyze');
        const input = document.getElementById('ai-api-key');

        if (btn && input) {
            btn.addEventListener('click', () => {
                this.apiKey = input.value.trim();
                if (!this.apiKey) {
                    alert('Please enter your Gemini API Key first!');
                    return;
                }
                this.analyzeMarket();
            });
        }
    },

    analyzeMarket: async function () {
        if (this.isAnalyzing) return;
        this.isAnalyzing = true;

        const resultEl = document.getElementById('ai-result');
        resultEl.innerHTML = '<div style="color: #2962FF; text-align: center; margin-top: 30px;">🧠 AI is thinking...</div>';

        try {
            // 1. Prepare Data
            const candles = allCandles.slice(-30); // Last 30 candles
            if (candles.length < 10) {
                throw new Error("Not enough data to analyze.");
            }

            const currentPrice = candles[candles.length - 1].close;

            // Format for AI
            const dataStr = candles.map(c =>
                `[Time: ${new Date(c.time * 1000).toLocaleTimeString()}, Open: ${c.open}, High: ${c.high}, Low: ${c.low}, Close: ${c.close}]`
            ).join('\n');

            const prompt = `
                You are "ProTrade Bot", an elite crypto day trader assistant connected to this user's terminal.
                Your goal is to protect the user's capital and maximize profits.
                
                Analyze these last 30 candles for BTC/USDT (${currentInterval} interval).
                Current Price: ${currentPrice}
                
                Candle Data (Newest last):
                ${dataStr}
                
                Instructions:
                1. Identify the immediate trend (Bullish/Bearish/Neutral).
                2. Look for specific patterns (Engulfing, Doji, Hammer, Head & Shoulders).
                3. Suggest a trade action: BUY (Long), SELL (Short), or HOLD.
                4. Provide a short, punchy reasoning (max 2 sentences).
                5. Give a confidence score (0-100%).
                
                Output strictly in JSON format:
                {
                    "action": "BUY" | "SELL" | "HOLD",
                    "confidence": number,
                    "reasoning": "string"
                }
            `;

            console.log("Sending data to Gemini...");

            // Get selected model
            const model = document.getElementById('ai-model').value || 'gemini-1.5-flash';
            console.log(`Using model: ${model}`);

            // 2. Call API
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });

            if (!response.ok) {
                let errorDetails = "Unknown Error";
                try {
                    const errorData = await response.json();
                    errorDetails = JSON.stringify(errorData, null, 2);
                } catch (e) {
                    errorDetails = await response.text();
                }
                throw new Error(`API Error: ${response.status} \nDetails: ${errorDetails}`);
            }

            const data = await response.json();
            const text = data.candidates[0].content.parts[0].text;

            // 3. Parse & Display
            // Clean markdown code blocks if present
            const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const result = JSON.parse(jsonStr);

            this.displayResult(result);

        } catch (e) {
            console.error("AI Analysis Failed:", e);
            let errorMsg = e.message || "Unknown Error";
            if (e.cause) errorMsg += ` (Cause: ${e.cause})`;
            resultEl.innerHTML = `<div style="color: #FF3D00;">Error: ${errorMsg}</div>`;

            // Log full error details to debug console
            console.error("Full Error Details:", JSON.stringify(e, Object.getOwnPropertyNames(e)));
        } finally {
            this.isAnalyzing = false;
        }
    },

    displayResult: function (result) {
        const resultEl = document.getElementById('ai-result');
        let color = '#ccc';
        if (result.action === 'BUY') color = '#00C853';
        if (result.action === 'SELL') color = '#FF3D00';
        if (result.action === 'HOLD') color = '#FFD600';

        resultEl.innerHTML = `
            <div style="text-align: center; margin-bottom: 10px;">
                <span style="font-size: 18px; font-weight: bold; color: ${color}">${result.action}</span>
                <span style="font-size: 12px; color: #888;">(${result.confidence}% Confidence)</span>
            </div>
            <div style="font-size: 11px; line-height: 1.4;">${result.reasoning}</div>
        `;

        console.log(`AI Suggestion: ${result.action} (${result.confidence}%)`);
    }
};

// App Configuration
const CONFIG = {
    symbol: 'BTCUSDT',
    // Use Bybit V5 Public API (Spot)
    restUrl: 'https://api.bybit.com/v5/market/kline',
    wsUrl: 'wss://stream.bybit.com/v5/public/spot',
    chartColors: {
        bg: '#121212',
        grid: '#1E1E1E',
        text: '#B0B0B0',
        up: '#00C853',
        down: '#FF3D00'
    }
};

// State
let currentPrice = 0;
let wsConnection = null;
let candleSeriesRef = null;
let allCandles = []; // Master dataset
let isFetchingHistory = false;
let noMoreHistory = false;
let currentInterval = '1'; // Default 1 minute

// DOM Elements
const els = {
    price: document.getElementById('btc-price'),
    change: document.getElementById('btc-change'),
    chartContainer: document.getElementById('chart-container'),
    markPrice: document.getElementById('pos-mark-price'),
    timeframeButtons: document.querySelectorAll('.tf-btn'),
    rangeButtons: document.querySelectorAll('.range-btn')
};

// --- Debug Helper (Overlay) ---
const showStatus = (msg, isError = false) => {
    console.log(`[STATUS] ${msg}`);
    let statusEl = document.getElementById('chart-status');
    if (!statusEl) {
        statusEl = document.createElement('div');
        statusEl.id = 'chart-status';
        statusEl.style.position = 'absolute';
        statusEl.style.top = '50%';
        statusEl.style.left = '50%';
        statusEl.style.transform = 'translate(-50%, -50%)';
        statusEl.style.color = isError ? '#FF3D00' : '#EAEAEA';
        statusEl.style.backgroundColor = 'rgba(0,0,0,0.7)';
        statusEl.style.padding = '10px 20px';
        statusEl.style.borderRadius = '4px';
        statusEl.style.zIndex = '100';
        statusEl.style.pointerEvents = 'none'; // Let clicks pass through
        els.chartContainer.appendChild(statusEl);
    }
    statusEl.textContent = msg;
    statusEl.style.color = isError ? '#FF3D00' : '#EAEAEA';

    // Hide after 3 seconds if not error
    if (!isError && msg === 'Ready') {
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 2000);
    } else {
        statusEl.style.display = 'block';
    }
};

// --- Data Generation (Fallback) ---
const generateMockData = (startPrice = 90000, endTime = null, interval = '1') => {
    showStatus('Generating Mock Data...', false);
    const data = [];
    // If endTime is provided, generate data BEFORE that time
    let time = endTime ? endTime : (Math.floor(Date.now() / 1000));

    // Calculate time step based on interval
    let stepSeconds = 60; // 1m
    if (interval === '5') stepSeconds = 5 * 60;
    if (interval === '15') stepSeconds = 15 * 60;
    if (interval === '60') stepSeconds = 60 * 60;
    if (interval === '240') stepSeconds = 4 * 60 * 60;
    if (interval === 'D') stepSeconds = 24 * 60 * 60;
    if (interval === 'W') stepSeconds = 7 * 24 * 60 * 60;

    // If generating initial data, go back 1000 steps.
    time = time - (1000 * stepSeconds);

    let price = startPrice;

    for (let i = 0; i < 1000; i++) {
        const volatility = (Math.random() - 0.5) * (price * 0.002); // 0.2% volatility
        const open = price;
        const close = price + volatility;
        const high = Math.max(open, close) + Math.random() * (price * 0.001);
        const low = Math.min(open, close) - Math.random() * (price * 0.001);

        data.push({
            time: time + (i * stepSeconds),
            open,
            high,
            low,
            close
        });

        price = close;
    }
    return data;
};

// --- Data Fetching ---
const fetchHistoricalData = async (endTime = null) => {
    if (isFetchingHistory || noMoreHistory) return [];
    isFetchingHistory = true;
    showStatus('Fetching Data...', false);

    try {
        // Fetch candles for SPOT
        let url = `${CONFIG.restUrl}?category=spot&symbol=${CONFIG.symbol}&interval=${currentInterval}&limit=1000`;
        if (endTime) {
            url += `&end=${endTime}`;
        }

        console.log(`Fetching history from: ${url}`);

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.retCode === 0 && data.result.list) {
            const rawData = data.result.list.reverse();

            if (rawData.length === 0) {
                noMoreHistory = true;
                isFetchingHistory = false;
                return [];
            }

            const formattedData = rawData.map(item => ({
                time: parseInt(item[0]) / 1000,
                open: parseFloat(item[1]),
                high: parseFloat(item[2]),
                low: parseFloat(item[3]),
                close: parseFloat(item[4])
            }));

            console.log(`Successfully fetched ${formattedData.length} candles.`);
            isFetchingHistory = false;
            return formattedData;
        } else {
            console.warn('Bybit API returned invalid data, using mock.', data);
            isFetchingHistory = false;
            return generateMockData(currentPrice > 0 ? currentPrice : 90000, endTime ? endTime / 1000 : null, currentInterval);
        }
    } catch (error) {
        console.warn('Failed to fetch historical data (likely CORS), using mock fallback.', error);
        isFetchingHistory = false;
        return generateMockData(currentPrice > 0 ? currentPrice : 90000, endTime ? endTime / 1000 : null, currentInterval);
    }
};

// --- Chart Manager ---
const ChartManager = {
    chart: null,
    candleSeries: null,
    markers: [],

    init: async function () {
        const container = els.chartContainer;
        const { width, height } = container.getBoundingClientRect();

        if (width === 0 || height === 0) {
            showStatus('Error: Container Hidden', true);
            return;
        }

        showStatus('Initializing Chart...', false);
        container.innerHTML = '';

        this.chart = LightweightCharts.createChart(container, {
            layout: {
                background: { type: 'solid', color: CONFIG.chartColors.bg },
                textColor: CONFIG.chartColors.text,
            },
            grid: {
                vertLines: { color: CONFIG.chartColors.grid },
                horzLines: { color: CONFIG.chartColors.grid },
            },
            width: width,
            height: height,
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
                rightOffset: 12,
            },
        });

        this.candleSeries = this.chart.addCandlestickSeries({
            upColor: CONFIG.chartColors.up,
            downColor: CONFIG.chartColors.down,
            borderVisible: false,
            wickUpColor: CONFIG.chartColors.up,
            wickDownColor: CONFIG.chartColors.down,
        });

        candleSeriesRef = this.candleSeries; // Global ref for WS

        // Load Initial Data
        noMoreHistory = false;
        const initialData = await fetchHistoricalData();
        if (initialData.length > 0) {
            allCandles = initialData;
            this.candleSeries.setData(allCandles);

            const lastCandle = allCandles[allCandles.length - 1];
            if (currentPrice === 0) updateHeader(lastCandle.close);

            this.chart.timeScale().fitContent();
            showStatus('Ready', false);
        } else {
            showStatus('No Data Loaded', true);
        }

        this.initInfiniteScroll();
        this.initResizeObserver(container);
        this.createLegend();

        return { chart: this.chart, candleSeries: this.candleSeries };
    },

    initInfiniteScroll: function () {
        this.chart.timeScale().subscribeVisibleLogicalRangeChange(async (newVisibleLogicalRange) => {
            if (newVisibleLogicalRange === null) return;
            if (newVisibleLogicalRange.from < 10 && !isFetchingHistory && !noMoreHistory) {
                const oldestCandle = allCandles[0];
                if (!oldestCandle) return;
                const olderData = await fetchHistoricalData(oldestCandle.time * 1000);
                if (olderData.length > 0) {
                    const uniqueOlderData = olderData.filter(c => c.time < oldestCandle.time);
                    if (uniqueOlderData.length > 0) {
                        allCandles = [...uniqueOlderData, ...allCandles];
                        this.candleSeries.setData(allCandles);
                        // Re-apply markers after data update
                        this.candleSeries.setMarkers(this.markers);
                    }
                }
            }
        });
    },

    initResizeObserver: function (container) {
        const resizeObserver = new ResizeObserver(entries => {
            if (entries.length === 0 || !entries[0].contentRect) return;
            const newRect = entries[0].contentRect;
            this.chart.applyOptions({ width: newRect.width, height: newRect.height });
        });
        resizeObserver.observe(container);
    },

    createLegend: function () {
        const legend = document.createElement('div');
        legend.style.position = 'absolute';
        legend.style.left = '12px';
        legend.style.bottom = '12px';
        legend.style.zIndex = '10';
        legend.style.fontSize = '11px';
        legend.style.color = '#ccc';
        legend.style.background = 'rgba(0, 0, 0, 0.5)';
        legend.style.padding = '5px 8px';
        legend.style.borderRadius = '4px';
        legend.style.pointerEvents = 'none';
        legend.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-block; width: 8px; height: 8px; background: #9C27B0; border-radius: 50%;"></span> Entry
                <span style="display: inline-block; width: 8px; height: 8px; background: #E040FB; border-radius: 50%;"></span> Exit
            </div>
        `;
        els.chartContainer.appendChild(legend);
    },

    addMarker: function (time, price, type, text) {
        // type: 'BUY' (Green) or 'SELL' (Red) or 'ENTRY'/'EXIT' (Legacy)

        let color = '#E040FB'; // Default Purple
        let position = 'aboveBar';
        let shape = 'circle';

        if (type === 'BUY') {
            color = '#00C853'; // Green
            position = 'belowBar';
            shape = 'arrowUp';
        } else if (type === 'SELL') {
            color = '#FF3D00'; // Red
            position = 'aboveBar';
            shape = 'arrowDown';
        } else if (type === 'ENTRY') {
            color = '#9C27B0';
            position = 'belowBar';
        }

        this.markers.push({
            time: time,
            position: position,
            color: color,
            shape: shape,
            text: text,
            size: 1
        });

        // Sort markers by time (required by Lightweight Charts)
        this.markers.sort((a, b) => a.time - b.time);

        if (this.candleSeries) {
            this.candleSeries.setMarkers(this.markers);
        }
    }
};

// Alias for backward compatibility if needed, or just use ChartManager.init()
const initChart = () => ChartManager.init();

// --- WebSocket Manager ---
const manageSubscription = (action, interval) => {
    if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) return;

    const topic = `kline.${interval}.${CONFIG.symbol}`;
    const payload = {
        op: action, // 'subscribe' or 'unsubscribe'
        args: [topic]
    };

    console.log(`WebSocket: ${action} ${topic}`);
    wsConnection.send(JSON.stringify(payload));
};

const initWebSocket = () => {
    try {
        wsConnection = new WebSocket(CONFIG.wsUrl);

        wsConnection.onopen = () => {
            console.log('Connected to Bybit Spot WebSocket');
            // Initial Subscription
            const payload = {
                op: 'subscribe',
                args: [
                    `tickers.${CONFIG.symbol}`,
                    `kline.${currentInterval}.${CONFIG.symbol}`
                ]
            };
            wsConnection.send(JSON.stringify(payload));
        };

        wsConnection.onmessage = (event) => {
            const msg = JSON.parse(event.data);

            // 1. Ticker Update (Header)
            if (msg.topic === `tickers.${CONFIG.symbol}`) {
                const ticker = msg.data;
                if (ticker.lastPrice) {
                    updateHeader(parseFloat(ticker.lastPrice), ticker.price24hPcnt);
                }
            }

            // 2. Candle Update (Chart)
            if (msg.topic && msg.topic.startsWith('kline')) {
                const candle = msg.data[0];
                if (candle && candleSeriesRef) {
                    const newCandle = {
                        time: parseInt(candle.start) / 1000,
                        open: parseFloat(candle.open),
                        high: parseFloat(candle.high),
                        low: parseFloat(candle.low),
                        close: parseFloat(candle.close)
                    };

                    // Update Chart
                    candleSeriesRef.update(newCandle);

                    // Update Master Dataset (allCandles)
                    if (allCandles.length > 0) {
                        const lastCandle = allCandles[allCandles.length - 1];
                        if (newCandle.time === lastCandle.time) {
                            // Update existing candle
                            allCandles[allCandles.length - 1] = newCandle;
                        } else if (newCandle.time > lastCandle.time) {
                            // New candle started
                            allCandles.push(newCandle);
                            // Optional: Limit array size to prevent memory leak
                            if (allCandles.length > 2000) allCandles.shift();
                        }
                    }

                    // Update Header Price immediately
                    updateHeader(newCandle.close);

                    // Log pulse (throttled to avoid spam)
                    if (Math.random() > 0.9) {
                        console.log(`⚡ Pulse: ${newCandle.close}`);
                    }

                    // Feed data to AutoBot
                    if (typeof autoBot !== 'undefined' && autoBot.isRunning) {
                        autoBot.processTick(allCandles, newCandle.close);
                    }
                }
            }
        };

        wsConnection.onerror = (err) => {
            console.error('WebSocket Error:', err);
        };

        wsConnection.onclose = () => {
            console.warn('WebSocket Closed. Reconnecting in 5s...');
            setTimeout(initWebSocket, 5000);
        };
    } catch (e) {
        console.error("WebSocket init failed:", e);
    }
};

// --- Timeframe & Range Switching ---
const initTimeframes = () => {
    // 1. Interval Buttons (1m, 5m, etc.)
    els.timeframeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const newInterval = btn.dataset.interval;
            if (newInterval === currentInterval) return;

            // Update UI
            els.timeframeButtons.forEach(b => b.classList.remove('active'));
            els.rangeButtons.forEach(b => b.classList.remove('active')); // Clear ranges
            btn.classList.add('active');

            // Manage WS Subscription
            manageSubscription('unsubscribe', currentInterval);
            currentInterval = newInterval;
            manageSubscription('subscribe', currentInterval);

            console.log(`Switching to interval: ${currentInterval}`);
            initChart(); // Re-init chart with new interval
        });
    });

    // 2. Range Buttons (1D, 1W, 1Y, etc.)
    els.rangeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const range = btn.dataset.range;

            // Auto-Resolution Logic
            let targetInterval = '15'; // Default
            if (range === '1D') targetInterval = '15';
            if (range === '1W') targetInterval = '60';
            if (range === '1M') targetInterval = '240';
            if (range === '6M') targetInterval = 'D';
            if (range === '1Y') targetInterval = 'D';
            if (range === 'MAX') targetInterval = 'W';

            if (targetInterval === currentInterval) {
                // Just re-fetch if interval is same but range might be different (logic simplified here)
                // Ideally we just set range, but re-init is safer for now
            } else {
                // Manage WS Subscription
                manageSubscription('unsubscribe', currentInterval);
                currentInterval = targetInterval;
                manageSubscription('subscribe', currentInterval);
            }

            // Update UI
            els.rangeButtons.forEach(b => b.classList.remove('active'));
            els.timeframeButtons.forEach(b => b.classList.remove('active')); // Clear intervals
            btn.classList.add('active');

            console.log(`Switching to range: ${range} (Interval: ${currentInterval})`);
            initChart();
        });
    });
};

// --- UI Updates ---
const updateHeader = (price, changePcnt) => {
    els.price.textContent = price.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    if (price > currentPrice) {
        els.price.style.color = CONFIG.chartColors.up;
    } else if (price < currentPrice) {
        els.price.style.color = CONFIG.chartColors.down;
    }
    currentPrice = price;

    if (changePcnt) {
        const changeVal = parseFloat(changePcnt) * 100;
        els.change.textContent = `${changeVal > 0 ? '+' : ''}${changeVal.toFixed(2)}%`;
        els.change.style.color = changeVal >= 0 ? CONFIG.chartColors.up : CONFIG.chartColors.down;
    }
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    DebugManager.init();
    Account.init();
    // AITrader.init(); // Removed in favor of AutoBot

    // Init AutoBot UI
    const botBtn = document.getElementById('btn-bot-toggle');
    if (botBtn) {
        botBtn.addEventListener('click', () => {
            if (autoBot.isRunning) autoBot.stop();
            else autoBot.start();
        });
    }

    // Re-query elements since we added new buttons
    els.timeframeButtons = document.querySelectorAll('.tf-btn');
    els.rangeButtons = document.querySelectorAll('.range-btn');

    initTimeframes();
    requestAnimationFrame(() => {
        initChart();
        initWebSocket();
    });
});
