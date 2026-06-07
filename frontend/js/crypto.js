/* ══════════════════════════════════════
   CRYPTO.JS — AES-GCM + PBKDF2
   Fallback: если не HTTPS → XOR-шифр
══════════════════════════════════════ */

'use strict';

const Crypto = (() => {

    const VERIFY_PLAINTEXT  = 'QR_WALLET_V1_OK';
    const PBKDF2_ITERATIONS = 100_000;

    // ── Detect secure context ──────────────
    const hasSubtle = !!(window.crypto && window.crypto.subtle);

    // ── Helpers ───────────────────────────

    function buf2hex(buf) {
        return Array.from(new Uint8Array(buf))
            .map(b => b.toString(16).padStart(2, '0')).join('');
    }
    function hex2buf(hex) {
        const bytes = [];
        for (let i = 0; i < hex.length; i += 2)
            bytes.push(parseInt(hex.substr(i, 2), 16));
        return new Uint8Array(bytes).buffer;
    }
    function str2buf(str) { return new TextEncoder().encode(str); }
    function buf2str(buf) { return new TextDecoder().decode(buf); }

    // ── XOR fallback (HTTP / no SubtleCrypto) ─
    // NOT cryptographically strong, but functional for demo
    function xorEncrypt(text, pin) {
        const key = pin.repeat(Math.ceil(text.length / pin.length)).slice(0, text.length);
        let result = '';
        for (let i = 0; i < text.length; i++) {
            result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i));
        }
        return btoa(unescape(encodeURIComponent(result)));
    }
    function xorDecrypt(b64, pin) {
        try {
            const text = decodeURIComponent(escape(atob(b64)));
            return xorEncrypt(text, pin); // XOR is symmetric
        } catch { throw new Error('Неверный PIN'); }
    }

    // ── Web Crypto path ───────────────────

    async function deriveKey(pin, saltHex) {
        const saltBuf = hex2buf(saltHex);
        const keyMat  = await window.crypto.subtle.importKey(
            'raw', str2buf(pin), { name: 'PBKDF2' }, false, ['deriveKey']
        );
        return window.crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: saltBuf, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
            keyMat,
            { name: 'AES-GCM', length: 256 },
            false, ['encrypt', 'decrypt']
        );
    }

    async function subtleEncrypt(plaintext, cryptoKey) {
        const iv  = window.crypto.getRandomValues(new Uint8Array(12));
        const enc = await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv }, cryptoKey, str2buf(plaintext)
        );
        const combined = new Uint8Array(iv.byteLength + enc.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(enc), iv.byteLength);
        return buf2hex(combined.buffer);
    }

    async function subtleDecrypt(cipherhex, cryptoKey) {
        const buf  = new Uint8Array(hex2buf(cipherhex));
        const iv   = buf.slice(0, 12);
        const data = buf.slice(12);
        const dec  = await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv }, cryptoKey, data
        );
        return buf2str(dec);
    }

    function generateSalt() {
        return buf2hex(window.crypto.getRandomValues(new Uint8Array(16)));
    }

    // ── Public API ────────────────────────

    async function setupPin(pin) {
        if (hasSubtle) {
            const saltHex     = generateSalt();
            const key         = await deriveKey(pin, saltHex);
            const verifyToken = await subtleEncrypt(VERIFY_PLAINTEXT, key);
            return { saltHex, verifyToken, key, mode: 'aes' };
        } else {
            // Fallback: XOR
            const verifyToken = xorEncrypt(VERIFY_PLAINTEXT, pin);
            return { saltHex: 'fallback', verifyToken, key: pin, mode: 'xor' };
        }
    }

    async function verifyPin(pin, saltHex, verifyToken, mode) {
        try {
            if (mode === 'xor' || saltHex === 'fallback') {
                const plain = xorDecrypt(verifyToken, pin);
                return plain === VERIFY_PLAINTEXT
                    ? { ok: true, key: pin, mode: 'xor' }
                    : { ok: false };
            }
            // AES path
            const key   = await deriveKey(pin, saltHex);
            const plain = await subtleDecrypt(verifyToken, key);
            return plain === VERIFY_PLAINTEXT
                ? { ok: true, key, mode: 'aes' }
                : { ok: false };
        } catch { return { ok: false }; }
    }

    async function encryptObject(obj, key, mode) {
        const text = JSON.stringify(obj);
        if (mode === 'xor' || typeof key === 'string') {
            return 'xor:' + xorEncrypt(text, key);
        }
        return subtleEncrypt(text, key);
    }

    async function decryptObject(hex, key, mode) {
        if (hex.startsWith('xor:') || mode === 'xor' || typeof key === 'string') {
            const b64 = hex.startsWith('xor:') ? hex.slice(4) : hex;
            return JSON.parse(xorDecrypt(b64, key));
        }
        const str = await subtleDecrypt(hex, key);
        return JSON.parse(str);
    }

    async function encryptWithKey(obj, hexKey) {
        const text = JSON.stringify(obj);
        const keyBuf = hex2buf(hexKey);
        const key = await window.crypto.subtle.importKey('raw', keyBuf, { name: 'AES-GCM' }, false, ['encrypt']);
        return subtleEncrypt(text, key);
    }

    async function decryptWithKey(hex, hexKey) {
        const keyBuf = hex2buf(hexKey);
        const key = await window.crypto.subtle.importKey('raw', keyBuf, { name: 'AES-GCM' }, false, ['decrypt']);
        const str = await subtleDecrypt(hex, key);
        return JSON.parse(str);
    }

    return { setupPin, verifyPin, encryptObject, decryptObject, encryptWithKey, decryptWithKey, hasSubtle };

})();