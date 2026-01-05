// commands/spek.js — FINAL
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { exec } = require('child_process');
const settings = require('../settings');

let channelInfo = {};
try {
  const mod = require('../lib/messageConfig');
  if (mod && mod.channelInfo) channelInfo = mod.channelInfo;
} catch {}

function fmtUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600).toString().padStart(2, '0');
  const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return (d > 0 ? `${d}d ` : '') + `${h}:${m}:${s}`;
}
function nowID() {
  try { return new Date().toLocaleString('id-ID', { hour12: false }); }
  catch { return new Date().toISOString().replace('T',' ').slice(0,19); }
}
function progressBar(pct, width = 20) {
  const p = Math.max(0, Math.min(1, pct));
  const filled = Math.round(p * width);
  const empty = width - filled;
  return '▰'.repeat(filled) + '▱'.repeat(empty);
}
// GB/TB otomatis
function bytesToReadable(n) {
  const tb = 1024 ** 4;
  const gb = 1024 ** 3;
  const mb = 1024 ** 2;
  if (n >= tb) return `${(n / tb).toFixed(2)} TB`;
  if (n >= gb) return `${(n / gb).toFixed(2)} GB`;
  if (n >= mb) return `${(n / mb).toFixed(2)} MB`;
  return `${n} B`;
}
function pct(a,b){ return b>0 ? a/b : 0; }

// Estimasi CPU usage (loadavg per core)
function cpuLoadPct() {
  const cores = os.cpus()?.length || 1;
  const load1 = os.loadavg?.()[0] || 0;
  const p = Math.max(0, Math.min(1, load1 / cores));
  return { p, load1, cores };
}

// Deteksi jumlah socket, core (fisik), thread (logical) — robust & lintas distro
function getCpuTopology() {
  return new Promise((resolve) => {
    const isWin = os.platform().startsWith('win');

    const resolveSafe = (obj) => {
      const totalThreads = Math.max(1, obj.totalThreads || os.cpus().length || 1);
      const totalCores   = Math.max(1, obj.totalCores   || os.cpus().length || 1);
      const sockets      = Math.max(1, obj.sockets      || 1);
      const coresPerSocket = Math.max(1, Math.round(totalCores / sockets));
      const threadsPerCore = Math.max(1, Math.round(totalThreads / totalCores));
      resolve({ sockets, coresPerSocket, threadsPerCore, totalCores, totalThreads });
    };

    // Fallback 3: os.cpus()
    const fallbackOs = () => {
      const c = os.cpus() || [];
      resolveSafe({ sockets: 1, totalCores: c.length, totalThreads: c.length });
    };

    // Fallback 2: /proc/cpuinfo (Linux)
    const fallbackCpuinfo = () => {
      fs.readFile('/proc/cpuinfo', 'utf8', (err, data) => {
        if (err || !data) return fallbackOs();
        const lines = data.split(/\r?\n/);
        const cpuSet = new Set();        // logical CPU (processor)
        const physCoreSet = new Set();   // physical_id:core_id
        const socketSet = new Set();     // physical_id

        let cur = {};
        const flush = () => {
          if ('processor' in cur) cpuSet.add(String(cur.processor).trim());
          if ('physical id' in cur && 'core id' in cur) {
            const sid = String(cur['physical id']).trim();
            const cid = String(cur['core id']).trim();
            socketSet.add(sid);
            physCoreSet.add(`${sid}:${cid}`);
          }
          cur = {};
        };

        for (const ln of lines) {
          if (!ln.trim()) { flush(); continue; }
          const m = ln.match(/^([\w \t\(\)\/]+)\s*:\s*(.*)$/);
          if (m) {
            const k = m[1].trim();
            const v = m[2].trim();
            cur[k] = v;
          }
        }
        flush();

        const sockets = socketSet.size || 1;
        const totalCores = physCoreSet.size || os.cpus().length || 1;
        const totalThreads = cpuSet.size || os.cpus().length || 1;
        resolveSafe({ sockets, totalCores, totalThreads });
      });
    };

    if (isWin) return fallbackOs();

    // Primary: lscpu -p (portable & cepat)
    const cmd = `lscpu -p=CPU,CORE,SOCKET | grep -v '^#'`;
    exec(cmd, { timeout: 3000 }, (err, stdout = '') => {
      if (err || !stdout.trim()) return fallbackCpuinfo();

      const cpuSet = new Set();   // logical
      const coreSet = new Set();  // socket:core (fisik)
      const sockSet = new Set();  // socket index

      for (const line of stdout.trim().split(/\r?\n/)) {
        const parts = line.split(',');
        if (parts.length < 3) continue;
        const cpu = parts[0].trim();
        const core = parts[1].trim();
        const sock = parts[2].trim();
        cpuSet.add(cpu);
        coreSet.add(`${sock}:${core}`);
        sockSet.add(sock);
      }

      const sockets = sockSet.size || 1;
      const totalCores = coreSet.size || os.cpus().length || 1;     // fisik (unik socket:core)
      const totalThreads = cpuSet.size || os.cpus().length || 1;    // logical
      resolveSafe({ sockets, totalCores, totalThreads });
    });
  });
}

