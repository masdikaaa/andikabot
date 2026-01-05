// commands/reminder.js — Baileys v7 (Node 20+)
// Fitur: .remind / .reminder (ADMIN/OWNER/SUDO ONLY)
// ✅ ID selalu pakai nomor terkecil yang kosong
// ✅ Reminder yang selesai / dibatalkan DIHAPUS dari JSON (tidak numpuk)
'use strict';

const fs   = require('fs');
const path = require('path');

// helper dari project kamu
const isAdmin = require('../lib/isAdmin');
const { isSudo } = require('../lib/index');

const DATA_DIR   = path.join(__dirname, '..', 'data');
const STORE_PATH = path.join(DATA_DIR, 'reminders.json');
const TICK_MS    = 20 * 1000; // cek tiap 20 detik
let _timer = null;
let _sock  = null;

/* -------------------- util io -------------------- */
function ensureDir(p){ if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function readJSON(p, fb){ try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; } }
function writeJSON(p, o){ try { ensureDir(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(o, null, 2)); } catch {} }
function now(){ return Date.now(); }

/* -------------------- store -------------------- */
// lastId tidak dipakai lagi, keep utk kompatibilitas file lama
function loadStore() {
  const j = readJSON(STORE_PATH, { items: [], lastId: 0 });
  if (!Array.isArray(j.items)) j.items = [];
  return j;
}
function saveStore(s){ writeJSON(STORE_PATH, s); }

// ambil ID terkecil yang belum dipakai
function nextAvailableId(s) {
  const used = new Set(s.items.map(x => x.id));
  let i = 1;
  while (used.has(i)) i++;
  return i;
}

/* -------------------- parsing -------------------- */
const DAY_MAP = {
  sun: 0, sunday: 0, minggu: 0,
  mon: 1, monday: 1, senin: 1,
  tue: 2, tuesday: 2, selasa: 2,
  wed: 3, wednesday: 3, rabu: 3,
  thu: 4, thursday: 4, kamis: 4,
  fri: 5, friday: 5, jumat: 5, "jum'at": 5,
  sat: 6, saturday: 6, sabtu: 6,
};

