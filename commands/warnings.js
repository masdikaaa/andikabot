// commands/warnings.js — FINAL (cek via reply/mention saja, tanpa daftar grup)
// - Sumber data: ../data/userGroupData.json → warnings[chatId][digits] = count
// - REPLY > MENTION untuk cek 1 user
// - Jika tanpa reply/mention: kirim instruksi agar user reply/mention

'use strict';

// ====== CONFIG ======
const MAX_TEXT_LEN = 3500; // batas aman panjang teks per pesan (untuk jaga-jaga split)

// ====== IMPORT ======
const fs = require('fs');
const path = require('path');

// Jika lib/index tidak punya normalizeId, fallback no-op aman
let normalizeId = (x) => String(x || '').replace(/\D+/g, '');
try {
  const lib = require('../lib/index');
  if (typeof lib.normalizeId === 'function') normalizeId = lib.normalizeId;
} catch { /* ignore, fallback dipakai */ }

// Path store utama (sesuai struktur proyek)
const STORE_PATH = path.resolve(__dirname, '../data/userGroupData.json');

// ---------- File helpers ----------
function loadStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) return { warnings: {} };
    const raw = fs.readFileSync(STORE_PATH, 'utf8') || '{}';
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return { warnings: {} };
    if (!data.warnings || typeof data.warnings !== 'object') data.warnings = {};
    return data;
  } catch {
    return { warnings: {} };
  }
}

// ---------- JID/Number helpers ----------
const onlyDigits = s => String(s || '').replace(/\D+/g, '');
function jidToDigits(jid) {
  const left = String(jid || '').split('@')[0];
  return onlyDigits(left);
}
function fmtAtDigitsFromJid(jid) {
  return '@' + jidToDigits(jid);
}

// ---------- Target resolvers (REPLY > MENTION) ----------
function getReplyTargetJid(message) {
  const ctx = message?.message?.extendedTextMessage?.contextInfo;
  if (!ctx) return null;
  if (ctx.participant) return ctx.participant; // user yang di-reply
  if (Array.isArray(ctx.mentionedJid) && ctx.mentionedJid.length) return ctx.mentionedJid[0];
  return null;
}
function getMentionTargetJid(message, mentionedJidList) {
  if (Array.isArray(mentionedJidList) && mentionedJidList.length) return mentionedJidList[0];
  const ctx = message?.message?.extendedTextMessage?.contextInfo;
  const arr = ctx?.mentionedJid;
  return Array.isArray(arr) && arr.length ? arr[0] : null;
}

// ---------- Hitung warnings ----------
function getWarnCount(store, chatId, userJid) {
  const digits = normalizeId(userJid) || jidToDigits(userJid);
  const byGroup = store.warnings?.[chatId] || {};
  const val = byGroup[digits] || 0;
  const legacy = store.warnings?.[digits] || 0; // legacy flat jika ada
  return Math.max(val, legacy);
}

// ---------- Progress bar ----------
function bar3(n) {
  const x = Math.max(0, Math.min(3, n | 0));
  return '🟨'.repeat(x) + '⬜'.repeat(3 - x);
}

// ==============================
//            MAIN
// ==============================
async function warningsCommand(sock, chatId, mentionedJidList = [], message) {
  const store = loadStore();

  // REPLY > MENTION
  const replyTarget = getReplyTargetJid(message);
  const mentionTarget = getMentionTargetJid(message, mentionedJidList);
  const target = replyTarget || mentionTarget;

  // ==== MODE: cek satu user (WAJIB ada target) ====
  if (target) {
    const count = getWarnCount(store, chatId, target);
    const txt =
`*『 ⚠️ CEK PERINGATAN 』*

👤 Pengguna : ${fmtAtDigitsFromJid(target)}
🏷️ Mode     : ${chatId.endsWith('@g.us') ? 'Grup' : 'Privat'}
🔢 Total    : *${count}/3* ${bar3(count)}

• Auto-kick akan terjadi saat mencapai 3 peringatan.
• Untuk cek user lain, *reply* pesan user tersebut atau *mention* akun-nya.`;

    // Biarkan mentions agar highlight hijau
    await sock.sendMessage(chatId, { text: txt, mentions: [target] }, { quoted: message });
    return;
  }

  // ==== TANPA target (tidak ada reply/mention) ====
  const info =
`*『 ℹ️ CARA CEK PERINGATAN 』*

Silakan *balas (reply) pesan user* atau *mention @user* lalu kirim *.warnings* untuk melihat peringatan pengguna tersebut.

Contoh:
• Reply pesan user lalu kirim: *.warnings*
• Atau: *.warnings @62812xxxxxxx*`;

  // jaga-jaga split jika kepanjangan (mestinya tidak)
  if (info.length <= MAX_TEXT_LEN) {
    await sock.sendMessage(chatId, { text: info }, { quoted: message });
  } else {
    let i = 0;
    while (i < info.length) {
      await sock.sendMessage(chatId, { text: info.slice(i, i + MAX_TEXT_LEN) }, { quoted: message });
      i += MAX_TEXT_LEN;
    }
  }
}

module.exports = warningsCommand;
