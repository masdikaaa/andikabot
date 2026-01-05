// commands/imagine.js
const axios = require('axios');

// ====== Channel badge (opsional, biar ada forwarded badge) ======
let channelInfo = {};
try {
  const cfg = require('../lib/messageConfig');
  if (cfg?.channelInfo) channelInfo = cfg.channelInfo;
} catch {}

// Ambil teks mentah dari berbagai tipe pesan
function getRawText(m) {
  const msg = m?.message || {};
  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    ''
  ).trim();
}

// Ambil teks dari reply kalau ada
function getQuotedText(m) {
  const q = m?.message?.extendedTextMessage?.contextInfo?.quotedMessage || {};
  return (
    q.conversation ||
    q.extendedTextMessage?.text ||
    q.imageMessage?.caption ||
    q.videoMessage?.caption ||
    ''
  ).trim();
}

// Hilangkan prefix (.imagine | .flux | .dalle) lalu ambil sisa prompt
function extractUserPrompt(rawText) {
  if (!rawText) return '';
  const firstWord = rawText.split(/\s+/)[0].toLowerCase();
  const isCmd = ['.imagine', '.flux', '.dalle'].includes(firstWord);
  if (!isCmd) return rawText.trim();
  const rest = rawText.slice(firstWord.length).trim();
  return rest || '';
}

/**
 * Expand Bahasa Indonesia ke deskripsi yg lebih terstruktur (tanpa random)
 * - Tetap mempertahankan prompt asli user
 * - Tambahkan penjelasan teknis yg sering membantu model
 * - Negative prompt untuk kurangi artefak
 */
function buildExpandedPrompt(userPrompt) {
  // Deteksi ringan Bahasa Indonesia (heuristik)
  const isIndo = / (yang|dengan|dan|serta|di|ke|pada|dalam|warna|gaya|realistis|anime|ilustrasi|potret|latar|langit|matahari|malam|siang|pemandangan|pegunungan|laut|pantai|kota|jalan|kamera|close ?up|wide)/i.test(userPrompt);

  // Pemetaan kata kunci ID -> token styling EN (opsional, ringan)
  const mapTokens = [];
  const lower = userPrompt.toLowerCase();

  if (/(realistis|realistic|fotoreal|foto realist)/.test(lower)) mapTokens.push('photo-realistic, natural skin tones');
  if (/(anime|manga|kartun|2d)/.test(lower)) mapTokens.push('anime style, clean lineart, vibrant colors');
  if (/(ilustrasi|ilustrasi detail|digital painting|lukisan)/.test(lower)) mapTokens.push('highly detailed digital painting');
  if (/(sinema|cinematic|drama|film)/.test(lower)) mapTokens.push('cinematic lighting, depth of field');
  if (/(malam|night)/.test(lower)) mapTokens.push('night scene, soft rim light');
  if (/(senja|sunset|matahari terbenam)/.test(lower)) mapTokens.push('golden hour, warm tones');
  if (/(pagi|sunrise|matahari terbit)/.test(lower)) mapTokens.push('sunrise lighting, gentle soft light');
  if (/(pegunungan|gunung)/.test(lower)) mapTokens.push('mountain landscape, atmospheric perspective');
  if (/(pantai|laut|ocean|beach)/.test(lower)) mapTokens.push('coastal scene, specular highlights');
  if (/(kota|city|urban|jalan)/.test(lower)) mapTokens.push('urban scene, ambient occlusion');
  if (/(portrait|potret|close ?up)/.test(lower)) mapTokens.push('portrait, sharp focus on eyes, bokeh background');
  if (/(wide|wide ?shot|landscape)/.test(lower)) mapTokens.push('wide shot, balanced composition');
  if (/(makro|macro)/.test(lower)) mapTokens.push('macro shot, extreme detail, shallow depth of field');

  // Kualitas tetap (tidak random, supaya stabil & konsisten)
  const quality = [
    'high detail',
    'sharp focus',
    'clean edges',
    'well-balanced composition'
  ];

  // “Prompt final” = prompt user + styling EN + quality
  // Untuk model yang support, memberi konteks EN bisa meningkatkan “ketepatan”
  // meski input asli ID tetap dipakai.
  const styleLine = mapTokens.length ? `Style hints: ${mapTokens.join(', ')}.` : '';
  const qualityLine = `Quality: ${quality.join(', ')}.`;

  // Negative prompt standar (umum dipakai berbagai model)
  const negative = [
    'lowres', 'blurry', 'noisy', 'pixelated', 'jpeg artifacts',
    'overexposed', 'underexposed', 'bad anatomy', 'deformed', 'disfigured',
    'duplicate', 'watermark', 'text', 'logo'
  ];

  // Jika user pakai Bahasa Indonesia, beri catatan bahasa (bantu model paham konteks)
  const langHint = isIndo
    ? 'Language note: The main subject is described in Indonesian; focus on semantics, not literal wording.'
    : '';

  const finalPrompt =
`${userPrompt}

${styleLine}
${qualityLine}
${langHint}
Negative prompt: ${negative.join(', ')}.`;

  return finalPrompt.trim();
}

async function imagineCommand(sock, chatId, message) {
  try {
    // Ambil prompt: dari inline, baris bawah, atau reply
    const raw = getRawText(message);
    let userPrompt = extractUserPrompt(raw);
    if (!userPrompt) {
      const q = getQuotedText(message);
      if (q) userPrompt = q;
    }

    if (!userPrompt) {
      await sock.sendMessage(chatId, {
        text:
`🎨 *Image Generator*
Kirim prompt setelah perintah, atau balas pesan yang berisi prompt.

Contoh:
• *.imagine matahari terbenam di pegunungan, nuansa hangat*
• *.flux ilustasi kucing bergaya anime, ekspresi lucu*
• *.dalle potret realistis kakek tersenyum, soft bokeh*

Tips: pakai detail jelas (objek, suasana, gaya, sudut pandang).`,
        ...channelInfo
      }, { quoted: message });
      return;
    }

    // Beri notifikasi proses
    await sock.sendMessage(chatId, {
      text: '🧪 Sedang membuat gambar berdasarkan prompt kamu…',
      ...channelInfo
    }, { quoted: message });

    // Bangun prompt final yang terstruktur (tanpa random)
    const finalPrompt = buildExpandedPrompt(userPrompt);

    // Panggil API (pakai endpoint kamu)
    // NOTE: kamu bisa ganti endpoint di sini. Tetap pakai yang sama biar kompatibel.
    const url = `https://shizoapi.onrender.com/api/ai/imagine?apikey=shizo&query=${encodeURIComponent(finalPrompt)}`;
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 120000 });

    const imgBuffer = Buffer.from(res.data);

    await sock.sendMessage(chatId, {
      image: imgBuffer,
      caption:
`🎨 *Hasil Gambar*

📝 *Prompt asli:*
${userPrompt}

🧠 *Expanded (ringkas):*
${finalPrompt.split('\n').slice(0,4).join('\n')} …`,
      ...channelInfo
    }, { quoted: message });
  } catch (err) {
    console.error('Error imagineCommand:', err?.message || err);
    await sock.sendMessage(chatId, {
      text: '❌ Gagal membuat gambar. Coba perjelas prompt (objek, gaya, suasana, sudut).',
      ...channelInfo
    }, { quoted: message });
  }
}

module.exports = imagineCommand;
