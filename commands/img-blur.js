const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const axios = require('axios');
const sharp = require('sharp');

async function blurCommand(sock, chatId, message, quotedMessage) {
    try {
        // Ambil gambar yang akan diblur
        let imageBuffer;
        
        if (quotedMessage) {
            // Jika membalas pesan
            if (!quotedMessage.imageMessage) {
                await sock.sendMessage(chatId, { 
                    text: '⚠️ *Harap balas ke pesan gambar terlebih dahulu.*' 
                }, { quoted: message });
                return;
            }
            
            const quoted = {
                message: {
                    imageMessage: quotedMessage.imageMessage
                }
            };
            
            imageBuffer = await downloadMediaMessage(
                quoted,
                'buffer',
                { },
                { }
            );
        } else if (message.message?.imageMessage) {
            // Jika gambar ada di pesan saat ini
            imageBuffer = await downloadMediaMessage(
                message,
                'buffer',
                { },
                { }
            );
        } else {
            await sock.sendMessage(chatId, { 
                text: '⚠️ *Balas gambar atau kirim gambar dengan caption* `.blur`' 
            }, { quoted: message });
            return;
        }

        // Resize & optimasi gambar
        const resizedImage = await sharp(imageBuffer)
            .resize(800, 800, { // Maks 800x800
                fit: 'inside',
                withoutEnlargement: true
            })
            .jpeg({ quality: 80 }) // JPEG kualitas 80%
            .toBuffer();

        // Terapkan efek blur
        const blurredImage = await sharp(resizedImage)
            .blur(10) // Radius blur 10
            .toBuffer();

        // Kirim gambar blur
        await sock.sendMessage(chatId, {
            image: blurredImage,
            caption: '✅ *Gambar berhasil di-blur!*',
            contextInfo: {
                forwardingScore: 1,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363421594431163@newsletter',
                    newsletterName: 'Andika Bot',
                    serverMessageId: -1
                }
            }
        }, { quoted: message });

    } catch (error) {
        console.error('Error in blur command:', error);
        await sock.sendMessage(chatId, { 
            text: '❌ *Gagal memproses blur gambar. Coba lagi nanti ya!*' 
        }, { quoted: message });
    }
}

module.exports = blurCommand;
