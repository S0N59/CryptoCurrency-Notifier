import { Router } from 'express';
import { userQueries } from '../database.js';

const router = Router();

// Get all allowed users
router.get('/', async (req, res) => {
    try {
        const users = await userQueries.getAll.all();
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users', message: error.message });
    }
});

// Add new allowed user
router.post('/', async (req, res) => {
    try {
        const { telegram_id, username } = req.body;

        if (!telegram_id) {
            return res.status(400).json({
                error: 'Missing required field',
                required: ['telegram_id']
            });
        }

        await userQueries.create.run({
            telegram_id: String(telegram_id),
            username: username || null
        });

        const user = await userQueries.getById.get(String(telegram_id));
        res.status(201).json(user);
    } catch (error) {
        res.status(500).json({ error: 'Failed to add user', message: error.message });
    }
});

// Toggle user active status
router.patch('/:telegramId/toggle', async (req, res) => {
    try {
        const user = await userQueries.getById.get(req.params.telegramId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        await userQueries.toggleActive.run({
            telegram_id: req.params.telegramId,
            is_active: user.is_active ? 0 : 1
        });

        const updated = await userQueries.getById.get(req.params.telegramId);
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Failed to toggle user', message: error.message });
    }
});

// Delete user
router.delete('/:telegramId', async (req, res) => {
    try {
        const user = await userQueries.getById.get(req.params.telegramId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        await userQueries.delete.run(req.params.telegramId);
        res.json({ success: true, message: 'User removed from allowed list' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete user', message: error.message });
    }
});

export default router;