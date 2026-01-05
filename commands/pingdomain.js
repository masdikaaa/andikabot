// commands/pingdomain.js
// Emulasi output CMD Windows (1 chat, 8 kali ping) + emoji
// Dukungan flag: -4 / -6 untuk prefer IPv4 / IPv6

const os = require('os');
const { exec } = require('child_process');
const dns = require('dns').promises;

/* ===== channel info (opsional) ===== */
let channelInfo = {};
try {
  const mod = require('../lib/messageConfig');
  if (mod && mod.channelInfo) channelInfo = mod.channelInfo;
} catch {}

/* ===== helpers ===== */
function getText(m) {
  const x = m?.message || {};
  return (
    x.conversation ||
    x.extendedTextMessage?.text ||
    x.imageMessage?.caption ||
    x.videoMessage?.caption ||
    ''
  )?.trim() || '';
}

function cleanHost(s='') {
  return String(s)
    .trim()
    .replace(/^(?:https?:\/\/)?(?:www\.)?/i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
}

function isHostLike(s='') {
  return /^(?:(?:\d{1,3}\.){3}\d{1,3}|[a-z0-9-]+(?:\.[a-z0-9-]+)+)$/i.test(s);
}

function box(title='*PING DOMAIN*', sub='') {
  const W = 34;
  const top = '┏' + '━'.repeat(W);
  const l1  = `┃  ${title}`;
  const l2  = sub ? `┃  ${sub}` : null;
  const bot = '┗' + '━'.repeat(W);
  return [top, l1, l2, bot].filter(Boolean).join('\n');
}

function toMsInt(v) {
  if (v == null) return null;
  const n = Number(v);
  if (Number.isNaN(n)) return null;
  return Math.round(n);
}

/* ===== DNS resolve (honor -4 / -6) ===== */
async function resolveHost(host, familyPref) {
  try {
    if (familyPref === 4 || familyPref === 6) {
      const a = await dns.lookup(host, { family: familyPref });
      return { ok:true, ip:a.address, family:a.family };
    }
    // Try v4 first then v6
    try {
      const a4 = await dns.lookup(host, { family: 4 });
      return { ok:true, ip:a4.address, family:a4.family };
    } catch {
      const a6 = await dns.lookup(host, { family: 6 });
      return { ok:true, ip:a6.address, family:a6.family };
    }
  } catch (e) {
    return { ok:false, error: e.message };
  }
}

/* ===== jalankan ping system ===== */
function runPing(hostOrIp, opts = {}) {
  const { count = 8, family = 0, timeoutSec = 8 } = opts;
  const isWin = os.platform().startsWith('win');

  // Flags family
  const famFlag = family === 4 ? (isWin ? '-4' : '-4') :
                  family === 6 ? (isWin ? '-6' : '-6') : '';

  // Command
  // Windows: ping -n 8 -w <ms> [-4|-6] host
  // Linux/Mac: ping [-4|-6] -n -c 8 -W <sec> host
  const cmd = isWin
    ? `ping ${famFlag} -n ${count} -w ${timeoutSec * 1000} ${hostOrIp}`
    : `ping ${famFlag} -n -c ${count} -W ${Math.max(1, Math.min(timeoutSec, 10))} ${hostOrIp}`;

  const execTimeout = (timeoutSec + count + 3) * 1000;

  return new Promise((resolve) => {
    exec(cmd, { timeout: execTimeout }, (err, stdout, stderr) => {
      const out = (stdout || '') + (stderr || '');
      resolve({ out, isWin });
    });
  });
}

/* ===== parser baris reply untuk bikin 8 output ala CMD ===== */
function parseLinesToReplies(out) {
  const replies = [];
  const lines = out.split(/\r?\n/);

  for (const ln of lines) {
    const line = ln.trim();
    if (!line) continue;

    // Timeout markers (variasi OS)
    if (/timed\s*out/i.test(line) ||
        /Destination Host Unreachable/i.test(line) ||
        /100% packet loss/i.test(line) && /packets transmitted/i.test(out)) {
      replies.push({ type: 'timeout' });
      continue;
    }

    // "bytes from" (Unix) → contain time= and ttl=
    if (/bytes from/i.test(line) || /Reply from/i.test(line)) {
      // time:
      let timeMs = null;
      const mTime1 = line.match(/time[=<]\s*([\d.]+)\s*ms/i);       // time=12.3 ms / time<1ms
      const mTime2 = line.match(/time[=<]\s*([\d.]+)\s* ?ms/i);
      const mLt1   = /time<\s*1\s*ms/i.test(line);
      if (mLt1) timeMs = 1;
      else if (mTime1) timeMs = toMsInt(mTime1[1]);
      else if (mTime2) timeMs = toMsInt(mTime2[1]);

      // ttl:
      let ttl = null;
      const mTTL = line.match(/ttl[=\s:]+(\d+)/i);
      if (mTTL) ttl = Number(mTTL[1]);

      replies.push({ type: 'reply', time: timeMs, ttl });
      continue;
    }
  }
  return replies;
}

/* ===== format WA ala CMD + emoji ===== */
function formatOutput({ host, ip, replies, stats }) {
  const header =
`🛰️ *Pinging* ${host} [${ip}] *with 32 bytes of data:*`;

  const body = replies.map(rep => {
    if (rep.type === 'timeout') return `⏳ *Request timed out.*`;
    const t = rep.time != null ? `${rep.time}ms` : '—';
    const ttlStr = rep.ttl != null ? rep.ttl : '—';
    return `✅ *Reply from* ${ip}: bytes=32 time=${t} TTL=${ttlStr}`;
  });

  const summary =
`📊 *Ping statistics for* ${ip}:
📦 Packets: *Sent*=${stats.sent}, *Received*=${stats.recv}, *Lost*=${stats.lost} (${stats.loss}% loss)
⏱️ Approx. round trip times in milli-seconds:
   Minimum = ${stats.min ?? '—'}ms, Maximum = ${stats.max ?? '—'}ms, Average = ${stats.avg ?? '—'}ms`;

  return [header, ...body, '', summary].join('\n');
}

function computeStats(replies, expectedCount) {
  const sent = expectedCount;
  const recv = replies.filter(r => r.type === 'reply').length;
  const lost = sent - recv;
  const loss = Math.round((lost / sent) * 100);

  const times = replies.filter(r => r.type === 'reply' && r.time != null).map(r => r.time);
  const min = times.length ? Math.min(...times) : null;
  const max = times.length ? Math.max(...times) : null;
  const avg = times.length ? Math.round(times.reduce((a,b)=>a+b,0) / times.length) : null;

  return { sent, recv, lost, loss, min, max, avg };
}

/* ===== command ===== */
async function pingDomainCommand(sock, chatId, message) {
  const raw = getText(message);
  const lower = raw.toLowerCase();

  // Ambil argumen dari teks / reply
  const tokens = raw.split(/\s+/).filter(Boolean);
  const cmdWord = (tokens[0] || '').toLowerCase();

  let familyPref = 0; // 0 = auto, 4 = IPv4, 6 = IPv6
  let hostArg = '';

  if (['.pingdomain', '.pinghost', '.netping'].includes(cmdWord)) {
    // parse flags
    const args = tokens.slice(1);
    const flagIdx = args.findIndex(a => /^-([46])$/.test(a));
    if (flagIdx >= 0) {
      const fl = args[flagIdx];
      familyPref = fl === '-4' ? 4 : 6;
      args.splice(flagIdx, 1);
    }
    hostArg = args.join(' ').trim();
  }

  if (!hostArg) {
    const q = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const qText = (q?.conversation || q?.extendedTextMessage?.text || q?.imageMessage?.caption || q?.videoMessage?.caption || '').trim();
    if (qText) hostArg = qText;
  }

  const host = cleanHost(hostArg);
  if (!host || !isHostLike(host)) {
    const head = box('*PING DOMAIN*');
    const help = `${head}
⚠️ *Format salah.*

Contoh:
• *.pingdomain google.com*
• *.pingdomain -4 cloudflare.com*
• *.pingdomain -6 cloudflare.com*
• *.pinghost 1.1.1.1*
• *.netping github.com*`;
    await sock.sendMessage(chatId, { text: help, ...channelInfo, linkPreview: { isDisabled:true } }, { quoted: message });
    return;
  }

  // Resolve DNS sesuai preferensi
  let ip = host;
  let fam = familyPref || 0;

  // Jika host bukan IP langsung, resolve
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) && !/:/.test(host)) {
    const res = await resolveHost(host, familyPref);
    if (!res.ok) {
      await sock.sendMessage(chatId, { text: `❌ Gagal resolve DNS untuk *${host}* (${res.error || 'unknown'})`, ...channelInfo }, { quoted: message });
      return;
    }
    ip = res.ip;
    fam = res.family;
  }

  // Jalankan ping OS
  const COUNT = 8;
  const { out, isWin } = await runPing(ip, { count: COUNT, family: fam, timeoutSec: 6 });

  // Parse line-by-line jadi 8 hasil ala CMD (timeout / reply)
  let replies = parseLinesToReplies(out);

  // Jika parser dapat kurang dari COUNT, pad dengan timeout biar total 8
  if (replies.length < COUNT) {
    replies = replies.concat(Array(COUNT - replies.length).fill({ type: 'timeout' }));
  } else if (replies.length > COUNT) {
    replies = replies.slice(0, COUNT);
  }

  // Hitung statistik
  const stats = computeStats(replies, COUNT);

  // Format output
  const text = formatOutput({ host, ip, replies, stats });

  await sock.sendMessage(
    chatId,
    { text, ...channelInfo, linkPreview: { isDisabled: true } },
    { quoted: message }
  );
}

module.exports = { pingDomainCommand };
