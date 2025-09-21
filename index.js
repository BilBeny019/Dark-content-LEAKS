require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('❌ BOT_TOKEN não encontrado. Verifique o .env ou variáveis de ambiente.');
  process.exit(1);
}

const USE_WEBHOOK = process.env.USE_WEBHOOK === 'true'; // set true no Render se quiser webhook
const WEBHOOK_PATH = '/telegram-webhook'; // rota que Telegram vai chamar se usar webhook

// rota de ping para UptimeRobot / Render
app.get('/ping', (req, res) => res.send('✅ Bot is online!'));

// inicializa bot: polling (local) ou webhook (Render)
let bot;
if (USE_WEBHOOK) {
  bot = new TelegramBot(token); // sem polling
  app.post(WEBHOOK_PATH, (req, res) => {
    bot.processUpdate(req.body)
      .then(() => res.sendStatus(200))
      .catch(err => {
        console.error('Erro processUpdate:', err);
        res.sendStatus(500);
      });
  });
  console.log('⚙️ Iniciado em modo WEBHOOK. Configure o webhook no Telegram.');
} else {
  bot = new TelegramBot(token, { polling: true });
  console.log('⚙️ Iniciado em modo POLLING.');
}

// ----------------- Catálogo -----------------
const products = {
  'lizzy_and_bro': { name: 'Lizzy And Bro', price: 25, videoUrl: 'https://files.fm/u/fgkpuqf6pm' },
  'savannah': { name: 'Savannah', price: 30, videoUrl: 'https://files.fm/u/8mz72wxtmg' },
  'abbi': { name: 'Abbi', price: 22, videoUrl: 'https://files.fm/f/vg9sk8v6nc' },
  'ivanka_and_bro': { name: 'Ivanka and Bro', price: 32, videoUrl: 'https://files.fm/u/4cc5vnrupu' },
  'mom_and_son': { name: 'Mom and Son', price: 30, videoUrl: 'https://files.fm/f/jyvd7thq36' },
  'omegle': { name: 'Omegle', price: 40, videoUrl: 'https://files.fm/u/thmavn8r6j' },
  'darkzaide': { name: 'Darkzaide', price: 30, videoUrl: 'https://files.fm/u/r6bedx78ty' },
  'real_incest': { name: 'Real incest', price: 40, videoUrl: 'https://files.fm/u/gs2ngwyywb' },
  'desiree_garcia': { name: 'Desiree Garcia', price: 30, videoUrl: 'https://files.fm/u/3tegqj7vtx' },
  'amelia': { name: 'Amelia', price: 35, videoUrl: 'https://files.fm/u/pfssvgaz38' },
  // adicione mais aqui...
};

function formatPrice(v) { return `$${v.toFixed(2)}`; }
const states = {};

// helper: teclado (2 colunas)
function buildProductKeyboard() {
  const keys = Object.keys(products);
  const rows = [];
  for (let i = 0; i < keys.length; i += 2) {
    const row = [];
    const k1 = keys[i];
    row.push({ text: `${products[k1].name} — ${formatPrice(products[k1].price)}`, callback_data: `product_${k1}` });
    if (keys[i + 1]) {
      const k2 = keys[i + 1];
      row.push({ text: `${products[k2].name} — ${formatPrice(products[k2].price)}`, callback_data: `product_${k2}` });
    }
    rows.push(row);
  }
  rows.push([{ text: '🛒 Ver Carrinho', callback_data: 'carrinho' }]);
  return rows;
}

function resetState(chatId) {
  states[chatId] = { step: 'awaiting_product', cart: [] };
}

// ----------------- Handlers -----------------

// start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  resetState(chatId);
  bot.sendMessage(chatId, '👋 Welcome to the dark store! Choose a product below.:', {
    reply_markup: { inline_keyboard: buildProductKeyboard() }
  });
});

// callback
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  if (!states[chatId]) resetState(chatId);
  const st = states[chatId];

  // produto escolhido
  if (data.startsWith('product_')) {
    const key = data.replace('product_', '');
    const prod = products[key];
    st.selected = key;
    st.step = 'awaiting_interest';
    await bot.sendMessage(chatId, `🎬 Preview: ${prod.videoUrl}`);
    await bot.sendMessage(chatId, `💬 Do you want to buy *${prod.name}* for *${formatPrice(prod.price)}* ?`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Yes', callback_data: 'interested_yes' },
            { text: '❌ No', callback_data: 'interested_no' }
          ]
        ]
      }
    });
    return bot.answerCallbackQuery(query.id);
  }

  // interesse
  if (st.step === 'awaiting_interest') {
    if (data === 'interested_yes') {
      st.step = 'awaiting_method';
      await bot.sendMessage(chatId, '💰 Choose payment method:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '💳 PayPal', callback_data: 'method_paypal' }],
            [{ text: '🪙 Binance', callback_data: 'method_binance' }],
            [{ text: '💼 CashApp', callback_data: 'method_cashapp' }],
            [{ text: '🎁 Gift Card', callback_data: 'method_giftcard' }]
          ]
        }
      });
    } else {
      resetState(chatId);
      await bot.sendMessage(chatId, '👌Alright — choose another product with com /start.');
    }
    return bot.answerCallbackQuery(query.id);
  }

  // método
  if (st.step === 'awaiting_method' && data.startsWith('method_')) {
    const method = data.replace('method_', '');
    st.method = method;
    st.step = 'awaiting_confirmation';
    const prod = products[st.selected];
    let reply = `🧾 *Resumo do pedido*\n\n• Produto: *${prod.name}*\n• Preço: *${formatPrice(prod.price)}*\n• Método: *${method.toUpperCase()}*\n\n`;

    if (method === 'paypal') reply += '💳 PayPal\👉 [Contacte o suporte](https://t.me/darksellerboss)\nThen type *confirm*';
    if (method === 'binance') reply += '🪙 Binance\n• BTC: `12avvin2PmX8LcEQVyKr6gFCyVrt5bW9WR`\n• USDT: `0xb5cfe96ed1a089f6e46fd66fdbd2d31c4af4568d`\nThen type *confirm*';
    if (method === 'cashapp') reply += '💼 CashApp\n👉 [Contacte o suporte](https://t.me/darksellerboss)\nThen type *confirm*';
    if (method === 'giftcard') reply += '🎁 Gift Card\n👉 [Contacte o suporte](https://t.me/darksellerboss)\nThen type *confirm*';

    await bot.sendMessage(chatId, reply, { parse_mode: 'Markdown', disable_web_page_preview: false });
    return bot.answerCallbackQuery(query.id);
  }

  // carrinho
  if (data === 'carrinho') {
    const cart = st.cart || [];
    if (cart.length === 0) await bot.sendMessage(chatId, '🛒 Your cart is empty.');
    else await bot.sendMessage(chatId, '🛍️ Carrinho:\n- ' + cart.join('\n- '));
    return bot.answerCallbackQuery(query.id);
  }

  return bot.answerCallbackQuery(query.id);
});

// confirmação textual
bot.on('message', (msg) => {
  if (!msg.text) return;
  const chatId = msg.chat.id;
  const text = msg.text.toLowerCase().trim();
  const st = states[chatId];
  if (!st) return;

  if (st.step === 'awaiting_confirmation' && text === 'confirm') {
    const prod = products[st.selected];
    bot.sendMessage(chatId, `✅ Payment confirmed!\nYou buy *${prod.name}*.\nSend proof for 👉 https://t.me/SELLERBOSS010`, { parse_mode: 'Markdown' });
    resetState(chatId);
  }
});

// express listen

app.listen(PORT, () => console.log(`🌍 App escutando na porta ${PORT}`));


