import { processUpdate } from '../../src/services/telegram.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const update = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        processUpdate(update || {});
        return res.status(200).json({ ok: true });
    } catch (error) {
        console.error('Webhook processing error:', error);
        return res.status(500).json({ error: 'Webhook processing failed' });
    }
}
