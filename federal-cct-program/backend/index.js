require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Database (using MongoDB Atlas in production)
let db = {
  users: {},
  shares: {},
  payments: {},
  applications: {}
};

// Paystack config
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE_URL = 'https://api.paystack.co';

// Helper middleware
const verifyWhatsAppShares = (req, res, next) => {
  const phone = req.body.phone || req.query.phone;
  if (!phone) return res.status(400).json({ error: 'Phone number required' });

  const userShares = db.shares[phone] || { friends: 0, groups: 0 };
  
  req.shareStatus = {
    canAccessForm: userShares.friends >= 10 && userShares.groups >= 2,
    shares: userShares
  };
  
  next();
};

// Routes
app.get('/api/eligibility', verifyWhatsAppShares, (req, res) => {
  const phone = req.query.phone;
  const hasPaid = db.payments[phone]?.verified || false;
  
  res.json({
    canAccessForm: req.shareStatus.canAccessForm,
    paid: hasPaid,
    shares: req.shareStatus.shares
  });
});

app.post('/api/share', (req, res) => {
  const { phone, type } = req.body;
  if (!phone || !type) return res.status(400).json({ error: 'Phone and type required' });

  if (!db.shares[phone]) {
    db.shares[phone] = { friends: 0, groups: 0 };
  }

  if (type === 'friend') {
    db.shares[phone].friends = Math.min(db.shares[phone].friends + 1, 10);
  } else if (type === 'group') {
    db.shares[phone].groups = Math.min(db.shares[phone].groups + 1, 2);
  }

  res.json(db.shares[phone]);
});

app.get('/api/share-status', (req, res) => {
  const { phone } = req.query;
  res.json({
    friends: 0,
    groups: 0,
    phone: phone || 'none'
  });
});

app.post('/api/application', verifyWhatsAppShares, (req, res) => {
  if (!req.shareStatus.canAccessForm) {
    return res.status(403).json({ error: 'Complete WhatsApp sharing requirements first' });
  }

  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone required' });

  db.applications[phone] = req.body;
  res.json({ success: true });
});

app.post('/api/init-payment', async (req, res) => {
  const { phone, amount, email, isUpgrade = false } = req.body;
  if (!phone || !amount || !email) {
    return res.status(400).json({ error: 'Phone, amount and email required' });
  }

  const reference = `PAY-${uuidv4()}`;
  const amountInKobo = amount * 100;
  
  try {
    const response = await axios.post(
      `${PAYSTACK_BASE_URL}/transaction/initialize`,
      {
        email,
        amount: amountInKobo,
        reference,
        callback_url: `${process.env.VERCEL_URL}/api/verify-payment`,
        metadata: { phone, isUpgrade }
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    db.payments[reference] = {
      phone,
      amount,
      isUpgrade,
      verified: false,
      createdAt: new Date()
    };

    res.json({
      authorization_url: response.data.data.authorization_url,
      access_code: response.data.data.access_code,
      reference
    });
  } catch (error) {
    console.error('Paystack error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Payment initialization failed' });
  }
});

app.get('/api/verify-payment', async (req, res) => {
  const { reference } = req.query;
  if (!reference) return res.status(400).json({ error: 'Reference required' });

  try {
    const payment = db.payments[reference];
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    const response = await axios.get(
      `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
        }
      }
    );

    if (response.data.data.status === 'success') {
      db.payments[reference].verified = true;
      db.payments[reference].verifiedAt = new Date();
      
      if (payment.isUpgrade && db.applications[payment.phone]) {
        db.applications[payment.phone].upgraded = true;
      }

      return res.json({ 
        success: true,
        amount: payment.amount,
        isUpgrade: payment.isUpgrade
      });
    } else {
      return res.json({ 
        success: false,
        message: 'Payment not completed'
      });
    }
  } catch (error) {
    console.error('Paystack verification error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Payment verification failed' });
  }
});

module.exports = app;
