// commands/curl.js — HTTP(S) tester (Andika Bot box style)
// Usage: .curl <url> | .curl -I <url>

'use strict';
const { execFile } = require('child_process');

const TIMEOUT_MS = 15000; // 15 detik
const MAX_BODY   = 2400;  // potong isi body agar tidak flood

function box(title, lines = []) {
  const top = `┏━〔 ${title} 〕━┓`;
  const body = (lines && lines.length ? lines : ['']).map(l => `┊ ${l}`).join('\n');
  const bot = '┗━━━━━━━━━━━━━━━━━━━━━━┛';
  return [top, body, bot].join('\n');
}
function nowID() {
  return new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }) + ' WIB';
}
function looksBinary(s) {
  let nonPrintable = 0;
  for (const ch of String(s)) {
    const c = ch.charCodeAt(0);
    if ((c < 9) || (c > 13 && c < 32)) nonPrintable++;
  }
  return nonPrintable > Math.max(10, String(s).length * 0.02);
}

module.exports = async function curlCommand(sock, chatId, message, args = []) {
  try {
    if (!args.length) {
      const txt = box('🛰️ Cara Pakai .curl', [
        `📅 ${nowID()}`,
        '',
        'Contoh:',
        '• .curl https://example.tld',
        '• .curl -I https://example.tld',
        '',
        'Keterangan:',
        '• -I = HEAD (ambil header saja, lebih ringan)',
      ]);
      await sock.sendMessage(chatId, { text: txt }, { quoted: message });
      return;
    }

    let methodHead = false;
    const cleaned = args.filter(Boolean);
    if (['-I', '--head'].includes(cleaned[0])) {
      methodHead = true;
      cleaned.shift();
    }
    const url = cleaned[0] || '';
    if (!/^https?:\/\//i.test(url)) {
      const txt = box('❌ URL Tidak Valid', [
        'URL harus diawali http:// atau https://',
        '',
        'Contoh benar:',
        '• .curl https://example.tld',
        '• .curl -I http://example.tld',
      ]);
      await sock.sendMessage(chatId, { text: txt }, { quoted: message });
      return;
    }

    const curlArgs = [
      '-sS', '-L', '--max-time', '12',
      '-w', '\n\n[INFO] http_code=%{http_code} time_total=%{time_total}s size=%{size_download}B\n',
      url
    ];
    if (methodHead) curlArgs.unshift('-I');

    execFile('curl', curlArgs, { timeout: TIMEOUT_MS }, async (err, stdout, stderr) => {
      if (err) {
        const enoent = err && err.code === 'ENOENT';
        const msg = enoent
          ? 'Binary *curl* tidak ditemukan di server bot.'
          : (stderr || err.message || 'Tidak diketahui.').toString().slice(0, 800);

        const txt = box('❌ Gagal Menjalankan .curl', [
          `📅 ${nowID()}`,
          '',
          msg,
          '',
          ...(enoent
            ? ['💡 Instalasi: apt-get install curl (Debian/Ubuntu) / yum install curl (RHEL/Alma)']
            : [`💡 Coba HEAD: .curl -I ${url}`]
          ),
        ]);
        await sock.sendMessage(chatId, { text: txt }, { quoted: message });
        return;
      }

      let body = stdout || '';
      let info = '';
      const split = String(body).split('\n[INFO] ');
      if (split.length > 1) {
        body = split.slice(0, -1).join('\n[INFO] ');
        info = '[INFO] ' + split[split.length - 1];
      }

      let preview;
      if (looksBinary(body)) {
        preview = '📦 Konten biner terdeteksi (di-skip). Gunakan -I untuk header saja.';
      } else {
        preview = String(body).trim();
        if (preview.length > MAX_BODY) preview = preview.slice(0, MAX_BODY) + '\n… (dipotong)';
        if (!preview) preview = '(tidak ada body)';
      }

      const status  = (info.match(/http_code=(\d+)/) || [])[1] || '—';
      const timeTot = (info.match(/time_total=([0-9.]+)s/) || [])[1] || '—';
      const size    = (info.match(/size_download=([0-9]+)B/) || [])[1] || '—';

      const lines = [
        `📅 ${nowID()}`,
        `🔗 URL: ${url}`,
        `📥 Status: ${status}   ⏱️ ${timeTot}   📦 ${size}`,
        '',
        '🧾 Output:',
        ...String(preview).split('\n')
      ];

      const txt = box('🛰️ CURL Tester', lines);
      await sock.sendMessage(chatId, { text: txt }, { quoted: message });
    });
  } catch (e) {
    const txt = box('❌ Error .curl', [
      'Terjadi kesalahan internal saat menjalankan perintah.'
    ]);
    await sock.sendMessage(chatId, { text: txt }, { quoted: message }).catch(() => {});
  }
};
