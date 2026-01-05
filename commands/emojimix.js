const fetch = require('node-fetch');
const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');

async function emojimixCommand(sock, chatId, msg) {
    try {
        // Ambil teks setelah command
        const text = msg.message?.conversation?.trim() || 
                    msg.message?.extendedTextMessage?.text?.trim() || '';
        
        const args = text.split(' ').slice(1);
        
        if (!args[0]) {
            await sock.sendMessage(chatId, { text: '🎴 *Contoh:* .emojimix 😎+🥰' });
            return;
        }

        if (!text.includes('+')) {
            await sock.sendMessage(chatId, { 
                text: '✳️ *Pisahkan emoji dengan tanda* `+`\n\n📌 *Contoh:*\n*.emojimix* 😎+🥰' 
            });
            return;
        }

        let [emoji1, emoji2] = args[0].split('+').map(e => e.trim());

        // Tenor API endpoint
        const url = `https://tenor.googleapis.com/v2/featured?key=AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ&contentfilter=high&media_filter=png_transparent&component=proactive&collection=emoji_kitchen_v5&q=${encodeURIComponent(emoji1)}_${encodeURIComponent(emoji2)}`;

        const response = await fetch(url);
        const data = await response.json();

        if (!data.results || data.results.length === 0) {
            await sock.sendMessage(chatId, { 
                text: '❌ *Emoji tersebut tidak bisa dicampur.* Coba kombinasi lain ya.' 
            });
            return;
        }

        // Ambil URL hasil pertama
        const imageUrl = data.results[0].url;

        // Buat folder tmp jika belum ada
        const tmpDir = path.join(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }

        // Nama file sementara
        const tempFile = path.join(tmpDir, `temp_${Date.now()}.png`).replace(/\\/g, '/');
        const outputFile = path.join(tmpDir, `sticker_${Date.now()}.webp`).replace(/\\/g, '/');

        // Unduh gambar
        const imageResponse = await fetch(imageUrl);
        const buffer = await imageResponse.buffer();
        fs.writeFileSync(tempFile, buffer);

        // Konversi ke WebP via ffmpeg
        const ffmpegCommand = `ffmpeg -i "${tempFile}" -vf "scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" "${outputFile}"`;
        
        await new Promise((resolve, reject) => {
            exec(ffmpegCommand, (error) => {
                if (error) {
                    console.error('FFmpeg error:', error);
                    reject(error);
                } else {
                    resolve();
                }
            });
        });

        // Pastikan file jadi
        if (!fs.existsSync(outputFile)) {
            throw new Error('Failed to create sticker file');
        }

        // Kirim stiker
        const stickerBuffer = fs.readFileSync(outputFile);
        await sock.sendMessage(chatId, { 
            sticker: stickerBuffer 
        }, { quoted: msg });

        // Bersihkan file sementara
        try {
            fs.unlinkSync(tempFile);
            fs.unlinkSync(outputFile);
        } catch (err) {
            console.error('Error cleaning up temp files:', err);
        }

    } catch (error) {
        console.error('Error in emojimix command:', error);
        await sock.sendMessage(chatId, { 
            text: '❌ *Gagal mencampur emoji!* Pastikan kamu pakai emoji yang valid.\n\n📌 *Contoh:* .emojimix 😎+🥰' 
        });
    }
}

module.exports = emojimixCommand;
