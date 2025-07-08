const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const bodyParser = require('body-parser');
const app = express();
const PORT = 3000;

app.use(bodyParser.urlencoded({ extended: false }));

const API_ID = 'c17eadff';
const API_KEY = 'VS-0d726f7dc04a6b';
const DATABASE = './transaksideposit.json';
const SALDO_DB = './saldo.json';

// 🔃 Load & Save File Helper
function loadDB() {
  if (!fs.existsSync(DATABASE)) fs.writeFileSync(DATABASE, '[]');
  return JSON.parse(fs.readFileSync(DATABASE));
}

function saveDB(data) {
  fs.writeFileSync(DATABASE, JSON.stringify(data, null, 2));
}

function loadSaldo() {
  if (!fs.existsSync(SALDO_DB)) fs.writeFileSync(SALDO_DB, '{}');
  return JSON.parse(fs.readFileSync(SALDO_DB));
}

function saveSaldo(data) {
  fs.writeFileSync(SALDO_DB, JSON.stringify(data, null, 2));
}

function generateQR() {
  return '00020101021126670016COM.NOBUBANK.WWW01189360050300000879140214249245531475870303UMI51440014ID.CO.QRIS.WWW0215ID20222128523070303UMI5204481453033605802ID5908VIN GANS6008SIDOARJO61056121262070703A0163040DB5'; // Bisa diubah
}

// 🔧 CREATE DEPOSIT
app.post('/api/deposit/create', (req, res) => {
  const { api_key, sign, nominal, user } = req.body;
  const reff_id = `VS${Math.floor(Math.random() * 10000)}`;

  if (!api_key || !sign || !nominal) {
    return res.json({ result: false, message: 'Parameter tidak lengkap.' });
  }

  const validSign = crypto
    .createHash('md5')
    .update(API_ID + API_KEY + reff_id)
    .digest('hex');

  if (api_key !== API_KEY || sign !== validSign) {
    return res.json({ result: false, message: 'API Key atau Sign salah.' });
  }

  const fee = 597;
  const total = parseInt(nominal) + fee;
  const now = new Date();
  const created = now.toISOString().replace('T', ' ').split('.')[0];
  const expired = new Date(now.getTime() + 30 * 60000).toISOString().replace('T', ' ').split('.')[0];

  const data = loadDB();
  const deposit = {
    reff_id,
    nominal: parseInt(nominal),
    fee,
    total_bayar: total,
    status: 'Pending',
    qr_string: generateQR(),
    date_created: created,
    date_expired: expired,
    user: user || 'unknown'
  };

  data.push(deposit);
  saveDB(data);

  return res.json({ result: true, message: 'Deposit berhasil dibuat.', data: deposit });
});

// 🔍 CEK STATUS DEPOSIT
app.post('/api/deposit/status', (req, res) => {
  const { api_key, sign, reff_id } = req.body;

  if (!api_key || !sign || !reff_id) {
    return res.json({ result: false, message: 'Parameter tidak lengkap.' });
  }

  const validSign = crypto
    .createHash('md5')
    .update(API_ID + API_KEY + reff_id)
    .digest('hex');

  if (api_key !== API_KEY || sign !== validSign) {
    return res.json({ result: false, message: 'API Key atau Sign salah.' });
  }

  const data = loadDB();
  const found = data.find(d => d.reff_id === reff_id);
  if (!found) return res.json({ result: false, message: 'Deposit tidak ditemukan.' });

  return res.json({ result: true, message: 'Deposit berhasil ditemukan.', data: found });
});

// 🔁 AUTO CHECK STATUS TIAP 15 DETIK
setInterval(async () => {
  let data = loadDB();
  let saldo = loadSaldo();

  for (const trx of data) {
    if (trx.status !== 'Pending') continue;

    const validSign = crypto
      .createHash('md5')
      .update(API_ID + API_KEY + trx.reff_id)
      .digest('hex');

    const form = new URLSearchParams();
    form.append('api_key', API_KEY);
    form.append('sign', validSign);
    form.append('reff_id', trx.reff_id);

    const fetch = (await import('node-fetch')).default;
    try {
      const res = await fetch('http://localhost:3000/api/deposit/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form
      });

      const json = await res.json();

      if (json.result && json.data.status === 'Success') {
        trx.status = 'Success';

        let username = trx.user;
        if (!saldo[username]) saldo[username] = 0;
        saldo[username] += trx.nominal;

        console.log(`✅ Deposit ${trx.reff_id} sukses. Saldo ${username} +${trx.nominal}`);
        saveSaldo(saldo);
      }
    } catch (err) {
      console.log('Gagal cek status:', err.message);
    }
  }

  saveDB(data);
}, 15000);

// ▶️ Start API
app.listen(PORT, () => console.log(`✅ API running on http://localhost:${PORT}`));