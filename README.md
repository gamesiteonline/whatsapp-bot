# 🤖 AI WhatsApp Bot (Multi-Provider)

A feature-rich, modular WhatsApp bot powered by multiple AI providers (DeepSeek, Gemini, OpenAI, OpenRouter) and built with the Baileys library.

## 🚀 Features
- **4 AI Providers:** DeepSeek, Gemini, OpenAI, and OpenRouter.
- **50+ Modular Features:** Including commerce, support, entertainment, and security.
- **Web Dashboard:** Monitor status, view logs, and handle pairing.
- **Pairing Code Auth:** No need to scan QR codes (though fallback is supported).
- **Termux Compatible:** Uses `sql.js` for lightweight, cross-platform database support.

---

## 🛠️ Installation

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v16 or higher)
- [Git](https://git-scm.com/)

### 2. Clone & Install
```bash
git clone https://github.com/gamesiteonline/whatsapp-bot.git
cd whatsapp-bot
npm install
```

### 3. Configuration
Copy the `.env.example` file to `.env` and fill in your details:
```bash
cp .env.example .env
```
**Important:** Set `OWNER_NUMBER` to your phone number in international format (e.g., `255700000000`) without the `+`.

---

## 🚢 Deployment

### Option A: Local / Termux
1. Start the bot:
   ```bash
   npm start
   ```
2. Open the dashboard at `http://localhost:8080`.
3. Wait for the **Pairing Code** to appear in the logs or on the dashboard.
4. On your phone: **WhatsApp > Linked Devices > Link a Device > Link with phone number instead**.
5. Enter the code shown.

### Option B: VPS (Ubuntu/Debian)
1. Install PM2 to keep the bot running:
   ```bash
   sudo npm install -g pm2
   ```
2. Start the bot:
   ```bash
   pm2 start index.js --name "whatsapp-bot"
   ```
3. To view logs: `pm2 logs`.

### Option C: Railway / Render / Heroku
- Ensure you set the **Environment Variables** in the platform's dashboard.
- The bot uses port `8080` by default.
- **Note:** These platforms have ephemeral file systems. Since this bot uses local file auth, your session will reset on every redeploy unless you use a persistent volume.

---

## 🔧 Troubleshooting Pairing
If the bot fails to pair:
1. **Check `.env`:** Ensure `OWNER_NUMBER` is correct.
2. **Auth Reset:** Click "Reset Auth" on the dashboard or run `rm -rf auth_info_baileys`.
3. **Dashboard Manual Request:** Enter your number in the dashboard's "Request Code" input if the automatic one fails.
4. **Network:** Ensure your IP isn't flagged by WhatsApp (try a different network/VPN if needed).

---

## 📜 License
MIT
