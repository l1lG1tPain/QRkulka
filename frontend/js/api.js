'use strict';
/* ══════════════════════════════════════
   api.js — QRKulka Backend Client
   Работает в фоне. Без токена — молчит.
══════════════════════════════════════ */

const API = (() => {
  const BASE = window.QRKULKA_API || 'https://api.qrkulka.com';
  const KEY  = 'qrk_jwt';

  const getToken  = ()  => localStorage.getItem(KEY);
  const setToken  = t   => localStorage.setItem(KEY, t);
  const clearToken= ()  => localStorage.removeItem(KEY);
  const hasToken  = ()  => !!getToken();
  const isOnline  = ()  => navigator.onLine;

  async function req(method, path, body) {
    const h = { 'Content-Type': 'application/json' };
    const t = getToken();
    if (t) h['Authorization'] = 'Bearer ' + t;
    const opts = { method, headers: h };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(BASE + path, opts);
    if (res.status === 401) { clearToken(); throw new Error('AUTH_EXPIRED'); }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'API ' + res.status);
    return data;
  }

  /* ── Auth ── */
  async function loginTelegram(tgData) {
    const d = await req('POST', '/auth/telegram', tgData);
    setToken(d.token);
    return d.user;
  }

  /* ── Cards sync ── */
  // Push local encrypted blobs — сервер не видит содержимое
  async function pushCards(cards) {
    if (!hasToken() || !cards.length || !isOnline()) return;
    return req('POST', '/cards', { cards }).catch(e => console.warn('[api] push:', e.message));
  }

  // Pull blobs from server
  async function pullCards() {
    if (!hasToken() || !isOnline()) return [];
    return req('GET', '/cards').catch(() => []);
  }

  async function deleteCard(id) {
    if (!hasToken() || !isOnline()) return;
    return req('DELETE', '/cards/' + id).catch(() => {});
  }

  return { loginTelegram, pushCards, pullCards, deleteCard, hasToken, clearToken, isOnline, getToken };
})();
