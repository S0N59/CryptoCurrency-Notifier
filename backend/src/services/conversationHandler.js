/**
 * Conversation Handler
 * Manages multi-step conversations for the Telegram bot
 */

// In-memory conversation state storage
const conversations = new Map();

// Conversation states
const STATES = {
            IDLE: 'idle',
            AWAITING_SYMBOL: 'awaiting_symbol',
            AWAITING_PERCENT: 'awaiting_percent',
            AWAITING_TIMEWINDOW: 'awaiting_timewindow',
            AWAITING_EDIT_CHOICE: 'awaiting_edit_choice',
            AWAITING_EDIT_VALUE: 'awaiting_edit_value',
            AWAITING_DELETE_CONFIRM: 'awaiting_delete_confirm'
};

/**
 * Get or create conversation state for a user
 */
function getConversation(userId) {
            if (!conversations.has(userId)) {
                        conversations.set(userId, {
                                    state: STATES.IDLE,
                                    data: {}
                        });
            }
            return conversations.get(userId);
}

/**
 * Update conversation state
 */
function updateConversation(userId, state, data = {}) {
            const conv = getConversation(userId);
            conv.state = state;
            conv.data = { ...conv.data, ...data };
            conversations.set(userId, conv);
}

/**
 * Reset conversation to idle
 */
function resetConversation(userId) {
            conversations.set(userId, {
                        state: STATES.IDLE,
                        data: {}
            });
}

/**
 * Check if user is in a conversation
 */
function isInConversation(userId) {
            const conv = getConversation(userId);
            return conv.state !== STATES.IDLE;
}

export {
            STATES,
            getConversation,
            updateConversation,
            resetConversation,
            isInConversation
};
