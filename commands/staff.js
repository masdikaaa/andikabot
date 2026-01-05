async function staffCommand(sock, chatId, msg) {
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

        // Dapatkan admin dari peserta
        const participants = groupMetadata.participants;
        const groupAdmins = participants.filter(p => p.admin);
        const listAdmin = groupAdmins.map((v, i) => `${i + 1}. @${v.id.split('@')[0]}`).join('\n▢ ');
        
        // Pemilik grup
        const owner = groupMetadata.owner || groupAdmins.find(p => p.admin === 'superadmin')?.id || chatId.split('-')[0] + '@s.whatsapp.net';

        // Teks daftar admin (Bahasa Indonesia)
        const text = `
≡ *ADMIN GRUP* _${groupMetadata.subject}_

┌─⊷ *DAFTAR ADMIN* 🛡️
▢ ${listAdmin}
└───────────
`.trim();

        // Kirim pesan dengan gambar & mention
        await sock.sendMessage(chatId, {
            image: { url: pp },
            caption: text,
            mentions: [...groupAdmins.map(v => v.id), owner]
        });

    } catch (error) {
        console.error('Error in staff command:', error);
        await sock.sendMessage(chatId, { text: '❌ Gagal mengambil daftar admin!' });
    }
}

module.exports = staffCommand;
