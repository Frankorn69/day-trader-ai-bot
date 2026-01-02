
// Minimal Indicator Logic for Simulation
function calculateRSI(prices, period = 14) {
    if (prices.length <= period) return 50;

    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const diff = prices[i] - prices[i - 1];
        if (diff > 0) gains += diff;
        else losses -= diff;
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;

    // Wilder's Smoothing
    for (let i = period + 1; i < prices.length; i++) {
        const diff = prices[i] - prices[i - 1];
        let gain = diff > 0 ? diff : 0;
        let loss = diff < 0 ? -diff : 0;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

function calculateEMA(prices, period) {
    const k = 2 / (period + 1);
    let ema = prices[0];
    for (let i = 1; i < prices.length; i++) {
        ema = prices[i] * k + ema * (1 - k);
    }
    return ema;
}

function calculateMACD(prices) {
    // We need entire array history for accuracy? Yes.
    // Simulate iterative EMA
    let ema12 = prices[0];
    let ema26 = prices[0];
    let signal = 0; // Need to initialize properly

    // Warmup
    // Simply running the loop is enough to simulate approximate state
    let signalEma = 0;
    let hist = 0;

    // We can't easily do full Series EMA without arrays.
    // Let's just create the arrays.
    let ema12Arr = [prices[0]];
    let ema26Arr = [prices[0]];

    const k12 = 2 / 13;
    const k26 = 2 / 27;

    for (let i = 1; i < prices.length; i++) {
        ema12Arr.push(prices[i] * k12 + ema12Arr[i - 1] * (1 - k12));
        ema26Arr.push(prices[i] * k26 + ema26Arr[i - 1] * (1 - k26));
    }

    // MACD Line
    let macdLine = [];
    for (let i = 0; i < prices.length; i++) macdLine.push(ema12Arr[i] - ema26Arr[i]);

    // Signal Line (EMA9 of MACD)
    let signalArr = [macdLine[0]];
    const k9 = 2 / 10;
    for (let i = 1; i < macdLine.length; i++) {
        signalArr.push(macdLine[i] * k9 + signalArr[i - 1] * (1 - k9));
    }

    return macdLine[macdLine.length - 1] - signalArr[signalArr.length - 1];
}


console.log("Searching for Goldilocks parameters...");
// Brute Force
const trendSlopes = [5, 10, 15, 20];
const pullbackSlopes = [-2, -3, -4, -5, -6, -8];
const pullbackLens = [5, 6, 8, 10, 12, 14];

for (let ts of trendSlopes) {
    for (let ps of pullbackSlopes) {
        for (let pl of pullbackLens) {

            // Generate Data
            let prices = [];
            let p = 50000;
            // 140 bars trend
            for (let i = 0; i < 140; i++) { prices.push(p); p += ts; }
            // Pullback
            for (let i = 0; i < pl; i++) { prices.push(p); p += ps; }

            const rsi = calculateRSI(prices);
            const macdHist = calculateMACD(prices);
            const ema50 = calculateEMA(prices, 50);

            // Check
            if (rsi > 50 && rsi < 58 && macdHist > 1.0 && prices[prices.length - 1] > ema50) {
                console.log(`FOUND! Trend=${ts}, PB_Slope=${ps}, PB_Len=${pl} -> RSI:${rsi.toFixed(2)}, MACD:${macdHist.toFixed(2)}`);
            }
        }
    }
}
