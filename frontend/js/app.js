/* ══════════════════════════════════════
   APP.JS v5 — Fixed master_key + card sync
   Proper auth flow, migration handling, error recovery
══════════════════════════════════════ */
'use strict';

/* ─── STATE ─── */
const State = {
    masterKey: null,        // Shared encryption key from server
    pinKey: null,           // Local PIN encryption key
    token: null,            // Telegram bot token
    user: null, cards: [],
    editId: null, pin: '',
    color: 'purple', type: 'QR',
};

/* ─── UTILS ─── */
const $ = id => document.getElementById(id);
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const wait = ms => new Promise(r => setTimeout(r, ms));

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

function genUser() {
    const emojis = [
        '🍋','🦈','🐬','🐳','🐋','🐙','🦭','🐢','🐠','🪼','🦑','🦀','🌊',
        '📱','📲','💻','⌚','📷','📸','🖥️','🤖','⚙️','🔋','💾',
        '📡','🛰️','🔌','🧠','🛜','🌐','🔗','💡','🔍',
        '💳','💰','💵','💶','💷','🪙','🏦','📈','📊','💸',
        '🏷️','🎟️','🎫','🪪','📇','🗂️',
        '🔐','🔒','🛡️','🔑','🗝️',
        '🛒','🛍️','🏪','📦','🚕',
        '☕','🍔','🍟','🍕','🍣','🥤','🧃',
        '🎁','🎉','✨','🔖',
        '🚀','⚡','🔥','🎯','🏆','⭐','🌟','💎','👑',
        '🌙','☀️','🌈','🍀','🌸','🌺','🌻','🦋',
        '🦊','🐺','🦁','🐯','🐻','🐼','🐧',
        '🦅','🦉','🐨','🦝','🦄','🐉',
        '😎','🤓','🥷','🧙‍♂️','🧞‍♂️','🎩',
        '🎮','🎲','🎸','🎧','🎭','🎪','🃏',
        '🪐','🌌','☄️','🌠','🛸',
        '📚','✈️','🚗','🏍️','🚁','⛵','🏝️','🗺️','🧭',
        '🧩','🎬','🍿','🎡','🏟️','🎢',
        '⚽','🏀','🎾','🏐','🏓','🏸',
        '🛹','🚴','🏄','⛷️','🏂','🧗','🤸','🧘',
        '🦜','🦩'
    ];
    const chars  = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return {
        emoji: emojis[Math.floor(Math.random()*emojis.length)],
        code:  Array.from({length:6},()=>chars[Math.floor(Math.random()*chars.length)]).join(''),
    };
}

function fmtDate(ts) {
    return new Date(ts).toLocaleDateString('ru-RU',{day:'2-digit',month:'long',year:'numeric'});
}

function ago(ts) {
    const m=Math.floor((Date.now()-ts)/60000);
    if(m<1) return 'только что';
    if(m<60) return `${m} мин назад`;
    const h=Math.floor(m/60);
    if(h<24) return `${h} ч назад`;
    const d=Math.floor(h/24);
    return d===1?'вчера':`${d} дн назад`;
}

const GRAD = {
    purple:'linear-gradient(135deg,#4f46e5,#7c3aed)',
    cyan:  'linear-gradient(135deg,#06b6d4,#0ea5e9)',
    green: 'linear-gradient(135deg,#059669,#10b981)',
    red:   'linear-gradient(135deg,#dc2626,#f97316)',
    pink:  'linear-gradient(135deg,#ec4899,#f43f5e)',
    amber: 'linear-gradient(135deg,#ca8a04,#f59e0b)',
    blue:  'linear-gradient(135deg,#2563eb,#3b82f6)',
    teal:  'linear-gradient(135deg,#0f766e,#14b8a6)',
    rose:  'linear-gradient(135deg,#e11d48,#fb7185)',
    slate: 'linear-gradient(135deg,#334155,#64748b)'
};

