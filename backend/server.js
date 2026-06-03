'use strict';
require('dotenv').config();

const express    = require('express');
const crypto     = require('crypto');
const jwt        = require('jsonwebtoken');
const Database   = require('better-sqlite3');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const path       = require('path');
const fs         = require('fs');

/* ── Config ── */
const PORT         = process.env.PORT || 3001;
const JWT_SECRET   = process.env.JWT_SECRET;
const BOT_TOKEN    = process.env.BOT_TOKEN;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const DB_PATH      = process.env.DB_PATH || './data/qrkulka.db';

if (!JWT_SECRET || JWT_SECRET.length < 32) {
    console.error('❌ JWT_SECRET missing or too short (min 32 chars)');
    process.exit(1);
}
if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN missing');
    process.exit(1);
}

/* ── Database ── */
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
                                         id          INTEGER PRIMARY KEY AUTOINCREMENT,
                                         tg_id       TEXT    UNIQUE NOT NULL,
                                         first_name  TEXT,
                                         username    TEXT,
                                         emoji       TEXT    NOT NULL DEFAULT '🍋',
                                         user_code   TEXT    NOT NULL,
                                         created_at  INTEGER NOT NULL DEFAULT (unixepoch())
        );

    CREATE TABLE IF NOT EXISTS cards (
                                         id              TEXT    PRIMARY KEY,
                                         tg_id           TEXT    NOT NULL,
                                         encrypted_data  TEXT    NOT NULL,
                                         created_at      INTEGER NOT NULL,
                                         updated_at      INTEGER NOT NULL DEFAULT (unixepoch()),
        FOREIGN KEY (tg_id) REFERENCES users(tg_id) ON DELETE CASCADE
        );

    CREATE INDEX IF NOT EXISTS idx_cards_tg_id ON cards(tg_id);
