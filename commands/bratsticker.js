// commands/bratsticker.js
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { exec } = require('child_process');

/** ========= THEME / BRAND ========= */
const BRAND = 'Andika Bot';
const ICON = { stk: '🧩', tip: '✨', err: '❌' };
const HEAD = (title) =>
`╭─〔 ${title} 〕
│ ${BRAND}
╰──────────────────`;

/** ===== Channel badge (forwarded from channel) ===== */
const channelInfo = {
  contextInfo: {
    forwardingScore: 1,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: '120363421594431163@newsletter',
      newsletterName: BRAND,
      serverMessageId: -1
    }
  }
};

/** ===== Helpers ===== */
function ensureTmp() {
  const dir = path.join(__dirname, '..', 'tmp');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
async function showTyping(sock, chatId){
  try {
    await sock.presenceSubscribe(chatId);
    await sock.sendPresenceUpdate('composing', chatId);
    await sleep(600);
  } catch {}
}
function getArgsFrom(message, rawAfterCmd) {
  const direct = (rawAfterCmd || '').trim();
  if (direct) return direct;
  const q =
    message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation ||
    message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text ||
    message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage?.caption ||
    message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage?.caption ||
    '';
  return (q || '').trim();
}

/** Convert gambar (JPG/PNG/WebP apapun) → WebP 512×512 transparan, siap jadi sticker */
function toWebpSticker(inPath, outPath) {
  return new Promise((resolve, reject) => {
    // Pastikan kanvas 512×512, pertahankan rasio, transparansi OK
    const cmd =
      `ffmpeg -y -i "${inPath}" ` +
      `-vf "scale=512:512:force_original_aspect_ratio=decrease,` +
      `pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,format=rgba" ` +
      `-vcodec libwebp -lossless 1 -compression_level 6 -q:v 60 -loop 0 -an -vsync 0 "${outPath}"`;
    exec(cmd, (err) => err ? reject(err) : resolve(outPath));
  });
}

/** Bantuan */
function helpText(){
  return [
    HEAD(`${ICON.stk} Brat Sticker`),
    'Create WhatsApp style *Brat* stickers dari teks.',
    '',
    '*Cara pakai:*',
    '• *.brat <teks>*',
    '  _cth:_ *.brat halo dunia*',
    '• Atau balas teks dengan: *.brat*',
    '',
    `${ICON.tip} Hasil dikirim langsung sebagai *stiker* (WebP).`,
  ].join('\n');
}

/** ====== MAIN COMMAND ====== */
async function bratstickerCommand(sock, chatId, message, rawArgs) {
  try {
    await showTyping(sock, chatId);

    const text = getArgsFrom(message, rawArgs);
    if (!text) {
      await sock.sendMessage(chatId, { text: helpText(), ...channelInfo }, { quoted: message });
      return;
    }

    const url = `https://zelapioffciall.koyeb.app/imagecreator/bratv2?text=${encodeURIComponent(text)}`;
    const res = await fetch(url, { method: 'GET', timeout: 30_000 });
    if (!res || !res.ok) throw new Error(`HTTP ${res?.status || 'ERR'} saat panggil API`);

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    const buf = await res.buffer();
    console.log('[brat-sticker] content-type =', contentType || '(unknown)');

    const tmpDir = ensureTmp();
    const stamp = Date.now();
    const base = path.join(tmpDir, `brat-stk-${stamp}`);

    // Simpan response ke file input
    let inPath;
    if (contentType.includes('image/webp')) {
      inPath = `${base}.webp`;
    } else if (contentType.includes('png')) {
      inPath = `${base}.png`;
    } else {
      inPath = `${base}.jpg`; // fallback umum
    }
    fs.writeFileSync(inPath, buf);

    // Selalu hasilkan WebP sticker (walau input sudah WebP, tetap normalisasi ke kanvas 512)
    const outPath = `${base}.webp`;
    await toWebpSticker(inPath, outPath);

    // Kirim sebagai STIKER
    await sock.sendMessage(
      chatId,
      { sticker: fs.readFileSync(outPath), ...channelInfo },
      { quoted: message }
    );

    // Beres-bersih
    try { fs.unlinkSync(inPath); } catch {}
    try { fs.unlinkSync(outPath); } catch {}

  } catch (err) {
    console.error('bratstickerCommand error:', err);
    const card = [
      HEAD(`${ICON.err} Gagal membuat Brat Sticker`),
      'Terjadi gangguan konversi ke stiker. Coba lagi sebentar ya.',
    ].join('\n');
    await sock.sendMessage(chatId, { text: card, ...channelInfo }, { quoted: message });
  } finally {
    try { await sock.sendPresenceUpdate('paused', chatId); } catch {}
  }
}

module.exports = { bratstickerCommand };
