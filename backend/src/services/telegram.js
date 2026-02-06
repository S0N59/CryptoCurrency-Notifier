import TelegramBot from 'node-telegram-bot-api';
import config from '../config.js';
import { alertQueries, userQueries, historyQueries } from '../database.js';
import { confirmAlert } from './alertEngine.js';
import {
    STATES,
    getConversation,
    updateConversation,
    resetConversation
} from './conversationHandler.js';

let bot = null;

// Colorful emojis for each crypto
const CRYPTO_EMOJIS = {
    BTC: '🟠',
    ETH: '🔷',
    SOL: '🟣',
    XRP: '⚪',
    ADA: '🔵',
    DOGE: '🐕',
    DOT: '🔴',
    MATIC: '💜',
    LINK: '🔗',
    AVAX: '🔺'
};

const SYMBOL_LIST = ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'DOT', 'MATIC', 'LINK', 'AVAX'];
const MAX_ALERTS_PER_USER = 10;

function getEmoji(symbol) {
    return CRYPTO_EMOJIS[symbol] || '💰';
}

/**
 * Initialize Telegram bot
 */
export function initializeTelegramBot() {
    if (bot) {
        return bot;
    }

    if (!config.telegramBotToken) {
        console.warn('[Telegram] Bot token not configured.');
        return null;
    }

    try {
        const options = { polling: config.telegramPolling };
        bot = new TelegramBot(config.telegramBotToken, options);

        if (!config.telegramPolling) {
             console.log('[Telegram] Polling disabled (Webhook mode or inactive)');
             // If using webhook, we need to set it up here or in index.js
             // For now, we just don't start polling.
        }

        bot.onText(/\/start/, handleStart);
        bot.onText(/\/menu/, showMainMenu);

        bot.on('callback_query', handleCallbackQuery);
        bot.on('message', handleMessage);

        console.log('[Telegram] Bot initialized successfully');
        return bot;
    } catch (error) {
        console.error('[Telegram] Failed to initialize bot:', error.message);
        return null;
    }
}

/**
 * Handle incoming webhook update manually
 * Used by Vercel serverless function
 */
export function processUpdate(update) {
    if (!bot) {
        initializeTelegramBot();
    }
    if (bot) {
        bot.processUpdate(update);
    }
}

async function ensureUserRegistered(userId, username) {
    const existing = await userQueries.getById.get(String(userId));
    if (!existing) {
        await userQueries.create.run({
            telegram_id: String(userId),
            username: username || null
        });
    }
}

/**
 * Show main menu
 */
async function showMainMenu(msg, editMessage = false) {
    const chatId = msg.chat?.id || msg;
    const userId = String(msg.from?.id || msg);

    if (msg.from) {
        await ensureUserRegistered(userId, msg.from.username);
    }

    const alerts = await alertQueries.getByUser.all(userId);
    const activeCount = alerts.filter(a => a.enabled).length;

    const text = `🚀 <b>Crypto Alerts Dashboard</b> 📊

📱 <b>Status</b>
📬 Total: ${alerts.length} | ✅ Active: ${activeCount}

👇 <b>Choose an action:</b>`;

    const keyboard = {
        inline_keyboard: [
            [{ text: '➕ Create New Alert', callback_data: 'menu:new' }],
            [{ text: '📋 View My Alerts', callback_data: 'menu:list' }],
            [{ text: '🌐 Open Mini App', web_app: { url: config.webAppUrl } }],
            [{ text: '❓ How It Works', callback_data: 'menu:help' }]
        ]
    };

    if (editMessage && msg.message) {
        await bot.editMessageText(text, {
            chat_id: msg.message.chat.id,
            message_id: msg.message.message_id,
            parse_mode: 'HTML',
            reply_markup: keyboard
        });
    } else {
        await bot.sendMessage(chatId, text, {
            parse_mode: 'HTML',
            reply_markup: keyboard
        });
    }
}

/**
 * Process a webhook update
 */
export function processUpdate(body) {
    if (!bot) return;
    bot.processUpdate(body);
}

/**
 * Handle /start
 */
