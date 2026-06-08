'use strict';
/* ══════════════════════════════════════
   api.js — QRKulka Backend Client v2
   Improved error handling, 401 recovery, sync logic
══════════════════════════════════════ */

const API = (() => {
    const BASE = window.QRKULKA_API || 'https://api.qrkulka.com';
    const KEY  = 'qrk_jwt';
    const MASTER_KEY = 'qrk_master_key';

    const getToken  = ()  => localStorage.getItem(KEY);
    const setToken  = t   => localStorage.setItem(KEY, t);
    const clearToken= ()  => localStorage.removeItem(KEY);
    const hasToken  = ()  => !!getToken();
    const isOnline  = ()  => navigator.onLine;

    // Track if user is logged out to prevent spam
    let _loggedOut = false;

    async function req(method, path, body) {
        if (_loggedOut && !getToken()) {
            throw new Error('NOT_AUTHENTICATED');
        }

        const h = { 'Content-Type': 'application/json' };
        const t = getToken();
        if (t) h['Authorization'] = 'Bearer ' + t;

        const opts = { method, headers: h };
        if (body) opts.body = JSON.stringify(body);

        try {
            const res = await fetch(BASE + path, opts);

            // 401 Unauthorized - token expired or invalid
            if (res.status === 401) {
                clearToken();
                _loggedOut = true;
                throw new Error('AUTH_EXPIRED');
            }

            // 429 Too many requests
            if (res.status === 429) {
                throw new Error('RATE_LIMITED');
            }

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || `API error: ${res.status}`);
            }

            _loggedOut = false;  // Clear flag on success
            return data;
        } catch (e) {
            // Network errors
            if (e instanceof TypeError) {
                throw new Error('NETWORK_ERROR');
            }
            throw e;
        }
    }

    /* ── Auth ── */
    async function loginTelegram(tgData) {
        try {
            const d = await req('POST', '/auth/telegram', tgData);
            setToken(d.token);
            if (d.master_key) {
                localStorage.setItem(MASTER_KEY, d.master_key);
            }
            return d;
        } catch (e) {
            console.error('[API] Telegram login failed:', e.message);
            throw e;
        }
    }

    /* ── Token refresh (for future use) ── */
    async function refreshToken() {
        if (!hasToken()) return null;
        try {
            const d = await req('POST', '/auth/refresh');
            setToken(d.token);
            return d.token;
        } catch (e) {
            console.warn('[API] Token refresh failed:', e.message);
            clearToken();
            throw e;
        }
    }

    /* ── Cards sync ── */
    // Push local encrypted blobs — server не видит содержимое
    async function pushCards(cards) {
        if (!hasToken() || !cards.length || !isOnline()) {
            console.log('[API] Push skipped: token=', !!getToken(), 'cards=', cards.length, 'online=', isOnline());
            return;
        }
        try {
            const result = await req('POST', '/cards', { cards });
            console.log('[API] Pushed', cards.length, 'cards, synced:', result.synced);
            return result;
        } catch (e) {
            console.warn('[API] Push failed:', e.message);
            // Don't throw - let app handle offline gracefully
            return null;
        }
    }

    // Pull blobs from server
    async function pullCards() {
        if (!hasToken() || !isOnline()) {
            console.log('[API] Pull skipped: token=', !!getToken(), 'online=', isOnline());
            return [];
        }
        try {
            const result = await req('GET', '/cards');
            console.log('[API] Pulled', result.length, 'cards from server');
            return result;
        } catch (e) {
            console.warn('[API] Pull failed:', e.message);
            // Return empty array, don't throw
            return [];
        }
    }

    async function deleteCard(id) {
        if (!hasToken() || !isOnline()) {
            console.log('[API] Delete offline, id=', id);
            return;
        }
        try {
            await req('DELETE', '/cards/' + id);
            console.log('[API] Deleted card:', id);
        } catch (e) {
            console.warn('[API] Delete sync failed:', e.message);
            // Don't throw
        }
    }

    /* ── Me endpoint ── */
    async function getMe() {
        if (!hasToken()) return null;
        try {
            return await req('GET', '/me');
        } catch (e) {
            console.warn('[API] /me failed:', e.message);
            return null;
        }
    }

    return {
        loginTelegram,
        refreshToken,
        pushCards,
        pullCards,
        deleteCard,
        getMe,
        hasToken,
        clearToken,
        isOnline,
        getToken
    };
})();