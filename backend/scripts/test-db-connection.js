import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from backend/.env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '..', '.env');

dotenv.config({ path: envPath });

const { Pool } = pg;

console.log('Testing Database Connection...');
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Set (Hidden)' : 'Not Set');

if (!process.env.DATABASE_URL) {
    console.error('Error: DATABASE_URL is not set in .env');
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    },
    connectionTimeoutMillis: 10000 // 10 seconds
});

async function testConnection() {
    let client;
    try {
        console.log('Connecting to pool...');
        client = await pool.connect();
        console.log('Connected! Executing query...');
        const result = await client.query('SELECT NOW() as time, current_database() as db, version()');
        console.log('Query successful!');
        console.log('Time:', result.rows[0].time);
        console.log('Database:', result.rows[0].db);
        console.log('Version:', result.rows[0].version);
    } catch (error) {
        console.error('Connection failed:', error);
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

testConnection();
