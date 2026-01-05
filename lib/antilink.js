const { isJidGroup } = require('@whiskeysockets/baileys');
const { getAntilink, incrementWarningCount, resetWarningCount, isSudo } = require('../lib/index');
const isAdmin = require('../lib/isAdmin');
const config = require('../config');

const fs = require('fs');
const path = require('path');

const WARN_COUNT = config.WARN_COUNT || 3;

// ====== TOKEN IZIN SEKALI PAKAI (opsional) ======
const WHITELIST_TOKENS = ['#izinmin'];

// ====== FILE WHITELIST ======
const WL_PATH = path.join(__dirname, '../data/antilink_whitelist.json');

function ensureWhitelistFile() {
  if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
  if (!fs.existsSync(WL_PATH)) fs.writeFileSync(WL_PATH, JSON.stringify([], null, 2));
}
function readWhitelist() {
  ensureWhitelistFile();
  try {
    const raw = fs.readFileSync(WL_PATH, 'utf8');
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function writeWhitelist(list) {
  ensureWhitelistFile();
  fs.writeFileSync(WL_PATH, JSON.stringify(list, null, 2));
}

// ====== UTIL ======
const norm = s => (s || '').toLowerCase().trim();

// normalize domain from url or raw domain
function normalizeDomain(input) {
  if (!input) return '';
  let s = input.trim();

  // remove protocol
  s = s.replace(/^[a-z]+:\/\//i, '');
  // remove leading www.
  s = s.replace(/^www\./i, '');
  // take only host part before slash or query
  s = s.split(/[\/?#]/)[0];
  // remove trailing dot
  s = s.replace(/\.$/, '');
  return norm(s);
}

// Extract all domains from text (both URL & bare domains)
function extractDomains(text) {
  if (!text) return [];
  const t = text.trim();

  // match urls and bare domains
  const re = /(https?:\/\/[^\s]+|www\.[^\s]+|(?:[a-z0-9-]+\.)+[a-z]{2,})(?:[^\s]*)/gi;
  const out = new Set();
  let m;
  while ((m = re.exec(t)) !== null) {
    const d = normalizeDomain(m[0]);
    if (d) out.add(d);
  }
  return [...out];
}

// quick check if any url-ish exists
function containsURL(str) {
  if (!str || typeof str !== 'string') return false;
  const urlRegex = /(https?:\/\/\S+|www\.\S+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?)/i;
  return urlRegex.test(str);
}

// Ambil teks dari berbagai tipe pesan
function extractText(msg) {
  const m = msg.message || {};
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.buttonsMessage?.contentText ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    ''
  );
}

// Cek token whitelist
function hasWhitelistToken(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  return WHITELIST_TOKENS.some(tok => t.includes(tok.toLowerCase()));
}

// ====== Subdomain coverage check ======
function isCoveredByWhitelist(domain, whitelist) {
  // whitelist item boleh domain utama atau subdomain spesifik
  // cover if: exact match OR domain ends with '.' + whitelistItem
  for (const wl of whitelist) {
    if (domain === wl) return true;
    if (domain.endsWith('.' + wl)) return true;
  }
  return false;
}

// ====== CORE ======
async function Antilink(msg, sock) {
  const jid = msg.key?.remoteJid;
  if (!isJidGroup(jid)) return;

  const text = extractText(msg);
  if (!text) return;

  const sender = msg.key?.participant;
  if (!sender) return;

  // bypass by token
  if (hasWhitelistToken(text)) return;

  // admin/sudo bypass
  let botIsAdmin = false;
  try {
    const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, jid, sender);
    if (isSenderAdmin) return;
    botIsAdmin = !!isBotAdmin;
  } catch { botIsAdmin = false; }
  if (await isSudo(sender)) return;

  // no url -> ignore
  if (!containsURL(text)) return;

  // config
  const cfg = await getAntilink(jid, 'on'); // { enabled, action }
  if (!cfg?.enabled) return;
  const action = cfg.action || 'delete';

  // whitelist check (domain utama cover semua subdomain)
  const domainsInMsg = extractDomains(text);                   // e.g., ['mail.google.com', 't.me']
  const whitelist = readWhitelist().map(normalizeDomain);      // e.g., ['google.com', 't.me']

  // Jika semua domain terdeteksi masuk cakupan whitelist → lewati
  if (domainsInMsg.length && domainsInMsg.every(d => isCoveredByWhitelist(d, whitelist))) {
    return;
  }

  // otherwise, enforce
  try {
    if (botIsAdmin) {
      await sock.sendMessage(jid, { delete: msg.key });
    }

    switch (action) {
      case 'delete': {
        await sock.sendMessage(jid, {
          text: `🚫 *ANTILINK*\n@${sender.split('@')[0]}, tautan tidak diperbolehkan di sini.`,
          mentions: [sender]
        });
        break;
      }
      case 'kick': {
        if (botIsAdmin) {
          await sock.groupParticipantsUpdate(jid, [sender], 'remove');
          await sock.sendMessage(jid, {
            text: `🚫 *ANTILINK — KICK*\n@${sender.split('@')[0]} dikeluarkan karena mengirim tautan.`,
            mentions: [sender]
          });
        } else {
          await sock.sendMessage(jid, {
            text: `🚫 *ANTILINK — KICK*\nBot bukan admin, tidak dapat mengeluarkan @${sender.split('@')[0]}.`,
            mentions: [sender]
          });
        }
        break;
      }
      case 'warn': {
        const count = await incrementWarningCount(jid, sender);
        if (count >= WARN_COUNT) {
          if (botIsAdmin) {
            await sock.groupParticipantsUpdate(jid, [sender], 'remove');
            await resetWarningCount(jid, sender);
            await sock.sendMessage(jid, {
              text: `🚫 *ANTILINK — KICK*\n@${sender.split('@')[0]} dikeluarkan setelah ${WARN_COUNT} peringatan.`,
              mentions: [sender]
            });
          } else {
            await sock.sendMessage(jid, {
              text: `⚠️ *Peringatan ${WARN_COUNT}/${WARN_COUNT}*\nSeharusnya dikeluarkan, tapi bot bukan admin.`,
              mentions: [sender]
            });
          }
        } else {
          await sock.sendMessage(jid, {
            text: `⚠️ *Peringatan ${count}/${WARN_COUNT}*\n@${sender.split('@')[0]}, jangan kirim tautan.`,
            mentions: [sender]
          });
        }
        break;
      }
    }
  } catch (error) {
    console.error('Error in Antilink:', error);
  }
}

module.exports = { Antilink, readWhitelist, writeWhitelist, normalizeDomain, extractDomains };
