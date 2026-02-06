import { useState, useEffect } from 'react';
import { getSymbols, getUsers } from '../api';

export default function AlertForm({ token, onSubmit, onCancel, editingAlert, isTelegram }) {
    const [symbols, setSymbols] = useState([]);
    const [users, setUsers] = useState([]);
    const [formData, setFormData] = useState({
        symbol: 'BTC',
        percent_change: 5,
        time_window_minutes: 10,
        enabled: true,
        requires_confirmation: false,
        telegram_user_id: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        if (editingAlert) {
            setFormData({
                symbol: editingAlert.symbol,
                percent_change: editingAlert.percent_change,
                time_window_minutes: editingAlert.time_window_minutes,
                enabled: Boolean(editingAlert.enabled),
                requires_confirmation: Boolean(editingAlert.requires_confirmation),
                telegram_user_id: editingAlert.telegram_user_id
            });
        } else if (isTelegram) {
            // For Telegram Mini App, we don't need to select a user
            // Set a placeholder value to satisfy any client-side checks
            setFormData(prev => ({
                ...prev,
                telegram_user_id: 'me' 
            }));
        }
    }, [editingAlert, isTelegram]);

    const loadData = async () => {
        try {
            const promises = [getSymbols()];
            // Only fetch users if not in Telegram Mini App mode (Admin mode)
            if (!isTelegram) {
                promises.push(getUsers(token));
            }
            
            const results = await Promise.all(promises);
            const symbolsData = results[0];
            const usersData = results[1]; // Will be undefined if not fetched

            setSymbols(symbolsData);
            
            if (usersData) {
                setUsers(usersData.filter(u => u.is_active));

                // Set default user if available and not editing
                if (!editingAlert && usersData.length > 0) {
                    setFormData(prev => ({
                        ...prev,
                        telegram_user_id: usersData[0].telegram_id
                    }));
                }
            }
        } catch (err) {
            console.error('Failed to load form data:', err);
        }
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await onSubmit({
                ...formData,
                percent_change: parseFloat(formData.percent_change),
                time_window_minutes: parseInt(formData.time_window_minutes, 10)
            });
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="card">
            <div className="card-header">
                <h3 className="card-title">
                    {editingAlert ? '✏️ Edit Alert' : '➕ Create New Alert'}
                </h3>
                {onCancel && (
                    <button className="btn btn-ghost btn-sm" onClick={onCancel}>
                        ✕ Cancel
                    </button>
                )}
            </div>

            {error && (
                <div className="login-error mb-md">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit}>
                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label" htmlFor="symbol">
                            Symbol
                        </label>
                        <select
                            id="symbol"
                            name="symbol"
                            className="form-select"
                            value={formData.symbol}
                            onChange={handleChange}
                            required
                        >
                            {symbols.map(s => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </div>

                    {!isTelegram && (
                        <div className="form-group">
                            <label className="form-label" htmlFor="telegram_user_id">
                                Telegram User
                            </label>
                            <select
                                id="telegram_user_id"
                                name="telegram_user_id"
                                className="form-select"
                                value={formData.telegram_user_id}
                                onChange={handleChange}
                                required
                            >
                                <option value="">Select user...</option>
                                {users.map(u => (
                                    <option key={u.telegram_id} value={u.telegram_id}>
                                        {u.username || u.telegram_id}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label" htmlFor="percent_change">
                            Price Change (%)
                        </label>
                        <input
                            id="percent_change"
                            name="percent_change"
                            type="number"
                            step="0.1"
                            className="form-input"
                            value={formData.percent_change}
                            onChange={handleChange}
                            placeholder="e.g., 5 or -5"
                            required
                        />
                        <small className="text-muted" style={{ fontSize: '0.7rem' }}>
                            Positive = price increase, Negative = price decrease
                        </small>
                    </div>

                    <div className="form-group">
                        <label className="form-label" htmlFor="time_window_minutes">
                            Time Window (minutes)
                        </label>
                        <input
                            id="time_window_minutes"
                            name="time_window_minutes"
                            type="number"
                            min="1"
                            max="1440"
                            className="form-input"
                            value={formData.time_window_minutes}
                            onChange={handleChange}
                            placeholder="e.g., 10"
                            required
                        />
                    </div>
                </div>

                <div className="form-row">
                    <div className="form-group">
                        <label className="form-checkbox">
                            <input
                                type="checkbox"
                                name="enabled"
                                checked={formData.enabled}
                                onChange={handleChange}
                            />
                            <span>Enabled</span>
                        </label>
                    </div>

                    <div className="form-group">
                        <label className="form-checkbox">
                            <input
                                type="checkbox"
                                name="requires_confirmation"
                                checked={formData.requires_confirmation}
                                onChange={handleChange}
                            />
                            <span>Require Confirmation</span>
                        </label>
                    </div>
                </div>

                <div className="form-actions">
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={loading}
                    >
                        {loading ? 'Saving...' : (editingAlert ? 'Update Alert' : 'Create Alert')}
                    </button>
                </div>
            </form>
        </div>
    );
}
