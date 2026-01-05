// commands/resetlink.js
const isAdmin = require('../lib/isAdmin');
const { isSudo } = require('../lib/index');

async function resetlinkCommand(sock, chatId, senderId) {
  try {
    // Metadata grup
    const groupMetadata = await sock.groupMetadata(chatId);
    const participants = groupMetadata.participants || [];
    const groupOwner = groupMetadata.owner;

    // --- Cek hak akses pengirim ---
    let senderIsAdmin = false;
    let botIsAdmin = false;

    try {
      const res = await isAdmin(sock, chatId, senderId);
      senderIsAdmin = !!res.isSenderAdmin;
      botIsAdmin = !!res.isBotAdmin;
    } catch {
      // Fallback scan manual
      const admins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin' || p.isAdmin === true);
      senderIsAdmin = admins.some(p => p.id === senderId);
      const botBase = (sock.user?.id || '').split(':')[0];
      const botJid = botBase.endsWith('@s.whatsapp.net') ? botBase : `${botBase}@s.whatsapp.net`;
      botIsAdmin = admins.some(p => p.id === botJid);
    }

    const senderIsGroupOwner = !!groupOwner && groupOwner === senderId;
    const senderIsSudo = await isSudo(senderId).catch(() => false);

    if (!(senderIsAdmin || senderIsGroupOwner || senderIsSudo)) {
      await sock.sendMessage(chatId, { text: '⛔ *Hanya admin/owner grup (atau sudo) yang bisa memakai perintah ini!*' });
      return;
    }

    if (!botIsAdmin) {
      await sock.sendMessage(chatId, { text: '⚠️ *Bot harus jadi admin dulu untuk reset link grup!*' });
      return;
    }

    // --- Reset invite code & kirim link baru ---
    const newCode = await sock.groupRevokeInvite(chatId); // Baileys: kembalikan kode undangan baru
    const newLink = `https://chat.whatsapp.com/${newCode}`;

    await sock.sendMessage(chatId, {
      text: `✅ *Link grup berhasil di-reset!*\n\n🔗 *Link baru:*\n${newLink}`
    });
  } catch (error) {
    console.error('Error in resetlink command:', error);
    await sock.sendMessage(chatId, { text: '❌ *Gagal mereset link grup.*' });
  }
}

module.exports = resetlinkCommand;
