const isAdmin = require('../lib/isAdmin');
const store = require('../lib/lightweight_store');

async function deleteCommand(sock, chatId, message, senderId) {
    try {
        const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);

        if (!isBotAdmin) {
            await sock.sendMessage(chatId, { text: '⛔ *Bot harus menjadi admin untuk menghapus pesan.*' }, { quoted: message });
            return;
        }

        if (!isSenderAdmin) {
            await sock.sendMessage(chatId, { text: '⚠️ *Hanya admin grup yang dapat memakai perintah .delete.*' }, { quoted: message });
            return;
        }

        // Tentukan target user dan jumlah pesan
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
        const parts = text.trim().split(/\s+/);
        let countArg = 1;
        if (parts.length > 1) {
            const maybeNum = parseInt(parts[1], 10);
            if (!isNaN(maybeNum) && maybeNum > 0) countArg = Math.min(maybeNum, 50);
        }

        const ctxInfo = message.message?.extendedTextMessage?.contextInfo || {};
        const mentioned = Array.isArray(ctxInfo.mentionedJid) && ctxInfo.mentionedJid.length > 0 ? ctxInfo.mentionedJid[0] : null;
        const repliedParticipant = ctxInfo.participant || null;

        // Target user: prioritas balasan > mention; jika tidak ada, hentikan
        let targetUser = null;
        let repliedMsgId = null;
        if (repliedParticipant && ctxInfo.stanzaId) {
            targetUser = repliedParticipant;
            repliedMsgId = ctxInfo.stanzaId;
        } else if (mentioned) {
            targetUser = mentioned;
        } else {
            await sock.sendMessage(chatId, { text: '⚠️ *Balas pesan target atau mention user yang ingin dihapus pesannya.*' }, { quoted: message });
            return;
        }

        // Ambil N pesan terakhir dari targetUser di chat ini
        const chatMessages = Array.isArray(store.messages[chatId]) ? store.messages[chatId] : [];
        const toDelete = [];
        const seenIds = new Set();

        // Jika membalas, hapus pesan yang dibalas terlebih dahulu (mengurangi jatah N)
        if (repliedMsgId) {
            const repliedInStore = chatMessages.find(m => m.key.id === repliedMsgId && (m.key.participant || m.key.remoteJid) === targetUser);
            if (repliedInStore) {
                toDelete.push(repliedInStore);
                seenIds.add(repliedInStore.key.id);
            } else {
                // Jika tidak ada di store, tetap coba hapus langsung
                try {
                    await sock.sendMessage(chatId, {
                        delete: {
                            remoteJid: chatId,
                            fromMe: false,
                            id: repliedMsgId,
                            participant: repliedParticipant
                        }
                    });
                    countArg = Math.max(0, countArg - 1);
                } catch {}
            }
        }

        for (let i = chatMessages.length - 1; i >= 0 && toDelete.length < countArg; i--) {
            const m = chatMessages[i];
            const participant = m.key.participant || m.key.remoteJid;
            if (participant === targetUser && !seenIds.has(m.key.id)) {
                // lewati pesan protokol/sistem
                if (!m.message?.protocolMessage) {
                    toDelete.push(m);
                    seenIds.add(m.key.id);
                }
            }
        }

        if (toDelete.length === 0) {
            await sock.sendMessage(chatId, { text: 'ℹ️ *Tidak ditemukan pesan terbaru dari user tersebut.*' }, { quoted: message });
            return;
        }

        // Hapus berurutan dengan jeda kecil
        for (const m of toDelete) {
            try {
                const msgParticipant = m.key.participant || targetUser;
                await sock.sendMessage(chatId, {
                    delete: {
                        remoteJid: chatId,
                        fromMe: false,
                        id: m.key.id,
                        participant: msgParticipant
                    }
                });
                await new Promise(r => setTimeout(r, 300));
            } catch (e) {
                // lanjutkan
            }
        }

        // Opsional: aktifkan jika ingin notifikasi sukses
        // await sock.sendMessage(
        //     chatId,
        //     { text: `🗑️ *Berhasil menghapus ${toDelete.length} pesan* dari @${(targetUser||'').split('@')[0]}`, mentions: [targetUser] },
        //     { quoted: message }
        // );

    } catch (err) {
        await sock.sendMessage(chatId, { text: '❌ *Gagal menghapus pesan.*' }, { quoted: message });
    }
}

module.exports = deleteCommand;
