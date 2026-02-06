import { Router } from 'express';
import { historyQueries, alertQueries } from '../database.js';

const router = Router();

// Get all history entries
router.get('/', async (req, res) => {
    try {
        const history = await historyQueries.getAll.all();
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch history', message: error.message });
    }
});

// Get history for specific alert
router.get('/alert/:alertId', async (req, res) => {
    try {
        const alert = await alertQueries.getById.get(req.params.alertId);
        if (!alert) {
            return res.status(404).json({ error: 'Alert not found' });
        }

        const history = await historyQueries.getByAlert.all(req.params.alertId);
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch alert history', message: error.message });
    }
});

// Get statistics
router.get('/stats', async (req, res) => {
    try {
        const alerts = await alertQueries.getAll.all();
        const history = await historyQueries.getAll.all();

        const stats = {
            total_alerts: alerts.length,
            active_alerts: alerts.filter(a => a.enabled).length,
            by_state: {
                idle: alerts.filter(a => a.state === 'idle').length,
                triggered: alerts.filter(a => a.state === 'triggered').length,
                confirmed: alerts.filter(a => a.state === 'confirmed').length
            },
            recent_events: history.slice(0, 10),
            events_by_type: history.reduce((acc, h) => {
                acc[h.event_type] = (acc[h.event_type] || 0) + 1;
                return acc;
            }, {})
        };

        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch stats', message: error.message });
    }
});

export default router;