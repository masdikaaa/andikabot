// commands/npmcheck.js — Cek info paket NPM via api.siputzx.my.id
'use strict';

const axios = require('axios');

// === channel badge Andika Bot (fallback aman) ===
let baseChannelInfo = {};
try {
  const cfg = require('../lib/messageConfig');
  if (cfg && cfg.channelInfo) baseChannelInfo = cfg.channelInfo;
} catch {}
if (!baseChannelInfo.contextInfo) {
  baseChannelInfo = {
    contextInfo: {
      forwardingScore: 1,
      isForwarded: true,
      forwardedNewsletterMessageInfo: {
        newsletterJid: '120363421594431163@newsletter',
        newsletterName: 'Andika Bot',
        serverMessageId: -1
      }
    }
  };
}

function formatWIB(isoLike) {
  try {
    if (!isoLike) return '-';
    const dt = new Date(isoLike);
    if (isNaN(dt.getTime())) return '-';
    const opts = { timeZone: 'Asia/Jakarta', hour12: false };
    const dd = new Intl.DateTimeFormat('id-ID', { day: '2-digit', ...opts }).format(dt);
    const mo = new Intl.DateTimeFormat('id-ID', { month: 'short', ...opts }).format(dt);
    const yy = new Intl.DateTimeFormat('id-ID', { year: 'numeric', ...opts }).format(dt);
    const hm = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', ...opts }).format(dt);
    return `${dd} ${mo} ${yy} • ${hm} WIB`;
  } catch { return '-'; }
}

function usage() {
  return [
    '╭─〔 📦 *NPM CHECK* 〕',
    '│ Contoh:',
    '│ • *.npm axios*',
    '│ • *.npm @nestjs/core*',
    '╰────────────────────'
  ].join('\n');
}

async function npmCheckCommand(sock, chatId, message, pkgArg) {
  try {
    const pkg = String(pkgArg || '').trim();
    if (!pkg) {
      await sock.sendMessage(chatId, { text: usage(), ...baseChannelInfo }, { quoted: message });
      return;
    }

    await sock.presenceSubscribe(chatId);
    await sock.sendPresenceUpdate('composing', chatId);

    const url = `https://api.siputzx.my.id/api/check/npm?packageName=${encodeURIComponent(pkg)}`;
    const { data } = await axios.get(url, { timeout: 15000, headers: { accept: '*/*' } });

    if (!data || data.status !== true || !data.data) {
      const msg = [
        '❌ *Paket tidak ditemukan atau API gagal.*',
        '',
        usage()
      ].join('\n');
      await sock.sendMessage(chatId, { text: msg, ...baseChannelInfo }, { quoted: message });
      return;
    }

    const d = data.data;
    const ts = formatWIB(data.timestamp);
    const publishTime = formatWIB(d.publishTime);
    const latestPublishTime = formatWIB(d.latestPublishTime);

    const lines = [];
    lines.push('╭─〔 📦 *NPM PACKAGE INFO* 〕');
    lines.push(`│ 🧩 Nama        : *${d.name || pkg}*`);
    lines.push(`│ 🔖 Latest      : *${d.versionLatest || '-'}*`);
    lines.push(`│ 🐣 First ver   : *${d.versionPublish || '-'}*`);
    lines.push(`│ 🔁 Update cnt  : *${d.versionUpdate ?? '-'}*`);
    lines.push(`│ 🧷 Deps (latest/publish): *${d.latestDependencies ?? '-'} / ${d.publishDependencies ?? '-'}*`);
    lines.push(`│ 🕒 Published   : *${publishTime}*`);
    lines.push(`│ 🕒 Latest Pub. : *${latestPublishTime}*`);
    lines.push(`│ ⏱️ Diambil     : *${ts}*`);
    lines.push('╰────────────────────────');

    await sock.sendMessage(chatId, { text: lines.join('\n'), ...baseChannelInfo }, { quoted: message });
  } catch (err) {
    const code = err?.response?.status;
    const msg = [
      '❌ *Gagal mengambil data paket NPM.*',
      code === 429 ? '⚠️ Kena rate limit API, coba lagi beberapa saat.' : '',
      '',
      usage()
    ].filter(Boolean).join('\n');
    await sock.sendMessage(chatId, { text: msg, ...baseChannelInfo }, { quoted: message });
    console.error('npmCheckCommand error:', err?.response?.data || err?.message || err);
  }
}

module.exports = npmCheckCommand;
