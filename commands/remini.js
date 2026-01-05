const axios = require('axios');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { uploadImage } = require('../lib/uploadImage');

async function getQuotedOrOwnImageUrl(sock, message) {
    // 1) Quoted image (prioritas tertinggi)
    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (quoted?.imageMessage) {
        const stream = await downloadContentFromMessage(quoted.imageMessage, 'image');
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);
        return await uploadImage(buffer);
    }

    // 2) Gambar di pesan saat ini
    if (message.message?.imageMessage) {
        const stream = await downloadContentFromMessage(message.message.imageMessage, 'image');
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);
        return await uploadImage(buffer);
    }

    return null;
}

async function reminiCommand(sock, chatId, message, args) {
    try {
        let imageUrl = null;
        
        // Cek apakah args berisi URL
        if (args.length > 0) {
            const url = args.join(' ');
            if (isValidUrl(url)) {
                imageUrl = url;
            } else {
                return sock.sendMessage(chatId, { 
                    text: '❌ *URL tidak valid.*\n\n📌 *Cara pakai:* `.remini https://example.com/image.jpg`' 
                }, { quoted: message });
            }
        } else {
            // Coba ambil gambar dari pesan/quoted
            imageUrl = await getQuotedOrOwnImageUrl(sock, message);
            
            if (!imageUrl) {
                return sock.sendMessage(chatId, { 
                    text: '📸 *Perintah Remini AI Enhancement*\n\n*Cara pakai:*\n• `.remini <image_url>`\n• Balas gambar dengan `.remini`\n• Kirim gambar dengan caption `.remini`\n\n*Contoh:* `.remini https://example.com/image.jpg`' 
                }, { quoted: message });
            }
        }

        // Panggil API Remini
        const apiUrl = `https://api.princetechn.com/api/tools/remini?apikey=prince_tech_api_azfsbshfb&url=${encodeURIComponent(imageUrl)}`;
        
        const response = await axios.get(apiUrl, {
            timeout: 60000, // 60 detik
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (response.data && response.data.success && response.data.result) {
            const result = response.data.result;
            
            if (result.image_url) {
                // Unduh gambar hasil enhancement
                const imageResponse = await axios.get(result.image_url, {
                    responseType: 'arraybuffer',
                    timeout: 30000
                });
                
                if (imageResponse.status === 200 && imageResponse.data) {
                    // Kirim gambar hasil
                    await sock.sendMessage(chatId, {
                        image: imageResponse.data,
                        caption: '✨ *Gambar berhasil ditingkatkan!* \n\n_Ditingkatkan oleh KNIGHT-BOT_'
                    }, { quoted: message });
                } else {
                    throw new Error('Failed to download enhanced image');
                }
            } else {
                throw new Error(result.message || 'Failed to enhance image');
            }
        } else {
            throw new Error('API returned invalid response');
        }

    } catch (error) {
        console.error('Remini Error:', error.message);
        
        let errorMessage = '❌ *Gagal meningkatkan kualitas gambar.*';
        
        if (error.response?.status === 429) {
            errorMessage = '⏰ *Terlalu banyak permintaan.* Coba lagi nanti ya.';
        } else if (error.response?.status === 400) {
            errorMessage = '❌ *URL atau format gambar tidak valid.*';
        } else if (error.response?.status === 500) {
            errorMessage = '🔧 *Server bermasalah.* Coba lagi nanti.';
        } else if (error.code === 'ECONNABORTED') {
            errorMessage = '⏰ *Permintaan timeout.* Coba lagi ya.';
        } else if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
            errorMessage = '🌐 *Gangguan jaringan.* Periksa koneksi kamu.';
        } else if (error.message.includes('Error processing image')) {
            errorMessage = '❌ *Proses gambar gagal.* Coba dengan gambar lain.';
        }
        
        await sock.sendMessage(chatId, { 
            text: errorMessage 
        }, { quoted: message });
    }
}

// Helper untuk validasi URL
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

module.exports = { reminiCommand };
