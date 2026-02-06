export default function handler(req, res) {
    res.status(200).json({
        message: "Debug endpoint is working",
        timestamp: new Date().toISOString(),
        node_version: process.version,
        env_keys: Object.keys(process.env)
    });
}