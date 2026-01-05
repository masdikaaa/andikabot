const yts = require('yt-search');
const axios = require('axios');

async function playCommand(sock, chatId, message) {
    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text;
        const searchQuery = text.split(' ').slice(1).join(' ').trim();
        
        if (!searchQuery) {
            return await sock.sendMessage(chatId, { 
                text: "🎵 *Mau download lagu apa?* Ketik judulnya ya."
            });
        }

        // Cari lagunya
        const { videos } = await yts(searchQuery);
        if (!videos || videos.length === 0) {
            return await sock.sendMessage(chatId, { 
                text: "❌ *Lagu tidak ditemukan!* Coba judul lain ya."
            });
        }

        // Pesan loading
        await sock.sendMessage(chatId, {
            text: "_⏳ Mohon tunggu, proses download sedang berjalan..._"
        });

        // Ambil video pertama
        const video = videos[0];
        const urlYt = video.url;

        // Ambil audio dari API
        const response = await axios.get(`https://apis-keith.vercel.app/download/dlmp3?url=${urlYt}`);
        const data = response.data;

        if (!data || !data.status || !data.result || !data.result.downloadUrl) {
            return await sock.sendMessage(chatId, { 
                text: "⚠️ *Gagal mengambil audio dari API.* Coba lagi nanti ya."
            });
        }

        const audioUrl = data.result.downloadUrl;
        const title = data.result.title;

        // Kirim audio
        await sock.sendMessage(chatId, {
            audio: { url: audioUrl },
            mimetype: "audio/mpeg",
            fileName: `${title}.mp3`
        }, { quoted: message });

    } catch (error) {
        console.error('Error in song2 command:', error);
        await sock.sendMessage(chatId, { 
            text: "❌ *Download gagal.* Coba lagi nanti ya."
        });
    }
}

module.exports = playCommand; 

/* Powered by KNIGHT-BOT
   Credits to Keith MD */
