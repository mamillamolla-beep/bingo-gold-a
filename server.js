const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const app = express();

app.use(cors());
app.use(express.json());

// ================= የእርስዎ ሚስጥራዊ ቅንብሮች =================
const CHAPA_SECRET_KEY = 'CHASECK_TEST-xxxxxxxxxxxxxxxxxxxxxxxx';
const SERVER_URL = https://bingo-gold-a-1.onrender.com
const BOT_USERNAME = BINGO GOLD
const BOT_TOKEN = 8660418688:AAEczPRlL8XHxtY4VQGRxZ4lkjmMxE3E3fw
const ADMIN_TELEGRAM_ID = 5850978599
const ADMIN_PASSWORD = 080808
// =========================================================

const DB_FILE = './database.json';

function readDB() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({ users: {}, transactions: {} }));
    }
    return JSON.parse(fs.readFileSync(DB_FILE));
}

function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ለአስተዳዳሪው በቴሌግራም መልዕክት መላኪያ
async function notifyAdmin(message) {
    if (!BOT_TOKEN || BOT_TOKEN === 'YOUR_TELEGRAM_BOT_TOKEN') return;
    try {
        await axios.post(`https://telegram.org{BOT_TOKEN}/sendMessage`, {
            chat_id: ADMIN_TELEGRAM_ID,
            text: message,
            parse_mode: 'HTML'
        });
    } catch (err) {
        console.log('Telegram alert failed:', err.message);
    }
}

// 1. የተጫዋች ቀሪ ሂሳብ ማግኛ
app.get('/api/user/:telegramId', (req, res) => {
    const db = readDB();
    const id = req.params.telegramId;
    if (!db.users[id]) {
        db.users[id] = { balance: 0, withdrawals: [] };
        writeDB(db);
    }
    res.json({ balance: db.users[id].balance });
});

// 2. የጨዋታ ውርርድ እና ሽልማት ማስተካከያ
app.post('/api/balance/update', (req, res) => {
    const { telegramId, change } = req.body;
    const db = readDB();
    if (!db.users[telegramId]) db.users[telegramId] = { balance: 0, withdrawals: [] };

    if (db.users[telegramId].balance + change < 0) {
        return res.status(400).json({ error: 'በቂ ቀሪ ሂሳብ የለም' });
    }

    db.users[telegramId].balance += change;
    writeDB(db);
    res.json({ balance: db.users[telegramId].balance });
});

