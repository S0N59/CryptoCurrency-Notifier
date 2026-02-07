import express from 'express';
import cors from 'cors';
import config, { validateConfig } from './config.js';
import { initializeDatabase } from './database.js';
import { authMiddleware } from './middleware/auth.js';
import { initializeTelegramBot, processUpdate } from './services/telegram.js';
import { checkPricesAndTriggerAlerts } from './services/alertEngine.js';
import { cleanupPriceHistory, getSupportedSymbols } from './services/pricePoller.js';

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import routes
import alertsRouter from './routes/alerts.js';
import usersRouter from './routes/users.js';
import historyRouter from './routes/history.js';

const app = express();

// Request logging middleware for debugging
app.use((req, res, next) => {
    console.log(`[Request] ${req.method} ${req.url} (Path: ${req.path})`);
    next();
});

// Middleware
app.use(cors({
    origin: [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'https://cryptocurrency-32f7d.web.app',
        'https://cryptocurrency-32f7d.firebaseapp.com'
    ],
    credentials: true
}));
app.use(express.json());
app.use((req, res, next) => {
    if (!req.path.startsWith('/api') && req.path !== '/') {
        req.url = `/api${req.url}`;
    }
    next();
});

// Lazy initialization for Serverless
let isInitialized = false;
async function ensureInitialized(req, res, next) {
    if (!isInitialized) {
        try {
            console.log('[Init] Starting lazy initialization...');
            await initializeDatabase();
            initializeTelegramBot();
            isInitialized = true;
            console.log('[Init] Lazy initialization complete.');
        } catch (error) {
            console.error('[Init] Initialization failed:', error);
            // We continue as some routes might work without DB, 
            // but we don't set isInitialized to true so we try again next time
        }
    }
    next();
}

// Apply initialization middleware to all API routes
app.use('/api', ensureInitialized);

// Health check (public)
app.get(['/api/health', '/health'], (req, res) => {
    res.json({
        status: 'ok',
        version: '1.0.4',
        buildTimestamp: new Date().toISOString(),
        env: process.env.VERCEL ? 'vercel' : 'local',
        initialized: isInitialized,
        configWarnings: validateConfig()
    });
});

// Simple auth debug (public but obscured)
app.get('/api/auth-debug', (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.split(' ')[1] : null;
    
    res.json({
        hasAuthHeader: !!authHeader,
        tokenPrefix: token ? token.substring(0, 4) + '...' : 'none',
        expectedPrefix: config.adminToken ? config.adminToken.substring(0, 4) + '...' : 'none',
        tokenMatch: token === config.adminToken,
        envAdminTokenSet: !!process.env.ADMIN_TOKEN,
        envBotTokenSet: !!process.env.TELEGRAM_BOT_TOKEN
    });
});

// Routing debug (public)
app.get('/api/debug-routing', (req, res) => {
    res.json({
        url: req.url,
        path: req.path,
        method: req.method,
        baseUrl: req.baseUrl,
        originalUrl: req.originalUrl,
        headers: {
            host: req.headers.host,
            'x-forwarded-proto': req.headers['x-forwarded-proto'],
            'x-vercel-deployment-url': req.headers['x-vercel-deployment-url']
        },
        env: {
            NODE_ENV: process.env.NODE_ENV,
            VERCEL: process.env.VERCEL
        }
    });
});

// Database connection test (protected by admin token)
app.get('/api/test-db', async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.split(' ')[1] : null;

    console.log(`[Auth] Test-DB request. Received token: ${token ? token.substring(0, 4) + '...' : 'none'}`);
    console.log(`[Auth] Expected admin token starts with: ${config.adminToken.substring(0, 4)}...`);

    if (authHeader !== `Bearer ${config.adminToken}`) {
        return res.status(401).json({ 
            error: 'Unauthorized',
            received: token ? token.substring(0, 4) + '...' : 'none',
            expected: config.adminToken.substring(0, 4) + '...'
        });
    }

    try {
        const { pool } = await import('./database.js');
        const result = await pool.query('SELECT NOW() as time, current_database() as db');
        res.json({
            success: true,
            message: 'Database connection successful',
            data: result.rows[0]
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Database connection failed',
            error: error.message
        });
    }
});

// Get supported symbols (public)
app.get('/api/symbols', (req, res) => {
    res.json(getSupportedSymbols());
});

