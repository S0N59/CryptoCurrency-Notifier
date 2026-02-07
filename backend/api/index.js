export default async function handler(req, res) {
    try {
        const pathParam = req.query?.path;
        const normalizedPathParam = pathParam
            ? (Array.isArray(pathParam) ? pathParam.join('/') : String(pathParam))
            : null;

        const rawUrl = typeof req.url === 'string' ? req.url : '';
        const rawQueryPath = rawUrl.includes('path=')
            ? new URL(`http://localhost${rawUrl}`).searchParams.get('path')
            : null;

        const originalUrlHeader = req.headers['x-vercel-original-url']
            || req.headers['x-original-url']
            || req.headers['x-matched-path']
            || req.headers['x-forwarded-uri']
            || req.headers['x-rewrite-url'];

        const candidateUrl = normalizedPathParam
            ? `/api/${normalizedPathParam}`
            : (rawQueryPath ? `/api/${rawQueryPath}` : null)
                || originalUrlHeader
                || rawUrl;

        if (candidateUrl) {
            req.url = candidateUrl.startsWith('/api') || candidateUrl === '/'
                ? candidateUrl
                : `/api${candidateUrl}`;
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