// 3. በቴሌብር እና ሲቢኢ ብር ማስገቢያ (Deposit)
app.post('/api/deposit', async (req, res) => {
    const { amount, telegramId, firstName } = req.body;
    const tx_ref = `bingo-${telegramId}-${Date.now()}`;
    const db = readDB();

    db.transactions[tx_ref] = { telegramId, firstName, amount: Number(amount), status: 'pending', date: new Date().toISOString() };
    writeDB(db);

    try {
        const response = await axios.post(
            'https://chapa.co',
            {
                amount: amount,
                currency: 'ETB',
                email: `user${telegramId}@bingogame.et`,
                first_name: firstName || 'Player',
                last_name: 'Bingo',
                tx_ref: tx_ref,
                return_url: `https://t.me{BOT_USERNAME}`,
                callback_url: `${SERVER_URL}/api/verify/${tx_ref}`
            },
            {
                headers: {
                    Authorization: `Bearer ${CHAPA_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        res.json({ checkout_url: response.data.data.checkout_url });
    } catch (error) {
        res.status(500).json({ error: 'የክፍያ ሊንክ መፍጠር አልተቻለም' });
    }
});

// 4. ክፍያ ማረጋገጫ (Webhook)
app.get('/api/verify/:tx_ref', async (req, res) => {
    const { tx_ref } = req.params;
    const db = readDB();
    const tx = db.transactions[tx_ref];

    if (!tx || tx.status === 'paid') return res.sendStatus(200);

    try {
        const response = await axios.get(
            `https://chapa.co{tx_ref}`,
            { headers: { Authorization: `Bearer ${CHAPA_SECRET_KEY}` } }
        );

        if (response.data.status === 'success') {
            tx.status = 'paid';
            if (!db.users[tx.telegramId]) db.users[tx.telegramId] = { balance: 0, withdrawals: [] };
            db.users[tx.telegramId].balance += tx.amount;
            writeDB(db);

            await notifyAdmin(`💰 <b>አዲስ ገቢ (Deposit)!</b>\n👤 ተጫዋች: ${tx.firstName} (<code>${tx.telegramId}</code>)\n💵 መጠን: <b>${tx.amount} ብር</b>`);
        }
        res.sendStatus(200);
    } catch (error) {
        res.sendStatus(500);
    }
});

// 5. ብር ማውጫ ጥያቄ (Withdraw)
app.post('/api/withdraw', async (req, res) => {
    const { telegramId, amount, method, phone } = req.body;
    const db = readDB();
    const user = db.users[telegramId];

    if (!user || user.balance < amount || amount < 50) {
        return res.status(400).json({ error: 'ዝቅተኛው ማውጫ 50 ብር ነው ወይም በቂ ሂሳብ የለዎትም' });
    }

    const withdrawId = `wd-${Date.now()}`;
    user.balance -= Number(amount);
    user.withdrawals.push({
        id: withdrawId,
        amount: Number(amount),
        method,
        phone,
        status: 'pending',
        date: new Date().toISOString()
    });

    writeDB(db);

    await notifyAdmin(
        `🏦 <b>የብር ማውጫ ጥያቄ (Withdraw)!</b>\n` +
        `👤 ID: <code>${telegramId}</code>\n` +
        `💳 መንገድ: <b>${method}</b>\n` +
        `📱 ስልክ: <code>${phone}</code>\n` +
        `💵 መጠን: <b>${amount} ብር</b>\n\n` +
        `ለማጽደቅ Admin Panel ይክፈቱ።`
    );

    res.json({ balance: user.balance, message: 'የብር ማውጫ ጥያቄዎ ተልኳል!' });
});

// ================= ADMIN PANEL APIs =================
function checkAdmin(req, res, next) {
    if (req.headers['x-admin-pass'] !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'የተሳሳተ የይለፍ ቃል!' });
    }
    next();
}

// ሁሉንም መረጃ ለ Admin ማሳያ
app.get('/api/admin/data', checkAdmin, (req, res) => {
    const db = readDB();
    res.json(db);
});

// የብር ማውጫ ጥያቄ ማጽደቅ ወይም መሰረዝ
app.post('/api/admin/withdraw/action', checkAdmin, (req, res) => {
    const { telegramId, withdrawId, action } = req.body; // action: 'approved' ወይም 'rejected'
    const db = readDB();
    const user = db.users[telegramId];
    if (!user) return res.status(404).json({ error: 'ተጫዋቹ አልተገኘም' });

    const wd = user.withdrawals.find(w => w.id === withdrawId);
    if (!wd || wd.status !== 'pending') return res.status(400).json({ error: 'ጥያቄው አልተገኘም' });

    wd.status = action;
    if (action === 'rejected') {
        user.balance += wd.amount; // ከተሰረዘ ብሩን ወደ ተጫዋቹ ይመልሳል
    }

    writeDB(db);
    res.json({ success: true });
});

// ለተጫዋች በእጅ ሂሳብ መጨመር/መቀነስ (Manual Top-up)
app.post('/api/admin/user/balance', checkAdmin, (req, res) => {
    const { telegramId, amount } = req.body;
    const db = readDB();
    if (!db.users[telegramId]) db.users[telegramId] = { balance: 0, withdrawals: [] };
    db.users[telegramId].balance += Number(amount);
    writeDB(db);
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
