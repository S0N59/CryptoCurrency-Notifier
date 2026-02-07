import { useState, useEffect } from 'react';
import { getAlerts, toggleAlert, deleteAlert } from '../api';

export default function AlertList({ token, onEdit, refreshTrigger }) {
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const SYMBOL_EMOJIS = {
        BTC: '🟠',
        ETH: '🔷',
        SOL: '🟣',
        XRP: '⚪',
        ADA: '🔵',
        DOGE: '🐕',
        DOT: '🔴',
        MATIC: '💜',
        LINK: '🔗',
        AVAX: '🔺'
    };

    useEffect(() => {
        loadAlerts();
    }, [refreshTrigger]);

    const loadAlerts = async () => {
        try {
            setLoading(true);
            const data = await getAlerts(token);
            setAlerts(Array.isArray(data) ? data : []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = async (id) => {
        try {
            await toggleAlert(token, id);
            loadAlerts();
        } catch (err) {
            alert('Failed to toggle alert: ' + err.message);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Are you sure you want to delete this alert?')) return;

        try {
            await deleteAlert(token, id);
            loadAlerts();
        } catch (err) {
            alert('Failed to delete alert: ' + err.message);
        }
    };

    const getStateBadge = (state) => {
        switch (state) {
            case 'idle':
                return <span className="badge badge-idle">⏸️ Idle</span>;
            case 'triggered':
                return <span className="badge badge-triggered">⚡ Triggered</span>;
            case 'confirmed':
                return <span className="badge badge-confirmed">✅ Confirmed</span>;
            default:
                return <span className="badge">{state}</span>;
        }
    };

    if (loading) {
        return (
            <div className="loading-container">
                <div className="loading-spinner"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="card">
                <div className="login-error">{error}</div>
                <button className="btn btn-ghost" onClick={loadAlerts}>
                    🔄 Retry
                </button>
            </div>
        );
    }

    if (alerts.length === 0) {
        return (
            <div className="card">
                <div className="empty-state">
                    <div className="empty-state-icon">📭</div>
                    <h3 className="empty-state-title">No Alerts Yet</h3>
                    <p>Create your first alert using the form above.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="alert-grid">
            {alerts.map(alert => (
                <div
                    key={alert.id}
                    className={`card alert-card ${alert.state}`}
                >
                    <div className="flex items-center justify-between">
                        <span className="alert-symbol">
                            {SYMBOL_EMOJIS[alert.symbol] || '💰'} {alert.symbol}
                        </span>
                        {getStateBadge(alert.state)}
                    </div>

                    <div className="alert-details">
                        <div className="alert-detail">
                            <span className="alert-detail-label">Threshold</span>
                            <span className="alert-detail-value">
                                {alert.percent_change > 0 ? '+' : ''}{alert.percent_change}%
                            </span>
                        </div>
                        <div className="alert-detail">
                            <span className="alert-detail-label">Time Window</span>
                            <span className="alert-detail-value">{alert.time_window_minutes}min</span>
                        </div>
                        <div className="alert-detail">
                            <span className="alert-detail-label">User ID</span>
                            <span className="alert-detail-value font-mono">
                                {alert.telegram_user_id}
                            </span>
                        </div>
                        <div className="alert-detail">
                            <span className="alert-detail-label">Confirmation</span>
                            <span className="alert-detail-value">
                                {alert.requires_confirmation ? '✅ Required' : '❌ Not required'}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-sm">
                            <span
                                className={`status-dot ${alert.enabled ? 'active' : 'inactive'}`}
                            ></span>
                            <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                                {alert.enabled ? 'Active' : 'Paused'}
                            </span>
                        </div>
                        <div
                            className={`toggle-switch ${alert.enabled ? 'active' : ''}`}
                            onClick={() => handleToggle(alert.id)}
                            title={alert.enabled ? 'Click to disable' : 'Click to enable'}
                        ></div>
                    </div>

                    <div className="alert-actions">
                        <button
                            className="btn btn-ghost btn-sm flex-1"
                            onClick={() => onEdit(alert)}
                        >
                            ✏️ Edit
                        </button>
                        <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDelete(alert.id)}
                        >
                            🗑️ Delete
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}
