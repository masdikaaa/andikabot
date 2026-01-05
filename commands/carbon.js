// commands/carbon.js
const fetch = require('node-fetch');

/** ===== Channel forward badge (opsional) ===== */
let channelInfo = {};
try {
  const cfg = require('../lib/messageConfig');
  if (cfg?.channelInfo) channelInfo = cfg.channelInfo;
} catch {}
if (!channelInfo.contextInfo) {
  channelInfo = {
    contextInfo: {
      forwardingScore: 1,
      isForwarded: true,
      forwardedNewsletterMessageInfo: {
        newsletterJid: '120363421594431163@newsletter',
        newsletterName: 'Andika Bot',
        serverMessageId: -1
      }
    }
  };
}

/** ===== Helpers ===== */
function getTextFromMsg(message){
  return (
    message?.message?.conversation ||
    message?.message?.extendedTextMessage?.text ||
    message?.message?.imageMessage?.caption ||
    message?.message?.videoMessage?.caption ||
    ''
  );
}
function getQuotedText(message){
  const q =
    message?.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
    message?.message?.imageMessage?.contextInfo?.quotedMessage ||
    message?.message?.videoMessage?.contextInfo?.quotedMessage ||
    null;
  if (!q) return '';
  return (
    q.conversation ||
    q.extendedTextMessage?.text ||
    q.imageMessage?.caption ||
    q.videoMessage?.caption ||
    ''
  );
}
function stripCodeFence(s) {
  let txt = String(s || '');
  // hapus ```lang\n...\n``` atau ```\n...\n```
  const m = txt.match(/^\s*```[\w+-_.#]*\s*([\s\S]*?)\s*```\s*$/);
  if (m) return m[1];
  // hapus fence satu baris (```code```)
  const m2 = txt.match(/^\s*```([\s\S]*?)```\s*$/);
  if (m2) return m2[1];
  return txt;
}
async function showTyping(sock, chatId){
  try {
    await sock.presenceSubscribe(chatId);
    await sock.sendPresenceUpdate('composing', chatId);
    await new Promise(r=>setTimeout(r, 500));
  } catch {}
}

/** ===== Parsers =====
 * Mendukung:
 * - ".carbon\n<kode>"
 * - ".carbon <kode>"
 * - reply pesan berisi kode → ".carbon"
 * - blok ```fence```
 */
function extractCodeFromCommand(rawAll) {
  const raw = String(rawAll || '');
  // ambil semua teks setelah ".carbon" (termasuk newline berikutnya)
  const m = raw.match(/^\s*\.carbon\b[\t ]*(?:\r?\n)?([\s\S]*?)$/i);
  if (m) return m[1] || '';
  return '';
}

/** ===== MAIN COMMAND ===== */
async function carbonCommand(sock, chatId, message) {
  try {
    await showTyping(sock, chatId);

    const raw = getTextFromMsg(message);
    const quoted = getQuotedText(message);

    let code = '';
    if (quoted && !/^\s*\.carbon\b/i.test(raw)) {
      // kalau balas pesan & commandnya cuma ".carbon"
      code = quoted;
    } else {
      code = extractCodeFromCommand(raw);
      if (!code && quoted) code = quoted; // fallback
    }
    code = stripCodeFence(code).trim();

    if (!code) {
      // Usage/help dengan EMOJI + contoh
      await sock.sendMessage(chatId, {
        text:
`🖼️ *Carbon Code Image*
Bikin gambar kode cantik dari *kode apa pun* (auto-detect bahasa) ✨

*Cara pakai:*
1) Ketik:
.carbon

<tempel semua kode di sini>

2) Atau *balas/reply* pesan yang berisi kode, lalu ketik:
.carbon

*Contoh singkat:*
.carbon

print("Hello Carbon! 💚")

*Contoh multi-baris (JS):*
.carbon

const add = (a,b) => a+b
console.log(add(2,3)) // 👉 5

*Contoh pakai block fence:*
.carbon
\`\`\`python
for i in range(3):
    print(i)
\`\`\`

🔎 Tips:
• Nggak perlu tulis nama bahasanya - otomatis ke-detect.
• Bisa kode panjang (multi-line).`,
        ...channelInfo
      }, { quoted: message });
      try { await sock.sendMessage(chatId, { react: { text: '📌', key: message.key } }); } catch {}
      return;
    }

    // kirim ke endpoint (auto detect bahasa dilakukan oleh Carbon)
    const url = `https://zelapioffciall.koyeb.app/imagecreator/carbon?input=${encodeURIComponent(code)}`;

    const res = await fetch(url, { method:'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.buffer();

    await sock.sendMessage(chatId, {
      image: buf,
      caption: '🖼️ *Carbon Code Image* - selesai! ✅',
      ...channelInfo
    }, { quoted: message });

    try { await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } }); } catch {}

  } catch (err) {
    console.error('carbonCommand error:', err);
    await sock.sendMessage(chatId, { text: '❌ Gagal membuat Carbon image. Coba lagi ya.', ...channelInfo }, { quoted: message });
    try { await sock.sendMessage(chatId, { react: { text: '⚠️', key: message.key } }); } catch {}
  } finally {
    try { await sock.sendPresenceUpdate('paused', chatId); } catch {}
  }
}

module.exports = { carbonCommand };