async function handleStart(msg) {
    const chatId = msg.chat.id;
    const username = msg.from.first_name || 'friend';

    await ensureUserRegistered(String(msg.from.id), msg.from.username);

    const cryptoLine = SYMBOL_LIST.slice(0, 5).map(s => `${getEmoji(s)} ${s}`).join(' • ');

    const text = `🎉 <b>Welcome, ${username}!</b>

${cryptoLine}

🔔 I'm your personal <b>crypto alert bot</b>.
📈 Get notified when prices move.
📊 Track multiple coins at once.

✨ <b>Ready to get started?</b>`;

    const keyboard = {
        inline_keyboard: [
            [{ text: '🚀 Create My First Alert', callback_data: 'menu:new' }],
            [{ text: '📖 Show Menu', callback_data: 'menu:main' }]
        ]
    };

    await bot.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        reply_markup: keyboard
    });
}

/**
 * Handle callback queries
 */
async function handleCallbackQuery(query) {
    const userId = String(query.from.id);
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;

    await ensureUserRegistered(userId, query.from.username);

    if (data === 'menu:main') {
        resetConversation(userId);
        await bot.answerCallbackQuery(query.id);
        await showMainMenu(query, true);
        return;
    }

    if (data === 'menu:new') {
        await handleNewAlert(query);
        return;
    }

    if (data === 'menu:list') {
        await handleMyAlerts(query);
        return;
    }

    if (data === 'menu:help') {
        await showHelp(query);
        return;
    }

    if (data === 'cancel') {
        resetConversation(userId);
        await bot.answerCallbackQuery(query.id, { text: '❌ Cancelled' });
        await showMainMenu(query, true);
        return;
    }

    if (data.startsWith('sym:')) {
        const symbol = data.split(':')[1];
        await handleSymbolSelection(query, symbol);
        return;
    }

    if (data.startsWith('toggle:')) {
        await handleToggleAlert(query);
        return;
    }

    if (data.startsWith('del:')) {
        await handleDeleteAlert(query);
        return;
    }

    if (data.startsWith('confirm:')) {
        await handleConfirmAlert(query);
        return;
    }

    await bot.answerCallbackQuery(query.id);
}

/**
 * New alert flow
 */
async function handleNewAlert(query) {
    const userId = String(query.from.id);
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    const userAlerts = await alertQueries.getByUser.all(userId);
    if (userAlerts.length >= MAX_ALERTS_PER_USER) {
        await bot.answerCallbackQuery(query.id, {
            text: `⚠️ Max ${MAX_ALERTS_PER_USER} alerts reached!`,
            show_alert: true
        });
        return;
    }

    updateConversation(userId, STATES.AWAITING_SYMBOL, {});

    const rows = [];
    for (let i = 0; i < SYMBOL_LIST.length; i += 2) {
        const row = [];
        row.push({
            text: `${getEmoji(SYMBOL_LIST[i])} ${SYMBOL_LIST[i]}`,
            callback_data: `sym:${SYMBOL_LIST[i]}`
        });
        if (SYMBOL_LIST[i + 1]) {
            row.push({
                text: `${getEmoji(SYMBOL_LIST[i + 1])} ${SYMBOL_LIST[i + 1]}`,
                callback_data: `sym:${SYMBOL_LIST[i + 1]}`
            });
        }
        rows.push(row);
    }
    rows.push([{ text: '🔙 Back to Menu', callback_data: 'menu:main' }]);

    await bot.answerCallbackQuery(query.id);
    await bot.editMessageText(`🪙 <b>Select Cryptocurrency</b>

Pick a coin to track:`, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: rows }
    });
}

/**
 * Handle symbol selection
 */
async function handleSymbolSelection(query, symbol) {
    const userId = String(query.from.id);
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    updateConversation(userId, STATES.AWAITING_PERCENT, { symbol });

    await bot.answerCallbackQuery(query.id);
    await bot.editMessageText(`${getEmoji(symbol)} <b>${symbol} Selected</b>

📊 <b>Change threshold (%)</b>
Type a number:
• <code>5</code> for +5% (up)
• <code>-3</code> for -3% (down)`, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'cancel' }]]
        }
    });
}

/**
 * My alerts list
 */
