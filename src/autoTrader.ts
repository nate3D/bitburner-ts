import { NS } from "@ns";
import { logToFile } from "logger";

/** @param {NS} ns */
export async function main(ns: NS): Promise<void> {
    // If "sell" is passed as an option, sell all stocks and exit
    if (ns.args.length > 0 && ns.args[0] === "sell") {
        await sellAll(ns);
        return;
    }

    const stockSymbols = ns.stock.getSymbols();
    const thresholdBuy = 0.6;
    const thresholdSell = 0.5;
    const maxInvestmentPercentage = 0.5;
    const reserveCash = 1000000; // Reserve cash for emergencies
    const commission = ns.stock.getConstants().StockMarketCommission;

    while (true) {
        const playerMoney = ns.getPlayer().money;
        const maxInvestment = playerMoney * maxInvestmentPercentage - reserveCash;

        for (const sym of stockSymbols) {
            const forecast = ns.stock.getForecast(sym);
            const volatility = ns.stock.getVolatility(sym);
            const [sharesOwned, avgPrice, ,] = ns.stock.getPosition(sym);
            const maxShares = ns.stock.getMaxShares(sym);
            const askPrice = ns.stock.getAskPrice(sym);
            const bidPrice = ns.stock.getBidPrice(sym);

            // Adjust thresholds based on volatility
            let adjustedThresholdBuy = thresholdBuy;
            let adjustedThresholdSell = thresholdSell;

            if (volatility > 0.03) { // High volatility
                adjustedThresholdBuy += 0.05;
                adjustedThresholdSell -= 0.05;
            } else { // Low volatility
                adjustedThresholdBuy -= 0.02;
                adjustedThresholdSell += 0.02;
            }

            // Calculate potential investment and gain
            const affordableShares = Math.floor(maxInvestment / askPrice);
            const sharesToBuy = Math.min(affordableShares, maxShares);
            const potentialProfit = (bidPrice - avgPrice) * sharesOwned - commission * 2;

            // Buy logic
            if (forecast > adjustedThresholdBuy && sharesOwned === 0 && sharesToBuy > 0) {
                const cost = ns.stock.buyStock(sym, sharesToBuy);
                ns.print(`Bought ${sharesToBuy} shares of ${sym} at ${cost}`);
            }

            // Sell logic
            if (forecast < adjustedThresholdSell && sharesOwned > 0 && potentialProfit > 0) {
                const saleGain = ns.stock.getSaleGain(sym, sharesOwned, "Long");
                ns.stock.sellStock(sym, sharesOwned);
                ns.print(`Sold ${sharesOwned} shares of ${sym} for a gain of ${saleGain}`);
            }
        }

        // Wait for the next market update
        await ns.stock.nextUpdate();
    }
}

// Sell all stocks
export async function sellAll(ns: NS): Promise<void> {
    const stockSymbols = ns.stock.getSymbols();

    for (const sym of stockSymbols) {
        const [sharesOwned, , ,] = ns.stock.getPosition(sym);

        if (sharesOwned > 0) {
            ns.stock.sellStock(sym, sharesOwned);
            ns.print(`Sold ${sharesOwned} shares of ${sym}`);
        }
    }
}