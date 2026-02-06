import { useState, useCallback, useEffect } from 'react';
import Login from './components/Login';
import AlertForm from './components/AlertForm';
import AlertList from './components/AlertList';
import UserManager from './components/UserManager';
import HistoryView from './components/HistoryView';
import { createAlert, updateAlert } from './api';

const TABS = {
    ALERTS: 'alerts',
    USERS: 'users',
    HISTORY: 'history'
};

export default function App() {
    const [token, setToken] = useState(() => {
        return localStorage.getItem('admin_token') || null;
    });
    const [isTelegram, setIsTelegram] = useState(false);
    const [activeTab, setActiveTab] = useState(TABS.ALERTS);
    const [editingAlert, setEditingAlert] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    useEffect(() => {
        // Check for Telegram Web App environment
        if (window.Telegram?.WebApp) {
            const tg = window.Telegram.WebApp;
            tg.ready();
            
            if (tg.initData) {
                // We are in Telegram!
                setToken(tg.initData);
                setIsTelegram(true);
                tg.expand();
                
                // Set theme colors to match Telegram
                document.documentElement.style.setProperty('--primary-color', tg.themeParams.button_color || '#2481cc');
                document.documentElement.style.setProperty('--primary-hover', tg.themeParams.button_color || '#2481cc');
            }
        }
    }, []);

    const handleLogin = (newToken) => {
        localStorage.setItem('admin_token', newToken);
        setToken(newToken);
    };

    const handleLogout = () => {
        localStorage.removeItem('admin_token');
        setToken(null);
    };

    const handleCreateOrUpdate = useCallback(async (alertData) => {
        if (editingAlert) {
            await updateAlert(token, editingAlert.id, alertData);
        } else {
            await createAlert(token, alertData);
        }
        setShowForm(false);
        setEditingAlert(null);
        setRefreshTrigger(prev => prev + 1);
    }, [token, editingAlert]);

    const handleEdit = (alert) => {
        setEditingAlert(alert);
        setShowForm(true);
    };

    const handleCancelForm = () => {
        setShowForm(false);
        setEditingAlert(null);
    };

    // Show login if not authenticated
    if (!token) {
        return <Login onLogin={handleLogin} />;
    }

    return (
        <div className="app-container">
            {/* Header */}
            <header className="header">
                <div className="header-title">
                    <span className="header-logo">🔔</span>
                    <div>
                        <h1>Crypto Alerts</h1>
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                            {isTelegram ? 'Mini App Dashboard' : 'Event-Driven Alert & Approval System'}
                        </p>
                    </div>
                </div>
                {!isTelegram && (
                    <button className="btn btn-ghost" onClick={handleLogout}>
                        🚪 Logout
                    </button>
                )}
            </header>

            {/* Navigation Tabs */}
            <nav className="nav-tabs">
                <button
                    className={`nav-tab ${activeTab === TABS.ALERTS ? 'active' : ''}`}
                    onClick={() => setActiveTab(TABS.ALERTS)}
                >
                    ⚡ Alerts
                </button>
                {!isTelegram && (
                    <>
                        <button
                            className={`nav-tab ${activeTab === TABS.USERS ? 'active' : ''}`}
                            onClick={() => setActiveTab(TABS.USERS)}
                        >
                            👥 Users
                        </button>
                        <button
                            className={`nav-tab ${activeTab === TABS.HISTORY ? 'active' : ''}`}
                            onClick={() => setActiveTab(TABS.HISTORY)}
                        >
                            📜 History
                        </button>
                    </>
                )}
            </nav>

            {/* Tab Content */}
            {activeTab === TABS.ALERTS && (
                <div>
                    {/* Create/Edit Form */}
                    {showForm ? (
                        <div className="mb-md">
                            <AlertForm
                                token={token}
                                onSubmit={handleCreateOrUpdate}
                                onCancel={handleCancelForm}
                                editingAlert={editingAlert}
                                isTelegram={isTelegram}
                            />
                        </div>
                    ) : (
                        <div className="mb-md">
                            <button
                                className="btn btn-primary"
                                onClick={() => setShowForm(true)}
                            >
                                ➕ Create New Alert
                            </button>
                        </div>
                    )}

                    {/* Alert List */}
                    <AlertList
                        token={token}
                        onEdit={handleEdit}
                        refreshTrigger={refreshTrigger}
                    />
                </div>
            )}

            {activeTab === TABS.USERS && !isTelegram && (
                <UserManager token={token} />
            )}

            {activeTab === TABS.HISTORY && !isTelegram && (
                <HistoryView token={token} />
            )}

            {/* Footer */}
            <footer style={{
                textAlign: 'center',
                marginTop: 'var(--spacing-xl)',
                padding: 'var(--spacing-lg)',
                borderTop: '1px solid var(--border-color)',
                color: 'var(--text-muted)',
                fontSize: '0.75rem'
            }}>
                Event-Driven Alert & Approval System • Portfolio Project
            </footer>
        </div>
    );
}
