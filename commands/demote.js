// commands/demote.js
const isAdmin = require('../lib/isAdmin');

//
// Helpers aman JID
//
function normalizeJid(p) {
  if (!p) return '';
  if (typeof p === 'string') return p;
  const cand = p.id || p.jid || p.user || p.participant || p.sender || '';
  return typeof cand === 'string' ? cand : '';
}
const baseNum = (jid = '') => String(jid).split('@')[0].split(':')[0].replace(/\D/g, '');
const tag = (jid = '') => `@${String(jid).split('@')[0]}`;

// Jejak eksekutor
const DEMOTE_TRACE = new Map(); // key: groupId, val: { by, at }
const TRACE_TTL_MS = 15000;

//
// 1) Command: demote (tanpa pengumuman di sini)
//
async function demoteCommand(sock, chatId, mentionedJids, message) {
  try {
    if (!chatId.endsWith('@g.us')) {
      await sock.sendMessage(chatId, { text: '⚠️ *Perintah ini hanya bisa dipakai di dalam grup!*' });
      return;
    }

    // Cek admin (bot & pengirim)
    try {
      const who = normalizeJid(message.key?.participant || message.key?.remoteJid);
      const { isBotAdmin, isSenderAdmin } = await isAdmin(sock, chatId, who);
      if (!isBotAdmin) {
        await sock.sendMessage(chatId, { text: '⛔ *Jadikan bot sebagai admin dulu untuk memakai perintah ini.*' });
        return;
      }
      if (!isSenderAdmin) {
        await sock.sendMessage(chatId, { text: '⚠️ *Hanya admin grup yang dapat memakai perintah demote.*' });
        return;
      }
    } catch (e) {
      console.error('Error checking admin status:', e);
      await sock.sendMessage(chatId, { text: '❌ *Gagal mengecek status admin. Pastikan bot adalah admin grup ini.*' });
      return;
    }

    // Target dari mention atau reply
    let userToDemote = [];
    if (mentionedJids && mentionedJids.length > 0) {
      userToDemote = mentionedJids.map(normalizeJid).filter(Boolean);
    } else {
      const ctx = message.message?.extendedTextMessage?.contextInfo;
      const p = normalizeJid(ctx?.participant);
      if (p) userToDemote = [p];
    }

    if (userToDemote.length === 0) {
      await sock.sendMessage(chatId, { text: '⚠️ *Harap mention user atau balas pesannya untuk menurunkan jabatan (demote)!*' });
      return;
    }

    // Simpan jejak eksekutor
    const executorJid = normalizeJid(message.key?.participant || message.key?.remoteJid);
    DEMOTE_TRACE.set(chatId, { by: executorJid, at: Date.now() });

    // Eksekusi
    await new Promise(r => setTimeout(r, 400)); // jeda kecil
    await sock.groupParticipantsUpdate(chatId, userToDemote, 'demote');

    // React sukses
    try { await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } }); } catch {}
  } catch (error) {
    console.error('Error in demote command:', error);
    if (error?.data === 429) {
      await new Promise(r => setTimeout(r, 1500));
      await sock.sendMessage(chatId, { text: '⏳ *Terlalu cepat (rate limit). Coba lagi beberapa detik lagi.*' });
    } else {
      await sock.sendMessage(chatId, { text: '❌ *Gagal melakukan demote. Pastikan bot admin dan punya izin yang cukup.*' });
    }
  }
}

//
// 2) Event: kirim pengumuman sekali, tampilkan eksekutor (bukan bot)
//
async function handleDemotionEvent(sock, groupId, participants, author) {
  try {
    const parts = (participants || []).map(normalizeJid).filter(Boolean);
    if (!groupId || !parts.length) return;

    const botId = normalizeJid(sock.user?.id || '');
    let shownAuthor = normalizeJid(author);

    const authorIsBot = shownAuthor && baseNum(shownAuthor) === baseNum(botId);
    const trace = DEMOTE_TRACE.get(groupId);
    const traceValid = trace && (Date.now() - trace.at) < TRACE_TTL_MS;

    if ((!shownAuthor || authorIsBot) && traceValid) {
      shownAuthor = normalizeJid(trace.by);
      DEMOTE_TRACE.delete(groupId);
    }

    const demotedList = parts.map(jid => `• ${tag(jid)}`).join('\n');
    const byLine = shownAuthor ? `\n\n👑 *Dijalankan oleh:* ${tag(shownAuthor)}` : '';
    const msg =
`*『 🔻 DEMOTE GRUP 🔻 』*

👤 *User yang diturunkan:*
${demotedList}${byLine}

📅 *Waktu:* ${new Date().toLocaleString()}`;

    const mentions = Array.from(new Set([...parts, ...(shownAuthor ? [shownAuthor] : [])]));
    await new Promise(r => setTimeout(r, 400));
    await sock.sendMessage(groupId, { text: msg, mentions });
  } catch (error) {
    console.error('Error handling demotion event:', error);
    if (error?.data === 429) await new Promise(r => setTimeout(r, 1500));
  }
}

module.exports = { demoteCommand, handleDemotionEvent };
