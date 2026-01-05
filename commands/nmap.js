// commands/nmap.js — Port scanner (Andika Bot box style)
// Usage: .nmap -p80 <host> | .nmap -p80,443 <host>
// Syarat: paket "nmap" terpasang di server bot.

'use strict';
const { execFile } = require('child_process');

const TIMEOUT_MS = 20000; // 20 detik
const MAX_LINES  = 80;    // batasi raw output

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
function isValidHost(s='') {
  s = String(s).trim();
  const ipv4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
  const host = /^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*\.?$/;
  return ipv4.test(s) || host.test(s);
}
function parsePortsFlag(a=[]) {
  let p = null;
  for (const t of a) if (t.startsWith('-p')) { p = t.replace(/^-p/, '').trim(); break; }
  if (!p) return null;
  const ports = p.split(',').map(x => x.trim()).filter(Boolean);
  if (!ports.length) return null;
  for (const po of ports) {
    const n = Number(po);
    if (!Number.isInteger(n) || n < 1 || n > 65535) return null;
  }
  return ports.join(',');
}

module.exports = async function nmapCommand(sock, chatId, message, args = []) {
  try {
    if (args.length < 2) {
      const txt = box('🛰️ Cara Pakai .nmap', [
        `📅 ${nowID()}`,
        '',
        'Contoh:',
        '• .nmap -p80 1.2.3.4',
        '• .nmap -p80,443 masdika.id',
        '',
        'Keterangan:',
        '• -p80,443 = scan port 80 dan 443',
        '• Output ringkas + daftar port open',
      ]);
      await sock.sendMessage(chatId, { text: txt }, { quoted: message });
      return;
    }

    const portsFlag = parsePortsFlag(args);
    const host = args[args.length - 1];

    if (!portsFlag) {
      const txt = box('❌ Port Tidak Valid', [
        'Gunakan format -p80 atau -p80,443 (1–65535).',
        '',
        'Contoh:',
        '• .nmap -p80 1.2.3.4',
        '• .nmap -p80,443 masdika.id',
      ]);
      await sock.sendMessage(chatId, { text: txt }, { quoted: message });
      return;
    }
    if (!isValidHost(host)) {
      const txt = box('❌ Host/IP Tidak Valid', [
        'Masukkan host/IP yang benar.',
        '',
        'Contoh:',
        '• .nmap -p80 1.2.3.4',
        '• .nmap -p80,443 masdika.id',
      ]);
      await sock.sendMessage(chatId, { text: txt }, { quoted: message });
      return;
    }

    const nmapArgs = ['-Pn','-p', portsFlag, '--open','-T4','-oG','-','--', host];
    execFile('nmap', nmapArgs, { timeout: TIMEOUT_MS }, async (err, stdout, stderr) => {
      if (err && !stdout) {
        const enoent = err && err.code === 'ENOENT';
        const msg = enoent
          ? 'Binary *nmap* tidak ditemukan di server bot.'
          : (stderr || err.message || 'Tidak diketahui.').toString().slice(0, 800);

        const txt = box('❌ Gagal Menjalankan .nmap', [
          `📅 ${nowID()}`,
          '',
          msg,
          '',
          ...(enoent ? ['💡 Instalasi: apt-get install nmap (Debian/Ubuntu) / yum install nmap (RHEL/Alma)'] : []),
        ]);
        await sock.sendMessage(chatId, { text: txt }, { quoted: message });
        return;
      }

      const raw = (stdout || '').toString().split('\n').slice(0, MAX_LINES).join('\n');

      // Parse -oG: baris "Ports:" → ambil yang open saja
      const open = [];
      raw.split('\n').forEach(line => {
        const mPorts = line.match(/Ports:\s(.+)/);
        const mHost  = line.match(/^Host:\s+(\S+)/);
        if (mPorts && mHost) {
          const h = mHost[1];
          mPorts[1].split(',').map(s => s.trim()).forEach(segStr => {
            const seg = segStr.split('/');
            const port = seg[0], state = seg[1], proto = seg[2], svc = seg[4] || '';
            if (state === 'open') open.push({ host: h, port, proto, svc });
          });
        }
      });

      let listLines = [];
      if (!open.length) {
        listLines = ['🚫 Tidak ada port terbuka yang terdeteksi pada daftar tersebut.'];
      } else {
        listLines = ['✅ Port terbuka terdeteksi:'];
        for (const x of open) {
          listLines.push(`• ${x.host} → 🔓 ${x.port}/${x.proto}${x.svc ? ' ('+x.svc+')' : ''}`);
        }
      }

      const lines = [
        `📅 ${nowID()}`,
        `🎯 Target: ${host}`,
        `📦 Port: ${portsFlag}`,
        '',
        ...listLines,
        '',
        '🧾 Raw (ringkas):',
        ...((raw || '(kosong)').split('\n'))
      ];

      const txt = box('🛰️ Nmap Scanner', lines);
      await sock.sendMessage(chatId, { text: txt }, { quoted: message });
    });
  } catch (e) {
    const txt = box('❌ Error .nmap', [
      'Terjadi kesalahan internal saat menjalankan perintah.'
    ]);
    await sock.sendMessage(chatId, { text: txt }, { quoted: message }).catch(() => {});
  }
};
