import { Router } from 'express';
import { alertQueries, historyQueries, userQueries } from '../database.js';

const router = Router();

// Get all alerts (scoped by user if not admin)
router.get('/', async (req, res) => {
    try {
        let alerts;
        if (req.user && req.user.role === 'user') {
            alerts = await alertQueries.getByUser.all(req.user.telegram_id);
        } else {
            // Admin sees all
            alerts = await alertQueries.getAll.all();
        }
        res.json(alerts);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch alerts', message: error.message });
    }
});

// Get single alert by ID
router.get('/:id', async (req, res) => {
    try {
        const alert = await alertQueries.getById.get(req.params.id);
        if (!alert) {
            return res.status(404).json({ error: 'Alert not found' });
        }
        
        // Security check: ensure user owns the alert
        if (req.user && req.user.role === 'user' && alert.telegram_user_id !== req.user.telegram_id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        res.json(alert);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch alert', message: error.message });
    }
});

// Create new alert
router.post('/', async (req, res) => {
    try {
        const { symbol, percent_change, time_window_minutes, enabled, requires_confirmation } = req.body;
        let { telegram_user_id } = req.body;

        // If regular user, force their ID
        if (req.user && req.user.role === 'user') {
            telegram_user_id = req.user.telegram_id;
        }

        // Validation
        if (!symbol || !percent_change || !time_window_minutes || !telegram_user_id) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['symbol', 'percent_change', 'time_window_minutes', 'telegram_user_id']
            });
        }

        // Check if user is allowed
        let userAllowed = await userQueries.isAllowed.get(telegram_user_id);
        
        // Auto-register user if they are authenticated via Telegram Mini App
        if (!userAllowed && req.user && req.user.role === 'user' && req.user.telegram_id === telegram_user_id) {
            await userQueries.create.run({
                telegram_id: telegram_user_id,
                username: req.user.username || null
            });
            userAllowed = true;
        }

        if (!userAllowed) {
            return res.status(403).json({
                error: 'User not allowed',
                message: `Telegram user ${telegram_user_id} is not in the allowed list`
            });
        }

        const result = await alertQueries.create.run({
            symbol: symbol.toUpperCase(),
            percent_change: parseFloat(percent_change),
            time_window_minutes: parseInt(time_window_minutes, 10),
            enabled: enabled !== false ? 1 : 0,
            requires_confirmation: requires_confirmation ? 1 : 0,
            telegram_user_id: String(telegram_user_id)
        });

        const newAlert = await alertQueries.getById.get(result.lastInsertRowid);

        // Log creation
        await historyQueries.create.run({
            alert_id: result.lastInsertRowid,
            event_type: 'CREATED',
            old_state: null,
            new_state: 'idle',
            metadata: JSON.stringify({ symbol, percent_change, time_window_minutes })
        });

        res.status(201).json(newAlert);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create alert', message: error.message });
    }
});

// Update alert
router.put('/:id', async (req, res) => {
    try {
        const { symbol, percent_change, time_window_minutes, enabled, requires_confirmation } = req.body;
        
        const existing = await alertQueries.getById.get(req.params.id);
        if (!existing) {
            return res.status(404).json({ error: 'Alert not found' });
        }

        // Security check
        if (req.user && req.user.role === 'user' && existing.telegram_user_id !== req.user.telegram_id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        await alertQueries.update.run({
            id: req.params.id,
            symbol: symbol.toUpperCase(),
            percent_change: parseFloat(percent_change),
            time_window_minutes: parseInt(time_window_minutes, 10),
            enabled: enabled !== false ? 1 : 0,
            requires_confirmation: requires_confirmation ? 1 : 0
        });

        // Log update
        await historyQueries.create.run({
            alert_id: req.params.id,
            event_type: 'UPDATED',
            old_state: JSON.stringify(existing),
            new_state: JSON.stringify({ symbol, percent_change, time_window_minutes, enabled }),
            metadata: null
        });

        const updated = await alertQueries.getById.get(req.params.id);
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update alert', message: error.message });
    }
});

// Delete alert
router.delete('/:id', async (req, res) => {
    try {
        const existing = await alertQueries.getById.get(req.params.id);
        if (!existing) {
            return res.status(404).json({ error: 'Alert not found' });
        }

        // Security check
        if (req.user && req.user.role === 'user' && existing.telegram_user_id !== req.user.telegram_id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        await alertQueries.delete.run(req.params.id);

        // Log deletion (will have null alert_id)
        await historyQueries.create.run({
            alert_id: null,
            event_type: 'DELETED',
            old_state: JSON.stringify(existing),
            new_state: null,
            metadata: `Alert ${req.params.id} deleted`
        });

        res.json({ success: true, message: 'Alert deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete alert', message: error.message });
    }
});

// Toggle enabled status
router.patch('/:id/toggle', async (req, res) => {
    try {
        const existing = await alertQueries.getById.get(req.params.id);
        if (!existing) {
            return res.status(404).json({ error: 'Alert not found' });
        }

        // Security check
        if (req.user && req.user.role === 'user' && existing.telegram_user_id !== req.user.telegram_id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const newEnabled = existing.enabled ? 0 : 1;

        await alertQueries.toggleEnabled.run({
            id: req.params.id,
            enabled: newEnabled
        });

        await historyQueries.create.run({
            alert_id: req.params.id,
            event_type: newEnabled ? 'ENABLED' : 'DISABLED',
            old_state: existing.enabled ? 'enabled' : 'disabled',
            new_state: newEnabled ? 'enabled' : 'disabled',
            metadata: null
        });

        const updated = await alertQueries.getById.get(req.params.id);
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Failed to toggle alert', message: error.message });
    }
});

export default router;