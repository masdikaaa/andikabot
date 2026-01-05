// commands/gdrivedl.js — Google Drive downloader via api.siputzx.my.id
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

function usage() {
  return [
    '╭─〔 📥 *GDRIVE DL* 〕',
    '│ Kirim:',
    '│ • *.gdrive <link-google-drive>*',
    '│ • Balas pesan yg berisi link dgn *.gdrive*',
    '│ ',
    '│ Contoh:',
    '│ • *.gdrive https://drive.google.com/file/d/ID/view?usp=share*',
    '╰────────────────────'
  ].join('\n');
}

function extractUrlFromMessage(message) {
  const raw =
    message?.message?.extendedTextMessage?.text ||
    message?.message?.conversation ||
    message?.message?.imageMessage?.caption ||
    message?.message?.videoMessage?.caption ||
    '';

  // Ambil dari balasan jika ada
  const quoted =
    message?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const qtext =
    quoted?.extendedTextMessage?.text ||
    quoted?.conversation ||
    quoted?.imageMessage?.caption ||
    quoted?.videoMessage?.caption ||
    '';

  // Cari URL drive di teks
  const findDrive = (t = '') => {
    const m = t.match(/https?:\/\/(?:drive\.google\.com|docs\.google\.com)\/[^\s]+/i);
    return m ? m[0] : '';
  };

  return findDrive(raw) || findDrive(qtext) || '';
}

function looksLikeDrive(url) {
  return /https?:\/\/(?:drive\.google\.com|docs\.google\.com)\//i.test(url);
}

async function gdriveDownloadCommand(sock, chatId, message, argStr) {
  try {
    const argUrl = String(argStr || '').trim();
    const link = argUrl || extractUrlFromMessage(message);

    if (!link || !looksLikeDrive(link)) {
      await sock.sendMessage(chatId, { text: usage(), ...baseChannelInfo }, { quoted: message });
      return;
    }

    await sock.presenceSubscribe(chatId);
    await sock.sendPresenceUpdate('composing', chatId);

    const apiUrl = `https://api.siputzx.my.id/api/d/gdrive?url=${encodeURIComponent(link)}`;
    const { data } = await axios.get(apiUrl, { timeout: 20000, headers: { accept: '*/*' } });

    if (!data || data.status !== true || !data.data || !data.data.download) {
      const code = data?.status === false ? '' : (data ? '' : ' (no data)');
      const msg = [
        `❌ *Gagal ambil link download*${code}`,
        '',
        usage()
      ].join('\n');
      await sock.sendMessage(chatId, { text: msg, ...baseChannelInfo }, { quoted: message });
      return;
    }

    const fileName = (data.data.name || 'file').toString().replace(/[\\/:*?"<>|]+/g, '_');
    const direct = data.data.download;

    // Coba unduh konten untuk diupload ke WhatsApp
    let mime = 'application/octet-stream';
    let buf = null;
    try {
      const res = await axios.get(direct, {
        responseType: 'arraybuffer',
        timeout: 60000,
        headers: { accept: '*/*' }
      });
      buf = Buffer.from(res.data);
      const ct = res.headers['content-type'];
      if (typeof ct === 'string' && ct.length) mime = ct;

      // Upload sebagai dokumen
      await sock.sendMessage(
        chatId,
        {
          document: buf,
          mimetype: mime,
          fileName: fileName,
          caption: [
            '✅ *Google Drive → Dokumen*',
            `• Nama: *${fileName}*`,
            `• Sumber: drive.google.com`,
            '',
            '_Jika preview gagal, simpan dan buka via aplikasi terkait._'
          ].join('\n'),
          ...baseChannelInfo
        },
        { quoted: message }
      );
    } catch (upErr) {
      // Fallback: kirim tautan download jika upload gagal (mis. file besar)
      const msg = [
        '⚠️ *Upload langsung gagal* (kemungkinan ukuran terlalu besar).',
        '',
        '📥 Silakan unduh manual:',
        `• Nama: *${fileName}*`,
        `• Link: ${direct}`
      ].join('\n');
      await sock.sendMessage(chatId, { text: msg, ...baseChannelInfo }, { quoted: message });
    }
  } catch (err) {
    const code = err?.response?.status;
    const msg = [
      '❌ *Gagal memproses link Google Drive.*',
      code === 429 ? '⚠️ Rate limit API, coba lagi nanti.' : '',
      '',
      usage()
    ].filter(Boolean).join('\n');
    await sock.sendMessage(chatId, { text: msg, ...baseChannelInfo }, { quoted: message });
    console.error('gdriveDownloadCommand error:', err?.response?.data || err?.message || err);
  }
}

module.exports = gdriveDownloadCommand;
