require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// ============ BANCO DE DADOS SIMPLES ============
const DB_FILE = path.join(__dirname, 'usuarios.json');
const lerDB = () => fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : [];
const salvarDB = (dados) => fs.writeFileSync(DB_FILE, JSON.stringify(dados, null, 2));

// ============ MERCADO PAGO ============
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const preference = new Preference(client);

// ============ E-MAIL ============
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

function gerarSenha() {
  return crypto.randomBytes(6).toString('base64').slice(0, 10);
}

// ============ ROTAS ============
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app.html'));
});

app.post('/api/criar-pagamento', async (req, res) => {
  const { nome, email } = req.body;
  if (!nome || !email) return res.status(400).json({ erro: 'Nome e e-mail são obrigatórios.' });

  try {
    const body = {
      items: [{
        id: 'drinkmaster-acesso',
        title: 'Acesso Vitalício - DrinkMaster',
        description: 'Acesso completo ao aplicativo DrinkMaster',
        quantity: 1,
        unit_price: 19.90,
        currency_id: 'BRL'
      }],
      payer: { name: nome, email: email },
      back_urls: {
        success: 'https://drinkmaster.onrender.com/app',
        failure: 'https://drinkmaster.onrender.com/',
        pending: 'https://drinkmaster.onrender.com/'
      },
      auto_return: 'approved',
      notification_url: 'https://drinkmaster.onrender.com/webhook'
    };

    const result = await preference.create({ body });
    res.json({ init_point: result.init_point });

  } catch (erro) {
    console.error('Erro ao criar pagamento:', erro);
    res.status(500).json({ erro: 'Erro ao gerar o pagamento. Tente novamente.' });
  }
});

app.post('/webhook', async (req, res) => {
  const { type, data } = req.body;

  if (type === 'payment') {
    const paymentId = data.id;
    try {
      const payment = new Payment(client);
      const paymentData = await payment.get({ id: paymentId });

      if (paymentData.status === 'approved') {
        const email = paymentData.payer.email;
        const nome = paymentData.payer.first_name || 'Cliente';
        const db = lerDB();

        if (!db.find(u => u.email.toLowerCase() === email.toLowerCase())) {
          const senha = gerarSenha();
          db.push({ nome, email, senha, criadoEm: new Date().toISOString() });
          salvarDB(db);

          await transporter.sendMail({
            from: `"DrinkMaster" <${process.env.GMAIL_USER}>`,
            to: email,
            subject: '🍹 Pagamento confirmado! Seu acesso ao DrinkMaster chegou.',
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0a0e1a; color: #ffffff; border-radius: 10px;">
                <h1 style="color: #d4af37; text-align: center;">DrinkMaster</h1>
                <p>Olá, <strong>${nome}</strong>!</p>
                <p>Seu pagamento foi confirmado com sucesso. Aqui estão os seus dados de acesso:</p>
                <div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px; margin: 20px 0;">
                  <p><strong>E-mail:</strong> ${email}</p>
                  <p><strong>Senha:</strong> <span style="background: #d4af37; color: #000; padding: 2px 8px; border-radius: 4px; font-size: 1.2em; font-weight: bold;">${senha}</span></p>
                </div>
                <p style="text-align: center; margin: 30px 0;">
                  <a href="https://drinkmaster.onrender.com/app" style="background: #d4af37; color: #000; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">Acessar o DrinkMaster</a>
                </p>
              </div>
            `
          });
        }
      }
    } catch (error) {
      console.error('Erro ao processar webhook:', error);
    }
  }
  res.status(200).send('OK');
});

app.listen(PORT, () => {
  console.log(`🍹 DrinkMaster rodando em http://localhost:${PORT}`);
});