const BRANDS = [
    { keys: ['click'], emoji: '💳' },
    { keys: ['payme'], emoji: '💚' },
    { keys: ['uzum', 'uzumbank', 'uzum bank'], emoji: '🏦' },
    { keys: ['apelsin'], emoji: '🍊' },
    { keys: ['humo'], emoji: '💠' },
    { keys: ['uzcard'], emoji: '💠' },
    { keys: ['paynet'], emoji: '💳' },
    { keys: ['oson'], emoji: '⚡' },
    { keys: ['kaspi', 'kaspi.kz', 'kaspi bank'], emoji: '🔴' },
    { keys: ['halyk', 'halyk bank'], emoji: '🏦' },
    { keys: ['forte'], emoji: '🟣' },
    { keys: ['homebank'], emoji: '🏦' },
    { keys: ['jysan'], emoji: '🟠' },
    { keys: ['qiwi'], emoji: '🥝' },
    { keys: ['tinkoff', 't-bank', 'tbank'], emoji: '🟡' },
    { keys: ['sber', 'sberbank', 'sberpay'], emoji: '🟢' },
    { keys: ['alfa', 'alfabank'], emoji: '🔴' },
    { keys: ['yoomoney', 'юмани'], emoji: '💜' },
    { keys: ['mir', 'mirpay'], emoji: '💳' },
    { keys: ['korzinka', 'korzinka.uz'], emoji: '🛒' },
    { keys: ['makro'], emoji: '🛒' },
    { keys: ['havas'], emoji: '🛒' },
    { keys: ['magnum'], emoji: '🛒' },
    { keys: ['small'], emoji: '🛒' },
    { keys: ['perekrestok'], emoji: '🛒' },
    { keys: ['pyaterochka', 'пятерочка'], emoji: '🛒' },
    { keys: ['magnit'], emoji: '🛒' },
    { keys: ['qr', 'goqr', 'gopqr', 'go qr'], emoji: '📸' }
];

function normalize(str) {
    return (str || '').toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '');
}

function cEmoji(name) {
    const k = normalize(name);
    let bestMatch = null;
    let bestScore = 0;
    for (const brand of BRANDS) {
        for (const key of brand.keys) {
            const nk = normalize(key);
            if (!nk) continue;
            if (k === nk) return brand.emoji;
            if (k.includes(nk) || nk.includes(k)) {
                const score = nk.length;
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = brand.emoji;
                }
            }
        }
    }
    return bestMatch || '📦';
}

/* ─── TOAST / LOADER ─── */
let _toastTimer;
function toast(msg, ms=2800) {
    const t=$('toast');
    t.textContent=msg; t.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer=setTimeout(()=>t.classList.remove('show'),ms);
}
function loader(on) { $('loader').classList.toggle('show',on); }

/* ─── ROUTER ─── */
const SCREENS = {
    welcome:'s-welcome', 'pin-setup':'s-pin-setup', 'pin-enter':'s-pin-enter',
    home:'s-home', add:'s-add', scanner:'s-scanner',
    form:'s-form', card:'s-card', profile:'s-profile',
};
let _curScreen = 'welcome';

function go(name, slide=false) {
    const screenId = SCREENS[name];
    if(!screenId) { console.error('Unknown screen:', name); return; }
    Object.values(SCREENS).forEach(id => {
        const el=$(id);
        el.classList.remove('screen-active','screen-slide');
    });
    const el=$(screenId);
    el.classList.add('screen-active');
    if(slide) el.classList.add('screen-slide');
    _curScreen = name;
}

/* ─── KEYPAD ─── */
function buildKeypad(id, onDigit, onDel) {
    const wrap=$(id); wrap.innerHTML='';
    const keys =['1','2','3','4','5','6','7','8','9','','0','⌫'];
    const subs  =['','ABC','DEF','GHI','JKL','MNO','PQRS','TUV','WXYZ','','',''];
    keys.forEach((k,i)=>{
        const btn=document.createElement('div');
        btn.className='key';
        if(!k){ btn.classList.add('key-empty'); }
        else if(k==='⌫'){ btn.classList.add('key-del'); btn.textContent='⌫'; }
        else { btn.innerHTML=`${k}${subs[i]?`<span class="key-sub">${subs[i]}</span>`:''}`; }
        btn.addEventListener('click',()=>{
            if(!k) return;
            if(k==='⌫') onDel(); else onDigit(k);
        });
        wrap.appendChild(btn);
    });
}

function setDots(id, val, err=false) {
    $(id).querySelectorAll('.pdot').forEach((d,i)=>{
        d.classList.toggle('filled', i<val.length && !err);
        d.classList.toggle('error',  err);
    });
}

