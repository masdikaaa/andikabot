// commands/goodbye.js — FINAL (Baileys v7 safe: participant object -> JID)
'use strict';

const { isGoodByeOn } = require('../lib/index');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');

/* ================= Helpers ================= */

// Normalisasi participant (Baileys v7: object) -> JID "xxx@s.whatsapp.net"
function normalizeJid(p) {
  if (!p) return '';
  if (typeof p === 'string') return jidNormalizedUser(p);
  const cand = p.id || p.jid || p.user || p.phoneNumber || '';
  return cand ? jidNormalizedUser(cand) : '';
}

// Array participants -> array string JID
function jidsFromParticipants(arr) {
  return (arr || []).map(normalizeJid).filter(Boolean);
}

// Baca config goodbye per grup dari JSON
function loadGoodbyeConfig(groupId) {
  try {
    const p = path.join(__dirname, '../data/userGroupData.json');
    if (!fs.existsSync(p)) return {};
    const data = JSON.parse(fs.readFileSync(p, 'utf8') || '{}');
    return (data.goodbye && data.goodbye[groupId]) ? data.goodbye[groupId] : {};
  } catch {
    return {};
  }
}

// Render template kustom
function renderTemplate(tpl, ctx) {
  return (tpl || '')
    .replace(/\{user\}/gi, '@' + ctx.number)
    .replace(/\{name\}/gi, ctx.name)
    .replace(/\{number\}/gi, ctx.number)
    .replace(/\{group\}/gi, ctx.group)
    .replace(/\{desc\}/gi, ctx.desc)
    .replace(/\{description\}/gi, ctx.desc) // alias
    .replace(/\{count\}/gi, String(ctx.count))
    .replace(/\{time\}/gi, ctx.time);
}

/* ================ Command Handler (.goodbye) ================ */
// (tetap delegasi ke lib/welcome.js → handleGoodbye)
const { handleGoodbye } = require('../lib/welcome');

async function goodbyeCommand(sock, chatId, message) {
  // Hanya bisa di grup
  if (!chatId.endsWith('@g.us')) {
    await sock.sendMessage(chatId, { text: '⚠️ *Perintah ini hanya bisa dipakai di grup.*' });
    return;
  }

  // Ambil argumen setelah perintah
  const text = message.message?.conversation ||
               message.message?.extendedTextMessage?.text || '';
  const matchText = text.split(' ').slice(1).join(' ');

  await handleGoodbye(sock, chatId, message, matchText);
}

/* ================ Event Handler (LEAVE) ================ */
async function handleLeaveEvent(sock, id, participants) {
  try {
    // Cek apakah fitur goodbye aktif
    const isGoodbyeEnabled = await isGoodByeOn(id);
    if (!isGoodbyeEnabled) return;

    // Ambil metadata grup
    const groupMetadata = await sock.groupMetadata(id);
    const groupName = groupMetadata.subject || 'Grup';
    const groupDesc = (groupMetadata.desc && groupMetadata.desc.toString()) || '';
    const memberCount = (groupMetadata.participants || []).length;

    // Baca config goodbye khusus grup ini
    const cfg = loadGoodbyeConfig(id) || {};
    const customTpl = (cfg.template || cfg.message || '').trim();
    const customApi = (cfg.imageApi || '').trim();
    const textOnly  = !!cfg.textOnly;

    // Tanggal/waktu lokal
    const now = new Date();
    const timeString = now.toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    });

    // Kirim pesan per peserta yang keluar
    for (const p of (participants || [])) {
      try {
        const jid = normalizeJid(p);
        if (!jid) continue;
        const number = (jid.split('@')[0] || '').trim();

        // Ambil display name dari metadata grup (lebih stabil)
        let displayName = number;
        try {
          const groupParticipants = groupMetadata.participants || [];
          const userParticipant = groupParticipants.find(x => normalizeJid(x?.id || x) === jid);
          if (userParticipant && (userParticipant.name || userParticipant.notify)) {
            displayName = userParticipant.name || userParticipant.notify;
          }
        } catch {}

        // Ambil foto profil (opsional)
        let profilePicUrl = `https://s6.imgcdn.dev/YKC9Ho.png`; // avatar default
        try {
          const profilePic = await sock.profilePictureUrl(jid, 'image');
          if (profilePic) profilePicUrl = profilePic;
        } catch {}

        // Siapkan konteks untuk variabel template
        const ctx = {
          name: displayName,
          number,
          group: groupName,
          desc: groupDesc,
          count: memberCount,
          time: timeString
        };

        // Tentukan caption: pakai custom kalau ada, kalau tidak fallback default
        const defaultCaption = `👋 *@${number}*, selamat tinggal! Kami *tidak akan merindukanmu* 😅`;
        const finalCaption = customTpl ? renderTemplate(customTpl, ctx) : defaultCaption;

        // API gambar goodbye → pakai custom kalau diset; kalau tidak pakai default
        const apiUrl = customApi || (
          `https://api.some-random-api.com/welcome/img/2/gaming1` +
          `?type=leave&textcolor=red` +
          `&username=${encodeURIComponent(displayName)}` +
          `&guildName=${encodeURIComponent(groupName)}` +
          `&memberCount=${memberCount}` +
          `&avatar=${encodeURIComponent(profilePicUrl)}`
        );

        if (!textOnly) {
          try {
            const response = await fetch(apiUrl);
            if (response.ok) {
              const imageBuffer = await response.buffer();

              // Kirim gambar + caption (kustom / default)
              await sock.sendMessage(id, {
                image: imageBuffer,
                caption: finalCaption,
                mentions: [jid]
              });
              continue; // sukses, lanjut peserta berikutnya
            }
          } catch (e) {
            console.log('Goodbye image API gagal, fallback teks:', e?.message || e);
          }
        }

        // Fallback teks
        await sock.sendMessage(id, {
          text: finalCaption,
          mentions: [jid]
        });

      } catch (errorEach) {
        console.error('Error sending goodbye message:', errorEach);

        // Fallback teks jika error saat olah participant ini
        try {
          const jid = normalizeJid(p);
          const user = (jid.split('@')[0] || '').trim();
          const fallback = `👋 *@${user}*, selamat tinggal! Kami *tidak akan merindukanmu* 😅`;
          await sock.sendMessage(id, {
            text: fallback,
            mentions: [jid]
          });
        } catch {}
      }
    }
  } catch (error) {
    console.error('Error di handleLeaveEvent:', error);
  }
}

module.exports = { goodbyeCommand, handleLeaveEvent };