`);

console.log('✅ Database ready:', DB_PATH);

/* ── Prepared statements ── */
const stmts = {
    getUser:    db.prepare('SELECT * FROM users WHERE tg_id = ?'),
    createUser: db.prepare(`
        INSERT INTO users (tg_id, first_name, username, emoji, user_code)
        VALUES (@tg_id, @first_name, @username, @emoji, @user_code)
    `),
    updateUser: db.prepare(`
        UPDATE users SET first_name=@first_name, username=@username WHERE tg_id=@tg_id
    `),
    getCards:   db.prepare('SELECT * FROM cards WHERE tg_id = ? ORDER BY created_at DESC'),
    upsertCard: db.prepare(`
        INSERT INTO cards (id, tg_id, encrypted_data, created_at, updated_at)
        VALUES (@id, @tg_id, @encrypted_data, @created_at, @updated_at)
            ON CONFLICT(id) DO UPDATE SET
            encrypted_data = @encrypted_data,
                                   updated_at     = @updated_at
    `),
    deleteCard: db.prepare('DELETE FROM cards WHERE id = ? AND tg_id = ?'),
    countCards: db.prepare('SELECT COUNT(*) as n FROM cards WHERE tg_id = ?'),
};

/* ── Telegram auth verification ── */
function verifyTelegramAuth(data) {
    const { hash, ...rest } = data;
    // Check auth_date not too old (1 hour)
    if (Date.now() / 1000 - parseInt(rest.auth_date) > 3600) return false;

    const dataCheckStr = Object.keys(rest)
        .sort()
        .map(k => `${k}=${rest[k]}`)
        .join('\n');

    const secretKey = crypto
        .createHash('sha256')
        .update(BOT_TOKEN)
        .digest();

    const hmac = crypto
        .createHmac('sha256', secretKey)
        .update(dataCheckStr)
        .digest('hex');

    return hmac === hash;
}

/* ── User ID generator ── */
function generateUserCode() {
    const emojis = ['🍋','🔥','⚡','🌙','🎯','🦋','🍀','🌊','🎸','🦊','🐉','🌸','🦁','🐬','🦄','🌈'];
    const chars  = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const emoji  = emojis[Math.floor(Math.random() * emojis.length)];
    const code   = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return { emoji, code };
}

/* ── JWT helpers ── */
function signToken(tg_id) {
    return jwt.sign({ tg_id }, JWT_SECRET, { expiresIn: '30d' });
}

function authMiddleware(req, res, next) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
    try {
        req.user = jwt.verify(header.slice(7), JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: 'Invalid token' });
    }
}

/* ── Express app ── */
const app = express();

app.set('trust proxy', 1);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
    origin: [FRONTEND_URL, 'http://localhost:5173', 'http://localhost:3000'],
    methods: ['GET','POST','PUT','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization'],
    credentials: true,
}));
app.use(express.json({ limit: '500kb' }));

/* Rate limiters */
const authLimiter = rateLimit({ windowMs: 60_000, max: 10, message: { error: 'Too many requests' } });
const apiLimiter  = rateLimit({ windowMs: 60_000, max: 120 });

/* ── Routes ── */

/* Health check */
app.get('/health', (_, res) => res.json({ ok: true, ts: Date.now() }));

/* POST /auth/telegram
   Body: Telegram Login Widget data { id, first_name, username, auth_date, hash, ... }
   Returns: { token, user }
*/
app.post('/auth/telegram', authLimiter, (req, res) => {
    const data = req.body;

    if (!data?.hash || !data?.id || !data?.auth_date) {
        return res.status(400).json({ error: 'Missing auth fields' });
    }

    if (!verifyTelegramAuth(data)) {
        return res.status(401).json({ error: 'Invalid Telegram auth' });
    }

    const tg_id = String(data.id);
    let user = stmts.getUser.get(tg_id);

    if (!user) {
        const { emoji, code } = generateUserCode();
        stmts.createUser.run({
            tg_id,
            first_name: data.first_name || '',
            username:   data.username   || '',
            emoji,
            user_code:  code,
        });
        user = stmts.getUser.get(tg_id);
    } else {
        stmts.updateUser.run({ tg_id, first_name: data.first_name || '', username: data.username || '' });
    }

    const token = signToken(tg_id);
    res.json({
        token,
        user: {
            emoji:      user.emoji,
            code:       user.user_code,
            first_name: user.first_name,
            username:   user.username,
            created_at: user.created_at,
        },
    });
});

/* GET /me */
app.get('/me', authMiddleware, (req, res) => {
    const user = stmts.getUser.get(req.user.tg_id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { n: cardCount } = stmts.countCards.get(req.user.tg_id);
    res.json({
        emoji:      user.emoji,
        code:       user.user_code,
        first_name: user.first_name,
        username:   user.username,
        created_at: user.created_at,
        card_count: cardCount,
    });
});

/* GET /cards — get all encrypted card blobs */
app.get('/cards', authMiddleware, apiLimiter, (req, res) => {
    const rows = stmts.getCards.all(req.user.tg_id);
    res.json(rows.map(r => ({
        id:             r.id,
        encrypted_data: r.encrypted_data,
        created_at:     r.created_at,
        updated_at:     r.updated_at,
    })));
});

/* POST /cards — upsert one or many cards
   Body: { cards: [{ id, encrypted_data, created_at }] }
   Server stores ONLY encrypted blobs — never sees card data
*/
app.post('/cards', authMiddleware, apiLimiter, (req, res) => {
    const { cards } = req.body;
    if (!Array.isArray(cards) || cards.length === 0) {
        return res.status(400).json({ error: 'cards[] required' });
    }
    if (cards.length > 500) {
        return res.status(400).json({ error: 'Max 500 cards per request' });
    }

    const now = Math.floor(Date.now() / 1000);
    const upsert = db.transaction(items => {
        for (const c of items) {
            if (!c.id || !c.encrypted_data) continue;
            stmts.upsertCard.run({
                id:             c.id,
                tg_id:          req.user.tg_id,
                encrypted_data: c.encrypted_data,
                created_at:     c.created_at || now,
                updated_at:     now,
            });
        }
    });
    upsert(cards);

    res.json({ ok: true, synced: cards.length });
});

/* DELETE /cards/:id */
app.delete('/cards/:id', authMiddleware, apiLimiter, (req, res) => {
    const info = stmts.deleteCard.run(req.params.id, req.user.tg_id);
    if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
});

/* 404 */
app.use((_, res) => res.status(404).json({ error: 'Not found' }));

/* Error handler */
app.use((err, _, res, __) => {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
});

/* ── Telegram Bot (Polling) ── */
async function startBotPolling() {
    let offset = 0;
    const botApiUrl = `https://api.telegram.org/bot${BOT_TOKEN}`;

    async function getUpdates() {
        try {
            const url = `${botApiUrl}/getUpdates?offset=${offset}&timeout=30`;
            const data = await new Promise((resolve, reject) => {
                https.get(url, res => {
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => {
                        try { resolve(JSON.parse(body).result || []); }
                        catch { resolve([]); }
                    });
                }).on('error', reject);
            });
            return data;
        } catch (e) {
            console.warn('[Bot] getUpdates error:', e.message);
            return [];
        }
    }

    async function sendMessage(chatId, text, buttons = null) {
        const payload = JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
            reply_markup: buttons,
        });
        try {
            await new Promise((resolve, reject) => {
                const req = https.request(`${botApiUrl}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length },
                }, res => {
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => resolve(body));
                });
                req.on('error', reject);
                req.write(payload);
                req.end();
            });
        } catch (e) {
            console.warn('[Bot] sendMessage error:', e.message);
        }
    }

    async function handleUpdate(update) {
        const msg = update.message || update.callback_query?.message;
        if (!msg) return;

        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const text = msg.text || '';
        const userName = msg.from.first_name || 'User';

        // /start command → show auth button
        if (text.startsWith('/start')) {
            const tg_id = String(userId);
            let user = stmts.getUser.get(tg_id);

            if (!user) {
                const { emoji, code } = generateUserCode();
                stmts.createUser.run({
                    tg_id,
                    first_name: userName,
                    username: msg.from.username || '',
                    emoji,
                    user_code: code,
                });
                user = stmts.getUser.get(tg_id);
            }

            const token = signToken(tg_id);
            const deepLink = `${FRONTEND_URL}?token=${token}&emoji=${encodeURIComponent(user.emoji)}&code=${user.user_code}`;

            await sendMessage(chatId,
                `👋 Привет, <b>${userName}</b>!\n\n` +
                `Добро пожаловать в <b>QRKulka</b>\n\n` +
                `Нажми кнопку ниже, чтобы открыть приложение и начать добавлять карты лояльности.`,
                {
                    inline_keyboard: [[
                        { text: '📱 Открыть QRKulka', web_app: { url: deepLink } }
                    ]]
                }
            );
        }
    }

    // Polling loop
    console.log('🤖 Telegram Bot polling started');
    setInterval(async () => {
        const updates = await getUpdates();
        for (const upd of updates) {
            await handleUpdate(upd);
            offset = upd.update_id + 1;
        }
    }, 1000);
}

/* ── Start ── */
app.listen(PORT, () => {
    console.log(`🚀 QRKulka API on port ${PORT}`);
    console.log(`   CORS: ${FRONTEND_URL}`);
    startBotPolling();
});