// Auth endpoint for frontend login
app.post('/api/auth/login', (req, res) => {
    const { token } = req.body;

    if (token === config.adminToken) {
        res.json({
            success: true,
            message: 'Authentication successful'
        });
    } else {
        res.status(401).json({
            success: false,
            message: 'Invalid token'
        });
    }
});

// Protected API routes
app.use('/api/alerts', authMiddleware, alertsRouter);
app.use('/api/users', authMiddleware, usersRouter);
app.use('/api/history', authMiddleware, historyRouter);

// Telegram Webhook
app.post('/api/telegram/webhook', (req, res) => {
    try {
        console.log('[Webhook] Received update:', JSON.stringify(req.body));
        processUpdate(req.body);
        res.sendStatus(200);
    } catch (error) {
        console.error('Webhook processing error:', error);
        res.sendStatus(500);
    }
});

// Cron endpoint for Vercel
app.get('/api/cron/check-alerts', async (req, res) => {
    // Advanced security: check for Admin Token OR Cron Secret
    // Support Header (Authorization, x-cron-secret) or Query Param (secret)
    const authHeader = req.headers.authorization;
    const cronHeader = req.headers['x-cron-secret'];
    const querySecret = req.query.secret;

    const authorized = 
        (authHeader === `Bearer ${config.adminToken}`) ||
        (config.cronSecret && cronHeader === config.cronSecret) ||
        (config.cronSecret && querySecret === config.cronSecret);

    if (!authorized) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Set a timeout for the cron execution (e.g., 55 seconds for Vercel Pro, but 9s for Hobby)
    // We'll use 9000ms to be safe on free tier
    const TIMEOUT_MS = 9000;
    
    try {
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Operation timed out')), TIMEOUT_MS)
        );

        const checkPromise = checkPricesAndTriggerAlerts();
        
        const results = await Promise.race([checkPromise, timeoutPromise]);
        res.json(results);
    } catch (error) {
        console.error('Cron error:', error);
        res.status(error.message === 'Operation timed out' ? 504 : 500).json({ error: error.message });
    }
});

// Default root handler
app.get('/', (req, res) => {
    res.json({
        message: 'Crypto Alerts API is running',
        frontend: config.webAppUrl,
        endpoints: {
            health: '/api/health',
            webhook: '/api/telegram/webhook'
        }
    });
});

// Handle 404 for all other routes
app.use((req, res) => {
    res.status(404).json({ 
        error: 'API endpoint not found',
        debug: {
            url: req.url,
            path: req.path,
            method: req.method
        }
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message
    });
});

// Initialize and start
async function start() {
    console.log('═══════════════════════════════════════════════════');
    console.log('  Event-Driven Alert & Approval System');
    console.log('═══════════════════════════════════════════════════');

    // Validate configuration
    const warnings = validateConfig();
    if (warnings.length > 0) {
        console.warn('Configuration warnings:');
        warnings.forEach(w => console.warn(`- ${w}`));
    }

    // Initialize Database (Async)
    try {
        await initializeDatabase();
    } catch (error) {
        console.error('Failed to connect to database:', error);
        // Don't exit process in Vercel environment, just log error
        if (!process.env.VERCEL) {
            process.exit(1);
        }
    }

    // Initialize Telegram Bot
    const bot = initializeTelegramBot();

    // Start server
    app.listen(config.port, () => {
        console.log(`\n🚀 Server running on port ${config.port}`);
        console.log(`   Health check: http://localhost:${config.port}/health`);
    });

    // Start background jobs only if NOT in serverless/Vercel environment
    if (!process.env.VERCEL) {
        if (bot) {
            console.log('   Telegram Bot polling started');
        }

        // Polling loop
        console.log(`   Price polling active (every ${config.pollInterval / 1000}s)`);
        setInterval(async () => {
            try {
                await checkPricesAndTriggerAlerts();
            } catch (error) {
                console.error('Polling error:', error);
            }
        }, config.pollInterval);

        // Cleanup loop (every hour)
        setInterval(async () => {
            try {
                await cleanupPriceHistory();
            } catch (error) {
                console.error('Cleanup error:', error);
            }
        }, 60 * 60 * 1000);
    } else {
        console.log('   Serverless mode: Polling disabled. Relying on Cron and Webhooks.');
    }
}

// Start server only if running directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    start();
} 
// Note: When imported by Vercel (via api/index.js), we don't start the server
// and we don't run top-level initialization. We rely on ensureInitialized middleware.

export default app;