/* ─── AUTH ─── */
async function boot() {
    if(!Crypto.hasSubtle) {
        toast('⚠️ HTTP: шифрование упрощено. Для AES нужен localhost/HTTPS.',5000);
    }

    // Check if coming from Telegram bot
    const params = new URLSearchParams(window.location.search);
    const tokenFromBot = params.get('token');
    const emojiFromBot = params.get('emoji');
    const codeFromBot = params.get('code');
    const masterKeyFromBot = params.get('masterKey');

    // Clear URL params immediately
    if (tokenFromBot) {
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (tokenFromBot && masterKeyFromBot) {
        console.log('[Auth] Registering from Telegram bot, code:', codeFromBot);
        localStorage.setItem('qrk_jwt', tokenFromBot);
        localStorage.setItem('qrk_master_key', masterKeyFromBot);

        State.user = {
            emoji: decodeURIComponent(emojiFromBot || '🍋'),
            code: codeFromBot || '',
            createdAt: Date.now()
        };
        State.masterKey = masterKeyFromBot;
        State.token = tokenFromBot;

        await DB.saveUser(State.user);
        await DB.saveMasterKey(masterKeyFromBot);

        // Check if user already has PIN set on server
        try {
            const me = await API.getMe();
            if (me && me.pin_hash) {
                // PIN already exists - show PIN entry screen
                console.log('[Auth] PIN already set, requesting entry');
                $('enterAvatar').textContent = State.user.emoji;
                $('enterName').textContent = State.user.emoji + State.user.code;

                // Load cards but don't decrypt yet
                await loadCards();
                renderHome();
                renderProfile();

                // Show PIN entry instead of creation
                State.pin = '';
                buildKeypad('enterKeypad',
                    async(k)=>{
                        if(State.pin.length>=4) return;
                        State.pin+=k; setDots('enterDots',State.pin);
                        $('pinError').style.display='none';
                        if(State.pin.length===4){
                            setTimeout(async()=>{
                                loader(true);
                                const pinHashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(State.pin));
                                const pinHashHex = Array.from(new Uint8Array(pinHashBuffer)).map(b=>b.toString(16).padStart(2,'0')).join('');

                                // Verify PIN on server
                                try {
                                    const token = API.getToken() || State.token;
                                    const res = await fetch((window.QRKULKA_API || 'https://api.qrkulka.com') + '/auth/verify-pin', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                                        body: JSON.stringify({ pinHash: pinHashHex, action: 'verify' })
                                    });
                                    loader(false);

                                    if (res.ok) {
                                        // PIN correct
                                        await enterApp();
                                    } else {
                                        // PIN incorrect
                                        State.pin='';
                                        setDots('enterDots','',true);
                                        $('pinError').style.display='block';
                                        const d=$('enterDots');
                                        d.style.animation='shake .4s ease';
                                        setTimeout(()=>{ d.style.animation=''; setDots('enterDots',''); },500);
                                    }
                                } catch(e) {
                                    loader(false);
                                    toast('Ошибка проверки PIN: '+e.message);
                                    State.pin='';
                                    setDots('enterDots','');
                                }
                            },100);
                        }
                    },
                    ()=>{
                        State.pin=State.pin.slice(0,-1);
                        setDots('enterDots',State.pin);
                        $('pinError').style.display='none';
                    }
                );
                go('pin-enter', true);
                return;
            }
        } catch(e) {
            console.warn('[Auth] Could not check PIN status:', e.message);
        }

        // No PIN yet - show PIN creation screen
        $('setupAvatar').textContent = State.user.emoji;
        State.pin = '';
        buildKeypad('setupKeypad', onSetupKey, onSetupDel);

        await loadCards();
        renderHome();
        renderProfile();
        go('pin-setup', true);
        return;
    }

    // Existing device - check PIN
    const auth = await DB.getAuth();
    if(!auth) {
        go('welcome');
    } else {
        const user = await DB.getUser();
        const savedMasterKey = await DB.getMasterKey();

        if (!savedMasterKey) {
            console.error('[Auth] No masterKey found locally!');
            toast('⚠️ Данные повреждены, пожалуйста переайдите через Telegram');
            go('welcome');
            return;
        }

        State.masterKey = savedMasterKey;

        if(user){
            $('enterAvatar').textContent=user.emoji;
            $('enterName').textContent=user.emoji+user.code;
        }
        setupEnterPin(auth);
        go('pin-enter');
    }

    console.log('[Boot] URL Params:', {
        token: params.get('token') ? '✓' : '✗',
        emoji: params.get('emoji'),
        code: params.get('code'),
        masterKey: params.get('masterKey') ? params.get('masterKey').substring(0, 10) + '...' : '✗'
    });

    console.log('[Boot] masterKeyFromBot exists?', !!masterKeyFromBot);
}

