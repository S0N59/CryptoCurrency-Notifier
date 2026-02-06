import { alertQueries, historyQueries, confirmationQueries } from '../database.js';
import { fetchPrices, getHistoricalPrice, calculatePercentChange, getCurrentPrice } from './pricePoller.js';
import { sendAlertMessage } from './telegram.js';

/**
 * Alert State Machine
 * 
 * States:
 * - idle: Alert is active but threshold not crossed
 * - triggered: Threshold crossed, notification sent, awaiting confirmation (if required)
 * - confirmed: User confirmed the alert (only if requires_confirmation)
 * 
 * Transitions:
 * - idle -> triggered: When price change exceeds threshold
 * - triggered -> confirmed: When user clicks "Confirm" button
 * - triggered -> idle: When price recovers (optional, configurable)
 * - any -> deleted: When user deletes the alert
 */

/**
 * Main function to check all active alerts against current prices
 * Called either by internal poller or n8n webhook
 */
export async function checkPricesAndTriggerAlerts() {
    const results = {
        checked: 0,
        triggered: 0,
        errors: []
    };

    try {
        // Get all active alerts
        const activeAlerts = await alertQueries.getActive.all();

        if (activeAlerts.length === 0) {
            // console.log('[AlertEngine] No active alerts to check');
            return results;
        }

        // Get unique symbols from alerts
        const symbols = [...new Set(activeAlerts.map(a => a.symbol))];

        // Fetch current prices
        await fetchPrices(symbols);

        // Check each alert
        for (const alert of activeAlerts) {
            results.checked++;

            try {
                await checkSingleAlert(alert);
            } catch (error) {
                results.errors.push({ alertId: alert.id, error: error.message });
                console.error(`[AlertEngine] Error checking alert ${alert.id}:`, error.message);
            }
        }

        if (results.triggered > 0) {
            console.log(`[AlertEngine] Checked ${results.checked} alerts, triggered ${results.triggered}`);
        }
        return results;
    } catch (error) {
        console.error('[AlertEngine] Error in checkPricesAndTriggerAlerts:', error);
        throw error;
    }
}

/**
 * Check a single alert against current price
 */
async function checkSingleAlert(alert) {
    const currentPrice = getCurrentPrice(alert.symbol);
    if (!currentPrice) {
        console.log(`[AlertEngine] No price available for ${alert.symbol}`);
        return;
    }

    const historicalPrice = await getHistoricalPrice(alert.symbol, alert.time_window_minutes);
    if (!historicalPrice) {
        // console.log(`[AlertEngine] No historical price for ${alert.symbol} (${alert.time_window_minutes}min ago)`);
        return;
    }

    const percentChange = calculatePercentChange(historicalPrice, currentPrice);
    const thresholdExceeded = Math.abs(percentChange) >= Math.abs(alert.percent_change);

    // Direction check: positive threshold = price increase, negative = decrease
    const directionMatches = alert.percent_change > 0
        ? percentChange >= alert.percent_change
        : percentChange <= alert.percent_change;

    // console.log(`[AlertEngine] ${alert.symbol}: ${percentChange.toFixed(2)}% change (threshold: ${alert.percent_change}%)`);

    // State machine logic
    if (alert.state === 'idle' && thresholdExceeded && directionMatches) {
        await transitionToTriggered(alert, currentPrice, percentChange, historicalPrice);
    }
    // Note: We don't automatically transition back to idle - that's a design choice
    // The alert stays triggered until user confirms or deletes
}

/**
 * Transition alert from idle to triggered state
 */
async function transitionToTriggered(alert, currentPrice, percentChange, baselinePrice) {
    console.log(`[AlertEngine] Triggering alert ${alert.id} for ${alert.symbol}`);

    // Send Telegram notification
    const messageId = await sendAlertMessage(alert, currentPrice, percentChange, baselinePrice);

    // Update alert state
    await alertQueries.updateTriggerInfo.run({
        id: alert.id,
        state: 'triggered',
        telegram_message_id: messageId ? String(messageId) : null,
        baseline_price: baselinePrice
    });

    // Log the transition
    await historyQueries.create.run({
        alert_id: alert.id,
        event_type: 'TRIGGERED',
        old_state: 'idle',
        new_state: 'triggered',
        metadata: JSON.stringify({
            price: currentPrice,
            percent_change: percentChange,
            telegram_message_id: messageId
        })
    });
}