async function handleMyAlerts(query) {
    const userId = String(query.from.id);
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    resetConversation(userId);

    const alerts = await alertQueries.getByUser.all(userId);

    if (alerts.length === 0) {
        await bot.answerCallbackQuery(query.id);
        await bot.editMessageText(`📭 <b>No Alerts Yet</b>

You haven't created any alerts.
Set up your first one! 🚀`, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '➕ Create Alert', callback_data: 'menu:new' }],
                    [{ text: '🔙 Back', callback_data: 'menu:main' }]
                ]
            }
        });
        return;
    }

    let text = `📋 <b>Your Active Alerts</b>\n\n`;

    const buttons = [];

    for (const alert of alerts) {
        const emoji = getEmoji(alert.symbol);
        const status = alert.enabled ? '🟢' : '⏸️';
        const dir = alert.percent_change >= 0 ? '📈 +' : '📉 ';

        text += `${status} ${emoji} <b>${alert.symbol}</b>: ${dir}${alert.percent_change}% (${alert.time_window_minutes}m)\n`;

        buttons.push([
            {
                text: `${emoji} ${alert.symbol} ${alert.percent_change >= 0 ? '+' : ''}${alert.percent_change}%`,
                callback_data: `toggle:${alert.id}`
            },
            { text: '🗑️', callback_data: `del:${alert.id}` }
        ]);
    }

    text += `\n<i>Tap to pause/resume • 🗑️ to delete</i>`;

    buttons.push([{ text: '🔙 Back to Menu', callback_data: 'menu:main' }]);

    await bot.answerCallbackQuery(query.id);
    await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons }
    });
}

/**
 * Toggle alert
 */
async function handleToggleAlert(query) {
    const userId = String(query.from.id);
    const alertId = parseInt(query.data.split(':')[1], 10);
    const alert = await alertQueries.getById.get(alertId);

    if (!alert || alert.telegram_user_id !== userId) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Alert not found' });
        return;
    }

    await alertQueries.toggleEnabled.run({ id: alertId, enabled: alert.enabled ? 0 : 1 });

    await bot.answerCallbackQuery(query.id, {
        text: alert.enabled ? '⏸️ Paused' : '▶️ Resumed'
    });

    await handleMyAlerts(query);
}

/**
 * Delete alert
 */
async function handleDeleteAlert(query) {
    const userId = String(query.from.id);
    const alertId = parseInt(query.data.split(':')[1], 10);
    const alert = alertQueries.getById.get(alertId);

    if (!alert || alert.telegram_user_id !== userId) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Alert not found' });
        return;
    }

    historyQueries.create.run({
        alert_id: alertId,
        event_type: 'DELETED',
        old_state: alert.state,
        new_state: null,
        metadata: JSON.stringify({ symbol: alert.symbol })
    });

    alertQueries.delete.run(alertId);

    await bot.answerCallbackQuery(query.id, { text: '🗑️ Deleted!' });
    await handleMyAlerts(query);
}

/**
 * Confirm alert
 */
async function handleConfirmAlert(query) {
    const userId = String(query.from.id);
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const alertId = parseInt(query.data.split(':')[1], 10);

    const alert = alertQueries.getById.get(alertId);

    if (!alert || alert.telegram_user_id !== userId) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Alert not found' });
        return;
    }

    const success = await confirmAlert(alertId, String(messageId));

    if (success) {
        await bot.answerCallbackQuery(query.id, { text: '✅ Confirmed!' });

        // Update the message text to show it's historical/confirmed
        const originalText = query.message.text || '';
        const timestamp = new Date().toLocaleTimeString();
        const newText = `<b>✅ CONFIRMED AT ${timestamp}</b>\n\n${originalText}`;

        await bot.editMessageText(newText, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[
                    { text: '✓ Received', callback_data: 'noop' }
                ]]
            }
        });
    } else {
        await bot.answerCallbackQuery(query.id, { text: '⚠️ Already confirmed', show_alert: true });
    }
}

/**
 * Show help
 */
async function showHelp(query) {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    const text = `❓ <b>How It Works</b>

1️⃣ <b>Create Alert</b>: Pick a coin and threshold.
2️⃣ <b>Threshold</b>: e.g., +5% = notify on rise.
3️⃣ <b>Time Window</b>: e.g., 10 min window.
4️⃣ <b>Notify</b>: Get pinged when it hits.

💡 <b>Example:</b>
${getEmoji('BTC')} BTC +5% in 10 min.`;

    await bot.answerCallbackQuery(query.id);
    await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [[{ text: '🔙 Back to Menu', callback_data: 'menu:main' }]]
        }
    });
}

