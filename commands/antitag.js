const { setAntitag, getAntitag, removeAntitag } = require('../lib/index');
const isAdmin = require('../lib/isAdmin');

async function handleAntitagCommand(sock, chatId, userMessage, senderId, isSenderAdmin, message) {
    try {
        if (!isSenderAdmin) {
            await sock.sendMessage(
                chatId,
                { text: '🚫 *Khusus Admin Grup!*' },
                { quoted: message }
            );
            return;
        }

        const prefix = '.';
        const args = userMessage.slice(9).toLowerCase().trim().split(' ');
        const action = args[0];

        if (!action) {
            const usage = [
                '🛡️ *PENGATURAN ANTITAG*',
                '',
                `• ${prefix}antitag on`,
                `• ${prefix}antitag set *delete* | *kick*`,
                `• ${prefix}antitag off`,
                `• ${prefix}antitag get`,
            ].join('\n');
            await sock.sendMessage(chatId, { text: usage }, { quoted: message });
            return;
        }

        switch (action) {
            case 'on': {
                const existingConfig = await getAntitag(chatId, 'on');
                if (existingConfig?.enabled) {
                    await sock.sendMessage(
                        chatId,
                        { text: '✅ *_Antitag sudah AKTIF_*' },
                        { quoted: message }
                    );
                    return;
                }
                const result = await setAntitag(chatId, 'on', 'delete');
                await sock.sendMessage(
                    chatId,
                    { text: result ? '✅ *_Antitag berhasil diaktifkan_*' : '❌ *_Gagal mengaktifkan Antitag_*' },
                    { quoted: message }
                );
                break;
            }

            case 'off': {
                await removeAntitag(chatId, 'on');
                await sock.sendMessage(
                    chatId,
                    { text: '🟡 *_Antitag telah dimatikan_*' },
                    { quoted: message }
                );
                break;
            }

            case 'set': {
                if (args.length < 2) {
                    await sock.sendMessage(
                        chatId,
                        { text: `ℹ️ *_Mohon tentukan aksi:_* ${prefix}antitag set *delete* | *kick*` },
                        { quoted: message }
                    );
                    return;
                }
                const setAction = args[1];
                if (!['delete', 'kick'].includes(setAction)) {
                    await sock.sendMessage(
                        chatId,
                        { text: '❌ *_Aksi tidak valid. Pilih:_* *delete* atau *kick*.' },
                        { quoted: message }
                    );
                    return;
                }
                const setResult = await setAntitag(chatId, 'on', setAction);
                await sock.sendMessage(
                    chatId,
                    { text: setResult ? `⚙️ *_Aksi Antitag diatur ke_* *${setAction}*` : '❌ *_Gagal mengatur aksi Antitag_*' },
                    { quoted: message }
                );
                break;
            }

            case 'get': {
                const status = await getAntitag(chatId, 'on');
                const actionConfig = await getAntitag(chatId, 'on');
                const text = [
                    '📋 *_Konfigurasi Antitag_*',
                    `• Status : ${status ? '*ON*' : '*OFF*'}`,
                    `• Aksi   : *${actionConfig ? actionConfig.action : 'Belum diatur'}*`,
                ].join('\n');
                await sock.sendMessage(chatId, { text }, { quoted: message });
                break;
            }

            default: {
                await sock.sendMessage(
                    chatId,
                    { text: `ℹ️ *_Gunakan ${prefix}antitag untuk melihat cara pakai._*` },
                    { quoted: message }
                );
            }
        }
    } catch (error) {
        console.error('Error in antitag command:', error);
        await sock.sendMessage(
            chatId,
            { text: '❌ *_Terjadi kesalahan saat memproses perintah antitag_*' },
            { quoted: message }
        );
    }
}

async function handleTagDetection(sock, chatId, message, senderId) {
    try {
        const antitagSetting = await getAntitag(chatId, 'on');
        if (!antitagSetting || !antitagSetting.enabled) return;

        // Deteksi mention
        const mentions = message.message?.extendedTextMessage?.contextInfo?.mentionedJid ||
                         message.message?.conversation?.match(/@\d+/g) ||
                         [];

        // Hanya proses jika pesan grup & mention banyak
        if (mentions.length > 0 && mentions.length >= 3) {
            const groupMetadata = await sock.groupMetadata(chatId);
            const participants = groupMetadata.participants || [];
            const mentionThreshold = Math.ceil(participants.length * 0.5);

            if (mentions.length >= mentionThreshold) {
                const action = antitagSetting.action || 'delete';

                if (action === 'delete') {
                    await sock.sendMessage(chatId, {
                        delete: {
                            remoteJid: chatId,
                            fromMe: false,
                            id: message.key.id,
                            participant: senderId
                        }
                    });

                    await sock.sendMessage(
                        chatId,
                        { text: '⚠️ *Tagall terdeteksi!* Pesan telah dihapus.' },
                        { quoted: message }
                    );

                } else if (action === 'kick') {
                    await sock.sendMessage(chatId, {
                        delete: {
                            remoteJid: chatId,
                            fromMe: false,
                            id: message.key.id,
                            participant: senderId
                        }
                    });

                    await sock.groupParticipantsUpdate(chatId, [senderId], "remove");

                    await sock.sendMessage(
                        chatId,
                        {
                            text: `🚫 *Antitag Terdeteksi!*\n\n@${senderId.split('@')[0]} telah dikeluarkan karena men-tag semua member.`,
                            mentions: [senderId]
                        },
                        { quoted: message }
                    );
                }
            }
        }
    } catch (error) {
        console.error('Error in tag detection:', error);
    }
}

module.exports = {
    handleAntitagCommand,
    handleTagDetection
};
