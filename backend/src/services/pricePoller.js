import config from '../config.js';
import { priceQueries } from '../database.js';

// Cache for current prices
let priceCache = {};
let lastFetchTime = 0;
const CACHE_TTL = 30000; // 30 seconds

/**
 * Fetch current prices from CoinGecko API
 * @param {string[]} symbols - Array of symbols to fetch (e.g., ['BTC', 'ETH'])
 * @returns {Object} Map of symbol -> price
 */
export async function fetchPrices(symbols = []) {
    const now = Date.now();

    // Return cached prices if still valid
    if (now - lastFetchTime < CACHE_TTL && Object.keys(priceCache).length > 0) {
        return priceCache;
    }

    try {
        // Convert symbols to CoinGecko IDs
        const ids = symbols
            .map(s => config.symbolMap[s.toUpperCase()])
            .filter(Boolean);

        // If no specific symbols, fetch all supported
        const idsToFetch = ids.length > 0 ? ids : Object.values(config.symbolMap);

        const url = `${config.coinGeckoApiUrl}/simple/price?ids=${idsToFetch.join(',')}&vs_currencies=usd`;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`CoinGecko API error: ${response.status}`);
        }

        const data = await response.json();

        // Convert CoinGecko IDs back to symbols
        const prices = {};
        for (const [symbol, geckoId] of Object.entries(config.symbolMap)) {
            if (data[geckoId]) {
                prices[symbol] = data[geckoId].usd;

                // Record price in history for threshold calculations
                priceQueries.record.run({
                    symbol: symbol,
                    price: data[geckoId].usd
                });
            }
        }

        priceCache = prices;
        lastFetchTime = now;

        console.log(`[PricePoller] Fetched prices for ${Object.keys(prices).length} symbols`);

        return prices;
    } catch (error) {
        console.error('[PricePoller] Error fetching prices:', error.message);
        // Return cached prices if available, otherwise empty
        return priceCache;
    }
}

/**
 * Get price from specified minutes ago
 * @param {string} symbol - Symbol to look up
 * @param {number} minutesAgo - How many minutes back to look
 * @returns {Promise<number|null>} Price from that time or null if not available
 */
export async function getHistoricalPrice(symbol, minutesAgo) {
    const result = await priceQueries.getRecent.get(symbol.toUpperCase(), minutesAgo);
    return result ? result.price : null;
}

/**
 * Calculate percentage change between two prices
 * @param {number} oldPrice - Previous price
 * @param {number} newPrice - Current price
 * @returns {number} Percentage change (positive or negative)
 */
export function calculatePercentChange(oldPrice, newPrice) {
    if (!oldPrice || oldPrice === 0) return 0;
    return ((newPrice - oldPrice) / oldPrice) * 100;
}

/**
 * Get current price for a symbol from cache
 * @param {string} symbol - Symbol to look up
 * @returns {number|null} Current price or null
 */
export function getCurrentPrice(symbol) {
    return priceCache[symbol.toUpperCase()] || null;
}

/**
 * Clean up old price history entries
 */
export function cleanupPriceHistory() {
    try {
        const result = priceQueries.cleanup.run();
        console.log(`[PricePoller] Cleaned up ${result.changes} old price records`);
    } catch (error) {
        console.error('[PricePoller] Error cleaning up price history:', error.message);
    }
}

/**
 * Get all supported symbols
 * @returns {string[]} Array of supported symbols
 */
export function getSupportedSymbols() {
    return Object.keys(config.symbolMap);
}
