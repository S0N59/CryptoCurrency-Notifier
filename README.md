# Crypto Price Alerts Bot

A Telegram bot that alerts you when cryptocurrency prices change by your specified thresholds.

## Features

- 🔔 **Custom Alerts**: Set price change thresholds for any supported crypto
- ⏱️ **Time Windows**: Define the time period to monitor (e.g., alert me if BTC rises 5% in 10 minutes)
- 📱 **Telegram Native**: Configure everything directly in Telegram—no web panel needed
- 🔄 **Real-Time**: Polls prices every minute from CoinGecko (free API)

## Supported Cryptocurrencies

BTC, ETH, SOL, XRP, ADA, DOGE, DOT, MATIC, LINK, AVAX

## Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message and registration |
| `/newalert` | Create a new price alert |
| `/myalerts` | View and manage your alerts |
| `/help` | Show available commands |

## Setup

### Prerequisites

- Node.js 18+
- A Telegram bot token from [@BotFather](https://t.me/botfather)

### Installation

```bash
# 1. Install dependencies
cd backend
npm install

# 2. Configure environment
cp .env.example .env
```

Edit `backend/.env`:

```env
# Required: Your Telegram bot token from @BotFather
TELEGRAM_BOT_TOKEN=your_bot_token_here

# Optional: Admin access token (for web panel monitoring)
ADMIN_TOKEN=your_secure_token

# Optional: Polling interval in seconds (default: 60)
POLL_INTERVAL=60
```

### Run

```bash
# Start the bot
cd backend
npm start
```

## How It Works

1. **Start the bot** with `/start` to register
2. **Create an alert** with `/newalert`:
   - Select a cryptocurrency
   - Enter the % change threshold (e.g., `5` for +5%, `-3` for -3%)
   - Enter the time window in minutes
3. **Receive notifications** when your threshold is hit
4. **Manage alerts** with `/myalerts` to pause, resume, or delete

## Example

```
You: /newalert
Bot: Select a cryptocurrency: [BTC] [ETH] [SOL] ...
You: [BTC]
Bot: Enter price change threshold:
You: 5
Bot: Enter time window in minutes:
You: 10
Bot: ✅ Alert Created!
     📊 BTC | +5% | 10 minutes
```

When BTC rises 5%+ within any 10-minute window, you'll receive:
```
📈 ALERT: BTC

💰 Price: $42,150
📊 Change: +5.23%
⏱️ Window: 10 minutes

[Confirm] [Delete]
```

## Project Structure

```
crypto-alerts/
├── backend/
│   ├── src/
│   │   ├── index.js              # Express server
│   │   ├── config.js             # Environment config
│   │   ├── database.js           # SQLite schema
│   │   ├── services/
│   │   │   ├── telegram.js       # Bot commands & handlers
│   │   │   ├── conversationHandler.js
│   │   │   ├── alertEngine.js    # Price monitoring logic
│   │   │   └── pricePoller.js    # CoinGecko API
│   │   ├── routes/               # Optional REST API
│   │   └── middleware/
│   ├── data/                     # SQLite database
│   └── package.json
├── frontend/                     # Optional admin panel
└── README.md
```

## Admin Panel (Optional)

A React web panel is included for monitoring. Access at http://localhost:5173 after running:

```bash
cd frontend
npm install
npm run dev
```

Login with your `ADMIN_TOKEN`.

## License

MIT
