import { useState, useEffect } from 'react';
import { getUsers, addUser, toggleUser, deleteUser } from '../api';

export default function UserManager({ token }) {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [newUserId, setNewUserId] = useState('');
    const [newUsername, setNewUsername] = useState('');
    const [adding, setAdding] = useState(false);

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        try {
            setLoading(true);
            const data = await getUsers(token);
            setUsers(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = async (e) => {
        e.preventDefault();
        if (!newUserId.trim()) return;

        try {
            setAdding(true);
            await addUser(token, {
                telegram_id: newUserId.trim(),
                username: newUsername.trim() || null
            });
            setNewUserId('');
            setNewUsername('');
            loadUsers();
        } catch (err) {
            alert('Failed to add user: ' + err.message);
        } finally {
            setAdding(false);
        }
    };

    const handleToggle = async (telegramId) => {
        try {
            await toggleUser(token, telegramId);
            loadUsers();
        } catch (err) {
            alert('Failed to toggle user: ' + err.message);
        }
    };

    const handleDelete = async (telegramId) => {
        if (!confirm('Remove this user from the allowed list?')) return;

        try {
            await deleteUser(token, telegramId);
            loadUsers();
        } catch (err) {
            alert('Failed to delete user: ' + err.message);
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
            {/* Add User Form */}
            <div className="card mb-md">
                <div className="card-header">
                    <h3 className="card-title">➕ Add Allowed User</h3>
                </div>
                <form onSubmit={handleAdd}>
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label" htmlFor="telegram_id">
                                Telegram User ID *
                            </label>
                            <input
                                id="telegram_id"
                                type="text"
                                className="form-input"
                                value={newUserId}
                                onChange={(e) => setNewUserId(e.target.value)}
                                placeholder="e.g., 123456789"
                                required
                            />
                            <small className="text-muted" style={{ fontSize: '0.7rem' }}>
                                User can get their ID by messaging @userinfobot on Telegram
                            </small>
                        </div>
                        <div className="form-group">
                            <label className="form-label" htmlFor="username">
                                Username (optional)
                            </label>
                            <input
                                id="username"
                                type="text"
                                className="form-input"
                                value={newUsername}
                                onChange={(e) => setNewUsername(e.target.value)}
                                placeholder="e.g., john_doe"
                            />
                        </div>
                    </div>
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={adding || !newUserId.trim()}
                    >
                        {adding ? 'Adding...' : '➕ Add User'}
                    </button>
                </form>
            </div>

            {/* User List */}
            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">👥 Allowed Users ({users.length})</h3>
                </div>

                {error && <div className="login-error">{error}</div>}

                {users.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">👤</div>
                        <h3 className="empty-state-title">No Users Added</h3>
                        <p>Add Telegram user IDs to allow them to receive alerts.</p>
                    </div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Telegram ID</th>
                                <th>Username</th>
                                <th>Status</th>
                                <th>Added</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(user => (
                                <tr key={user.telegram_id}>
                                    <td className="font-mono">{user.telegram_id}</td>
                                    <td>{user.username || '-'}</td>
                                    <td>
                                        <span className={`badge ${user.is_active ? 'badge-success' : 'badge-warning'}`}>
                                            {user.is_active ? '✅ Active' : '⏸️ Inactive'}
                                        </span>
                                    </td>
                                    <td className="text-muted">
                                        {new Date(user.added_at).toLocaleDateString()}
                                    </td>
                                    <td>
                                        <div className="flex gap-sm">
                                            <button
                                                className="btn btn-ghost btn-sm"
                                                onClick={() => handleToggle(user.telegram_id)}
                                            >
                                                {user.is_active ? '⏸️' : '▶️'}
                                            </button>
                                            <button
                                                className="btn btn-danger btn-sm"
                                                onClick={() => handleDelete(user.telegram_id)}
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
