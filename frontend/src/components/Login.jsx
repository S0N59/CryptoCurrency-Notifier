import { useState } from 'react';
import { login } from '../api';

export default function Login({ onLogin }) {
    const [token, setToken] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await login(token);
            onLogin(token);
        } catch (err) {
            setError(err.message || 'Login failed. Please check your token.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="card login-card">
                <div className="login-logo">🔔</div>
                <h1 className="login-title">Crypto Alerts</h1>
                <p className="login-subtitle">Admin Panel</p>

                {error && (
                    <div className="login-error">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label" htmlFor="token">
                            Admin Token
                        </label>
                        <input
                            id="token"
                            type="password"
                            className="form-input"
                            value={token}
                            onChange={(e) => setToken(e.target.value)}
                            placeholder="Enter your admin token"
                            required
                            autoFocus
                        />
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        style={{ width: '100%' }}
                        disabled={loading || !token}
                    >
                        {loading ? (
                            <>
                                <span className="loading-spinner" style={{ width: '1rem', height: '1rem' }}></span>
                                Authenticating...
                            </>
                        ) : (
                            <>
                                🔐 Login
                            </>
                        )}
                    </button>
                </form>

                <p className="text-muted mt-md" style={{ fontSize: '0.75rem' }}>
                    Token is set in backend/.env as ADMIN_TOKEN
                </p>
            </div>
        </div>
    );
}