/**
 * Handle user confirmation of an alert
 * Called from Telegram callback handler
 * @param {number} alertId - ID of the alert to confirm
 * @param {string} messageId - Telegram message ID
 * @returns {boolean} True if confirmation was successful
 */
export async function confirmAlert(alertId, messageId) {
    const alert = await alertQueries.getById.get(alertId);

    if (!alert) {
        console.log(`[AlertEngine] Alert ${alertId} not found`);
        return false;
    }

    if (alert.state !== 'triggered') {
        console.log(`[AlertEngine] Alert ${alertId} is not in triggered state (current: ${alert.state})`);
        return false;
    }

    // Idempotency check - can only confirm once
    const existingConfirmation = await confirmationQueries.exists.get(alertId);
    if (existingConfirmation) {
        console.log(`[AlertEngine] Alert ${alertId} already confirmed`);
        return false;
    }

    // Record confirmation
    await confirmationQueries.create.run({
        alert_id: alertId,
        message_id: String(messageId)
    });

    // Update state
    await alertQueries.updateState.run({
        id: alertId,
        state: 'confirmed'
    });

    // Log the transition
    await historyQueries.create.run({
        alert_id: alertId,
        event_type: 'CONFIRMED',
        old_state: 'triggered',
        new_state: 'confirmed',
        metadata: JSON.stringify({ message_id: messageId })
    });

    console.log(`[AlertEngine] Alert ${alertId} confirmed`);
    return true;
}

/**
 * Handle deletion of an alert via Telegram
 * @param {number} alertId - ID of the alert to delete
 * @returns {boolean} True if deletion was successful
 */
export async function deleteAlertFromTelegram(alertId) {
    const alert = await alertQueries.getById.get(alertId);

    if (!alert) {
        console.log(`[AlertEngine] Alert ${alertId} not found`);
        return false;
    }

    // Log the deletion
    await historyQueries.create.run({
        alert_id: alertId,
        event_type: 'DELETED_VIA_TELEGRAM',
        old_state: alert.state,
        new_state: null,
        metadata: JSON.stringify({ symbol: alert.symbol })
    });

    // Delete confirmation record if exists
    await confirmationQueries.delete.run(alertId);

    // Delete the alert
    await alertQueries.delete.run(alertId);

    console.log(`[AlertEngine] Alert ${alertId} deleted`);
    return true;
}

/**
 * Manually trigger an alert (for testing via n8n webhook)
 * @param {number} alertId - ID of the alert to trigger
 */
export async function triggerAlertManually(alertId) {
    const alert = await alertQueries.getById.get(alertId);

    if (!alert) {
        throw new Error(`Alert ${alertId} not found`);
    }

    if (alert.state !== 'idle') {
        throw new Error(`Alert ${alertId} is not in idle state`);
    }

    // Fetch current price
    await fetchPrices([alert.symbol]);
    const currentPrice = getCurrentPrice(alert.symbol);

    if (!currentPrice) {
        throw new Error(`Could not fetch price for ${alert.symbol}`);
    }

    // Force trigger with current values
    await transitionToTriggered(alert, currentPrice, alert.percent_change, currentPrice);

    return { success: true, alertId, symbol: alert.symbol, price: currentPrice };
}

/**
 * Reset an alert back to idle state
 * @param {number} alertId - ID of the alert to reset
 */
export async function resetAlert(alertId) {
    const alert = await alertQueries.getById.get(alertId);

    if (!alert) {
        throw new Error(`Alert ${alertId} not found`);
    }

    // Clear confirmation if exists
    await confirmationQueries.delete.run(alertId);

    // Reset state
    await alertQueries.updateState.run({
        id: alertId,
        state: 'idle'
    });

    // Log the reset
    await historyQueries.create.run({
        alert_id: alertId,
        event_type: 'RESET',
        old_state: alert.state,
        new_state: 'idle',
        metadata: null
    });

    return { success: true, alertId };
}