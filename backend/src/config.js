import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from backend root
dotenv.config({ path: join(__dirname, '..', '.env') });

const config = {
  // Telegram Configuration
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  webAppUrl: process.env.WEB_APP_URL || 'https://example.com',
  telegramPolling: process.env.VERCEL ? false : (process.env.TELEGRAM_POLLING !== 'false'),

  // Admin Authentication
  adminToken: process.env.ADMIN_TOKEN || 'default-admin-token',
  cronSecret: process.env.CRON_SECRET,

  // Polling Configuration
  pollInterval: parseInt(process.env.POLL_INTERVAL || '60', 10) * 1000, // Convert to ms

  // Server Configuration
  port: parseInt(process.env.PORT || '3001', 10),

  // Database Configuration
  databaseUrl: process.env.DATABASE_URL,

  // CoinGecko API (free, no API key required)
  coinGeckoApiUrl: 'https://api.coingecko.com/api/v3',

  // Supported symbols mapping (symbol -> CoinGecko ID)
  symbolMap: {
    'BTC': 'bitcoin',
    'ETH': 'ethereum',
    'SOL': 'solana',
    'XRP': 'ripple',
    'ADA': 'cardano',
    'DOGE': 'dogecoin',
    'DOT': 'polkadot',
    'MATIC': 'matic-network',
    'LINK': 'chainlink',
    'AVAX': 'avalanche-2'
  }
};

// Validate required configuration
export function validateConfig() {
  const warnings = [];

  if (!config.telegramBotToken) {
    warnings.push('TELEGRAM_BOT_TOKEN is not set. Telegram notifications will be disabled.');
  }

  if (config.adminToken === 'default-admin-token') {
    warnings.push('ADMIN_TOKEN is using default value. Please set a secure token in production.');
  }

  if (config.webAppUrl === 'https://example.com') {
      warnings.push('WEB_APP_URL is using default value. Please set the actual URL of your Mini App.');
  }

  if (!config.databaseUrl) {
    warnings.push('DATABASE_URL is not set. Database connection will fail.');
  }

  return warnings;
}

export default config;
