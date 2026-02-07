export default async function handler(req, res) {
    try {
        const originalUrl = req.headers['x-vercel-original-url'] || req.headers['x-original-url'];
        if (originalUrl) {
            req.url = originalUrl;
        }
        if (!req.url.startsWith('/api')) {
            req.url = `/api${req.url}`;
        }

        const module = await import('../src/index.js');
        const app = module.default;
        return app(req, res);
    } catch (error) {
        console.error('Failed to load application:', error);
        res.status(500).json({ 
            error: 'Application Load Failed', 
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}
