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

// Health check (public)
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString()
    });
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
        processUpdate(req.body);
        res.sendStatus(200);
    } catch (error) {
        console.error('Webhook processing error:', error);
        res.sendStatus(500);
    }
});

// Cron endpoint for Vercel
app.get('/api/cron/check-alerts', async (req, res) => {
    // Basic security: check for Admin Token or Cron Secret
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${config.adminToken}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    try {
        const results = await checkPricesAndTriggerAlerts();
        res.json(results);
    } catch (error) {
        console.error('Cron error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Serve static frontend files
const frontendPath = join(__dirname, '..', '..', 'frontend', 'dist');
app.use(express.static(frontendPath));

// Handle SPA routing - send all non-API requests to index.html
app.get('*', (req, res) => {
    // Skip API calls that weren't matched above
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(join(frontendPath, 'index.html'));
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
} else {
    // Export for Vercel
    // We need to initialize DB and Bot when imported as a module (e.g. by Vercel)
    // However, Vercel creates a new instance per request (or reuses warm ones).
    // We should do lazy initialization or top-level initialization.
    // For simplicity, we trigger initialization asynchronously.
    initializeDatabase().catch(e => console.error('DB Init Error:', e));
    initializeTelegramBot();
}

export default app;
