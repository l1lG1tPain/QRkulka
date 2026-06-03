# QRKulka — Деплой гайд

## Структура
```
QRKulka/
├── frontend/   → Vercel (HTTPS, бесплатно)
└── backend/    → Твой VPS
```

---

## 1. Telegram Bot

1. Открой [@BotFather](https://t.me/BotFather)
2. `/newbot` → назови `QRKulka Bot` → username: `QRKulkaBot`
3. Скопируй **Bot Token**
4. После деплоя фронта: `/setdomain` → `qrkulka.vercel.app`

---

## 2. VPS — Бэкенд

```bash
# Загрузи backend/ на сервер
scp -r backend/ user@YOUR_VPS:/tmp/qrkulka-backend

# На сервере
ssh user@YOUR_VPS
cd /tmp/qrkulka-backend

# Запусти скрипт (Ubuntu 20/22)
bash setup-vps.sh api.qrkulka.com your@email.com
```

Скрипт автоматически:
- Установит Node.js 20, nginx, certbot, PM2
- Настроит SSL (HTTPS) для твоего домена
- Запустит API через PM2

### После установки — заполни .env:
```bash
nano /var/www/qrkulka-backend/.env
```
```
BOT_TOKEN=твой_токен_от_botfather
BOT_USERNAME=QRKulkaBot
JWT_SECRET=уже_сгенерирован_скриптом
FRONTEND_URL=https://qrkulka.vercel.app
PORT=3001
```
```bash
pm2 restart qrkulka-api
```

### Проверка:
```
https://api.qrkulka.com/health
# → {"ok":true,"ts":...}
```

---

## 3. Frontend — Vercel

### Вариант A: через GitHub (рекомендую)
1. Создай репо на GitHub, залей `frontend/`
2. Открой [vercel.com](https://vercel.com) → Import Git Repository
3. Выбери репо → Deploy
4. Получишь URL типа `qrkulka.vercel.app` ✅

### Вариант B: через CLI
```bash
npm i -g vercel
cd frontend/
vercel --prod
```

### Обновить API URL во frontend:
В `index.html` найди строку:
```js
window.QRKULKA_API = 'https://api.qrkulka.com';
```
Замени `api.qrkulka.com` на адрес своего VPS (или поддомен).

---

## 4. Иконки

Положи свои иконки в `frontend/icons/`:
- `QRKulka-512.png` — твоя иконка (уже используется)
- `icon-192.png` — для PWA (192×192)
- `icon-512.png` — для PWA (512×512)

---

## 5. Telegram авторизация (следующий шаг)

После настройки бота и деплоя, в `index.html` раскомментируй виджет Telegram и убери кнопку-заглушку:

```html
<!-- Заменить кнопку на виджет: -->
<script async
  src="https://telegram.org/js/telegram-widget.js?22"
  data-telegram-login="QRKulkaBot"
  data-size="large"
  data-radius="12"
  data-onauth="window.onTelegramAuth(user)"
  data-request-access="write">
</script>
```

И в `app.js` заменить `btnTgLogin` обработчик на:
```js
window.onTelegramAuth = async function(tgUser) {
  loader(true);
  const user = await API.loginTelegram(tgUser);
  // сохранить user, перейти к PIN...
};
```

---

## Команды PM2
```bash
pm2 logs qrkulka-api      # логи
pm2 restart qrkulka-api   # рестарт
pm2 status                # статус
```

---

## Локальная разработка
```bash
# Frontend
cd frontend && npx serve .
# → http://localhost:3000

# Backend
cd backend && npm install && cp .env.example .env
# (заполни .env)
node server.js
# → http://localhost:3001/health
```
