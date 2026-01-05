// lib/isBanned.js — SAFE, kebal file kosong/rusak
'use strict';

const fs   = require('fs');
const path = require('path');

const DATA_DIR  = path.join(__dirname, '..', 'data');
const BAN_FILE  = path.join(DATA_DIR, 'banned.json'); // sama seperti sebelumnya

function ensureBanFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(BAN_FILE)) {
      // kalau belum ada file → bikin dengan array kosong
      fs.writeFileSync(BAN_FILE, '[]');
      return;
    }

    // kalau ada tapi isinya kosong / whitespace → isi []
    const raw = fs.readFileSync(BAN_FILE, 'utf8');
    if (!raw || !raw.trim()) {
      fs.writeFileSync(BAN_FILE, '[]');
    }
  } catch (e) {
    console.error('ensureBanFile error:', e.message);
  }
}

function loadBanList() {
  try {
    ensureBanFile();
    const raw  = fs.readFileSync(BAN_FILE, 'utf8') || '[]';
    const text = raw.trim() || '[]';
    const json = JSON.parse(text);
    return Array.isArray(json) ? json : [];
  } catch (e) {
    console.error('loadBanList error:', e.message);
    return [];
  }
}

function isBanned(userId) {
  const list = loadBanList();
  return list.includes(userId);
}

module.exports = { isBanned };
