export default async function handler(req, res) {
    try {
        // Dynamic import to catch initialization errors
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