/* Welcome → Telegram bot */
$('btnTgLogin').addEventListener('click', () => {
    const BOT_USERNAME = 'QRKulka_bot';
    const botLink = `https://t.me/${BOT_USERNAME}?start=auth`;
    window.open(botLink, '_blank');
});

function onSetupKey(k) {
    if(State.pin.length>=4) return;
    State.pin+=k; setDots('setupDots',State.pin);
    if(State.pin.length===4) {
        setTimeout(async()=>{
            loader(true);
            try {
                // Calculate PIN hash
                const pinHashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(State.pin));
                const pinHashHex = Array.from(new Uint8Array(pinHashBuffer)).map(b=>b.toString(16).padStart(2,'0')).join('');

                // Save PIN to server
                const token = API.getToken() || State.token;
                const res = await fetch((window.QRKULKA_API || 'https://api.qrkulka.com') + '/auth/verify-pin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify({ pinHash: pinHashHex, action: 'create' })
                });

                if (!res.ok) {
                    throw new Error('PIN save failed');
                }

                loader(false);
                await enterApp();
            } catch(e){
                loader(false);
                toast('Ошибка: '+e.message);
                State.pin=''; setDots('setupDots','');
                console.error(e);
            }
        },150);
    }
}
function onSetupDel(){ State.pin=State.pin.slice(0,-1); setDots('setupDots',State.pin); }

/* PIN enter */
function setupEnterPin(auth) {
    State.pin='';
    buildKeypad('enterKeypad',
        async(k)=>{
            if(State.pin.length>=4) return;
            State.pin+=k; setDots('enterDots',State.pin);
            $('pinError').style.display='none';
            if(State.pin.length===4){
                setTimeout(async()=>{
                    loader(true);
                    const {ok,key,mode}=await Crypto.verifyPin(State.pin,auth.saltHex,auth.verifyToken,auth.mode);
                    loader(false);
                    if(ok){
                        State.pinKey=key;
                        await enterApp();
                    } else {
                        State.pin='';
                        setDots('enterDots','',true);
                        $('pinError').style.display='block';
                        const d=$('enterDots');
                        d.style.animation='shake .4s ease';
                        setTimeout(()=>{ d.style.animation=''; setDots('enterDots',''); },500);
                    }
                },100);
            }
        },
        ()=>{
            State.pin=State.pin.slice(0,-1);
            setDots('enterDots',State.pin);
            $('pinError').style.display='none';
        }
    );
}

/* ─── ENTER APP ─── */
async function enterApp() {
    const user = State.user || await DB.getUser();
    if(!user){ toast('Пользователь не найден'); return; }
    State.user=user;

    // Ensure masterKey is available
    if(!State.masterKey) {
        const saved = await DB.getMasterKey();
        if(!saved) {
            toast('❌ Ошибка: ключ шифрования не найден. Пожалуйста переавторизуйтесь через Telegram');
            go('welcome');
            return;
        }
        State.masterKey = saved;
    }

    // Send PIN hash to server for verification on next login
    try {
        const pinHash = await DB.kvGet('pin_hash');
        if(pinHash && API.hasToken()) {
            const token = API.getToken();
            await fetch((window.QRKULKA_API || 'https://api.qrkulka.com') + '/auth/verify-pin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({ pinHash })
            }).catch(e => console.warn('[Auth] PIN verification failed:', e.message));
        }
    } catch(e) {
        console.warn('[Auth] Could not send PIN hash:', e.message);
    }

    console.log('[App] Entering with user:', user.code, 'masterKey:', !!State.masterKey);

    await loadCards();
    renderHome();
    renderProfile();
    go('home',true);
}

