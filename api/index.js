const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const app = express();
app.use(express.json());
app.use(cors());

// MongoDB setup
const client = new MongoClient(process.env.MONGODB_URI);
let db;
async function getDb() {
  if (!db) {
    await client.connect();
    db = client.db(); // uses default DB from URI
  }
  return db;
}

// ---- WhatsApp Share ----
app.post('/api/share', async (req, res) => {
  const { phone, type } = req.body; // type: 'friend' or 'group'
  if (!phone || !['friend', 'group'].includes(type)) return res.status(400).json({ error: 'Invalid' });
  const db = await getDb();
  const sharesCol = db.collection('shares');
  let shares = await sharesCol.findOne({ phone }) || { friends: 0, groups: 0 };
  if (type === 'friend') shares.friends = Math.min((shares.friends || 0) + 1, 10);
  if (type === 'group') shares.groups = Math.min((shares.groups || 0) + 1, 2);
  await sharesCol.updateOne(
    { phone },
    { $set: { friends: shares.friends, groups: shares.groups, updated_at: new Date() } },
    { upsert: true }
  );
  res.json({ shared: { friends: shares.friends, groups: shares.groups } });
});

app.get('/api/share-status', async (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.json({ friends: 0, groups: 0 });
  const db = await getDb();
  const shares = await db.collection('shares').findOne({ phone });
  res.json(shares ? { friends: shares.friends || 0, groups: shares.groups || 0 } : { friends: 0, groups: 0 });
});

// ---- Application Form ----
app.post('/api/application', async (req, res) => {
  const { phone, ...formData } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone required' });
  const db = await getDb();
  await db.collection('applications').updateOne(
    { phone },
    { $set: { ...formData, phone, updatedAt: new Date() } },
    { upsert: true }
  );
  res.json({ success: true });
});

// ---- Paystack Payment Verification ----
app.post('/api/verify-payment', async (req, res) => {
  const { reference, phone, upgrade } = req.body;
  if (!reference || !phone) return res.status(400).json({ error: 'Missing reference or phone' });
  try {
    const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
    const resp = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${paystackSecret}` }
    });
    const status = resp.data.data.status;
    if (status === 'success') {
      const db = await getDb();
      await db.collection('payments').updateOne(
        { phone, reference },
        { $set: { status: 'success', upgrade: !!upgrade, updatedAt: new Date() } },
        { upsert: true }
      );
      return res.json({ success: true });
    }
    res.status(400).json({ error: 'Payment not successful' });
  } catch (e) {
    res.status(400).json({ error: 'Verification failed' });
  }
});

// ---- Check Eligibility (share + payment) ----
app.get('/api/eligibility', async (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.json({ canAccessForm: false, paid: false });
  const db = await getDb();
  const shares = await db.collection('shares').findOne({ phone });
  const payment = await db.collection('payments').findOne({ phone, status: 'success' });
  res.json({
    canAccessForm: (shares?.friends || 0) >= 10 && (shares?.groups || 0) >= 2,
    paid: !!payment
  });
});

// ---- Paystack Webhook (optional, for reliability) ----
app.post('/api/paystack-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    event = JSON.parse(req.body.toString());
  } catch (e) {
    return res.status(400).send('Invalid payload');
  }
  if (event.event === 'charge.success') {
    const data = event.data;
    const phone = data.metadata?.phone || data.customer?.phone || null;
    if (phone) {
      const db = await getDb();
      await db.collection('payments').updateOne(
        { phone, reference: data.reference },
        { $set: { status: 'success', upgrade: data.amount >= 100000, updatedAt: new Date() } },
        { upsert: true }
      );
    }
  }
  res.sendStatus(200);
});

module.exports = app;
