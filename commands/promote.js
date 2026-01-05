// commands/promote.js
const { isAdmin } = require('../lib/isAdmin'); // (tetap dibiarkan)

//
// Helpers aman JID
//
function normalizeJid(p) {
  if (!p) return '';
  if (typeof p === 'string') return p;
  const cand = p.id || p.jid || p.user || p.participant || p.sender || '';
  return typeof cand === 'string' ? cand : '';
}
function baseNum(jid = '') {
  const left = String(jid).split('@')[0];
  return left.split(':')[0].replace(/\D/g, '');
}
function tag(jid = '') { return `@${String(jid).split('@')[0]}`; }

//
// Jejak eksekutor (supaya pengumuman menunjukkan siapa yang mengeksekusi)
//
const PROMOTE_TRACE = new Map(); // key: groupId, val: { by, at }
const TRACE_TTL_MS = 15000;

//
// 1) Command: promote (tanpa pengumuman di sini)
//
async function promoteCommand(sock, chatId, mentionedJids, message) {
  try {
    if (!chatId.endsWith('@g.us')) {
      await sock.sendMessage(chatId, { text: '⚠️ *Perintah ini hanya bisa dipakai di grup!*' }, { quoted: message });
      return;
    }

    // Kumpulkan target (mention atau reply)
    let userToPromote = [];
    if (mentionedJids && mentionedJids.length > 0) {
      userToPromote = mentionedJids.map(normalizeJid).filter(Boolean);
    } else {
      const ctx = message.message?.extendedTextMessage?.contextInfo;
      const p = normalizeJid(ctx?.participant);
      if (p) userToPromote = [p];
    }

    if (!userToPromote.length) {
      await sock.sendMessage(chatId, { text: '⚠️ *Harap mention user atau balas pesannya untuk mempromosikan!*' }, { quoted: message });
      return;
    }

    // Catat eksekutor (yang menjalankan command)
    const executorJid = normalizeJid(message.key?.participant || message.participant || message.key?.remoteJid);
    PROMOTE_TRACE.set(chatId, { by: executorJid, at: Date.now() });

    // Eksekusi promote
    await sock.groupParticipantsUpdate(chatId, userToPromote, "promote");

    // React sukses
    try { await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } }); } catch {}
  } catch (error) {
    console.error('Error in promote command:', error);
    await sock.sendMessage(chatId, { text: '❌ *Gagal mempromosikan user.*' }, { quoted: message });
  }
}

//
// 2) Event: kirim SATU pengumuman, tampilkan eksekutor
//
async function handlePromotionEvent(sock, groupId, participants, author) {
  try {
    // Normalisasi daftar peserta & author
    const parts = (participants || []).map(normalizeJid).filter(Boolean);
    if (!groupId || !parts.length) return;

    const botId = normalizeJid(sock.user?.id || '');
    let shownAuthor = normalizeJid(author);

    // Jika event berasal dari bot (atau author kosong), pakai jejak eksekutor
    const authorIsBot = shownAuthor && baseNum(shownAuthor) === baseNum(botId);
    const trace = PROMOTE_TRACE.get(groupId);
    const traceValid = trace && (Date.now() - trace.at) < TRACE_TTL_MS;

    if ((!shownAuthor || authorIsBot) && traceValid) {
      shownAuthor = normalizeJid(trace.by);
      PROMOTE_TRACE.delete(groupId);
    }

    // Susun pesan
    const promotedList = parts.map(jid => `• ${tag(jid)}`).join('\n');
    const byLine = shownAuthor ? `\n\n👑 *Dijalankan Oleh:* ${tag(shownAuthor)}` : '';
    const dateLine = `\n\n📅 *Tanggal:* ${new Date().toLocaleString()}`;

    const text =
`*『 PROMOSI GRUP 』*

👥 *User yang Dipromosikan:*
${promotedList}${byLine}${dateLine}`;

    // Mentions hanya string JID
    const mentions = Array.from(new Set([...parts, ...(shownAuthor ? [shownAuthor] : [])]));

    await sock.sendMessage(groupId, { text, mentions });
  } catch (error) {
    console.error('Error handling promotion event:', error);
  }
}

module.exports = { promoteCommand, handlePromotionEvent };