/* ─── CARDS CRUD ─── */
async function loadCards() {
    console.log('[Load] Starting loadCards, hasToken:', API.hasToken(), 'isOnline:', API.isOnline());
    console.log('[Load] masterKey available:', !!State.masterKey);

    if (!State.masterKey) {
        console.error('[Load] No masterKey! Cannot decrypt cards');
        State.cards = [];
        return;
    }

    // Sync from server first if online
    if(API.isOnline() && API.hasToken()) {
        try {
            console.log('[Sync] Pulling cards from server...');
            const serverCards = await API.pullCards();
            console.log('[Sync] Server returned:', serverCards ? serverCards.length : 0, 'cards');

            if(serverCards && serverCards.length > 0) {
                const localCards = await DB.getAllCards();
                const localIds = new Set(localCards.map(c => c.id));

                for(const card of serverCards) {
                    if(!localIds.has(card.id)) {
                        console.log('[Sync] Adding new card from server:', card.id);
                        await DB.saveCard({
                            id: card.id,
                            createdAt: card.created_at,
                            encryptedData: card.encrypted_data
                        });
                    }
                }
                console.log('[Sync] Merged cards from server');
            }
        } catch(e) {
            console.warn('[Sync] Pull failed:', e.message);
        }
    }

    // Load all cards from local DB and decrypt with masterKey
    const out = [];
    try {
        const rows = await DB.getAllCards();
        console.log('[Load] Got', rows.length, 'cards from local DB');

        for(const r of rows){
            try {
                // Decrypt with masterKey (shared across devices)
                const decrypted = await Crypto.decryptWithKey(r.encryptedData, State.masterKey);
                out.push({...decrypted, id: r.id, createdAt: r.createdAt});
                console.log('[Load] ✓ Decrypted card:', r.id);
            } catch(e) {
                // Individual card decryption failed - continue with others
                console.warn('[Decrypt] Failed for card', r.id, ':', e.message);
                // Could add a notification here if needed
            }
        }
        console.log('[Load] Successfully decrypted', out.length, 'of', rows.length, 'cards');
        State.cards = out;
    } catch(e) {
        console.error('[Load] Error loading cards:', e.message);
        State.cards = [];
    }
}

async function addCard(data) {
    const id=uid(), createdAt=Date.now();
    const full={...data,id,createdAt};

    if (!State.masterKey) {
        throw new Error('MasterKey not available');
    }

    // Encrypt with masterKey (not PIN key)
    const enc = await Crypto.encryptWithKey(full, State.masterKey);
    await DB.saveCard({id,createdAt,encryptedData:enc});
    State.cards.unshift(full);

    if(API.isOnline()) {
        console.log('[Sync] Pushing card:', id);
        API.pushCards([{id,createdAt,encrypted_data:enc}]).then(()=>{
            console.log('[Sync] Card pushed OK');
        }).catch(e=>{
            console.error('[Sync] Push failed:', e.message);
        });
    } else {
        console.log('[Sync] Offline, card saved locally only');
    }

    return full;
}

async function delCard(id) {
    await DB.deleteCard(id);
    State.cards=State.cards.filter(c=>c.id!==id);

    if(API.isOnline()) {
        API.deleteCard(id).catch(e=>console.warn('Delete sync failed:',e));
    }
}

