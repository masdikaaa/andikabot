// commands/ss.js — Screenshot Web (NekoLabs) — Andika Bot Style
// Command: .ss <url> <device> <fullpage>
// device : mobile / tablet / desktop
// fullpage : true / false  → true = kirim fullPage=true, false = tanpa fullPage

'use strict';

const fetch = require('node-fetch');
const { channelInfo } = require('../lib/messageConfig');

/** ========= THEME / BRAND ========= */
const BRAND = 'Andika Bot';
const ICON = {
  shot: '🖼️',
  ok:   '✅',
  warn: '⚠️',
  err:  '❌',
  tip:  '✨'
};

const HEAD = (title) =>
`╭─〔 ${title} 〕
│ ${BRAND}
╰──────────────────`;

/** ========= API CONFIG ========= */
const API_BASE = 'https://api.nekolabs.web.id/tools/ssweb';
const RETRIES  = 3;
const DELAY_MS = 1800;

/** ========= Helpers ========= */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchScreenshot(url, device, fullpage) {
  // base URL
  let api =
    `${API_BASE}` +
    `?url=${encodeURIComponent(url)}` +
    `&device=${device}`;

  // kalau minta fullpage baru kirim param ini
  if (fullpage) {
    api += `&fullPage=true`;
  }

  let lastErr = null;

  for (let i = 0; i < RETRIES; i++) {
    try {
      // 1) Panggil API NekoLabs (umumnya balikin JSON)
      const res = await fetch(api, { timeout: 30000 });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const ctype = (res.headers.get('content-type') || '').toLowerCase();

      // A) JSON → ada field result (URL gambar)
      if (ctype.includes('application/json')) {
        const data = await res.json();
        if (!data || !data.success || !data.result) {
          throw new Error(
            `Invalid JSON response: ${JSON.stringify(data).slice(0, 200)}`
          );
        }

        const imgUrl = data.result;

        // 2) Ambil gambar dari URL result
        const imgRes = await fetch(imgUrl, { timeout: 45000 });
        if (!imgRes.ok) {
          throw new Error(`IMG HTTP ${imgRes.status}`);
        }

        const imgType = (imgRes.headers.get('content-type') || '').toLowerCase();
        if (!imgType.startsWith('image/')) {
          const txt = await imgRes.text().catch(() => '');
          throw new Error(
            `IMG unexpected content-type: ${imgType} body: ${txt.slice(0, 200)}`
          );
        }

        const imgBuf = await imgRes.buffer();
        return imgBuf;
      }

      // B) Fallback: kalau suatu saat API langsung balikin image
      if (ctype.startsWith('image/')) {
        const buf = await res.buffer();
        return buf;
      }

      // C) HTML / text error
      const text = await res.text().catch(() => '');
      throw new Error(
        `Unexpected content-type: ${ctype} body: ${text.slice(0, 200)}`
      );

    } catch (err) {
      lastErr = err;
      await sleep(DELAY_MS);
    }
  }

  throw lastErr;
}

/** ========= Main Handler ========= */
async function handleSsCommand(sock, chatId, msg, match) {
  const parts = (match || '').trim().split(/\s+/);

  // === Help message ===
  if (!parts[0]) {
    return sock.sendMessage(
      chatId,
      {
        text:
`${HEAD('Screenshot Web')}

${ICON.shot} *Fungsi:* Ambil screenshot dari website apa saja.

*Format:*
.ss <url> <device> <fullpage>

*Parameter:*
• *url*     : wajib, harus diawali http:// atau https://
• *device*  : mobile / tablet / desktop (opsional, default: desktop)
• *fullpage*: true (panjang penuh) / false (normal / default API)

*Contoh:*
• .ss https://domain.tld/download desktop true
• .ss https://domain.tld mobile false
• .ss https://www.domain.tld mobile true`,
        quoted: msg,
        ...channelInfo
      }
    );
  }

  // === Ambil parameter ===
  const url      = parts[0];
  const deviceIn = (parts[1] || 'desktop').toLowerCase();
  const fullIn   = (parts[2] || 'false').toLowerCase();

  // Validasi URL
  if (!/^https?:\/\//i.test(url)) {
    return sock.sendMessage(
      chatId,
      {
        text:
`${HEAD('Screenshot Web')}
${ICON.err} URL harus dimulai dengan *http://* atau *https://*`,
        quoted: msg,
        ...channelInfo
      }
    );
  }

  // Validasi device
  const allowedDevices = ['mobile', 'tablet', 'desktop'];
  const device = allowedDevices.includes(deviceIn) ? deviceIn : 'desktop';

  // Validasi fullpage
  const fullpage = (fullIn === 'true');

  // Presence (Mas bebas tambahin reaction sendiri di luar sini)
  try {
    await sock.presenceSubscribe(chatId);
    await sock.sendPresenceUpdate('composing', chatId);
  } catch {}

  // === Eksekusi screenshot ===
  try {
    const img = await fetchScreenshot(url, device, fullpage);

    return sock.sendMessage(
      chatId,
      {
        image: img,
        caption:
`${HEAD('Screenshot Berhasil')}
${ICON.ok} ${ICON.shot} *URL*      : ${url}
${ICON.ok} *Device*   : ${device}
${ICON.ok} *fullPage* : ${fullpage ? 'true (panjang penuh)' : 'default (tanpa fullPage)'}`,
        ...channelInfo
      },
      { quoted: msg }
    );

  } catch (err) {
    console.error('SSWEB ERR:', err);

    return sock.sendMessage(
      chatId,
      {
        text:
`${HEAD('Screenshot Gagal')}
${ICON.err} Tidak dapat mengambil screenshot.

${ICON.tip} *Kemungkinan penyebab:*
• URL tidak valid
• Website menolak screenshot
• Website sedang down
• Layanan API sedang gangguan

Silakan coba lagi beberapa menit lagi.`,
        quoted: msg,
        ...channelInfo
      }
    );
  }
}

module.exports = {
  handleSsCommand
};
