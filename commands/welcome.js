// commands/welcome.js — FINAL CLEAN (Baileys v7 safe: participant object -> JID)
'use strict';

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { isWelcomeOn } = require('../lib/index');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');

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

/* ================= Helpers ================= */

// Normalisasi participant (Baileys v7: object) -> JID "xxx@s.whatsapp.net"
function normalizeJid(p) {
  if (!p) return '';
  if (typeof p === 'string') return jidNormalizedUser(p);
  const cand = p.id || p.jid || p.user || p.phoneNumber || '';
  return cand ? jidNormalizedUser(cand) : '';
}

// Baca config welcome per grup dari JSON
function loadWelcomeConfig(groupId) {
  try {
    const p = path.join(__dirname, '../data/userGroupData.json');
    if (!fs.existsSync(p)) return {};
    const data = JSON.parse(fs.readFileSync(p, 'utf8') || '{}');
    return (data.welcome && data.welcome[groupId]) ? data.welcome[groupId] : {};
  } catch {
    return {};
  }
}

function renderTemplate(tpl, ctx) {
  return (tpl || '')
    .replace(/\{name\}/gi, ctx.name)
    .replace(/\{number\}/gi, ctx.number)
    .replace(/\{group\}/gi, ctx.group)
    .replace(/\{desc\}/gi, ctx.desc)
    .replace(/\{count\}/gi, String(ctx.count))
    .replace(/\{time\}/gi, ctx.time)
    .replace(/\{user\}/gi, '@' + ctx.number);
}

function buildChannelInfo(cfg) {
  if (cfg && cfg.channelId) {
    return {
      contextInfo: {
        forwardingScore: 1,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: cfg.channelId,
          newsletterName: 'Andika Bot',
          serverMessageId: -1
        }
      }
    };
  }
  return baseChannelInfo;
}

const { handleWelcome } = require('../lib/welcome');

/* ================ Command Handler (.welcome) ================ */
async function welcomeCommand(sock, chatId, message) {
  if (!chatId.endsWith('@g.us')) {
    await sock.sendMessage(chatId, { text: '❌ Perintah ini hanya bisa digunakan di *grup*.' });
    return;
  }
  const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
  const matchText = text.split(' ').slice(1).join(' ').trim();
  await handleWelcome(sock, chatId, message, matchText);
}

/* ================ Event Handler (JOIN) ================ */
async function handleJoinEvent(sock, id, participants) {
  try {
    const enabled = await isWelcomeOn(id);
    if (!enabled) return;

    const groupMetadata = await sock.groupMetadata(id);
    const groupName = groupMetadata.subject || 'Grup';
    const groupDescRaw = (groupMetadata.desc && groupMetadata.desc.toString()) || 'Belum ada deskripsi grup';
    const memberCount = (groupMetadata.participants || []).length;

    const cfg = loadWelcomeConfig(id) || {};
    const customTpl = (cfg.template || cfg.message || '').trim();
    const customApi = (cfg.imageApi || '').trim();
    const textOnly = !!cfg.textOnly;
    const channelInfo = buildChannelInfo(cfg);

    const now = new Date();
    const timeString = now.toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    for (const p of (participants || [])) {
      try {
        const jid = normalizeJid(p);
        if (!jid) {
          console.warn('[welcome] gagal normalizeJid:', p);
          continue;
        }

        const number = (jid.split('@')[0] || '').trim();

        // Cari display name dari metadata peserta
        let displayName = number;
        try {
          const gpParts = groupMetadata.participants || [];
          const me = gpParts.find(x => normalizeJid(x?.id || x) === jid);
          displayName = me?.notify || me?.name || number;
        } catch {}

        // Foto profil (optional)
        let profilePicUrl = 'https://s6.imgcdn.dev/YKCQxa.png';
        try {
          const profilePic = await sock.profilePictureUrl(jid, 'image');
          if (profilePic) profilePicUrl = profilePic;
        } catch {}

        // Deskripsi dipotong biar tidak kepanjangan
        const MAX_DESC = 600;
        const descPreview = (groupDescRaw || '').trim();
        const groupDesc = descPreview.length > MAX_DESC ? (descPreview.slice(0, MAX_DESC) + '…') : descPreview;

        const ctx = {
          name: displayName,
          number,
          group: groupName,
          desc: groupDesc,
          count: memberCount,
          time: timeString
        };

        // ===== UI Caption =====
        const headerBox = [
          '┏━〔 𝐌𝐄𝐌𝐁𝐄𝐑 𝐁𝐀𝐑𝐔 〕━┓',
          `┃ 👋 Selamat datang : @${number},`,
          `┃ 👥 Anggota : #${memberCount},`,
          `┃ ⏰ Waktu : ${timeString},`,
          '┗━━━━━━━━━━━━━━━━━━━━━━┛'
        ].join('\n');

        const defaultGreeting = `*@${number}*, selamat datang di *${groupName}*! 🎉`;
        const renderedCustom = customTpl ? renderTemplate(customTpl, ctx) : '';
        const bodyGreeting = (renderedCustom || defaultGreeting).trimEnd();

        const footer = [
          '┈┈┈┈┈┈┈┈┈┈',
          '🔖 *Deskripsi Grup*',
          groupDesc,
          '',
          '⚡ *Powered by Andika Bot*'
        ].join('\n');

        const finalCaption = `${headerBox}\n\n${bodyGreeting}\n\n${footer}`;

        // API gambar welcome → pakai custom kalau diset; kalau tidak pakai default
        const apiUrl = customApi || (
          'https://api.some-random-api.com/welcome/img/2/gaming4'
          + '?type=join&textcolor=green'
          + `&username=${encodeURIComponent(displayName)}`
          + `&guildName=${encodeURIComponent(groupName)}`
          + `&memberCount=${memberCount}`
          + `&avatar=${encodeURIComponent(profilePicUrl)}`
        );

        if (!textOnly) {
          try {
            const response = await fetch(apiUrl);
            if (response.ok) {
              const imageBuffer = await response.buffer();
              await sock.sendMessage(id, {
                image: imageBuffer,
                caption: finalCaption,
                mentions: [jid],
                ...channelInfo
              });
              continue; // sukses kirim gambar
            } else {
              const reason = await safeReadText(response);
              console.warn('[welcome] non-200:', response.status, reason);
            }
          } catch (e) {
            console.warn('[welcome] image API error:', e?.message || e);
          }
        }

        // Fallback teks
        await sock.sendMessage(id, {
          text: finalCaption,
          mentions: [jid],
          ...channelInfo
        });
      } catch (errEach) {
        console.error('Error welcome per participant:', errEach);

        // Fallback aman untuk kasus error
        try {
          const firstJid = normalizeJid(p);
          const firstNum = (firstJid.split('@')[0] || '').trim();
          await sock.sendMessage(id, {
            text: `👋 Selamat datang *@${firstNum}* di *${groupName}*! 🎉`,
            mentions: [firstJid],
            ...channelInfo
          });
        } catch {}
      }
    }
  } catch (error) {
    console.error('Error di handleJoinEvent:', error);
  }
}

/* ===== util kecil untuk baca response text aman ===== */
async function safeReadText(response) {
  try {
    return await response.text();
  } catch {
    return '<no-text>';
  }
}

module.exports = {
  welcomeCommand,
  handleJoinEvent
};
