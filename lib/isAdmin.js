const { jidNormalizedUser } = require('@whiskeysockets/baileys');

// Normalisasi input (string/obj participant) -> "xxx@s.whatsapp.net"
function norm(j) {
  try {
    if (!j) return '';
    if (typeof j === 'string') return jidNormalizedUser(j);
    // kalau object participant
    const cand = j.id || j.jid || j.user || j.phoneNumber || '';
    return cand ? jidNormalizedUser(cand) : '';
  } catch {
    return '';
  }
}

function isAdminFlag(p) {
  const role = p?.admin;
  return role === 'admin' || role === 'superadmin';
}

async function isAdmin(sock, chatId, senderId) {
  try {
    const meta = await sock.groupMetadata(chatId);
    const parts = Array.isArray(meta?.participants) ? meta.participants : [];

    const botJid = jidNormalizedUser(sock.user?.id || '');
    const senderJid = norm(senderId);

    // cari participant berdasarkan JID yg sudah dinormalisasi
    const botPart = parts.find(p => norm(p) === botJid);
    const sndPart = parts.find(p => norm(p) === senderJid);

    // kalau botPart tidak ketemu (bug/lag), jangan block command admin
    const isBotAdmin = botPart ? isAdminFlag(botPart) : true;
    const isSenderAdmin = sndPart ? isAdminFlag(sndPart) : false;

    return { isSenderAdmin, isBotAdmin };
  } catch (e) {
    console.error('Error in isAdmin:', e);
    // fallback aman: jangan matiin perintah karena error metadata
    return { isSenderAdmin: false, isBotAdmin: true };
  }
}

module.exports = isAdmin;
