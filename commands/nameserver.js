// commands/nameserver.js
const { exec } = require('child_process');
const dns = require('dns').promises;

/* ===== channel info (opsional) ===== */
let channelInfo = {};
try {
  const mod = require('../lib/messageConfig');
  if (mod && mod.channelInfo) channelInfo = mod.channelInfo;
} catch {}

/* ===== IDN (punycode) support ===== */
let toASCII = (s) => s;
try {
  // Node's built-in punycode
  const puny = require('punycode/');
  toASCII = (s) => puny.toASCII(String(s || '').trim());
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

function cleanDomain(s='') {
  return String(s)
    .trim()
    .replace(/^mailto:/i, '')
    .replace(/^(?:https?:\/\/)?(?:www\.)?/i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
}

function isDomainLike(s='') {
  // sederhana: domain.tld / sub.domain.tld
  return /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(s);
}

function box(title='*NAMESERVER LOOKUP*', sub='') {
  const W = 34;
  const top = '┏' + '━'.repeat(W);
  const l1  = `┃  ${title}`;
  const l2  = sub ? `┃  ${sub}` : null;
  const bot = '┗' + '━'.repeat(W);
  return [top, l1, l2, bot].filter(Boolean).join('\n');
}

/* ===== Resolve helper (A/AAAA) ===== */
async function resolveAddrs(host) {
  const out = { v4: [], v6: [] };
  try {
    const a4 = await dns.resolve4(host);
    out.v4 = a4;
  } catch {}
  try {
    const a6 = await dns.resolve6(host);
    out.v6 = a6;
  } catch {}
  return out;
}

/* ===== NS lookup (DNS native → nslookup fallback) ===== */
async function lookupNS(domain) {
  // 1) native
  try {
    const ns = await dns.resolveNs(domain);
    if (Array.isArray(ns) && ns.length) return { ok: true, ns };
  } catch (e) {
    // continue
  }

  // 2) fallback via nslookup (kalau tersedia di host)
  try {
    const cmd = `nslookup -type=ns ${domain}`;
    const raw = await new Promise((resolve, reject) => {
      exec(cmd, { timeout: 8000 }, (err, stdout, stderr) => {
        if (err) return resolve((stdout || '') + (stderr || ''));
        resolve((stdout || '') + (stderr || ''));
      });
    });
    // parse: e.g. lines containing 'nameserver = X'
    const ns = Array.from(raw.matchAll(/nameserver\s*=\s*([^\s]+)\.?/ig)).map(m => m[1]);
    if (ns.length) return { ok: true, ns };
    return { ok: false, error: 'Tidak ada NS record (nslookup)' };
  } catch (e) {
    return { ok: false, error: e.message || 'nslookup error' };
  }
}

/* ===== main command ===== */
async function nameserverCommand(sock, chatId, message) {
  const raw = getText(message);
  const lower = raw.toLowerCase();
  let domainArg = '';
  const cmd = lower.split(/\s+/)[0];

  // support: .nameserver <domain> | .ns <domain> | .dnsns <domain>
  if (['.nameserver', '.ns', '.dnsns'].includes(cmd)) {
    domainArg = raw.split(/\s+/).slice(1).join(' ').trim();
  }

  if (!domainArg) {
    // support via reply text
    const q = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const qText = (q?.conversation || q?.extendedTextMessage?.text || q?.imageMessage?.caption || q?.videoMessage?.caption || '').trim();
    if (qText) domainArg = qText;
  }

  const domainClean = cleanDomain(domainArg);
  if (!domainClean || !isDomainLike(domainClean)) {
    const head = box('*NAMESERVER LOOKUP*');
    const help = `${head}
⚠️ *Format salah.*

*Contoh:*
• *.nameserver example.com*
• *.ns google.com*`;
    await sock.sendMessage(chatId, { text: help, ...channelInfo, linkPreview: { isDisabled: true } }, { quoted: message });
    return;
  }

  const domainASCII = toASCII(domainClean);

  // Lookup NS
  const nsRes = await lookupNS(domainASCII);

  // Header dan hasil
  const head = box('*NAMESERVER LOOKUP*', `🔎 ${domainASCII}`);
  const out = [head];

  if (!nsRes.ok) {
    out.push(`❌ *Gagal mengambil NS:* ${nsRes.error || 'unknown'}`);
    await sock.sendMessage(chatId, { text: out.join('\n'), ...channelInfo, linkPreview: { isDisabled: true } }, { quoted: message });
    return;
  }

  const uniqNS = Array.from(new Set(nsRes.ns.map(n => n.replace(/\.$/, ''))));
  out.push(`🧭 *NS (${uniqNS.length})*:`);
  if (uniqNS.length === 0) {
    out.push('• —');
  } else {
    out.push(...uniqNS.map(n => `• ${n}`));
  }

  // Resolve address masing-masing NS (glue check)
  out.push('');
  out.push('🔗 *Alamat NS*:');
  if (uniqNS.length === 0) {
    out.push('• —');
  } else {
    for (const host of uniqNS) {
      const addrs = await resolveAddrs(host);
      const parts = [];
      if (addrs.v4.length) parts.push(`${addrs.v4.join(', ')}`);
      if (addrs.v6.length) parts.push(`${addrs.v6.join(', ')}`);
      out.push(`• ${host} → ${parts.length ? parts.join(' | ') : '—'}`);
    }
  }

  await sock.sendMessage(
    chatId,
    { text: out.join('\n'), ...channelInfo, linkPreview: { isDisabled: true } },
    { quoted: message }
  );
}

module.exports = { nameserverCommand };