// Disk info: hanya baca mountpoint /
function getDiskInfo() {
  return new Promise((resolve) => {
    const isWin = os.platform().startsWith('win');
    if (isWin) {
      exec('wmic logicaldisk get size,freespace,caption', { timeout: 5000 }, (err, stdout='') => {
        if (err) return resolve(null);
        const lines = stdout.trim().split(/\r?\n/).slice(1).filter(Boolean);
        let total = 0, free = 0;
        for (const ln of lines) {
          const m = ln.trim().split(/\s+/);
          const size = Number(m.pop());
          const freespace = Number(m.pop());
          if (!Number.isNaN(size)) total += size;
          if (!Number.isNaN(freespace)) free += freespace;
        }
        if (total <= 0) return resolve(null);
        resolve({ total, used: total - free, free });
      });
    } else {
      exec("df -kP | grep -E ' /$'", { timeout: 5000 }, (err, stdout='') => {
        if (err || !stdout) return resolve(null);
        const parts = stdout.trim().split(/\s+/);
        if (parts.length < 6) return resolve(null);
        const total = Number(parts[1]) * 1024;
        const used  = Number(parts[2]) * 1024;
        const free  = Number(parts[3]) * 1024;
        resolve({ total, used, free });
      });
    }
  });
}

async function spekCommand(sock, chatId, message) {
  try {
    const botName = settings.botName || 'Andika Bot';
    const version = settings.version || '3.0.0';

    // ping kecil
    const t0 = Date.now();
    try { await sock.presenceSubscribe(chatId); await sock.sendPresenceUpdate('composing', chatId); } catch {}
    const ping = Math.max(1, Date.now() - t0);

    // uptime
    const upSec = process.uptime();
    const upStr = fmtUptime(upSec);

    // CPU
    const cpus = os.cpus() || [];
    const cpuModel = cpus[0]?.model || 'Unknown CPU';
    const cpuSpeed = cpus[0]?.speed ? `${cpus[0].speed}MHz` : '-';
    const { p: cpuPct, load1 } = cpuLoadPct();
    const topo = await getCpuTopology();

    // RAM
    const totalMem = os.totalmem();
    const freeMem  = os.freemem();
    const usedMem  = totalMem - freeMem;
    const memPct   = pct(usedMem, totalMem);

    // Disk
    const disk = await getDiskInfo();
    const totalDisk = disk?.total || 0;
    const usedDisk  = disk?.used  || 0;
    const diskPct   = pct(usedDisk, totalDisk);

    // OS/Host
    const host = os.hostname();
    const platform = os.platform();
    const arch = os.arch();
    const nodev = process.version;

    // bars & pretty
    const cpuBar = progressBar(cpuPct);
    const ramBar = progressBar(memPct);
    const dskBar = totalDisk ? progressBar(diskPct) : 'N/A';
    const gb = (n) => bytesToReadable(n);
    const pctStr = (p) => `${Math.round(p * 100)}%`;

    // caption
    const caption =
`┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃ 🤖 *${botName}*  •  v${version}
┃ 🟢 ONLINE   |  ⚡ Ping: *${ping} ms*
┃ 🕰️ ${nowID()}   |  ⏱️ Uptime: *${upStr}*
┃━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃ 🖥️  *SERVER SPECS*
┃ Hostname      : ${host}
┃ OS            : ${platform} (${arch})
┃ Node.js       : ${nodev}
┃━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃ 🔩  *CPU*
┃ Model         : ${cpuModel}
┃ Socket(s)     : ${topo.sockets}
┃ Core/socket   : ${topo.coresPerSocket}
┃ Thread/core   : ${topo.threadsPerCore}
┃ Total Core    : ${topo.totalCores}  (fisik)
┃ Total Thread  : ${topo.totalThreads}  (logical)
┃ Clock/Load    : ${cpuSpeed}  | Load(1m): ${load1.toFixed(2)}
┃ Usage Now     : *${pctStr(cpuPct)}*
┃   ${cpuBar}
┃━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃ 💾  *RAM*
┃ Used/Total    : ${gb(usedMem)} / ${gb(totalMem)}  (*${pctStr(memPct)}*)
┃   ${ramBar}
┃━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃ 💽  *DISK*
┃ ${totalDisk ? `Used/Total    : ${gb(usedDisk)} / ${gb(totalDisk)}  (*${pctStr(diskPct)}*)` : 'Info disk tidak tersedia'}
┃   ${totalDisk ? dskBar : '—'}
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`.trim();

    try { await sock.sendMessage(chatId, { react: { text: '📊', key: message.key } }); } catch {}
    const contextInfo = {
      forwardingScore: 999,
      isForwarded: true,
      forwardedNewsletterMessageInfo: {
        newsletterJid: '120363421594431163@newsletter',
        newsletterName: botName,
        serverMessageId: -1
      }
    };

    const imgPaths = [path.join(__dirname, '../assets/bot_image.jpg')];
    const existsPath = imgPaths.find(p => fs.existsSync(p));

    if (existsPath) {
      const imageBuffer = fs.readFileSync(existsPath);
      await sock.sendMessage(
        chatId,
        { image: imageBuffer, caption, contextInfo, ...channelInfo },
        { quoted: message }
      );
    } else {
      await sock.sendMessage(
        chatId,
        { text: caption, contextInfo, ...channelInfo },
        { quoted: message }
      );
    }
  } catch (err) {
    console.error('Error in spek command:', err);
    await sock.sendMessage(chatId, { text: '🟢 Bot aktif. (gagal baca spek)' }, { quoted: message });
  }
}

module.exports = spekCommand;
