const isAdmin = require('../lib/isAdmin');

async function groupInfoCommand(sock, chatId, msg) {
  try {
    // Ambil metadata grup
    const groupMetadata = await sock.groupMetadata(chatId);

    // Foto profil grup
    let pp;
    try {
      pp = await sock.profilePictureUrl(chatId, 'image');
    } catch {
      pp = 'https://i.imgur.com/2wzGhpF.jpeg'; // Gambar default
    }

    // Peserta & admin
    const participants = groupMetadata.participants || [];
    const groupAdmins = participants.filter(p => p.admin);
    const listAdmin =
      groupAdmins.map((v, i) => `${i + 1}. @${String(v.id).split('@')[0]}`).join('\n') || '-';

    // Owner grup
    const owner =
      groupMetadata.owner ||
      groupAdmins.find(p => p.admin === 'superadmin')?.id ||
      (chatId.split('-')[0] + '@s.whatsapp.net');

    // Normalisasi bot JID
    const rawBotId = sock.user?.id || '';
    const baseBot = rawBotId.split(':')[0];
    const botJid = baseBot.endsWith('@s.whatsapp.net') ? baseBot : `${baseBot}@s.whatsapp.net`;

    // Deteksi bot admin — primary via helper, fallback via scanning participants
    let botIsAdmin = false;
    try {
      const res = await isAdmin(sock, chatId, botJid);
      botIsAdmin = !!res.isBotAdmin;
    } catch {}

    if (!botIsAdmin) {
      const me = participants.find(
        p =>
          p.id === botJid &&
          (p.admin === 'admin' ||
            p.admin === 'superadmin' ||
            p.isAdmin === true ||
            p?.admin?.toString()?.length > 0)
      );
      botIsAdmin = !!me;
    }

    // Ambil link undangan (hanya jika bot admin)
    let groupLink = 'Bot bukan admin — tidak bisa melihat link.';
    if (botIsAdmin) {
      try {
        const code = await sock.groupInviteCode(chatId);
        if (code) groupLink = `https://chat.whatsapp.com/${code}`;
      } catch {
        groupLink = 'Gagal mengambil link grup.';
      }
    }

    // Teks info
    const text = `
┌──「 *ℹ️ INFO GRUP* 」
▢ *🆔 ID:* 
   • ${groupMetadata.id}
▢ *🔖 Nama:* 
   • ${groupMetadata.subject}
▢ *👥 Anggota:* 
   • ${participants.length}
▢ *👑 Pemilik Grup:* 
   • @${String(owner || '').split('@')[0]}
▢ *🛡️ Admin:* 
${listAdmin}

▢ *🔗 Link Grup:* 
   • ${groupLink}

▢ *📝 Deskripsi:* 
   • ${groupMetadata.desc?.toString() || 'Tidak ada deskripsi'}
`.trim();

    // Kirim dengan gambar & mention
    await sock.sendMessage(chatId, {
      image: { url: pp },
      caption: text,
      mentions: [...groupAdmins.map(v => v.id), owner].filter(Boolean)
    });
  } catch (error) {
    console.error('Error in groupinfo command:', error);
    await sock.sendMessage(chatId, { text: '❌ *Gagal mengambil info grup!*' });
  }
}

module.exports = groupInfoCommand;
