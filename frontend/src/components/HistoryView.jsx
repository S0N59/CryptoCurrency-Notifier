import { useState, useEffect } from 'react';
import { getHistory, getStats } from '../api';

export default function HistoryView({ token }) {
    const [history, setHistory] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [historyData, statsData] = await Promise.all([
                getHistory(token),
                getStats(token)
            ]);
            setHistory(historyData);
            setStats(statsData);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const getEventIcon = (eventType) => {
        switch (eventType) {
            case 'CREATED':
                return { icon: '➕', class: 'created' };
            case 'TRIGGERED':
                return { icon: '⚡', class: 'triggered' };
            case 'CONFIRMED':
                return { icon: '✅', class: 'confirmed' };
            case 'DELETED':
            case 'DELETED_VIA_TELEGRAM':
                return { icon: '🗑️', class: 'deleted' };
            case 'UPDATED':
                return { icon: '✏️', class: 'created' };
            case 'ENABLED':
                return { icon: '▶️', class: 'confirmed' };
            case 'DISABLED':
                return { icon: '⏸️', class: 'triggered' };
            case 'RESET':
                return { icon: '🔄', class: 'created' };
            default:
                return { icon: '📝', class: 'created' };
        }
    };

    const formatEventMessage = (event) => {
        const symbol = event.symbol || 'Unknown';
        switch (event.event_type) {
            case 'CREATED':
                return `Alert created for ${symbol}`;
            case 'TRIGGERED':
                return `Alert triggered for ${symbol}`;
            case 'CONFIRMED':
                return `Alert confirmed for ${symbol}`;
            case 'DELETED':
                return `Alert deleted for ${symbol}`;
            case 'DELETED_VIA_TELEGRAM':
                return `Alert deleted via Telegram for ${symbol}`;
            case 'UPDATED':
                return `Alert updated for ${symbol}`;
            case 'ENABLED':
                return `Alert enabled for ${symbol}`;
            case 'DISABLED':
                return `Alert disabled for ${symbol}`;
            case 'RESET':
                return `Alert reset for ${symbol}`;
            default:
                return `${event.event_type} for ${symbol}`;
        }
    };

    if (loading) {
        return (
            <div className="loading-container">
                <div className="loading-spinner"></div>
            </div>
        );
    }

    return (
        <div>
            {/* Stats Cards */}
            {stats && (
                <div className="stats-grid">
                    <div className="card stat-card">
                        <div className="stat-value">{stats.total_alerts}</div>
                        <div className="stat-label">Total Alerts</div>
                    </div>
                    <div className="card stat-card">
                        <div className="stat-value">{stats.active_alerts}</div>
                        <div className="stat-label">Active Alerts</div>
                    </div>
                    <div className="card stat-card">
                        <div className="stat-value">{stats.by_state.triggered}</div>
                        <div className="stat-label">Triggered</div>
                    </div>
                    <div className="card stat-card">
                        <div className="stat-value">{stats.by_state.confirmed}</div>
                        <div className="stat-label">Confirmed</div>
                    </div>
                </div>
            )}

            {/* Event History */}
            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">📜 Event History</h3>
                    <button className="btn btn-ghost btn-sm" onClick={loadData}>
                        🔄 Refresh
                    </button>
                </div>

                {error && <div className="login-error">{error}</div>}

                {history.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">📭</div>
                        <h3 className="empty-state-title">No Events Yet</h3>
                        <p>Events will appear here as alerts are created and triggered.</p>
                    </div>
                ) : (
                    <div>
                        {history.map(event => {
                            const { icon, class: iconClass } = getEventIcon(event.event_type);
                            return (
                                <div key={event.id} className="history-item">
                                    <div className={`history-icon ${iconClass}`}>
                                        {icon}
                                    </div>
                                    <div className="history-content">
                                        <div className="history-title">
                                            {formatEventMessage(event)}
                                        </div>
                                        <div className="history-meta">
                                            {event.old_state && event.new_state && (
                                                <span>
                                                    {event.old_state} → {event.new_state} •
                                                </span>
                                            )}
                                            {new Date(event.created_at).toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
