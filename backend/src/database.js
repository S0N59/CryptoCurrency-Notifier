import pg from 'pg';
import config from './config.js';

const { Pool } = pg;

// Use connection pool
const pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: {
        rejectUnauthorized: false // Required for Supabase/Neon in some envs
    }
});

// Helper for single query execution
async function query(text, params) {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        // console.log('executed query', { text, duration, rows: res.rowCount });
        return res;
    } catch (error) {
        console.error('Query error', { text, error });
        throw error;
    }
}

// Initialize database schema
async function initializeDatabase() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Alerts table
        await client.query(`
            CREATE TABLE IF NOT EXISTS alerts (
                id SERIAL PRIMARY KEY,
                symbol TEXT NOT NULL,
                percent_change REAL NOT NULL,
                time_window_minutes INTEGER NOT NULL,
                enabled INTEGER DEFAULT 1,
                requires_confirmation INTEGER DEFAULT 0,
                state TEXT DEFAULT 'idle',
                telegram_user_id TEXT NOT NULL,
                telegram_message_id TEXT,
                last_triggered_at TIMESTAMP,
                baseline_price REAL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Allowed Telegram users
        await client.query(`
            CREATE TABLE IF NOT EXISTS allowed_users (
                id SERIAL PRIMARY KEY,
                telegram_id TEXT UNIQUE NOT NULL,
                username TEXT,
                is_active INTEGER DEFAULT 1,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Alert history/logs
        await client.query(`
            CREATE TABLE IF NOT EXISTS alert_history (
                id SERIAL PRIMARY KEY,
                alert_id INTEGER REFERENCES alerts(id) ON DELETE SET NULL,
                event_type TEXT NOT NULL,
                old_state TEXT,
                new_state TEXT,
                metadata TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Confirmation tracking
        await client.query(`
            CREATE TABLE IF NOT EXISTS confirmations (
                id SERIAL PRIMARY KEY,
                alert_id INTEGER UNIQUE NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
                confirmed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                message_id TEXT
            )
        `);

        // Price history
        await client.query(`
            CREATE TABLE IF NOT EXISTS price_history (
                id SERIAL PRIMARY KEY,
                symbol TEXT NOT NULL,
                price REAL NOT NULL,
                recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Indices
        await client.query(`CREATE INDEX IF NOT EXISTS idx_alerts_state ON alerts(state)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_alerts_enabled ON alerts(enabled)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(telegram_user_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_history_alert ON alert_history(alert_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_price_symbol ON price_history(symbol, recorded_at)`);

        await client.query('COMMIT');
        console.log('Database initialized successfully (PostgreSQL)');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Failed to initialize database:', e);
        throw e;
    } finally {
        client.release();
    }
}

// Helper to convert named params (@param) to indexed params ($1)
// Note: This is a simplistic implementation for migration ease
// Ideally we should rewrite queries to use $1, $2 directly
function normalizeQuery(sql, paramsObj) {
    if (!paramsObj) return { text: sql, values: [] };
    
    let text = sql;
    const values = [];
    const keys = Object.keys(paramsObj);
    
    // Replace @key with $n
    // We sort keys by length descending to avoid partial replacements
    keys.sort((a, b) => b.length - a.length).forEach((key, index) => {
        const placeholder = `$${index + 1}`;
        text = text.split(`@${key}`).join(placeholder);
        values.push(paramsObj[key]);
    });
    
    return { text, values };
}

// Alert queries
const alertQueries = {
    create: {
        run: async (params) => {
            const sql = `
                INSERT INTO alerts (symbol, percent_change, time_window_minutes, enabled, requires_confirmation, telegram_user_id)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id
            `;
            const values = [
                params.symbol, params.percent_change, params.time_window_minutes,
                params.enabled, params.requires_confirmation, params.telegram_user_id
            ];
            const res = await query(sql, values);
            return { lastInsertRowid: res.rows[0].id };
        }
    },

    getAll: {
        all: async () => {
            const res = await query('SELECT * FROM alerts ORDER BY created_at DESC');
            return res.rows;
        }
    },

    getById: {
        get: async (id) => {
            const res = await query('SELECT * FROM alerts WHERE id = $1', [id]);
            return res.rows[0];
        }
    },

    getActive: {
        all: async () => {
            const res = await query('SELECT * FROM alerts WHERE enabled = 1');
            return res.rows;
        }
    },

    getByUser: {
        all: async (telegram_id) => {
            const res = await query('SELECT * FROM alerts WHERE telegram_user_id = $1 ORDER BY created_at DESC', [telegram_id]);
            return res.rows;
        }
    },

    update: {
        run: async (params) => {
            const sql = `
                UPDATE alerts 
                SET symbol = $1, percent_change = $2, time_window_minutes = $3,
                    enabled = $4, requires_confirmation = $5, updated_at = CURRENT_TIMESTAMP
                WHERE id = $6
            `;
            const values = [
                params.symbol, params.percent_change, params.time_window_minutes,
                params.enabled, params.requires_confirmation, params.id
            ];
            await query(sql, values);
        }
    },

    updateState: {
        run: async (params) => {
            await query(
                'UPDATE alerts SET state = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                [params.state, params.id]
            );
        }
    },

    updateTriggerInfo: {
        run: async (params) => {
            const sql = `
                UPDATE alerts 
                SET state = $1, last_triggered_at = CURRENT_TIMESTAMP, telegram_message_id = $2, 
                    baseline_price = $3, updated_at = CURRENT_TIMESTAMP 
                WHERE id = $4
            `;
            await query(sql, [params.state, params.telegram_message_id, params.baseline_price, params.id]);
        }
    },

    delete: {
        run: async (id) => {
            await query('DELETE FROM alerts WHERE id = $1', [id]);
        }
    },

    toggleEnabled: {
        run: async (params) => {
            await query(
                'UPDATE alerts SET enabled = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                [params.enabled, params.id]
            );
        }
    }
};

// User queries
const userQueries = {
    create: {
        run: async (params) => {
            const sql = `
                INSERT INTO allowed_users (telegram_id, username, is_active)
                VALUES ($1, $2, 1)
                ON CONFLICT (telegram_id) DO UPDATE SET username = $2
            `;
            await query(sql, [params.telegram_id, params.username]);
        }
    },

    getAll: {
        all: async () => {
            const res = await query('SELECT * FROM allowed_users ORDER BY added_at DESC');
            return res.rows;
        }
    },

    getById: {
        get: async (telegram_id) => {
            const res = await query('SELECT * FROM allowed_users WHERE telegram_id = $1', [telegram_id]);
            return res.rows[0];
        }
    },

    isAllowed: {
        get: async (telegram_id) => {
            const res = await query('SELECT 1 FROM allowed_users WHERE telegram_id = $1 AND is_active = 1', [telegram_id]);
            return res.rows[0];
        }
    },

    delete: {
        run: async (telegram_id) => {
            await query('DELETE FROM allowed_users WHERE telegram_id = $1', [telegram_id]);
        }
    },

    toggleActive: {
        run: async (params) => {
            await query(
                'UPDATE allowed_users SET is_active = $1 WHERE telegram_id = $2',
                [params.is_active, params.telegram_id]
            );
        }
    }
};

// History queries
const historyQueries = {
    create: {
        run: async (params) => {
            const sql = `
                INSERT INTO alert_history (alert_id, event_type, old_state, new_state, metadata)
                VALUES ($1, $2, $3, $4, $5)
            `;
            await query(sql, [params.alert_id, params.event_type, params.old_state, params.new_state, params.metadata]);
        }
    },

    getAll: {
        all: async () => {
            const sql = `
                SELECT h.*, a.symbol 
                FROM alert_history h 
                LEFT JOIN alerts a ON h.alert_id = a.id 
                ORDER BY h.created_at DESC 
                LIMIT 100
            `;
            const res = await query(sql);
            return res.rows;
        }
    },

    getByAlert: {
        all: async (alert_id) => {
            const res = await query('SELECT * FROM alert_history WHERE alert_id = $1 ORDER BY created_at DESC', [alert_id]);
            return res.rows;
        }
    }
};

// Confirmation queries
const confirmationQueries = {
    create: {
        run: async (params) => {
            const sql = `
                INSERT INTO confirmations (alert_id, message_id)
                VALUES ($1, $2)
                ON CONFLICT (alert_id) DO NOTHING
            `;
            await query(sql, [params.alert_id, params.message_id]);
        }
    },

    exists: {
        get: async (alert_id) => {
            const res = await query('SELECT 1 FROM confirmations WHERE alert_id = $1', [alert_id]);
            return res.rows[0];
        }
    },

    delete: {
        run: async (alert_id) => {
            await query('DELETE FROM confirmations WHERE alert_id = $1', [alert_id]);
        }
    }
};

// Price history queries
const priceQueries = {
    record: {
        run: async (params) => {
            await query('INSERT INTO price_history (symbol, price) VALUES ($1, $2)', [params.symbol, params.price]);
        }
    },

    getRecent: {
        get: async (symbol, minutes) => {
            const sql = `
                SELECT * FROM price_history 
                WHERE symbol = $1 AND recorded_at >= NOW() - ($2 || ' minutes')::INTERVAL
                ORDER BY recorded_at ASC
                LIMIT 1
            `;
            const res = await query(sql, [symbol, minutes]);
            return res.rows[0];
        }
    },

    cleanup: {
        run: async () => {
            await query("DELETE FROM price_history WHERE recorded_at < NOW() - INTERVAL '1 day'");
        }
    }
};

export {
    pool,
    query,
    initializeDatabase,
    alertQueries,
    userQueries,
    historyQueries,
    confirmationQueries,
    priceQueries
};