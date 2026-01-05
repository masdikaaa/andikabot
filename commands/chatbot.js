// commands/chatbot.js
const { setChatbot, getChatbot, removeChatbot } = require('../lib/index');
const isOwner = require('../lib/isOwner');

// In-memory storage for chat history dan user info (biar respons lebih “nyata”)
const chatMemory = {
  messages: new Map(), // { senderId: [last N messages] }
  userInfo: new Map()  // { senderId: { name, age, location } }
};

// Delay acak (2–5s) biar natural
const getRandomDelay = () => Math.floor(Math.random() * 3000) + 2000;

async function showTyping(sock, chatId) {
  try {
    await sock.presenceSubscribe(chatId);
    await sock.sendPresenceUpdate('composing', chatId);
    await new Promise(r => setTimeout(r, getRandomDelay()));
  } catch {}
}

function extractUserInfo(message) {
  const info = {};
  const low = (message || '').toLowerCase();

  if (low.includes('my name is')) {
    info.name = message.split(/my name is/i)[1]?.trim()?.split(/\s+/)[0];
  }
  if (low.includes('i am') && low.includes('years old')) {
    const m = message.match(/\b(\d{1,3})\b/);
    if (m) info.age = m[1];
  }
  if (low.includes('i live in') || low.includes('i am from')) {
    info.location = message.split(/i live in|i am from/i)[1]?.trim()?.split(/[.,!?]/)[0];
  }
  return info;
}

async function handleChatbotCommand(sock, chatId, message, match) {
  // izin: owner/sudo ATAU admin grup
  const senderId = message.key.participant || message.participant || message.key.remoteJid;

  let allow = false;
  try {
    allow = await isOwner(senderId);
  } catch {}

  if (!allow && chatId.endsWith('@g.us')) {
    try {
      const meta = await sock.groupMetadata(chatId);
      const p = meta.participants.find(p => p.id === senderId);
      allow = !!p && (p.admin === 'admin' || p.admin === 'superadmin');
    } catch {
      // kalau gagal ambil metadata, anggap bukan admin
    }
  }

  if (!match) {
    await showTyping(sock, chatId);
    return sock.sendMessage(chatId, {
      text: [
        '╭─〔 🤖 *PENGATURAN CHATBOT* 〕',
        '│ • .chatbot on   → aktifkan',
        '│ • .chatbot off  → nonaktifkan',
        '╰──────────────────────────'
      ].join('\n')
    }, { quoted: message });
  }

  const want = String(match || '').trim().toLowerCase();
  if (!['on', 'off'].includes(want)) {
    await showTyping(sock, chatId);
    return sock.sendMessage(chatId, { text: '⚠️ *Perintah tidak valid.* Ketik *.chatbot* untuk cara pakai.' }, { quoted: message });
  }

  if (!allow) {
    await showTyping(sock, chatId);
    return sock.sendMessage(chatId, { text: '❌ *Hanya owner/sudo atau admin grup yang boleh mengubah status chatbot.*' }, { quoted: message });
  }

  if (want === 'on') {
    await setChatbot(chatId, true);
    await showTyping(sock, chatId);
    return sock.sendMessage(chatId, { text: '✅ *Chatbot diaktifkan untuk grup ini.*' }, { quoted: message });
  } else {
    await removeChatbot(chatId);
    await showTyping(sock, chatId);
    return sock.sendMessage(chatId, { text: '⛔ *Chatbot dimatikan untuk grup ini.*' }, { quoted: message });
  }
}

async function handleChatbotResponse(sock, chatId, message, userMessage, senderId) {
  // === STOP kalau chatbot OFF ===
  const cfg = await getChatbot(chatId);
  if (!cfg || !cfg.enabled) return;

  try {
    const botNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';

    // Harus mention bot ATAU reply ke pesan bot
    let isBotMentioned = false;
    let isReplyToBot = false;

    const xt = message.message?.extendedTextMessage;
    if (xt) {
      const mentionedJid = xt.contextInfo?.mentionedJid || [];
      const quotedParticipant = xt.contextInfo?.participant;
      isBotMentioned = mentionedJid.some(jid => jid === botNumber);
      isReplyToBot = quotedParticipant === botNumber;
    } else if (message.message?.conversation) {
      isBotMentioned = (message.message.conversation || '').includes(`@${botNumber.split('@')[0]}`);
    }

    if (!isBotMentioned && !isReplyToBot) return;

    // Bersihkan mention @bot dari isi
    let cleaned = userMessage || '';
    if (isBotMentioned) cleaned = cleaned.replace(new RegExp(`@${botNumber.split('@')[0]}`, 'g'), '').trim();

    // simpan info & history singkat
    if (!chatMemory.messages.has(senderId)) chatMemory.messages.set(senderId, []);
    if (!chatMemory.userInfo.has(senderId)) chatMemory.userInfo.set(senderId, {});

    const info = extractUserInfo(cleaned);
    if (Object.keys(info).length) {
      chatMemory.userInfo.set(senderId, { ...chatMemory.userInfo.get(senderId), ...info });
    }

    const history = chatMemory.messages.get(senderId);
    history.push(cleaned);
    if (history.length > 20) history.shift();
    chatMemory.messages.set(senderId, history);

    await showTyping(sock, chatId);

    // === panggil API kamu ===
    const prompt = `
Chat natural, singkat (1–2 baris), casual. Hindari ngomong kamu AI.
Context:
${history.join('\n')}

User info:
${JSON.stringify(chatMemory.userInfo.get(senderId) || {}, null, 2)}

User: ${cleaned}
You:
`.trim();

    const fetch = (await import('node-fetch')).default;
    const r = await fetch('https://api.dreaded.site/api/chatgpt?text=' + encodeURIComponent(prompt));
    if (!r.ok) throw new Error('chatgpt api failed');
    const j = await r.json();

    let out = (j.result?.prompt || '').trim()
      .replace(/\n\s*\n/g, '\n')
      .replace(/^You:.*$/gm, '')
      .replace(/^User:.*$/gm, '')
      .trim();

    if (!out) return;

    // delay human-like
    await new Promise(r => setTimeout(r, getRandomDelay()));

    await sock.sendMessage(chatId, { text: out }, { quoted: message });
  } catch (e) {
    console.error('chatbot error:', e.message);
    try {
      await sock.sendMessage(chatId, { text: '😅 Lagi error dikit, coba tanya lagi ya.' }, { quoted: message });
    } catch {}
  }
}

module.exports = {
  handleChatbotCommand,
  handleChatbotResponse
};
