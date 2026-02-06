const API_BASE = import.meta.env.VITE_API_URL || '/api';

// Helper to get auth headers
function getAuthHeaders(token) {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Bypass-Tunnel-Reminder': 'true'
    };
}

// Helper for public headers
function getPublicHeaders() {
    return {
        'Content-Type': 'application/json',
        'Bypass-Tunnel-Reminder': 'true'
    };
}

// Handle API response
async function handleResponse(response) {
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.message || data.error || 'Request failed');
    }
    return data;
}

// Auth
export async function login(token) {
    const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: getPublicHeaders(),
        body: JSON.stringify({ token })
    });
    return handleResponse(response);
}

// Symbols
export async function getSymbols() {
    const response = await fetch(`${API_BASE}/symbols`, {
        headers: getPublicHeaders()
    });
    return handleResponse(response);
}

// Alerts
export async function getAlerts(token) {
    const response = await fetch(`${API_BASE}/alerts`, {
        headers: getAuthHeaders(token)
    });
    return handleResponse(response);
}

export async function createAlert(token, alertData) {
    const response = await fetch(`${API_BASE}/alerts`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify(alertData)
    });
    return handleResponse(response);
}

export async function updateAlert(token, id, alertData) {
    const response = await fetch(`${API_BASE}/alerts/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(token),
        body: JSON.stringify(alertData)
    });
    return handleResponse(response);
}

export async function toggleAlert(token, id) {
    const response = await fetch(`${API_BASE}/alerts/${id}/toggle`, {
        method: 'PATCH',
        headers: getAuthHeaders(token)
    });
    return handleResponse(response);
}

export async function deleteAlert(token, id) {
    const response = await fetch(`${API_BASE}/alerts/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(token)
    });
    return handleResponse(response);
}

// Users
export async function getUsers(token) {
    const response = await fetch(`${API_BASE}/users`, {
        headers: getAuthHeaders(token)
    });
    return handleResponse(response);
}

export async function addUser(token, userData) {
    const response = await fetch(`${API_BASE}/users`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify(userData)
    });
    return handleResponse(response);
}

export async function toggleUser(token, telegramId) {
    const response = await fetch(`${API_BASE}/users/${telegramId}/toggle`, {
        method: 'PATCH',
        headers: getAuthHeaders(token)
    });
    return handleResponse(response);
}

export async function deleteUser(token, telegramId) {
    const response = await fetch(`${API_BASE}/users/${telegramId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(token)
    });
    return handleResponse(response);
}

// History
export async function getHistory(token) {
    const response = await fetch(`${API_BASE}/history`, {
        headers: getAuthHeaders(token)
    });
    return handleResponse(response);
}

export async function getStats(token) {
    const response = await fetch(`${API_BASE}/history/stats`, {
        headers: getAuthHeaders(token)
    });
    return handleResponse(response);
}
