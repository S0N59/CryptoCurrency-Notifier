export default async function handler(req, res) {
    try {
        const module = await import('../backend/src/index.js');
        const app = module.default;
        return app(req, res);
    } catch (error) {
        console.error('Failed to load application:', error);
        res.status(500).json({
            error: 'Application Load Failed',
            message: error.message
        });
    }
}
