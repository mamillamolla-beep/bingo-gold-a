const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const app = express();

app.use(cors());
app.use(express.json());

// ከ Chapa Dashboard የሚወስዱት Secret Key
const CHAPA_SECRET_KEY = 'CHASECK_TEST-xxxxxxxxxxxxxxxxxxxxxxxx';
const SERVER_URL = https://bingo-gold-a-1.onrender.com
const BOT_USERNAME = 'YOUR_BOT_USERNAME'; // የቴሌግራም ቦትዎ ስም ያለ @

const DB_FILE = './database.json';

// ዳታቤዝ ማንበቢያ እና መጻፊያ
function readDB() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({ users: {}, transactions: {} }));
    }
    return JSON.parse(fs.readFileSync(DB_FILE));
}

function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// 1. የተጫዋች ቀሪ ሂሳብ ማግኛ (Get Balance)
app.get('/api/user/:telegramId', (req, res) => {
    const db = readDB();
    const id = req.params.telegramId;
    if (!db.users[id]) {
        db.users[id] = { balance: 0, withdrawals: [] };
        writeDB(db);
    }
    res.json({ balance: db.users[id].balance });
});

// 2. የጨዋታ ውርርድ እና ሽልማት ማስተካከያ (Update Balance)
app.post('/api/balance/update', (req, res) => {
    const { telegramId, change } = req.body; // change: ሲያስገባ +፣ ሲወራረድ -
    const db = readDB();
    if (!db.users[telegramId]) db.users[telegramId] = { balance: 0, withdrawals: [] };

    if (db.users[telegramId].balance + change < 0) {
        return res.status(400).json({ error: 'በቂ ቀሪ ሂሳብ የለም' });
    }

    db.users[telegramId].balance += change;
    writeDB(db);
    res.json({ balance: db.users[telegramId].balance });
});

// 3. በቴሌብር እና ሲቢኢ ብር ብር ማስገቢያ (Deposit via Chapa)
app.post('/api/deposit', async (req, res) => {
    const { amount, telegramId, firstName } = req.body;
    const tx_ref = `bingo-${telegramId}-${Date.now()}`;
    const db = readDB();

    db.transactions[tx_ref] = { telegramId, amount: Number(amount), status: 'pending' };
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

// 4. ክፍያው መሳካቱን Chapa ሲያሳውቅ ቀሪ ሂሳብ መጨመር (Webhook)
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
        }
        res.sendStatus(200);
    } catch (error) {
        res.sendStatus(500);
    }
});

// 5. ብር ማውጫ ጥያቄ (Withdraw to Telebirr / CBE Birr)
app.post('/api/withdraw', (req, res) => {
    const { telegramId, amount, method, phone } = req.body;
    const db = readDB();
    const user = db.users[telegramId];

    if (!user || user.balance < amount || amount < 50) {
        return res.status(400).json({ error: 'ዝቅተኛው ማውጫ 50 ብር ነው ወይም በቂ ሂሳብ የለዎትም' });
    }

    user.balance -= Number(amount);
    user.withdrawals.push({
        amount: Number(amount),
        method,
        phone,
        status: 'pending',
        date: new Date().toISOString()
    });

    writeDB(db);
    res.json({ balance: user.balance, message: 'የብር ማውጫ ጥያቄዎ ተልኳል!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
