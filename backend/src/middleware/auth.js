import crypto from 'crypto';
import config from '../config.js';
import { userQueries } from '../database.js';

/**
 * Verify Telegram Web App data
 * @param {string} telegramInitData 
 * @returns {object|null} The user object if valid, null otherwise
 */
function verifyTelegramWebAppData(telegramInitData) {
    if (!telegramInitData) return null;

    try {
        const urlParams = new URLSearchParams(telegramInitData);
        const hash = urlParams.get('hash');
        
        if (!hash) return null;

        urlParams.delete('hash');
        
        // Sort keys alphabetically
        const params = [];
        for (const [key, value] of urlParams.entries()) {
            params.push(`${key}=${value}`);
        }
        params.sort();
        
        const dataCheckString = params.join('\n');
        
        // Create secret key
        const secretKey = crypto
            .createHmac('sha256', 'WebAppData')
            .update(config.telegramBotToken)
            .digest();
            
        // Calculate hash
        const calculatedHash = crypto
            .createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex');
            
        if (calculatedHash === hash) {
            const userStr = urlParams.get('user');
            if (userStr) {
                return JSON.parse(userStr);
            }
        }
    } catch (error) {
        console.error('Telegram auth verification failed:', error);
    }
    
    return null;
}

/**
 * Authentication middleware
 * Supports:
 * 1. Admin Token (Bearer <token>)
 * 2. Telegram Web App Init Data (Bearer <initData>)
 */
export async function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            error: 'Authorization header required',
            message: 'Please provide a Bearer token'
        });
    }

    const parts = authHeader.split(' ');

    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return res.status(401).json({
            error: 'Invalid authorization format',
            message: 'Use format: Bearer <token>'
        });
    }

    const token = parts[1];

    // Check if it's the Admin Token
    if (token === config.adminToken) {
        req.user = { role: 'admin' };
        return next();
    }

    // Check if it's Telegram Web App Data
    // Simple heuristic: Telegram data usually contains "query_id=" or "user="
    if (token.includes('user=') || token.includes('query_id=')) {
        const telegramUser = verifyTelegramWebAppData(token);
        if (telegramUser) {
            req.user = {
                role: 'user',
                telegram_id: String(telegramUser.id),
                username: telegramUser.username,
                first_name: telegramUser.first_name
            };

            // Ensure user is registered in our database
            try {
                const existing = await userQueries.getById.get(String(telegramUser.id));
                if (!existing) {
                    await userQueries.create.run({
                        telegram_id: String(telegramUser.id),
                        username: telegramUser.username || null
                    });
                }
            } catch (err) {
                console.error('Failed to ensure user registration:', err);
                // Continue anyway, alert creation might fail later if user check is strict
            }

            return next();
        }
    }

    return res.status(403).json({
        error: 'Invalid token',
        message: 'The provided token is not valid'
    });
}
