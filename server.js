const express = require('express');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

// BANCO DE DADOS LOCAL (Para o Render)
const DB_FILE = path.join(__dirname, 'usuarios.json');
const lerDB = () => fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : [];
const salvarDB = (dados) => fs.writeFileSync(DB_FILE, JSON.stringify(dados, null, 2));

// CONFIG MERCADO PAGO
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const preference = new Preference(client);

// CONFIG GMAIL
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
});

function gerarSenha() { return crypto.randomBytes(4).toString('hex'); }

// ROTAS DE TELAS
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'app.html')));

// ROTA QUE GERA O PIX REAL
app.post('/api/comprar', async (req, res) => {
  const { nome, email } = req.body;
  try {
    const result = await preference.create({
      body: {
        items: [{ id: 'acesso', title: 'DrinkMaster', quantity: 1, unit_price: 19.90, currency_id: 'BRL' }],
        payer: { name: nome, email: email },
        back_urls: { success: 'https://drinkmaster.onrender.com/app', failure: 'https://drinkmaster.onrender.com/' },
        auto_return: 'approved',
        notification_url: 'https://drinkmaster.onrender.com/webhook'
      }
    });
    res.json({ link: result.init_point });
  } catch (e) { res.status(500).json({ erro: 'Erro no pagamento' }); }
});

// ROTA QUE O MERCADO PAGO AVISA (WEBHOOK SEGURO)
app.post('/webhook', async (req, res) => {
  const { type, data } = req.body;
  if (type === 'payment') {
    try {
      const payment = new Payment(client);
      const pData = await payment.get({ id: data.id });
      
      if (pData.status === 'approved') {
        const email = pData.payer.email;
        const nome = pData.payer.first_name || 'Cliente';
        const db = lerDB();
        
        if (!db.find(u => u.email === email)) {
          const senha = gerarSenha();
          db.push({ nome, email, senha });
          salvarDB(db);
          
          await transporter.sendMail({
            from: `"DrinkMaster" <${process.env.GMAIL_USER}>`,
            to: email,
            subject: 'Seu acesso ao DrinkMaster chegou!',
            html: `<h1>Pagamento Confirmado!</h1><p>Seu login é: <b>${email}</b><br>Sua senha é: <b>${senha}</b></p><a href="https://drinkmaster.onrender.com/app">Acessar App</a>`
          });
        }
      }
    } catch (err) { console.error(err); }
  }
  res.status(200).send('OK');
});

// LOGIN DO APP
app.post('/api/login', (req, res) => {
  const { email, senha } = req.body;
  const db = lerDB();
  const user = db.find(u => u.email === email && u.senha === senha);
  if (user) res.json({ ok: true });
  else res.status(401).json({ erro: 'Login inválido' });
});

// LER OS DRINKS (Funciona com o nome que o Windows deu)
app.get('/api/drinks', (req, res) => {
  try {
    const files = fs.readdirSync(__dirname);
    const jsonFile = files.find(f => f.endsWith('.json') && f.includes('deepseek'));
    if (jsonFile) {
      const drinks = JSON.parse(fs.readFileSync(path.join(__dirname, jsonFile), 'utf8'));
      return res.json(drinks);
    }
    res.json([]);
  } catch { res.json([]); }
});

app.listen(process.env.PORT || 3000, () => console.log('Servidor Rodando'));