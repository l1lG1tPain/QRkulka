/* ══════════════════════════════════════
   DB.JS — IndexedDB wrapper
══════════════════════════════════════ */
'use strict';

const DB = (() => {

    const DB_NAME    = 'qr-wallet';
    const DB_VERSION = 1;
    const STORE_KV   = 'kv';
    const STORE_CARDS = 'cards';
    let _db = null;

    function open() {
        if (_db) return Promise.resolve(_db);
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = e => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_KV))
                    db.createObjectStore(STORE_KV, { keyPath: 'key' });
                if (!db.objectStoreNames.contains(STORE_CARDS)) {
                    const s = db.createObjectStore(STORE_CARDS, { keyPath: 'id' });
                    s.createIndex('createdAt', 'createdAt');
                }
            };
            req.onsuccess = e => { _db = e.target.result; resolve(_db); };
            req.onerror   = e => reject(e.target.error);
        });
    }

    async function kvGet(key) {
        const db = await open();
        return new Promise((res, rej) => {
            const req = db.transaction(STORE_KV, 'readonly').objectStore(STORE_KV).get(key);
            req.onsuccess = () => res(req.result ? req.result.value : null);
            req.onerror   = e => rej(e.target.error);
        });
    }
    async function kvSet(key, value) {
        const db = await open();
        return new Promise((res, rej) => {
            const req = db.transaction(STORE_KV, 'readwrite').objectStore(STORE_KV).put({ key, value });
            req.onsuccess = () => res();
            req.onerror   = e => rej(e.target.error);
        });
    }

    async function saveAuth(data)  { await kvSet('auth', data); }
    async function getAuth()       { return kvGet('auth'); }
    async function saveUser(u)     { await kvSet('user', u); }
    async function getUser()       { return kvGet('user'); }
    async function saveMasterKey(key) { await kvSet('master_key', key); }
    async function getMasterKey()  { return kvGet('master_key'); }

    async function saveCard({ id, createdAt, encryptedData }) {
        const db = await open();
        return new Promise((res, rej) => {
            const req = db.transaction(STORE_CARDS, 'readwrite')
                .objectStore(STORE_CARDS).put({ id, createdAt, encryptedData });
            req.onsuccess = () => res();
            req.onerror   = e => rej(e.target.error);
        });
    }

    async function getAllCards() {
        const db = await open();
        return new Promise((res, rej) => {
            const req = db.transaction(STORE_CARDS, 'readonly')
                .objectStore(STORE_CARDS).index('createdAt').getAll();
            req.onsuccess = () => res(req.result.reverse());
            req.onerror   = e => rej(e.target.error);
        });
    }

    async function deleteCard(id) {
        const db = await open();
        return new Promise((res, rej) => {
            const req = db.transaction(STORE_CARDS, 'readwrite')
                .objectStore(STORE_CARDS).delete(id);
            req.onsuccess = () => res();
            req.onerror   = e => rej(e.target.error);
        });
    }

    async function countCards() {
        const db = await open();
        return new Promise((res, rej) => {
            const req = db.transaction(STORE_CARDS, 'readonly')
                .objectStore(STORE_CARDS).count();
            req.onsuccess = () => res(req.result);
            req.onerror   = e => rej(e.target.error);
        });
    }

    async function clearAll() {
        const db = await open();
        return new Promise((res, rej) => {
            const tx = db.transaction([STORE_KV, STORE_CARDS], 'readwrite');
            tx.objectStore(STORE_KV).clear();
            tx.objectStore(STORE_CARDS).clear();
            tx.oncomplete = res;
            tx.onerror    = e => rej(e.target.error);
        });
    }

    return { saveAuth, getAuth, saveUser, getUser, saveMasterKey, getMasterKey, kvSet, kvGet, saveCard, getAllCards, deleteCard, countCards, clearAll };
})();