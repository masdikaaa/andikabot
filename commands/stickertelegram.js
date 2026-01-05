const fetch = require('node-fetch');
const { writeExifImg } = require('../lib/exif');
const delay = time => new Promise(res => setTimeout(res, time));
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const webp = require('node-webpmux');
const crypto = require('crypto');
const { exec } = require('child_process');
const settings = require('../settings');

async function stickerTelegramCommand(sock, chatId, msg) {
    try {
        // Ambil URL dari pesan
        const text = msg.message?.conversation?.trim() || 
                    msg.message?.extendedTextMessage?.text?.trim() || '';
        
        const args = text.split(' ').slice(1);
        
        if (!args[0]) {
            await sock.sendMessage(chatId, { 
                text: '⚠️ Mohon masukkan URL stiker Telegram!\n\nContoh: *.tg https://t.me/addstickers/Porcientoreal*' 
            });
            return;
        }

        // Validasi format URL
        if (!args[0].match(/(https:\/\/t.me\/addstickers\/)/gi)) {
            await sock.sendMessage(chatId, { 
                text: '❌ URL tidak valid! Pastikan itu adalah URL stiker Telegram.' 
            });
            return;
        }

        // Ambil nama pack dari URL
        const packName = args[0].replace("https://t.me/addstickers/", "");

        // Token bot (harus valid agar bisa akses API Telegram)
        const botToken = '7801479976:AAGuPL0a7kXXBYz6XUSR_ll2SR5V_W6oHl4';
        
        try {
            // Ambil info sticker pack
            const response = await fetch(
                `https://api.telegram.org/bot${botToken}/getStickerSet?name=${encodeURIComponent(packName)}`,
                { 
                    method: "GET",
                    headers: {
                        "Accept": "application/json",
                        "User-Agent": "Mozilla/5.0"
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const stickerSet = await response.json();
            
            if (!stickerSet.ok || !stickerSet.result) {
                throw new Error('Pack stiker tidak valid atau respons API bermasalah');
            }

            // Info awal
            await sock.sendMessage(chatId, { 
                text: `📦 Ditemukan *${stickerSet.result.stickers.length}* stiker.\n⏳ Memulai proses unduh...`
            });

            // Buat folder tmp jika belum ada
            const tmpDir = path.join(process.cwd(), 'tmp');
            if (!fs.existsSync(tmpDir)) {
                fs.mkdirSync(tmpDir, { recursive: true });
            }

            // Proses setiap stiker
            let successCount = 0;
            for (let i = 0; i < stickerSet.result.stickers.length; i++) {
                try {
                    const sticker = stickerSet.result.stickers[i];
                    const fileId = sticker.file_id;
                    
                    // Ambil path file
                    const fileInfo = await fetch(
                        `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`
                    );
                    
                    if (!fileInfo.ok) continue;
                    
                    const fileData = await fileInfo.json();
                    if (!fileData.ok || !fileData.result.file_path) continue;

                    // Unduh stiker
                    const fileUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
                    const imageResponse = await fetch(fileUrl);
                    const imageBuffer = await imageResponse.buffer();

                    // Nama file sementara
                    const tempInput = path.join(tmpDir, `temp_${Date.now()}_${i}`);
                    const tempOutput = path.join(tmpDir, `sticker_${Date.now()}_${i}.webp`);

                    fs.writeFileSync(tempInput, imageBuffer);

                    // Deteksi stiker animasi / video
                    const isAnimated = sticker.is_animated || sticker.is_video;
                    
                    // Konversi ke WebP pakai ffmpeg
                    const ffmpegCommand = isAnimated
                        ? `ffmpeg -i "${tempInput}" -vf "scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality 75 -compression_level 6 "${tempOutput}"`
                        : `ffmpeg -i "${tempInput}" -vf "scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality 75 -compression_level 6 "${tempOutput}"`;

                    await new Promise((resolve, reject) => {
                        exec(ffmpegCommand, (error) => {
                            if (error) {
                                console.error('FFmpeg error:', error);
                                reject(error);
                            } else resolve();
                        });
                    });

                    // Baca file WebP
                    const webpBuffer = fs.readFileSync(tempOutput);

                    // Tambah metadata dengan webpmux
                    const img = new webp.Image();
                    await img.load(webpBuffer);

                    const metadata = {
                        'sticker-pack-id': crypto.randomBytes(32).toString('hex'),
                        'sticker-pack-name': settings.packname,
                        'emojis': sticker.emoji ? [sticker.emoji] : ['🤖']
                    };

                    const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
                    const jsonBuffer = Buffer.from(JSON.stringify(metadata), 'utf8');
                    const exif = Buffer.concat([exifAttr, jsonBuffer]);
                    exif.writeUIntLE(jsonBuffer.length, 14, 4);

                    img.exif = exif;

                    const finalBuffer = await img.save(null);

                    // Kirim stiker
                    await sock.sendMessage(chatId, { 
                        sticker: finalBuffer 
                    });

                    successCount++;
                    await delay(1000); // jeda singkat anti rate-limit

                    // Bersihkan file sementara
                    try {
                        fs.unlinkSync(tempInput);
                        fs.unlinkSync(tempOutput);
                    } catch (err) {
                        console.error('Gagal hapus file sementara:', err);
                    }

                } catch (err) {
                    console.error(`Error saat memproses stiker ke-${i + 1}:`, err);
                    continue;
                }
            }

            // Notif selesai
            await sock.sendMessage(chatId, { 
                text: `✅ Berhasil mengunduh *${successCount}/${stickerSet.result.stickers.length}* stiker!`
            });

        } catch (error) {
            throw new Error(`Gagal memproses pack stiker: ${error.message}`);
        }

    } catch (error) {
        console.error('Error di stickertelegram command:', error);
        await sock.sendMessage(chatId, { 
            text: '❌ Gagal memproses stiker Telegram!\nPastikan:\n1) URL benar\n2) Pack stiker ada\n3) Pack stiker bersifat publik'
        });
    }
}

module.exports = stickerTelegramCommand;
