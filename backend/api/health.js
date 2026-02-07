import { validateConfig } from '../src/config.js';

export default async function handler(req, res) {
    res.status(200).json({
        status: 'ok',
        version: '1.0.3',
        timestamp: new Date().toISOString(),
        configWarnings: validateConfig()
    });
}