/**
 * Handle text messages
 */
async function handleMessage(msg) {
    if (!msg.text || msg.text.startsWith('/')) return;

    const chatId = msg.chat.id;
    const userId = String(msg.from.id);
    const text = msg.text.trim();

    const conv = getConversation(userId);

    if (conv.state === STATES.AWAITING_PERCENT) {
        const percent = parseFloat(text);

        if (isNaN(percent) || percent === 0) {
            await bot.sendMessage(chatId, '❌ Enter a valid number\nExample: <code>5</code> or <code>-3</code>', { parse_mode: 'HTML' });
            return;
        }

        updateConversation(userId, STATES.AWAITING_TIMEWINDOW, { percent_change: percent });

        const dir = percent >= 0 ? '📈' : '📉';
        await bot.sendMessage(chatId, `${dir} <b>Got it: ${percent >= 0 ? '+' : ''}${percent}%</b>

⏱️ <b>Enter time window (min)</b>
Example: <code>10</code> for 10 minutes`,
            { parse_mode: 'HTML' }
        );
        return;
    }

    if (conv.state === STATES.AWAITING_TIMEWINDOW) {
        const minutes = parseInt(text, 10);

        if (isNaN(minutes) || minutes < 1 || minutes > 1440) {
            await bot.sendMessage(chatId, '❌ Enter 1-1440 minutes');
            return;
        }

        const { symbol, percent_change } = conv.data;

        try {
            const result = await alertQueries.create.run({
                symbol,
                percent_change,
                time_window_minutes: minutes,
                enabled: 1,
                requires_confirmation: 1,
                telegram_user_id: userId
            });

            await historyQueries.create.run({
                alert_id: result.lastInsertRowid,
                event_type: 'CREATED',
                old_state: null,
                new_state: 'idle',
                metadata: JSON.stringify({ symbol, percent_change, time_window_minutes: minutes })
            });

            const dir = percent_change >= 0 ? '📈 +' : '📉 ';

            await bot.sendMessage(chatId, `🎉 <b>Alert Created!</b>

${getEmoji(symbol)} <b>${symbol}</b>: ${dir}${percent_change}% (${minutes}m)
✅ I'll notify you when this happens!`,
                {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '➕ Add Another', callback_data: 'menu:new' }],
                            [{ text: '📖 Back to Menu', callback_data: 'menu:main' }]
                        ]
                    }
                }
            );
        } catch (error) {
            console.error('[Telegram] Create alert failed:', error);
            await bot.sendMessage(chatId, '❌ Failed to create alert.');
        }

        resetConversation(userId);
        return;
    }
}

/**
 * Send price alert notification
 */
export async function sendAlertMessage(alert, currentPrice, percentChange, baselinePrice) {
    if (!bot) return null;

    const emoji = getEmoji(alert.symbol);
    const isUp = percentChange >= 0;

    // Directional emojis
    const headerEmoji = isUp ? '🚀' : '💥';
    const trendEmoji = isUp ? '📈 UP' : '📉 DOWN';
    const changeSign = isUp ? '➕' : '➖';
    const diff = Math.abs(currentPrice - baselinePrice);

    const text = `${headerEmoji} <b>${emoji} ${alert.symbol} ALERT</b>

${trendEmoji} <b>${Math.abs(percentChange).toFixed(2)}%</b>

💰 <b>Current:</b> <code>$${currentPrice.toLocaleString()}</code>
🕒 <b>Started:</b> <code>$${baselinePrice.toLocaleString()}</code>
✨ <b>Move:</b> <code>$${diff.toLocaleString()}</code> ${changeSign}
⏱ <b>Window:</b> <code>${alert.time_window_minutes}m</code>

✅ <i>Tap to confirm</i>`;

    try {
        const sent = await bot.sendMessage(alert.telegram_user_id, text, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[
                    { text: '✅ Confirm Receipt', callback_data: `confirm:${alert.id}` },
                    { text: '🗑️ Remove Alert', callback_data: `del:${alert.id}` }
                ]]
            }
        });

        console.log(`[Telegram] Alert sent: ${alert.symbol} to ${alert.telegram_user_id}`);
        return sent.message_id;
    } catch (error) {
        console.error('[Telegram] Send failed:', error.message);
        return null;
    }
}

export function getBot() {
    return bot;
}