/* ─── HOME ─── */
function renderHome() {
    const u=State.user;
    $('homeGreet').textContent='Привет 👋';
    $('homeName').textContent=u.emoji+u.code;
    $('homeAvatarInner').textContent=u.emoji;

    if(!State.cards.length){
        $('cardsSection').style.display='none';
        $('recentSection').style.display='none';
        $('heroSection').innerHTML=`
      <div class="section" style="padding-top:28px">
        <div class="empty-state">
          <div class="empty-icon">💳</div>
          <div class="empty-title syne">Нет карт</div>
          <div class="empty-sub">Добавь карту лояльности,<br/>QR‑код или ваучер</div>
          <div class="btn-empty" id="emptyBtn">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" width="18" height="18"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Добавить карту
          </div>
        </div>
      </div>`;
        $('emptyBtn').onclick=()=>{ resetForm(); go('add',true); };
        return;
    }

    const top=State.cards.slice(0,3);
    $('heroSection').innerHTML=`
    <div class="hero-section">
      <div class="hero-label">Основная карта</div>
      <div class="card-stack">
        ${top.map(c=>`
          <div class="stack-card" style="background:${GRAD[c.color]||GRAD.purple}" data-id="${c.id}">
            <div class="sc-top"><div class="sc-brand">${esc(c.name)}</div><div class="sc-pill">${esc(c.type)}</div></div>
            <div class="sc-bot"><div class="sc-num">·· ···· ····</div><div class="sc-qr">${cEmoji(c.name)}</div></div>
          </div>`).join('')}
      </div>
      <div class="stack-dots">${top.map((_,i)=>`<div class="sdot${i===0?' on':''}"></div>`).join('')}</div>
    </div>`;
    document.querySelectorAll('.stack-card').forEach(el=>
        el.addEventListener('click',()=>openCard(el.dataset.id)));

    $('cardsMini').innerHTML=State.cards.map(c=>`
    <div class="mini-card" style="background:${GRAD[c.color]||GRAD.purple}" data-id="${c.id}">
      <div class="mc-emoji">${cEmoji(c.name)}</div>
      <div class="mc-name">${esc(c.name)}</div>
    </div>`).join('');
    document.querySelectorAll('.mini-card').forEach(el=>
        el.addEventListener('click',()=>openCard(el.dataset.id)));

    $('recentList').innerHTML=State.cards.slice(0,5).map(c=>`
    <div class="recent-item" data-id="${c.id}">
      <div class="ri-ic" style="background:rgba(99,102,241,0.15)">${cEmoji(c.name)}</div>
      <div class="ri-info"><div class="ri-name">${esc(c.name)}</div><div class="ri-time">${ago(c.createdAt)}</div></div>
      <div class="ri-arr">›</div>
    </div>`).join('');
    document.querySelectorAll('.recent-item').forEach(el=>
        el.addEventListener('click',()=>openCard(el.dataset.id)));

    $('cardsSection').style.display='';
    $('recentSection').style.display='';
}

/* ─── CARD VIEW ─── */
function openCard(id) {
    const c=State.cards.find(x=>x.id===id);
    if(!c) return;
    State.editId=id;

    $('cardViewTitle').textContent=c.name;
    $('cvName').textContent=c.name;
    $('cvBadge').textContent=c.type||'QR';
    $('cvNote').textContent=c.note||'';
    $('cvDate').textContent=fmtDate(c.createdAt);
    $('cvType').textContent=c.type||'QR';
    $('cvHeroCard').style.background=GRAD[c.color]||GRAD.purple;

    const box=$('qrBox'); box.innerHTML='';
    const val=(c.value||c.name||'').trim();
    $('qrValue').textContent=val.length>80?val.slice(0,80)+'…':val;

    if(c.type==='Штрихкод'){
        const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
        svg.id='bcsvg'; box.appendChild(svg);
        try{
            JsBarcode('#bcsvg',val,{format:'CODE128',width:2.2,height:90,displayValue:false,background:'transparent',lineColor:'#fff',margin:0});
            svg.style.maxWidth='290px';
        }catch{ box.innerHTML='<div style="color:rgba(255,255,255,.4);padding:16px;font-size:13px">Неверный формат</div>'; }
    } else {
        try{
            new QRCode(box,{text:val||'empty',width:200,height:200,colorDark:'#fff',colorLight:'rgba(0,0,0,0)',correctLevel:QRCode.CorrectLevel.M});
        }catch{ box.innerHTML='<div style="color:rgba(255,255,255,.4);padding:16px;font-size:13px">Ошибка QR</div>'; }
    }
    go('card',true);
}

$('btnDelete').addEventListener('click',async()=>{
    if(!State.editId||!confirm('Удалить карту?')) return;
    await delCard(State.editId);
    toast('🗑 Карта удалена');
    renderHome(); renderProfile();
    go('home');
});

/* ─── ADD FLOW ─── */
$('mScan').addEventListener('click',()=>{ go('scanner',true); startScan(); });
$('mGallery').addEventListener('click',()=>$('galleryInput').click());
$('mManual').addEventListener('click',()=>{ resetForm(); go('form',true); });

$('galleryInput').addEventListener('change',async e=>{
    const f=e.target.files[0]; if(!f) return;
    loader(true);
    await Scanner.scanFile(f,
        (txt,fmt)=>{ loader(false); fillForm(txt,Scanner.guessType(txt,fmt)); go('form',true); toast('✅ Код найден!'); },
        ()=>{ loader(false); toast('Код не найден — введи вручную'); resetForm(); go('form',true); }
    );
    e.target.value='';
});

