const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { writeExifImg, writeExifVid } = require('../lib/exif');

async function attpCommand(sock, chatId, message) {
  const userMessage = message.message.conversation || message.message.extendedTextMessage?.text || '';
  const text = userMessage.split(' ').slice(1).join(' ');

  if (!text) {
    await sock.sendMessage(
      chatId,
      { text: '⚠️ *Format salah!*\n\nGunakan: *.attp <teks>*\nContoh: *.attp Halo Andika!* ✨' },
      { quoted: message }
    );
    return;
  }

  try {
    const mp4Buffer = await renderBlinkingVideoWithFfmpeg(text);
    const webpPath = await writeExifVid(mp4Buffer, { packname: 'Andika Bot' });
    const webpBuffer = fs.readFileSync(webpPath);
    try { fs.unlinkSync(webpPath) } catch (_) {}
    await sock.sendMessage(chatId, { sticker: webpBuffer }, { quoted: message });
  } catch (error) {
    console.error('Error generating local sticker:', error);
    await sock.sendMessage(
      chatId,
      { text: '❌ *Gagal membuat stiker.*\nCoba lagi dengan teks lebih singkat, lalu ulangi perintah *.attp*.\nJika masih gagal, hubungi admin. 🛠️' },
      { quoted: message }
    );
  }
}

module.exports = attpCommand;

/* =========================
   FONT RESOLVER + ESCAPING
========================= */
function resolveFontPath() {
  // 1) Prioritaskan font lokal di repo (taruh font kamu di assets/fonts/)
  const localCandidates = [
    path.join(__dirname, '../assets/fonts/DejaVuSans-Bold.ttf'),
    path.join(__dirname, '../assets/fonts/Poppins-Bold.ttf'),
    path.join(__dirname, '../assets/fonts/arialbd.ttf'),
  ];

  for (const p of localCandidates) {
    if (fs.existsSync(p)) return p;
  }

  // 2) Sistem Linux umum (Debian/Ubuntu)
  const linuxCandidates = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
    '/usr/share/fonts/truetype/freefont/FreeSans.ttf',
    // Alpine sering di sini:
    '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/TTF/DejaVuSans.ttf',
  ];
  for (const p of linuxCandidates) {
    if (fs.existsSync(p)) return p;
  }

  // 3) Windows
  const winCandidates = [
    'C:/Windows/Fonts/arialbd.ttf',
    'C:/Windows/Fonts/ARIALBD.TTF',
    'C:/Windows/Fonts/segoeuib.ttf',
  ];
  for (const p of winCandidates) {
    if (fs.existsSync(p)) return p;
  }

  // Terakhir: biarkan drawtext coba "Sans" (mungkin gagal)
  return null;
}

function escapeDrawtextText(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/,/g, '\\,')
    .replace(/'/g, "\\'")
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/%/g, '\\%');
}

/* =========================
   RENDER PNG (opsional)
========================= */
function renderTextToPngWithFfmpeg(text) {
  return new Promise((resolve, reject) => {
    const fontPath = resolveFontPath();
    const safeText = escapeDrawtextText(text);
    const safeFontPath = fontPath
      ? (process.platform === 'win32'
          ? fontPath.replace(/\\/g, '/').replace(':', '\\:')
          : fontPath)
      : null;

    // Gunakan fontfile jika ada, kalau tidak pakai font default (Sans) — bisa gagal di Alpine.
    const draw = safeFontPath
      ? `drawtext=fontfile='${safeFontPath}':text='${safeText}':fontcolor=white:fontsize=56:borderw=2:bordercolor=black@0.6:x=(w-text_w)/2:y=(h-text_h)/2`
      : `drawtext=font='Sans':text='${safeText}':fontcolor=white:fontsize=56:borderw=2:bordercolor=black@0.6:x=(w-text_w)/2:y=(h-text_h)/2`;

    const args = [
      '-y',
      '-f', 'lavfi',
      '-i', 'color=c=#00000000:s=512x512',
      '-vf', draw,
      '-frames:v', '1',
      '-f', 'image2',
      'pipe:1'
    ];

    const ff = spawn('ffmpeg', args);
    const chunks = [];
    const errors = [];
    ff.stdout.on('data', d => chunks.push(d));
    ff.stderr.on('data', e => errors.push(e));
    ff.on('error', reject);
    ff.on('close', code => {
      if (code === 0) return resolve(Buffer.concat(chunks));
      reject(new Error(Buffer.concat(errors).toString() || `ffmpeg exited with code ${code}`));
    });
  });
}

/* =========================
   RENDER VIDEO BLINK
========================= */
function renderBlinkingVideoWithFfmpeg(text) {
  return new Promise((resolve, reject) => {
    const fontPath = resolveFontPath();
    const safeText = escapeDrawtextText(text);
    const safeFontPath = fontPath
      ? (process.platform === 'win32'
          ? fontPath.replace(/\\/g, '/').replace(':', '\\:')
          : fontPath)
      : null;

    // Blink cycle
    const cycle = 0.3;
    const dur = 1.8; // 6 cycles

    const baseOpt = `text='${safeText}':borderw=2:bordercolor=black@0.6:fontsize=56:x=(w-text_w)/2:y=(h-text_h)/2`;
    const fontOpt = safeFontPath
      ? `fontfile='${safeFontPath}'`
      : `font='Sans'`; // kalau tidak ada fontfile, coba family Sans (bisa gagal kalau fontconfig/fonts tidak terpasang)

    const drawRed   = `drawtext=${fontOpt}:fontcolor=red:${baseOpt}:enable='lt(mod(t\\,${cycle})\\,0.1)'`;
    const drawBlue  = `drawtext=${fontOpt}:fontcolor=blue:${baseOpt}:enable='between(mod(t\\,${cycle})\\,0.1\\,0.2)'`;
    const drawGreen = `drawtext=${fontOpt}:fontcolor=green:${baseOpt}:enable='gte(mod(t\\,${cycle})\\,0.2)'`;

    const filter = `${drawRed},${drawBlue},${drawGreen}`;

    const args = [
      '-y',
      '-f', 'lavfi',
      '-i', `color=c=black:s=512x512:d=${dur}:r=20`,
      '-vf', filter,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart+frag_keyframe+empty_moov',
      '-t', String(dur),
      '-f', 'mp4',
      'pipe:1'
    ];

    const ff = spawn('ffmpeg', args);
    const chunks = [];
    const errors = [];
    ff.stdout.on('data', d => chunks.push(d));
    ff.stderr.on('data', e => errors.push(e));
    ff.on('error', reject);
    ff.on('close', code => {
      if (code === 0) return resolve(Buffer.concat(chunks));
      reject(new Error(Buffer.concat(errors).toString() || `ffmpeg exited with code ${code}`));
    });
  });
}