function pad2(n){ return n < 10 ? '0'+n : ''+n; }
function fmtTS(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function parseRelative(text) {
  // e.g. "1h 30m", "10m", "45s", "2d 5h"
  const re = /(\d+)\s*(d|h|m|s)\b/gi;
  let m, ms = 0, found = false;
  while ((m = re.exec(text))) {
    const n = parseInt(m[1], 10);
    const u = m[2].toLowerCase();
    found = true;
    if (u === 'd') ms += n * 24 * 3600 * 1000;
    else if (u === 'h') ms += n * 3600 * 1000;
    else if (u === 'm') ms += n * 60 * 1000;
    else if (u === 's') ms += n * 1000;
  }
  return found ? (now() + ms) : null;
}

function parseTimeHM(hm) {
  // "14:30" -> {h:14,m:30}
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  let h = parseInt(m[1], 10);
  let mi = parseInt(m[2], 10);
  if (h<0 || h>23 || mi<0 || mi>59) return null;
  return { h, mi };
}

function nextDailyAt(h, mi, base = new Date()) {
  const d = new Date(base.getTime());
  d.setSeconds(0, 0);
  d.setHours(h, mi, 0, 0);
  if (d.getTime() <= base.getTime()) d.setDate(d.getDate()+1);
  return d.getTime();
}

function nextWeeklyAt(weekday, h, mi, base = new Date()) {
  const d = new Date(base.getTime());
  d.setSeconds(0, 0);
  const cur = d.getDay();
  let add = (weekday - cur);
  if (add < 0 || (add === 0 && (d.getHours() > h || (d.getHours() === h && d.getMinutes() >= mi)))) {
    add += 7;
  }
  d.setDate(d.getDate() + add);
  d.setHours(h, mi, 0, 0);
  return d.getTime();
}

/* -------------------- scheduler -------------------- */
function initReminderScheduler(sock) {
  _sock = sock;
  if (_timer) clearInterval(_timer);
  _timer = setInterval(async () => {
    try {
      const s = loadStore();
      const nowTs = now();
      let changed = false;
      const removeIds = new Set(); // kumpulkan yang harus DIHAPUS (one-off selesai)

      for (const it of s.items) {
        if (typeof it.dueTs !== 'number') continue;
        if (nowTs >= it.dueTs) {
          // kirim reminder
          try {
            await _sock.sendMessage(it.chatId, {
              text: `⏰ *Reminder #${it.id}*\n${it.text}\n\n— ${it.creatorName || 'Anon'} • ${fmtTS(Date.now())}`
            });
          } catch {}

          // reschedule / remove
          if (it.repeat === 'daily' && it.timeOfDay) {
            it.dueTs = nextDailyAt(it.timeOfDay.h, it.timeOfDay.mi, new Date(nowTs + 1000));
            changed = true;
          } else if (it.repeat === 'weekly' && typeof it.weekday === 'number' && it.timeOfDay) {
            it.dueTs = nextWeeklyAt(it.weekday, it.timeOfDay.h, it.timeOfDay.mi, new Date(nowTs + 1000));
            changed = true;
          } else {
            // one-off: tandai untuk DIHAPUS agar slot ID lowong
            removeIds.add(it.id);
            changed = true;
          }
        }
      }

      if (removeIds.size > 0) {
        s.items = s.items.filter(x => !removeIds.has(x.id));
      }

      if (changed) saveStore(s);
    } catch (e) {
      // diamkan
    }
  }, TICK_MS);
}

/* -------------------- helper izin (admin only) -------------------- */
async function assertAdminOnly(sock, chatId, message) {
  const isGroup = chatId.endsWith('@g.us');
  const senderId = message.key.participant || message.key.remoteJid;

  // owner bot (fromMe) selalu lolos
  if (message.key.fromMe) return true;

  // sudo juga lolos
  try {
    if (await isSudo(senderId)) return true;
  } catch {}

  // di grup: wajib admin
  if (isGroup) {
    try {
      const st = await isAdmin(sock, chatId, senderId, message);
      if (st && st.isSenderAdmin) return true;
    } catch {}
    await sock.sendMessage(chatId, { text: '🚫 *Fitur reminder hanya untuk admin grup / owner / sudo.*' }, { quoted: message });
    return false;
  }

  // di chat pribadi: hanya owner/sudo
  await sock.sendMessage(chatId, { text: '🚫 *Fitur reminder hanya untuk owner bot / sudo.*' }, { quoted: message });
  return false;
}

/* -------------------- usage text -------------------- */
function usage() {
  return [
    '╭─〔 ⏰ *REMINDER (ADMIN ONLY)* 〕',
    '│ .remind in <durasi> <teks>',
    '│   • .remind in 10m Minum air',
    '│   • .remind in 1h 30m Standup',
    '│   • Satuan: d=hari, h=jam, m=menit, s=detik (bisa digabung)',
    '│',
    '│ .remind at <HH:MM> <teks>  (hari ini, kalau lewat → besok)',
    '│   • .remind at 21:00 Doa malam',
    '│',
    '│ .remind on <YYYY-MM-DD> <HH:MM> <teks>',
    '│   • .remind on 2025-01-01 07:00 Tahun baru',
    '│',
    '│ .remind daily <HH:MM> <teks>  (berulang harian)',
    '│   • .remind daily 12:30 Makan siang',
    '│',
    '│ .remind weekly <day> <HH:MM> <teks>  (berulang mingguan)',
    "│   • Hari: minggu/senin/selasa/rabu/kamis/jumat/jum'at/sabtu",
    '│   • Atau: sun..sat / sunday..saturday',
    '│   • .remind weekly jumat 11:30 Berangkat sholat Jumat',
    '│',
    '│ .remind list',
    '│ .remind cancel <id>',
    '╰────────────────────────────'
  ].join('\n');
}

function creatorNameFromMessage(msg) {
  const name =
    msg.pushName ||
    msg?.key?.participant ||
    msg?.key?.remoteJid ||
    'User';
  return String(name);
}

/* -------------------- command -------------------- */
async function remindCommand(sock, chatId, message, argsStr) {
  // Gate: admin/owner/sudo only
  const allowed = await assertAdminOnly(sock, chatId, message);
  if (!allowed) return;

  const s = loadStore();
  const parts = (argsStr || '').trim().split(/\s+/);
  const sub = (parts[0] || '').toLowerCase();

  // bantuan
  if (!sub || sub === 'help') {
    await sock.sendMessage(chatId, { text: usage() }, { quoted: message });
    return;
  }

  const creator = message.key.participant || message.key.remoteJid;
  const creatorName = creatorNameFromMessage(message);

  // LIST
  if (sub === 'list') {
    const my = s.items.filter(x => x.chatId === chatId);
    if (my.length === 0) {
      await sock.sendMessage(chatId, { text: '📭 Tidak ada reminder aktif di chat ini.' }, { quoted: message });
      return;
    }
    const lines = ['🗒️ *Reminder aktif:*'];
    for (const it of my.sort((a,b)=>a.dueTs-b.dueTs)) {
      lines.push(`• #${it.id} — ${fmtTS(it.dueTs)} — ${it.text}${it.repeat ? ` (${it.repeat})` : ''}`);
    }
    await sock.sendMessage(chatId, { text: lines.join('\n') }, { quoted: message });
    return;
  }

  // CANCEL → hapus agar slot ID lowong
  if (sub === 'cancel' || sub === 'delete' || sub === 'del') {
    const id = parseInt(parts[1], 10);
    if (isNaN(id)) {
      await sock.sendMessage(chatId, { text: '❌ Format: *.remind cancel <id>*\nLihat *.remind list* untuk ID.' }, { quoted: message });
      return;
    }
    const before = s.items.length;
    s.items = s.items.filter(x => !(x.id === id && x.chatId === chatId));
    if (s.items.length === before) {
      await sock.sendMessage(chatId, { text: `❌ Reminder #${id} tidak ditemukan.` }, { quoted: message });
      return;
    }
    saveStore(s);
    await sock.sendMessage(chatId, { text: `✅ Reminder #${id} dibatalkan & dihapus.` }, { quoted: message });
    return;
  }

  // IN (relative) — one-off
  if (sub === 'in') {
    const afterIn = (argsStr || '').trim().slice(2).trim(); // "10m sesuatu"
    const m = afterIn.match(/^(.+?)\s+(.+)$/);
    if (!m) {
      await sock.sendMessage(chatId, { text: '❌ Format: *.remind in <durasi> <teks>*\ncontoh: *.remind in 45m Minum air*' }, { quoted: message });
      return;
    }
    const dur = m[1];
    const text = m[2];
    const due = parseRelative(dur);
    if (!due || due - now() < 1000) {
      await sock.sendMessage(chatId, { text: '❌ Durasi tidak valid. Contoh: 10m, 1h 30m, 2d 5h.' }, { quoted: message });
      return;
    }
    const id = nextAvailableId(s);
    s.items.push({
      id, chatId, creator, creatorName,
      text,
      dueTs: due,
      repeat: null
    });
    saveStore(s);
    await sock.sendMessage(chatId, { text: `✅ Reminder #${id} dibuat.\n🕒 ${fmtTS(due)} — ${text}` }, { quoted: message });
    return;
  }

  // AT HH:MM — one-off (jadwal besok kalau sudah lewat)
  if (sub === 'at') {
    const hm = parts[1] || '';
    const time = parseTimeHM(hm);
    if (!time) {
      await sock.sendMessage(chatId, { text: '❌ Format: *.remind at HH:MM <teks>*\ncontoh: *.remind at 21:00 Doa malam*' }, { quoted: message });
      return;
    }
    const text = (argsStr || '').trim().split(/\s+/).slice(2).join(' ').trim();
    if (!text) {
      await sock.sendMessage(chatId, { text: '❌ Teks pengingat kosong.' }, { quoted: message });
      return;
    }
    const due = nextDailyAt(time.h, time.mi, new Date());
    const id = nextAvailableId(s);
    s.items.push({
      id, chatId, creator, creatorName,
      text,
      dueTs: due,
      repeat: null
    });
    saveStore(s);
    await sock.sendMessage(chatId, { text: `✅ Reminder #${id} dibuat.\n🕒 ${fmtTS(due)} — ${text}` }, { quoted: message });
    return;
  }

  // ON YYYY-MM-DD HH:MM — one-off
  if (sub === 'on') {
    const dateStr = parts[1] || '';
    const hm = parts[2] || '';
    const time = parseTimeHM(hm);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !time) {
      await sock.sendMessage(chatId, { text: '❌ Format: *.remind on YYYY-MM-DD HH:MM <teks>*' }, { quoted: message });
      return;
    }
    const text = (argsStr || '').trim().split(/\s+/).slice(3).join(' ').trim();
    if (!text) {
      await sock.sendMessage(chatId, { text: '❌ Teks pengingat kosong.' }, { quoted: message });
      return;
    }
    const [Y,M,D] = dateStr.split('-').map(n=>parseInt(n,10));
    const d = new Date(Y, (M-1), D, time.h, time.mi, 0, 0);
    const due = d.getTime();
    if (isNaN(due) || due <= now()+1000) {
      await sock.sendMessage(chatId, { text: '❌ Waktu sudah lewat / tidak valid.' }, { quoted: message });
      return;
    }
    const id = nextAvailableId(s);
    s.items.push({
      id, chatId, creator, creatorName,
      text,
      dueTs: due,
      repeat: null
    });
    saveStore(s);
    await sock.sendMessage(chatId, { text: `✅ Reminder #${id} dibuat.\n🕒 ${fmtTS(due)} — ${text}` }, { quoted: message });
    return;
  }

  // DAILY HH:MM — repeat
  if (sub === 'daily') {
    const hm = parts[1] || '';
    const time = parseTimeHM(hm);
    if (!time) {
      await sock.sendMessage(chatId, { text: '❌ Format: *.remind daily HH:MM <teks>*' }, { quoted: message });
      return;
    }
    const text = (argsStr || '').trim().split(/\s+/).slice(2).join(' ').trim();
    if (!text) {
      await sock.sendMessage(chatId, { text: '❌ Teks pengingat kosong.' }, { quoted: message });
      return;
    }
    const due = nextDailyAt(time.h, time.mi, new Date());
    const id = nextAvailableId(s);
    s.items.push({
      id, chatId, creator, creatorName,
      text,
      dueTs: due,
      repeat: 'daily',
      timeOfDay: time
    });
    saveStore(s);
    await sock.sendMessage(chatId, { text: `✅ Reminder harian #${id} dibuat.\n🕒 ${fmtTS(due)} — ${text}` }, { quoted: message });
    return;
  }

  // WEEKLY <day> HH:MM — repeat
  if (sub === 'weekly') {
    const dayRaw = (parts[1] || '').toLowerCase();
    const weekday = DAY_MAP[dayRaw];
    const time = parseTimeHM(parts[2] || '');
    if (typeof weekday !== 'number' || !time) {
      await sock.sendMessage(chatId, { text: '❌ Format: *.remind weekly <day> HH:MM <teks>*\ncontoh: *.remind weekly jumat 11:30 Standup*' }, { quoted: message });
      return;
    }
    const text = (argsStr || '').trim().split(/\s+/).slice(3).join(' ').trim();
    if (!text) {
      await sock.sendMessage(chatId, { text: '❌ Teks pengingat kosong.' }, { quoted: message });
      return;
    }
    const due = nextWeeklyAt(weekday, time.h, time.mi, new Date());
    const id = nextAvailableId(s);
    s.items.push({
      id, chatId, creator, creatorName,
      text,
      dueTs: due,
      repeat: 'weekly',
      weekday,
      timeOfDay: time
    });
    saveStore(s);
    await sock.sendMessage(chatId, { text: `✅ Reminder mingguan #${id} dibuat.\n🕒 ${fmtTS(due)} — ${text}` }, { quoted: message });
    return;
  }

  // fallback → bantuan
  await sock.sendMessage(chatId, { text: usage() }, { quoted: message });
}

/* -------------------- exports -------------------- */
module.exports = {
  remindCommand,
  initReminderScheduler
};