/* ─── SCANNER ─── */
let _scanning=false;
async function startScan(){
    if(_scanning) return; _scanning=true;
    try{
        await Scanner.start('qr-reader',async(txt,fmt)=>{
            await Scanner.stop(); _scanning=false;
            fillForm(txt,Scanner.guessType(txt,fmt));
            go('form',true); toast('✅ Распознан!');
        });
    }catch(e){ _scanning=false; toast('📷 '+(e.message||'Нет камеры')); go('add'); }
}

$('btnScanGallery').addEventListener('click',async()=>{
    await Scanner.stop(); _scanning=false;
    $('galleryInput').click(); go('add');
});

$('torchBtn').addEventListener('click',async()=>{
    const on=await Scanner.toggleTorch();
    $('torchBtn').classList.toggle('on',!!on);
    if(on===false) toast('Фонарик недоступен');
});

/* ─── FORM ─── */
function resetForm(){
    $('fName').value=$('fValue').value=$('fNote').value='';
    State.color='purple'; State.type='QR'; syncForm();
}
function fillForm(val,type){
    resetForm(); $('fValue').value=val; State.type=type||'QR'; syncForm();
}
function syncForm(){
    $('fPreviewName').textContent=$('fName').value||'Название карты';
    $('fPreviewBadge').textContent=State.type;
    $('fPreviewNote').textContent=$('fNote').value||'·· ···· ····';
    $('formPreview').style.background=GRAD[State.color]||GRAD.purple;
    document.querySelectorAll('.tpill').forEach(p=>p.classList.toggle('active',p.dataset.t===State.type));
    document.querySelectorAll('.cdot').forEach(d=>d.classList.toggle('active',d.dataset.color===State.color));
}

$('fName').addEventListener('input',syncForm);
$('fNote').addEventListener('input',syncForm);
document.querySelectorAll('.tpill').forEach(p=>p.addEventListener('click',()=>{ State.type=p.dataset.t; syncForm(); }));
document.querySelectorAll('.cdot').forEach(d=>d.addEventListener('click',()=>{ State.color=d.dataset.color; syncForm(); }));

$('btnSave').addEventListener('click',async()=>{
    const name=$('fName').value.trim(), val=$('fValue').value.trim();
    if(!name){ toast('Введи название'); $('fName').focus(); return; }
    if(!val){  toast('Введи данные карты'); $('fValue').focus(); return; }
    loader(true);
    try{
        await addCard({name,value:val,type:State.type,color:State.color,note:$('fNote').value.trim()});
        loader(false); toast('✅ Карта сохранена!');
        renderHome(); renderProfile(); go('home');
    }catch(e){ loader(false); toast('Ошибка: '+e.message); console.error(e); }
});

/* ─── PROFILE ─── */
function renderProfile(){
    const u=State.user; if(!u) return;
    $('profileAvatar').textContent=u.emoji;
    $('profileName').textContent=u.emoji+' '+u.code;
    $('profileId').textContent='ID: '+u.code;
    $('storageInfo').textContent=`${State.cards.length} карт · AES-256-GCM`;
}

$('sChangePin').addEventListener('click',()=>toast('Для смены PIN очисти данные и зарегистрируйся заново'));
$('sClear').addEventListener('click',async()=>{
    if(!confirm('Удалить всё? Необратимо!')) return;
    loader(true); await DB.clearAll(); loader(false);
    window.location.reload();
});

/* ─── NAV ─── */
document.querySelectorAll('[data-nav]').forEach(el=>{
    el.addEventListener('click',async()=>{
        const t=el.dataset.nav;
        if(_curScreen==='scanner'){ await Scanner.stop(); _scanning=false; }
        if(t==='add') resetForm();
        document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('nav-active'));
        if(t==='home'||t==='profile'){
            document.querySelectorAll(`[data-nav="${t}"]`).forEach(b=>{
                if(b.classList.contains('nav-btn')) b.classList.add('nav-active');
            });
        }
        go(t, t!=='home');
    });
});

document.querySelectorAll('[data-back]').forEach(el=>{
    el.addEventListener('click',async()=>{
        if(_curScreen==='scanner'){ await Scanner.stop(); _scanning=false; }
        go(el.dataset.back);
    });
});

/* ─── INIT ─── */
boot().catch(e=>{ console.error('boot error:',e); toast('Ошибка: '+e.message); });