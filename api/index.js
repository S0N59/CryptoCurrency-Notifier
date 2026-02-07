export default async function handler(req, res) {
  try {
    const pathParam = req.query?.path;
    const normalizedPathParam = (pathParam === '' || pathParam == null)
      ? null
      : (Array.isArray(pathParam) ? pathParam.join('/') : String(pathParam));

    const rawUrl = typeof req.url === 'string' ? req.url : '';
    const rawQueryPath = rawUrl.includes('path=')
      ? new URL(`http://localhost${rawUrl}`).searchParams.get('path')
      : null;
    const normalizedRawQueryPath = (rawQueryPath === '' || rawQueryPath == null) ? null : rawQueryPath;

    const originalUrlHeader = req.headers['x-vercel-original-url']
      || req.headers['x-original-url']
      || req.headers['x-matched-path']
      || req.headers['x-forwarded-uri']
      || req.headers['x-rewrite-url'];

    const candidateUrl = normalizedPathParam
      ? `/api/${normalizedPathParam}`
      : (normalizedRawQueryPath ? `/api/${normalizedRawQueryPath}` : null)
        || originalUrlHeader
        || rawUrl;

    if (candidateUrl) {
      req.url = candidateUrl === '/'
        ? '/'
        : (candidateUrl.startsWith('/api') ? candidateUrl : `/api${candidateUrl}`);
    }

    const module = await import('../backend/src/index.js');
    const app = module.default;
    return app(req, res);
  } catch (error) {
    console.error('Failed to load application:', error);
    return res.status(500).json({
      error: 'Application Load Failed',
      message: error.message
    });
  }
}
