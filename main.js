// main.js — FINAL (Baileys v7 safe) — prefix resmi TITIK (.) untuk semua command
const settings = require('./settings');
require('./config.js');

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const ytdl = require('ytdl-core');
const yts = require('yt-search');

const { isBanned } = require('./lib/isBanned');
const { fetchBuffer } = require('./lib/myfunc');
const { isSudo, getChatbot } = require('./lib/index');

const {
  autotypingCommand,
  isAutotypingEnabled,
  handleAutotypingForMessage,
  handleAutotypingForCommand,
  handleAutotypingForCommand: _hA,
  showTypingAfterCommand
} = require('./commands/autotyping');
const {
  autoreadCommand,
  isAutoreadEnabled,
  handleAutoread
} = require('./commands/autoread');

const {
  daftarCommand,
  limitCommand,
  reglistCommand,
  regdelCommand,
  limitAddCommand,
  limitDelCommand,
  limitAllCommand,
  // helper untuk gate & consumsi limit
  isMemberRegistered,
  getRemainingQuota,
  consumeQuota,
  timeUntilReset,
  formatDuration
} = require('./commands/daftar');

// Command imports
const tagAllCommand = require('./commands/tagall');
const helpCommand = require('./commands/help');
const banCommand = require('./commands/ban');
const { promoteCommand, handlePromotionEvent } = require('./commands/promote');
const { demoteCommand, handleDemotionEvent } = require('./commands/demote');
const muteCommand = require('./commands/mute');
const unmuteCommand = require('./commands/unmute');
const stickerCommand = require('./commands/sticker');
const isAdmin = require('./lib/isAdmin');
const warnCommand = require('./commands/warn');
const warningsCommand = require('./commands/warnings');
const ttsCommand = require('./commands/tts');
const { tictactoeCommand, handleTicTacToeMove } = require('./commands/tictactoe');
const { incrementMessageCount, topMembers, removeUserFromGroupCounts } = require('./commands/topmembers');
const ownerCommand = require('./commands/owner');
const deleteCommand = require('./commands/delete');
const { handleAntilinkCommand } = require('./commands/antilink');
const { handleAntitagCommand, handleTagDetection } = require('./commands/antitag');
const { Antilink } = require('./lib/antilink');

const { mentionCommand, handleMentionDetection } = require('./commands/mention');

const memeCommand = require('./commands/meme');
const tagCommand = require('./commands/tag');
const tagNotAdminCommand = require('./commands/tagnotadmin');
const hideTagCommand = require('./commands/hidetag');
const jokeCommand = require('./commands/joke');
const quoteCommand = require('./commands/quote');
const factCommand = require('./commands/fact');
const weatherCommand = require('./commands/weather');
const newsCommand = require('./commands/news');
const kickCommand = require('./commands/kick');
const simageCommand = require('./commands/simage');
const attpCommand = require('./commands/attp');
const { startHangman, guessLetter } = require('./commands/hangman');
const { startTrivia, answerTrivia } = require('./commands/trivia');
const { complimentCommand } = require('./commands/compliment');
const { insultCommand } = require('./commands/insult');
const { lyricsCommand } = require('./commands/lyrics');
const { dareCommand } = require('./commands/dare');
const { truthCommand } = require('./commands/truth');
const { clearCommand } = require('./commands/clear');
const pingCommand = require('./commands/ping');
const spekCommand = require('./commands/spek');
const blurCommand = require('./commands/img-blur');
const { welcomeCommand, handleJoinEvent } = require('./commands/welcome');
const { goodbyeCommand, handleLeaveEvent } = require('./commands/goodbye');
const githubCommand = require('./commands/github');
const { handleAntiBadwordCommand, handleBadwordDetection } = require('./lib/antibadword');
const antibadwordCommand = require('./commands/antibadword');
const { handleChatbotCommand, handleChatbotResponse } = require('./commands/chatbot');

const takeCommand = require('./commands/take');
const { flirtCommand } = require('./commands/flirt');
const characterCommand = require('./commands/character');
const wastedCommand = require('./commands/wasted');
const shipCommand = require('./commands/ship');
const groupInfoCommand = require('./commands/groupinfo');
const resetlinkCommand = require('./commands/resetlink');
const staffCommand = require('./commands/staff');
const unbanCommand = require('./commands/unban');
const emojimixCommand = require('./commands/emojimix');

const viewOnceCommand = require('./commands/viewonce');
const clearSessionCommand = require('./commands/clearsession');
const { autoStatusCommand, handleStatusUpdate } = require('./commands/autostatus');

const { simpCommand } = require('./commands/simp');
const { stupidCommand } = require('./commands/stupid');

const stickerTelegramCommand = require('./commands/stickertelegram');
const textmakerCommand = require('./commands/textmaker');

const { handleAntideleteCommand, handleMessageRevocation, storeMessage } = require('./commands/antidelete');
const clearTmpCommand = require('./commands/cleartmp');
const setProfilePicture = require('./commands/setpp');
const { setGroupDescription, setGroupName, setGroupPhoto } = require('./commands/groupmanage');
const linkGroupCommand = require('./commands/linkgroup');

const instagramCommand = require('./commands/instagram');
const facebookCommand = require('./commands/facebook');
const spotifyCommand = require('./commands/spotify');
const playCommand = require('./commands/play');
const tiktokCommand = require('./commands/tiktok');
const songCommand = require('./commands/song');
const aiCommand = require('./commands/ai');
const urlCommand = require('./commands/url');
const { handleTranslateCommand } = require('./commands/translate');
const { handleSsCommand } = require('./commands/ss');
const { addCommandReaction, handleAreactCommand } = require('./lib/reactions');

const { goodnightCommand } = require('./commands/goodnight');
const { shayariCommand } = require('./commands/shayari');
const { rosedayCommand } = require('./commands/roseday');
const imagineCommand = require('./commands/imagine');
const videoCommand = require('./commands/video');
const sudoCommand = require('./commands/sudo');

const { piesCommand, piesAlias } = require('./commands/pies');
const stickercropCommand = require('./commands/stickercrop');
const updateCommand = require('./commands/update');
const removebgCommand = require('./commands/removebg');
const { reminiCommand } = require('./commands/remini');
const { igsCommand } = require('./commands/igs');
const { anticallCommand, readState: readAnticallState } = require('./commands/anticall');
const { pmblockerCommand, readState: readPmBlockerState } = require('./commands/pmblocker');
const settingsCommand = require('./commands/settings');
const soraCommand = require('./commands/sora');
const googleCommand = require('./commands/google');
const { text2qrCommand } = require('./commands/text2qr');
const { gempaCommand } = require('./commands/gempa');
const { domainCommand } = require('./commands/domain');
const { pingDomainCommand } = require('./commands/pingdomain');
const { nameserverCommand } = require('./commands/nameserver');
const dnscheckCommand = require('./commands/dnscheck');
const { jobCommand } = require('./commands/job');
const { sholatCommand } = require('./commands/sholat');
const { carbonCommand } = require('./commands/carbon');
const { claudeCommand } = require('./commands/claude');
const { bratstickerCommand } = require('./commands/bratsticker');
const subdomainCommand = require('./commands/subdomain');
const curlCmd = require('./commands/curl');
const nmapCmd = require('./commands/nmap');
const antiStickerCmdMod = require('./commands/antisticker');
const { antiStickerCommand } = require('./commands/antisticker');
const { AntiSticker } = require('./lib/antisticker');
const getppCommand = require('./commands/getpp');
const { remindCommand } = require('./commands/reminder');
const resiCommand = require('./commands/resi');
const npmCheckCommand = require('./commands/npmcheck');
const gdriveDownloadCommand = require('./commands/gdrivedl');
const capcutCommand = require('./commands/capcut');

// Top Rank auto (notif realtime top 20)
const { handleTopRankAutoAfterIncrement, topRankAutoCommand } = require('./commands/toprank_auto');

// Docker self-restart command
const { dockerCommand } = require('./commands/docker');

// ===== Baileys v7 participant normalizer =====
const { jidNormalizedUser } = require('@whiskeysockets/baileys');
function normalizeJid(p) {
  if (!p) return '';
  if (typeof p === 'string') return jidNormalizedUser(p);
  const cand = p.id || p.jid || p.user || p.phoneNumber || '';
  return cand ? jidNormalizedUser(cand) : '';
}
function numberFrom(p) {
  const j = normalizeJid(p);
  return (j.split('@')[0] || '').trim();
}

// ===== GLOBAL SEND DELAY CONFIG (biar natural, anti spam) =====
const MIN_DELAY_MS = 350;   // minimal jeda ~0.35s
const MAX_DELAY_MS = 1200;  // base maksimal, bisa nambah dikit utk text panjang

function randomDelayMs(estimatedLen) {
  let base = MIN_DELAY_MS;

  // tambah delay sesuai panjang kira-kira
  if (estimatedLen > 60) base += 250;    // text lumayan panjang
  if (estimatedLen > 180) base += 350;   // paragraf
  if (estimatedLen > 360) base += 500;   // jawaban panjang

  const jitter = Math.floor(Math.random() * 250); // random kecil biar gak kaku
  const total = base + jitter;

  // clamp biar gak kebangetan
  return Math.min(MAX_DELAY_MS + 800, total); // max sekitar 2s-an
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Global settings
global.packname = settings.packname;
global.author = settings.author;
global.channelLink = 'https://whatsapp.com/channel/0029VbBT6La4SpkP1fSVn50p';
global.ytch = 'Andika Community';

// Channel badge
const channelInfo = {
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

/* ========= Daftar command dikenal (FORMAT TITIK) ========= */
function isKnownCommand(userMessage) {
  const cmd = userMessage.split(/\s+/)[0];
  const known = new Set([
    '.simage', '.kick', '.mute', '.unmute',
    '.google', '.qr', '.text2qr', '.subdomain', '.resi',
    '.gempa', '.infogempa', '.cekgempa', '.curl', '.nmap',
    '.domain', '.cekdomain', '.pingdomain', '.pinghost', '.netping',
    '.nameserver', '.ns', '.dnsns', '.dnscheck',
    '.job', '.sholat', '.carbon',
    '.ban', '.unban', '.h', '.getpp',
    '.help', '.menu', '.bot', '.list',
    '.sticker', '.s', '.bratsticker', '.brat',
    '.warnings', '.warn', '.tts',
    '.delete', '.del', '.attp',
    '.settings', '.mode',
    '.anticall', '.pmblocker',
    '.owner', '.tagall', '.tagnotadmin', '.hidetag', '.tag',
    '.antilink', '.antitag', '.antisticker',
    '.meme', '.joke', '.quote', '.fact',
    '.weather', '.news', '.claude',
    '.ttt', '.tictactoe', '.move', '.topmembers',
    '.hangman', '.guess', '.trivia', '.answer',
    '.compliment', '.insult', '.lyrics',
    '.simp', '.stupid', '.itssostupid', '.iss',
    '.dare', '.truth', '.clear',
    '.promote', '.demote',
    '.ping', '.spek',
    '.mention', '.setmention',
    '.blur', '.welcome', '.goodbye',
    '.git', '.github', '.sc', '.script', '.repo',
    '.antibadword', '.chatbot',
    '.take', '.flirt', '.character', '.waste', '.ship',
    '.groupinfo', '.infogp', '.infogrupo',
    '.resetlink', '.revoke', '.anularlink',
    '.linkgroup',
    '.staff', '.admins', '.listadmin',
    '.tourl', '.url',
    '.emojimix', '.emix',
    '.tg', '.stickertelegram', '.tgsticker', '.telesticker',
    '.vv', '.clearsession', '.clearsesi',
    '.autostatus',
    '.metallic', '.ice', '.snow', '.impressive', '.matrix', '.light', '.neon', '.devil', '.purple', '.thunder', '.leaves', '.1917', '.arena', '.hacker', '.sand', '.blackpink', '.glitch', '.fire',
    '.antidelete', '.surrender',
    '.cleartmp', '.setpp', '.setgdesc', '.setgname', '.setgpp',
    '.instagram', '.insta', '.ig', '.igsc', '.igs',
    '.fb', '.facebook',
    '.music', '.spotify', '.play', '.mp3', '.ytmp3', '.song',
    '.video', '.ytmp4',
    '.tiktok', '.tt',
    '.gpt', '.gemini',
    '.translate', '.trt',
    '.ss', '.ssweb', '.screenshot',
    '.areact', '.autoreact', '.autoreaction',
    '.sudo', '.goodnight', '.lovenight', '.gn',
    '.shayari', '.shayri', '.roseday',
    '.imagine', '.flux', '.dalle',
    '.jid', '.autotyping', '.autoread',
    '.crop', '.pies', '.china', '.indonesia', '.japan', '.korea', '.hijab',
    '.update', '.removebg', '.rmbg', '.nobg',
    '.remini', '.enhance', '.upscale',
    '.sora',
    // registrasi/limit system
    '.daftar', '.limit', '.reglist', '.regdel', '.limitadd', '.limitdel', '.limitall',
    // NEW
    '.remind', '.reminder', '.npm', '.gdrive', '.capcut', '.cc',
    '.toprankauto',
    // Docker self-restart
    '.docker'
  ]);
  return known.has(cmd);
}

// Tambah ke FREE agar admin nggak kehalang limit/daftar (tetap admin-only saat eksekusi)
const FREE_COMMANDS = new Set([
  '.limit', '.limitall', '.daftar', '.reglist', '.regdel', '.limitadd', '.limitdel',
  '.help', '.menu',
  '.linkgroup',
]);

/* ==== PMBLOCKER helpers ==== */
const PMBLOCKER_PATH = './data/pmblocker.json';
function savePmBlockedList(nextBlocked) {
  try {
    if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
    const cur = readPmBlockerState() || { enabled: false, message: '', blocked: [] };
    const payload = {
      enabled: !!cur.enabled,
      message: cur.message || '',
      blocked: Array.isArray(nextBlocked) ? nextBlocked : (cur.blocked || [])
    };
    fs.writeFileSync(PMBLOCKER_PATH, JSON.stringify(payload, null, 2));
  } catch {}
}

/* ==== BAN CHAT per-user helpers ==== */
const BAN_CHAT_USER_FILE = path.join(__dirname, 'data', 'banned_chat_users.json');

function ensureBanChatUserFile() {
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(BAN_CHAT_USER_FILE)) fs.writeFileSync(BAN_CHAT_USER_FILE, '[]');
  return BAN_CHAT_USER_FILE;
}

function isUserChatBanned(userJid) {
  try {
    const file = ensureBanChatUserFile();
    const raw = fs.readFileSync(file, 'utf8') || '[]';
    const text = raw.trim() || '[]';
    const list = JSON.parse(text);
    return Array.isArray(list) && list.includes(userJid);
  } catch {
    return false;
  }
}

function isChatBanned(jid) {
  try {
    const file = ensureBanChatFile();
    const raw = fs.readFileSync(file, 'utf8');
    const list = JSON.parse(raw);
    return Array.isArray(list) && list.includes(jid);
  } catch {
    return false;
  }
}

async function handleMessages(sock, messageUpdate, printLog) {
  let chatId;
  try {
    // === PATCH GLOBAL: delay untuk semua sock.sendMessage (sekali per koneksi) ===
    if (!sock.__andikaDelayPatched) {
      const originalSendMessage = sock.sendMessage.bind(sock);

      sock.sendMessage = async (jid, content, options) => {
        try {
          // Beberapa tipe pesan jangan ditahan lama (delete/reaction dsb)
          const isFastMessage =
            content &&
            (
              content.delete ||                 // hapus pesan
              content.reactionMessage ||        // react
              content.pollUpdateMessage ||      // update poll
              content.ephemeralMessage          // ephemeral wrapper
            );

          if (!isFastMessage) {
            let estimatedLen = 0;
            if (typeof content?.text === 'string') {
              estimatedLen = content.text.length;
            } else if (typeof content?.caption === 'string') {
              estimatedLen = content.caption.length;
            } else if (Array.isArray(content?.buttons)) {
              // kira-kira dari body button + text
              estimatedLen = (content.text || '').length + content.buttons.length * 10;
            }

            const delayMs = randomDelayMs(estimatedLen);
            await sleep(delayMs);
          }
        } catch {
          // kalau gagal estimasi, tetep kirim tanpa delay tambahan
        }

        return originalSendMessage(jid, content, options);
      };

      sock.__andikaDelayPatched = true;
      console.log('✅ Global sendMessage delay patch aktif (AndikaBot).');
    }
    // =======================================================================

    const { messages, type } = messageUpdate;
    if (type !== 'notify') return;

    const message = messages[0];
    if (!message?.message) return;

    await handleAutoread(sock, message);

    if (message.message) {
      // simpan untuk antidelete
      storeMessage(sock, message);
    }

    if (message.message?.protocolMessage?.type === 0) {
      await handleMessageRevocation(sock, message);
      return;
    }

    chatId = message.key.remoteJid;

    // ==== FIX: normalisasi sender pakai normalizeJid (lid → jid biasa) ====
    const senderIdRaw = message.key.participant || message.key.remoteJid;
    const senderId = normalizeJid(senderIdRaw);
    const isGroup = chatId.endsWith('@g.us');
    const senderIsSudo = await isSudo(senderId);
    // =======================================================================

    // BAN CHAT per-user: kalau user dibanned chat → auto-delete + stop
    try {
      const isOwnerOrSudo = message.key.fromMe || senderIsSudo;
      let isSenderAdminEarly = false;

      if (isGroup) {
        try {
          const stEarly = await isAdmin(sock, chatId, senderId, message);
          isSenderAdminEarly = !!stEarly.isSenderAdmin;
        } catch {}
      }

      // Owner / sudo / admin TIDAK kena ban chat
      if (!isOwnerOrSudo && !isSenderAdminEarly && isUserChatBanned(senderId)) {
        try {
          await sock.sendMessage(chatId, { delete: message.key });
        } catch (e) {
          console.error('Gagal auto-delete pesan user banned chat:', e.message);
        }
        return;
      }
    } catch (e) {
      console.error('Gagal cek banned chat user:', e.message);
    }

    // mode public/private
    let isPublic = true;
    try {
      const dataMode = JSON.parse(fs.readFileSync('./data/messageCount.json'));
      if (typeof dataMode.isPublic === 'boolean') isPublic = dataMode.isPublic;
    } catch (e) {}

    // ===== Ambil teks user =====
    let userMessage = (
      message.message?.conversation?.trim() ||
      message.message?.extendedTextMessage?.text?.trim() ||
      message.message?.imageMessage?.caption?.trim() ||
      message.message?.videoMessage?.caption?.trim() ||
      ''
    ).toLowerCase().replace(/\/\s+/g, '/').trim();

    let rawText =
      message.message?.conversation?.trim() ||
      message.message?.extendedTextMessage?.text?.trim() ||
      message.message?.imageMessage?.caption?.trim() ||
      message.message?.videoMessage?.caption?.trim() ||
      '';

    // ===== PREFIX HANDLER: Resmi TITIK (.) =====
    const toDot = (s) => s.replace(/^[./]/, '.');
    const originalRaw = rawText;

    // ⛔ Jika user pakai "/", abaikan total (tanpa balasan/log)
    if (userMessage.startsWith('/')) return;

    // Normalisasi tampilan/log ke TITIK
    if (/^[./]/.test(userMessage)) userMessage = toDot(userMessage);
    if (/^[./]/.test(rawText)) rawText = toDot(rawText);

    // LOG pakai titik persis input user
    if (userMessage.startsWith('.')) {
      const shownInLog =
        originalRaw?.trim().startsWith('.') || originalRaw?.trim().startsWith('/')
          ? toDot(originalRaw.trim().toLowerCase().replace(/\s+/g, ' '))
          : userMessage;
      console.log(`📝 Command dipakai di ${isGroup ? 'grup' : 'privat'}: ${shownInLog}`);
    }

    // BAN FITUR: blokir fitur bot untuk user tertentu (kecuali owner/sudo/admin)
    if (!message.key.fromMe && !senderIsSudo) {
      let isSenderAdmin2 = false;

      if (isGroup) {
        try {
          const st2 = await isAdmin(sock, chatId, senderId, message);
          isSenderAdmin2 = !!st2.isSenderAdmin;
        } catch {}
      }

      if (!isSenderAdmin2 && isBanned(senderId) && !userMessage.startsWith('.unban')) {
        if (Math.random() < 0.1) {
          await sock.sendMessage(chatId, {
            text: '❌ Kamu diblokir dari penggunaan bot. Hubungi admin untuk dibuka.',
            ...channelInfo
          });
        }
        return;
      }
    }

    // === HITUNG PESAN: hanya di grup + bukan pesan dari bot sendiri ===
    if (isGroup && !message.key.fromMe) {
      try {
        // Selalu simpan ke messageCount.json (buat .topmembers & statistik)
        incrementMessageCount(chatId, senderId, message.key.id);

        // Cek & kirim notif Top Rank (kalau fitur di grup ini ON)
        await handleTopRankAutoAfterIncrement(
          sock,
          chatId,
          senderId,
          message.pushName || message.message?.conversation || message.key?.participant
        );
      } catch (e) {
        console.error('Gagal increment / auto top rank:', e);
      }
    }

    // === PASSIVES (deteksi di grup: badword, antilink, antisticker, chatbot/tag/mention) ===
    if (isGroup) {
      if (userMessage) {
        await handleBadwordDetection(sock, chatId, message, userMessage, senderId);
      }
      await Antilink(message, sock);
      await AntiSticker(message, sock); // enforcer antisticker
    }

    // PM blocker
    if (!isGroup && !message.key.fromMe && !senderIsSudo) {
      try {
        const pmState = readPmBlockerState();
        if (pmState.enabled) {
          await sock.sendMessage(chatId, {
            text: pmState.message || 'Pesan pribadi diblokir. Silakan hubungi owner di grup saja.'
          });
          try {
            const list = new Set(pmState.blocked || []);
            list.add(chatId);
            savePmBlockedList([...list]);
          } catch {}
          try {
            await sock.updateBlockStatus(chatId, 'block');
          } catch (e) {}
          return;
        }
      } catch (e) {}
    }

    // --- IGNORE UNKNOWN DOT COMMANDS (silent) ---
    if (userMessage.startsWith('.')) {
      const head = userMessage.split(/\s+/)[0]; // ".help"
      if (!isKnownCommand(head)) {
        console.log(`⚪ Unknown command ignored: ${head}`);
        return;
      }
    }

    // kalau bukan command → passives lanjutan
    if (!userMessage.startsWith('.')) {
      await handleAutotypingForMessage(sock, chatId, userMessage);
      if (isGroup) {
        await handleChatbotResponse(sock, chatId, message, userMessage, senderId);
        await handleTagDetection(sock, chatId, message, senderId);
        await handleMentionDetection(sock, chatId, message);
      }
      return;
    }

    // === KILL-SWITCH CHATBOT per-grup ===
    if (isGroup) {
      try {
        const cfg = await getChatbot(chatId); // { enabled: true } | null
        const chatbotOn = !!(cfg && cfg.enabled);

        if (!chatbotOn) {
          if (userMessage.startsWith('.chatbot')) {
            const arg = rawText.slice(8).trim(); // on | off | (kosong)
            await handleChatbotCommand(sock, chatId, message, arg);
            return;
          }
          const txt = [
            '╭─〔 🛑 *BOT DIMATIKAN* 〕',
            '│ Bot sedang *OFF* di grup ini.',
            '│ 🔧 Untuk mengaktifkan:',
            '│ • *Admin/Owner/Sudo* ketik: *.chatbot on*',
            '╰────────────────────────'
          ].join('\n');
          await sock.sendMessage(chatId, { text: txt }, { quoted: message });
          return;
        }
      } catch (e) {
        console.error('chatbot gate check failed:', e.message);
      }
    }

    // ==== MODE-GATE + REGISTRASI/LIMIT ====
    const isOwnerOrSudo = message.key.fromMe || senderIsSudo;
    const rawCmd = userMessage.split(/\s+/)[0]; // ".something"

    // ==== HARD GUARD: reminder admin-only, group-only ====
    if (rawCmd === '.remind' || rawCmd === '.reminder') {
      if (!isGroup) {
        await sock.sendMessage(
          chatId,
          { text: 'Perintah ini hanya bisa dipakai di *grup*.' },
          { quoted: message }
        );
        return;
      }
      let st = { isSenderAdmin: false };
      try {
        st = await isAdmin(sock, chatId, senderId, message);
      } catch {}
      const adminOK = st.isSenderAdmin || message.key.fromMe || senderIsSudo;
      if (!adminOK) {
        await sock.sendMessage(
          chatId,
          { text: '🚫 *Khusus Admin Grup / Owner / Sudo*', ...channelInfo },
          { quoted: message }
        );
        return;
      }
    }

    // PRIVATE mode
    if (!isPublic && !isOwnerOrSudo) {
      const txt = [
        '╭─〔 🔒 *PRIVATE MODE* 〕',
        '│ Akses bot dibatasi.',
        '│ Hanya owner/sudo yang bisa pakai.',
        '╰────────────────────'
      ].join('\n');
      await sock.sendMessage(chatId, { text: txt }, { quoted: message });
      return;
    }

    // PUBLIC: Free commands + limit
    if (isPublic) {
      if (userMessage === '.limit') {
        await limitCommand(sock, chatId, message);
        return;
      }
      if (userMessage === '.limitall') {
        await limitAllCommand(sock, chatId, message);
        return;
      }
      if (userMessage === '.daftar') {
        await daftarCommand(sock, chatId, message);
        return;
      }
      if (userMessage === '.reglist') {
        await reglistCommand(sock, chatId, message);
        return;
      }

      if (rawCmd === '.regdel') {
        const idxArg = rawText.split(/\s+/).slice(1).join(' ');
        await regdelCommand(sock, chatId, message, idxArg);
        return;
      }
      if (rawCmd === '.limitadd') {
        await limitAddCommand(sock, chatId, message);
        return;
      }
      if (rawCmd === '.limitdel') {
        await limitDelCommand(sock, chatId, message);
        return;
      }

      if (!isOwnerOrSudo && isKnownCommand(rawCmd) && !FREE_COMMANDS.has(rawCmd)) {
        if (!isMemberRegistered(chatId, senderId)) {
          await sock.sendMessage(
            chatId,
            {
              text:
                '📝 *Kamu belum terdaftar di grup ini.*\n' +
                'Daftar dulu dengan *.daftar* untuk mulai memakai bot.'
            },
            { quoted: message }
          );
          return;
        }
        const remain = getRemainingQuota(chatId, senderId);
        if (remain <= 0 || !consumeQuota(chatId, senderId)) {
          const leftTxt = formatDuration(timeUntilReset(chatId, senderId));
          await sock.sendMessage(
            chatId,
            { text: `⛔ *Limit habis.*\nTunggu reset dalam *${leftTxt}*.` },
            { quoted: message }
          );
          return;
        }
      }
    }

    // admin/owner guards
    const adminCommands = [
      '.mute', '.unmute', '.ban', '.unban', '.promote', '.demote', '.kick',
      '.tagall', '.tagnotadmin', '.hidetag', '.antilink', '.antitag',
      '.setgdesc', '.setgname', '.setgpp', '.antisticker', '.h',
      // NEW: reminder admin-only
      '.remind', '.reminder'
    ];
    const ownerCommands = [
      '.mode', '.autostatus', '.antidelete', '.cleartmp', '.setpp',
      '.clearsession', '.areact', '.autoreact', '.autotyping', '.autoread', '.pmblocker'
    ];
    const headCmd = userMessage.split(/\s+/)[0];
    const isAdminCommand = adminCommands.includes(headCmd);
    const isOwnerCommand = ownerCommands.includes(headCmd);

    let isSenderAdmin = false;
    let isBotAdmin = false;

    if (isGroup && isAdminCommand) {
      const adminStatus = await isAdmin(sock, chatId, senderId, message);
      isSenderAdmin = adminStatus.isSenderAdmin;
      isBotAdmin = adminStatus.isBotAdmin;

      if (!isBotAdmin && headCmd !== '.remind' && headCmd !== '.reminder') {
        // sebagian admin command butuh bot admin (remind tidak perlu bot admin)
        await sock.sendMessage(
          chatId,
          { text: 'Jadikan bot admin terlebih dahulu untuk memakai perintah admin.', ...channelInfo },
          { quoted: message }
        );
        return;
      }

      if (
        userMessage.startsWith('.mute') ||
        userMessage === '.unmute' ||
        userMessage.startsWith('.ban') ||
        userMessage.startsWith('.unban') ||
        userMessage.startsWith('.promote') ||
        userMessage.startsWith('.demote')
      ) {
        if (!isSenderAdmin && !message.key.fromMe) {
          await sock.sendMessage(
            chatId,
            { text: 'Maaf, hanya admin grup yang bisa memakai perintah ini.', ...channelInfo },
            { quoted: message }
          );
          return;
        }
      }
    }

    if (isOwnerCommand) {
      if (!message.key.fromMe && !senderIsSudo) {
        await sock.sendMessage(chatId, { text: '❌ Perintah ini hanya untuk owner atau sudo!' }, { quoted: message });
        return;
      }
    }

    // Command handlers
    let commandExecuted = false;

    switch (true) {
      case userMessage === '.simage': {
        const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (quotedMessage?.stickerMessage) {
          await simageCommand(sock, quotedMessage, chatId);
        } else {
          await sock.sendMessage(
            chatId,
            { text: 'Balas stiker dengan perintah .simage untuk mengonversi.', ...channelInfo },
            { quoted: message }
          );
        }
        commandExecuted = true;
        break;
      }

      case userMessage.startsWith('.kick'): {
        const mentionedJidListKick =
          message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
        await kickCommand(sock, chatId, senderId, mentionedJidListKick, message);
        commandExecuted = true;
        break;
      }

      case userMessage.startsWith('.mute'): {
        const parts = userMessage.trim().split(/\s+/);
        const muteArg = parts[1];
        const muteDuration = muteArg !== undefined ? parseInt(muteArg, 10) : undefined;
        if (muteArg !== undefined && (isNaN(muteDuration) || muteDuration <= 0)) {
          await sock.sendMessage(
            chatId,
            {
              text:
                'Masukkan menit yang valid atau gunakan .mute tanpa angka untuk langsung dibisukan.',
              ...channelInfo
            },
            { quoted: message }
          );
        } else {
          await muteCommand(sock, chatId, senderId, message, muteDuration);
        }
        commandExecuted = true;
        break;
      }

      case userMessage === '.unmute':
        await unmuteCommand(sock, chatId, senderId);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.google'):
        await googleCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.qr'):
      case userMessage.startsWith('.text2qr'):
        await text2qrCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.capcut'):
      case userMessage.startsWith('.cc'): {
        await capcutCommand(sock, chatId, message);
        commandExecuted = true;
        break;
      }

      case userMessage === '.gempa':
      case userMessage === '.infogempa':
      case userMessage === '.cekgempa':
        await gempaCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.domain'):
      case userMessage.startsWith('.cekdomain'):
        await domainCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.subdomain'): {
        const args = rawText.split(/\s+/).slice(1).join(' ').trim();
        await subdomainCommand(sock, chatId, args, message);
        commandExecuted = true;
        break;
      }

      case userMessage.startsWith('.pingdomain'):
      case userMessage.startsWith('.pinghost'):
      case userMessage.startsWith('.netping'):
        await pingDomainCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.nameserver'):
      case userMessage.startsWith('.ns'):
      case userMessage.startsWith('.dnsns'):
        await nameserverCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.dnscheck'): {
        const args = rawText.slice(9).trim();
        await dnscheckCommand(sock, chatId, message, args);
        commandExecuted = true;
        break;
      }

      case userMessage.startsWith('.job'): {
        const argsStr = rawText.split(/\s+/).slice(1).join(' ').trim();
        await jobCommand(sock, chatId, message, argsStr);
        commandExecuted = true;
        break;
      }

      // Reminder (ADMIN/OWNER/SUDO only, GROUP only)
      case userMessage.startsWith('.remind'):
      case userMessage.startsWith('.reminder'): {
        if (!isGroup) {
          await sock.sendMessage(
            chatId,
            { text: 'Perintah ini hanya bisa dipakai di *grup*.' },
            { quoted: message }
          );
          commandExecuted = true;
          break;
        }
        let st = { isSenderAdmin: false };
        try {
          st = await isAdmin(sock, chatId, senderId, message);
        } catch {}
        const adminOK = st.isSenderAdmin || message.key.fromMe || senderIsSudo;
        if (!adminOK) {
          await sock.sendMessage(
            chatId,
            { text: '🚫 *Khusus Admin Grup / Owner / Sudo*', ...channelInfo },
            { quoted: message }
          );
          commandExecuted = true;
          break;
        }
        const head = userMessage.startsWith('.reminder') ? '.reminder' : '.remind';
        const argsStr = rawText.slice(head.length).trim();
        await remindCommand(sock, chatId, message, argsStr);
        commandExecuted = true;
        break;
      }

      case userMessage.startsWith('.sholat'): {
        if (!isGroup) {
          await sock.sendMessage(
            chatId,
            { text: 'Perintah ini hanya bisa dipakai di grup.' },
            { quoted: message }
          );
          commandExecuted = true;
          break;
        }
        let adminChk = { isSenderAdmin: false };
        try {
          adminChk = await isAdmin(sock, chatId, senderId, message);
        } catch {}
        const isSenderAdminX = adminChk.isSenderAdmin || message.key.fromMe;
        if (!isSenderAdminX) {
          await sock.sendMessage(
            chatId,
            { text: '🚫 *Khusus Admin Grup!*', ...channelInfo },
            { quoted: message }
          );
          commandExecuted = true;
          break;
        }
        await sholatCommand(sock, chatId, message);
        commandExecuted = true;
        break;
      }

      case userMessage.startsWith('.carbon'):
        await carbonCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.brat'):
      case userMessage.startsWith('.bratsticker'): {
        const args = rawText.slice(userMessage.startsWith('.bratsticker') ? 12 : 5).trim();
        await bratstickerCommand(sock, chatId, message, args);
        commandExecuted = true;
        break;
      }

      case userMessage.startsWith('.claude'): {
        const args = rawText.slice(7).trim();
        await claudeCommand(sock, chatId, message, args);
        commandExecuted = true;
        break;
      }

      case userMessage.startsWith('.curl'): {
        const args = rawText.trim().split(/\s+/).slice(1);
        await curlCmd(sock, chatId, message, args);
        commandExecuted = true;
        break;
      }

      case userMessage.startsWith('.nmap'): {
        const args = rawText.trim().split(/\s+/).slice(1);
        await nmapCmd(sock, chatId, message, args);
        commandExecuted = true;
        break;
      }

      case userMessage.startsWith('.ban'): {
        const argsStr = rawText.split(/\s+/).slice(1).join(' ').trim();
        await banCommand(sock, chatId, message, argsStr);
        commandExecuted = true;
        break;
      }

      case userMessage.startsWith('.unban'): {
        const argsStr = rawText.split(/\s+/).slice(1).join(' ').trim();
        await unbanCommand(sock, chatId, message, argsStr);
        commandExecuted = true;
        break;
      }

      case userMessage === '.help':
      case userMessage === '.menu':
      case userMessage === '.bot':
      case userMessage === '.list': {
        const isOwnerOrSudoX = message.key.fromMe || senderIsSudo;
        if (isGroup && !isOwnerOrSudoX) {
          if (!isMemberRegistered(chatId, senderId)) {
            await sock.sendMessage(
              chatId,
              {
                text:
                  '📝 *Kamu belum terdaftar di grup ini.*\n' +
                  'Daftar dulu dengan *.daftar* untuk melihat menu.'
              },
              { quoted: message }
            );
            commandExecuted = true;
            break;
          }
        }
        await helpCommand(sock, chatId, message, global.channelLink);
        commandExecuted = true;
        break;
      }

      case userMessage === '.sticker':
      case userMessage === '.s':
        await stickerCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.warnings'): {
        const mentionedJidListWarnings =
          message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        await warningsCommand(sock, chatId, mentionedJidListWarnings, message);
        commandExecuted = true;
        break;
      }

      case userMessage.startsWith('.warn'): {
        const mentionedJidListWarn =
          message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
        await warnCommand(sock, chatId, senderId, mentionedJidListWarn, message);
        commandExecuted = true;
        break;
      }

      case userMessage.startsWith('.tts'): {
        const text = userMessage.slice(4).trim();
        await ttsCommand(sock, chatId, text, message);
        commandExecuted = true;
        break;
      }

      case userMessage.startsWith('.delete'):
      case userMessage.startsWith('.del'):
        await deleteCommand(sock, chatId, message, senderId);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.attp'):
        await attpCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage === '.settings':
        await settingsCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.mode'): {
        if (!message.key.fromMe && !senderIsSudo) {
          await sock.sendMessage(
            chatId,
            { text: 'Hanya owner bot yang bisa memakai perintah ini!', ...channelInfo },
            { quoted: message }
          );
          commandExecuted = true;
          break;
        }
        let data;
        try {
          data = JSON.parse(fs.readFileSync('./data/messageCount.json'));
        } catch (error) {
          console.error('Gagal membaca status mode akses:', error);
          await sock.sendMessage(
            chatId,
            { text: 'Gagal membaca status mode bot', ...channelInfo },
            { quoted: message }
          );
          commandExecuted = true;
          break;
        }

        const action = userMessage.split(' ')[1]?.toLowerCase();
        if (!action) {
          const currentMode = data.isPublic ? 'PUBLIC' : 'PRIVATE';
          const txt = [
            '╭─〔 ⚙️ *MODE BOT* 〕',
            `│ 📡 Status : *${currentMode}*`,
            '│ ',
            '│ 🔄 Ubah dengan:',
            '│ • .mode public',
            '│ • .mode private',
            '╰──────────────────'
          ].join('\n');
          await sock.sendMessage(chatId, { text: txt, ...channelInfo }, { quoted: message });
          commandExecuted = true;
          break;
        }

        if (action !== 'public' && action !== 'private') {
          await sock.sendMessage(
            chatId,
            {
              text: '❌ Format salah.\n• .mode public\n• .mode private',
              ...channelInfo
            },
            { quoted: message }
          );
          commandExecuted = true;
          break;
        }

        try {
          data.isPublic = action === 'public';
          fs.writeFileSync('./data/messageCount.json', JSON.stringify(data, null, 2));

          const styled =
            action === 'public'
              ? [
                  '╭─〔 ✅ *MODE DIUBAH* 〕',
                  '│ 🌐 Mode: *PUBLIC*',
                  '│ 👥 Semua user dapat memakai bot',
                  '│ 📝 Registrasi & limit aktif',
                  '╰────────────────────────'
                ].join('\n')
              : [
                  '╭─〔 ✅ *MODE DIUBAH* 〕',
                  '│ 🔒 Mode: *PRIVATE*',
                  '│ 👑 Hanya owner/sudo yang bisa akses',
                  '│ 📴 Registrasi & limit disembunyikan',
                  '╰────────────────────────'
                ].join('\n');

          await sock.sendMessage(chatId, { text: styled, ...channelInfo });
          commandExecuted = true;
        } catch (error) {
          console.error('Gagal mengubah mode akses:', error);
          await sock.sendMessage(chatId, { text: 'Gagal mengubah mode bot', ...channelInfo });
          commandExecuted = true;
        }
        break;
      }

      case userMessage.startsWith('.anticall'):
        if (!message.key.fromMe && !senderIsSudo) {
          await sock.sendMessage(
            chatId,
            { text: 'Hanya owner/sudo yang dapat menggunakan anticall.' },
            { quoted: message }
          );
          commandExecuted = true;
          break;
        }
        {
          const args = userMessage.split(' ').slice(1).join(' ');
          await anticallCommand(sock, chatId, message, args);
        }
        commandExecuted = true;
        break;

      case userMessage.startsWith('.pmblocker'):
        if (!message.key.fromMe && !senderIsSudo) {
          await sock.sendMessage(
            chatId,
            { text: 'Hanya owner/sudo yang dapat menggunakan pmblocker.' },
            { quoted: message }
          );
          commandExecuted = true;
          break;
        }
        {
          const args = userMessage.split(' ').slice(1).join(' ');
          await pmblockerCommand(sock, chatId, message, args);
        }
        commandExecuted = true;
        break;

      // ====== DOCKER SELF-RESTART (.docker restart andikabot) ======
      case userMessage.startsWith('.docker'): {
        const parts = rawText.trim().split(/\s+/);
        const args = parts.slice(1); // ['restart','andikabot']
        await dockerCommand(sock, message, '.', args);
        commandExecuted = true;
        break;
      }

      case userMessage === '.owner':
        await ownerCommand(sock, chatId);
        commandExecuted = true;
        break;

      case userMessage === '.tagall': {
        let st = { isSenderAdmin: false };
        if (isGroup) {
          try {
            st = await isAdmin(sock, chatId, senderId, message);
          } catch {}
        }
        if (st.isSenderAdmin || message.key.fromMe) {
          await tagAllCommand(sock, chatId, senderId, message);
        } else {
          await sock.sendMessage(
            chatId,
            { text: 'Maaf, hanya admin grup yang bisa memakai .tagall.', ...channelInfo },
            { quoted: message }
          );
        }
        commandExecuted = true;
        break;
      }

      case userMessage === '.tagnotadmin':
        await tagNotAdminCommand(sock, chatId, senderId, message);
        commandExecuted = true;
        break;

      case headCmd === '.hidetag' || headCmd === '.h': {
        const commandLength = headCmd === '.hidetag' ? 8 : 2;
        const messageText = rawText.slice(commandLength).trim();
        const replyMessage =
          message.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;
        await hideTagCommand(sock, chatId, senderId, messageText, replyMessage, message);
        commandExecuted = true;
        break;
      }

      case userMessage.startsWith('.tag'): {
        const messageText = rawText.slice(4).trim();
        const replyMessage =
          message.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;
        await tagCommand(sock, chatId, senderId, messageText, replyMessage, message);
        commandExecuted = true;
        break;
      }

      case userMessage.startsWith('.antilink'):
        if (!isGroup) {
          await sock.sendMessage(
            chatId,
            { text: 'Perintah ini hanya bisa dipakai di grup.', ...channelInfo },
            { quoted: message }
          );
          commandExecuted = true;
          break;
        }
        if (!isBotAdmin) {
          await sock.sendMessage(
            chatId,
            { text: 'Jadikan bot admin terlebih dahulu.', ...channelInfo },
            { quoted: message }
          );
          commandExecuted = true;
          break;
        }
        await handleAntilinkCommand(sock, chatId, userMessage, senderId, isSenderAdmin, message);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.antitag'):
        if (!isGroup) {
          await sock.sendMessage(
            chatId,
            { text: 'Perintah ini hanya bisa dipakai di grup.', ...channelInfo },
            { quoted: message }
          );
          commandExecuted = true;
          break;
        }
        if (!isBotAdmin) {
          await sock.sendMessage(
            chatId,
            { text: 'Jadikan bot admin terlebih dahulu.', ...channelInfo },
            { quoted: message }
          );
          commandExecuted = true;
          break;
        }
        await handleAntitagCommand(sock, chatId, userMessage, senderId, isSenderAdmin, message);
        commandExecuted = true;
        break;

      // ====================== ANTISTICKER (ADMIN ONLY) ======================
      case userMessage.startsWith('.antisticker'):
        if (!isGroup) {
          await sock.sendMessage(
            chatId,
            { text: 'Perintah ini hanya bisa dipakai di grup.', ...channelInfo },
            { quoted: message }
          );
          commandExecuted = true;
          break;
        }
        {
          const adminStatus = await isAdmin(sock, chatId, senderId, message);
          const _isSenderAdmin = adminStatus.isSenderAdmin;
          const _isBotAdmin = adminStatus.isBotAdmin;
          if (!_isBotAdmin) {
            await sock.sendMessage(
              chatId,
              { text: 'Jadikan bot admin terlebih dahulu.', ...channelInfo },
              { quoted: message }
            );
            commandExecuted = true;
            break;
          }
          await antiStickerCommand(sock, chatId, userMessage, senderId, _isSenderAdmin, message);
        }
        commandExecuted = true;
        break;
      // =====================================================================

      case userMessage === '.meme':
        await memeCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage === '.joke':
        await jokeCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.quote'):
        await quoteCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage === '.fact':
        await factCommand(sock, chatId, message, message);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.weather'): {
        const city = userMessage.slice(9).trim();
        if (city) {
          await weatherCommand(sock, chatId, message, city);
        } else {
          await sock.sendMessage(
            chatId,
            { text: 'Sertakan kota, contoh: .weather Jakarta', ...channelInfo },
            { quoted: message }
          );
        }
        commandExecuted = true;
        break;
      }

      case userMessage.startsWith('.getpp'): {
        await getppCommand(sock, chatId, message);
        commandExecuted = true;
        break;
      }

      case userMessage.startsWith('.news'): {
        const argsStr = rawText.split(/\s+/).slice(1).join(' ').trim();
        await newsCommand(sock, chatId, message, argsStr);
        commandExecuted = true;
        break;
      }

      case userMessage.startsWith('.resi'): {
        const argsStr = rawText.split(/\s+/).slice(1).join(' ').trim();
        await resiCommand(sock, chatId, message, argsStr);
        commandExecuted = true;
        break;
      }

      case userMessage.startsWith('.npm'): {
        const argsStr = rawText.split(/\s+/).slice(1).join(' ').trim();
        await npmCheckCommand(sock, chatId, message, argsStr);
        commandExecuted = true;
        break;
      }

      case userMessage.startsWith('.gdrive'):
      case userMessage.startsWith('.gddl'): {
        const argsStr = rawText.split(/\s+/).slice(1).join(' ').trim();
        await gdriveDownloadCommand(sock, chatId, message, argsStr);
        commandExecuted = true;
        break;
      }

      case userMessage.startsWith('.ttt'):
      case userMessage.startsWith('.tictactoe'): {
        const tttText = userMessage.split(' ').slice(1).join(' ');
        await tictactoeCommand(sock, chatId, senderId, tttText);
        commandExecuted = true;
        break;
      }

      case userMessage.startsWith('.move'): {
        const position = parseInt(userMessage.split(' ')[1]);
        if (isNaN(position)) {
          await sock.sendMessage(
            chatId,
            {
              text: 'Mohon kirim nomor posisi yang valid untuk gerakan Tic-Tac-Toe.',
              ...channelInfo
            },
            { quoted: message }
          );
        } else {
          await handleTicTacToeMove(sock, chatId, senderId, position);
        }
        commandExecuted = true;
        break;
      }

      case userMessage === '.topmembers':
        topMembers(sock, chatId, isGroup);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.hangman'):
        startHangman(sock, chatId);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.guess'): {
        const guessedLetter = userMessage.split(' ')[1];
        if (guessedLetter) {
          guessLetter(sock, chatId, guessedLetter);
        } else {
          sock.sendMessage(
            chatId,
            { text: 'Tebak satu huruf dengan .guess <huruf>', ...channelInfo },
            { quoted: message }
          );
        }
        commandExecuted = true;
        break;
      }

      case userMessage.startsWith('.trivia'):
        startTrivia(sock, chatId);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.answer'): {
        const answer = userMessage.split(' ').slice(1).join(' ');
        if (answer) {
          answerTrivia(sock, chatId, answer);
        } else {
          sock.sendMessage(
            chatId,
            { text: 'Kirim jawaban dengan .answer <jawaban>', ...channelInfo },
            { quoted: message }
          );
        }
        commandExecuted = true;
        break;
      }

      case userMessage.startsWith('.compliment'):
        await complimentCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.insult'):
        await insultCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.lyrics'): {
        const songTitle = userMessage.split(' ').slice(1).join(' ');
        await lyricsCommand(sock, chatId, songTitle, message);
        commandExecuted = true;
        break;
      }

      case userMessage.startsWith('.simp'): {
        const quotedMsg =
          message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const mentionedJid =
          message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        await simpCommand(sock, chatId, quotedMsg, mentionedJid, senderId);
        commandExecuted = true;
        break;
      }

      case userMessage.startsWith('.stupid'):
      case userMessage.startsWith('.itssostupid'):
      case userMessage.startsWith('.iss'): {
        const stupidQuotedMsg =
          message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const stupidMentionedJid =
          message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        const stupidArgs = userMessage.split(' ').slice(1);
        await stupidCommand(
          sock,
          chatId,
          stupidQuotedMsg,
          stupidMentionedJid,
          senderId,
          stupidArgs
        );
        commandExecuted = true;
        break;
      }

      case userMessage === '.dare':
        await dareCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage === '.truth':
        await truthCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage === '.clear':
        if (isGroup) await clearCommand(sock, chatId);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.promote'): {
        const mentionedJidListPromote =
          message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
        await promoteCommand(sock, chatId, mentionedJidListPromote, message);
        commandExecuted = true;
        break;
      }

      case userMessage.startsWith('.demote'): {
        const mentionedJidListDemote =
          message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
        await demoteCommand(sock, chatId, mentionedJidListDemote, message);
        commandExecuted = true;
        break;
      }

      case userMessage === '.ping':
        await pingCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage === '.spek':
        await spekCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.mention'): {
        const argsStr = rawText.slice(9).trim();
        await mentionCommand(sock, chatId, senderId, message, argsStr);
        commandExecuted = true;
        break;
      }

      case userMessage === '.setmention':
        await mentionCommand(sock, chatId, senderId, message, 'status');
        commandExecuted = true;
        break;

      case userMessage.startsWith('.blur'): {
        const quotedMessage =
          message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        await blurCommand(sock, chatId, message, quotedMessage);
        commandExecuted = true;
        break;
      }

      case userMessage.startsWith('.welcome'):
        if (isGroup) {
          if (!isSenderAdmin) {
            const adminStatus = await isAdmin(sock, chatId, senderId);
            isSenderAdmin = adminStatus.isSenderAdmin;
          }
          if (isSenderAdmin || message.key.fromMe) {
            await welcomeCommand(sock, chatId, message);
          } else {
            await sock.sendMessage(
              chatId,
              {
                text: 'Maaf, hanya admin grup yang bisa memakai perintah ini.',
                ...channelInfo
              },
              { quoted: message }
            );
          }
        } else {
          await sock.sendMessage(
            chatId,
            { text: 'Perintah ini hanya bisa dipakai di grup.', ...channelInfo },
            { quoted: message }
          );
        }
        commandExecuted = true;
        break;

      case userMessage.startsWith('.goodbye'):
        if (isGroup) {
          if (!isSenderAdmin) {
            const adminStatus = await isAdmin(sock, chatId, senderId);
            isSenderAdmin = adminStatus.isSenderAdmin;
          }
          if (isSenderAdmin || message.key.fromMe) {
            await goodbyeCommand(sock, chatId, message);
          } else {
            await sock.sendMessage(
              chatId,
              {
                text: 'Maaf, hanya admin grup yang bisa memakai perintah ini.',
                ...channelInfo
              },
              { quoted: message }
            );
          }
        } else {
          await sock.sendMessage(
            chatId,
            { text: 'Perintah ini hanya bisa dipakai di grup.', ...channelInfo },
            { quoted: message }
          );
        }
        commandExecuted = true;
        break;

      case userMessage === '.git':
      case userMessage === '.github':
      case userMessage === '.sc':
      case userMessage === '.script':
      case userMessage === '.repo':
        await githubCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.antibadword'):
        if (!isGroup) {
          await sock.sendMessage(
            chatId,
            { text: 'Perintah ini hanya bisa dipakai di grup.', ...channelInfo },
            { quoted: message }
          );
          commandExecuted = true;
          break;
        }
        {
          const adminStatus = await isAdmin(sock, chatId, senderId, message);
          isSenderAdmin = adminStatus.isSenderAdmin;
          isBotAdmin = adminStatus.isBotAdmin;

          if (!isBotAdmin) {
            await sock.sendMessage(
              chatId,
              { text: '*Bot harus jadi admin untuk gunakan fitur ini*', ...channelInfo },
              { quoted: message }
            );
            commandExecuted = true;
            break;
          }
          await antibadwordCommand(sock, chatId, message, senderId, isSenderAdmin);
        }
        commandExecuted = true;
        break;

      case userMessage.startsWith('.chatbot'):
        if (!isGroup) {
          await sock.sendMessage(
            chatId,
            { text: 'Perintah ini hanya bisa dipakai di grup.', ...channelInfo },
            { quoted: message }
          );
          commandExecuted = true;
          break;
        }
        {
          const chatbotAdminStatus = await isAdmin(sock, chatId, senderId);
          if (!chatbotAdminStatus.isSenderAdmin && !message.key.fromMe) {
            await sock.sendMessage(
              chatId,
              { text: '*Hanya admin atau owner bot yang bisa pakai perintah ini*', ...channelInfo },
              { quoted: message }
            );
            commandExecuted = true;
            break;
          }
          const match = userMessage.slice(8).trim();
          await handleChatbotCommand(sock, chatId, message, match);
        }
        commandExecuted = true;
        break;

      case userMessage.startsWith('.take'): {
        const takeArgs = rawText.slice(5).trim().split(' ');
        await takeCommand(sock, chatId, message, takeArgs);
        commandExecuted = true;
        break;
      }

      case userMessage === '.flirt':
        await flirtCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.character'):
        await characterCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.waste'):
        await wastedCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage === '.ship':
        if (!isGroup) {
          await sock.sendMessage(
            chatId,
            { text: 'Perintah ini hanya bisa dipakai di grup!', ...channelInfo },
            { quoted: message }
          );
          commandExecuted = true;
          break;
        }
        await shipCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage === '.groupinfo':
      case userMessage === '.infogp':
      case userMessage === '.infogrupo':
        if (!isGroup) {
          await sock.sendMessage(
            chatId,
            { text: 'Perintah ini hanya bisa dipakai di grup!', ...channelInfo },
            { quoted: message }
          );
          commandExecuted = true;
          break;
        }
        await groupInfoCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage === '.resetlink':
      case userMessage === '.revoke':
      case userMessage === '.anularlink':
        if (!isGroup) {
          await sock.sendMessage(
            chatId,
            { text: 'Perintah ini hanya bisa dipakai di grup!', ...channelInfo },
            { quoted: message }
          );
          commandExecuted = true;
          break;
        }
        await resetlinkCommand(sock, chatId, senderId);
        commandExecuted = true;
        break;

      case userMessage === '.linkgroup':
        if (!isGroup) {
          await sock.sendMessage(
            chatId,
            { text: 'Perintah ini hanya bisa dipakai di grup!', ...channelInfo },
            { quoted: message }
          );
          commandExecuted = true;
          break;
        }
        await linkGroupCommand(sock, chatId, senderId, message);
        commandExecuted = true;
        break;

      case userMessage === '.staff':
      case userMessage === '.admins':
      case userMessage === '.listadmin':
        if (!isGroup) {
          await sock.sendMessage(
            chatId,
            { text: 'Perintah ini hanya bisa dipakai di grup!', ...channelInfo },
            { quoted: message }
          );
          commandExecuted = true;
          break;
        }
        await staffCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.tourl'):
      case userMessage.startsWith('.url'):
        await urlCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.emojimix'):
      case userMessage.startsWith('.emix'):
        await emojimixCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.tg'):
      case userMessage.startsWith('.stickertelegram'):
      case userMessage.startsWith('.tgsticker'):
      case userMessage.startsWith('.telesticker'):
        await stickerTelegramCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage === '.vv':
        await viewOnceCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage === '.clearsession':
      case userMessage === '.clearsesi':
        await clearSessionCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.autostatus'): {
        const autoStatusArgs = userMessage.split(' ').slice(1);
        await autoStatusCommand(sock, chatId, message, autoStatusArgs);
        commandExecuted = true;
        break;
      }

      case userMessage.startsWith('.metallic'):
        await textmakerCommand(sock, chatId, message, userMessage, 'metallic');
        commandExecuted = true;
        break;
      case userMessage.startsWith('.ice'):
        await textmakerCommand(sock, chatId, message, userMessage, 'ice');
        commandExecuted = true;
        break;
      case userMessage.startsWith('.snow'):
        await textmakerCommand(sock, chatId, message, userMessage, 'snow');
        commandExecuted = true;
        break;
      case userMessage.startsWith('.impressive'):
        await textmakerCommand(sock, chatId, message, userMessage, 'impressive');
        commandExecuted = true;
        break;
      case userMessage.startsWith('.matrix'):
        await textmakerCommand(sock, chatId, message, userMessage, 'matrix');
        commandExecuted = true;
        break;
      case userMessage.startsWith('.light'):
        await textmakerCommand(sock, chatId, message, userMessage, 'light');
        commandExecuted = true;
        break;
      case userMessage.startsWith('.neon'):
        await textmakerCommand(sock, chatId, message, userMessage, 'neon');
        commandExecuted = true;
        break;
      case userMessage.startsWith('.devil'):
        await textmakerCommand(sock, chatId, message, userMessage, 'devil');
        commandExecuted = true;
        break;
      case userMessage.startsWith('.purple'):
        await textmakerCommand(sock, chatId, message, userMessage, 'purple');
        commandExecuted = true;
        break;
      case userMessage.startsWith('.thunder'):
        await textmakerCommand(sock, chatId, message, userMessage, 'thunder');
        commandExecuted = true;
        break;
      case userMessage.startsWith('.leaves'):
        await textmakerCommand(sock, chatId, message, userMessage, 'leaves');
        commandExecuted = true;
        break;
      case userMessage.startsWith('.1917'):
        await textmakerCommand(sock, chatId, message, userMessage, '1917');
        commandExecuted = true;
        break;
      case userMessage.startsWith('.arena'):
        await textmakerCommand(sock, chatId, message, userMessage, 'arena');
        commandExecuted = true;
        break;
      case userMessage.startsWith('.hacker'):
        await textmakerCommand(sock, chatId, message, userMessage, 'hacker');
        commandExecuted = true;
        break;
      case userMessage.startsWith('.sand'):
        await textmakerCommand(sock, chatId, message, userMessage, 'sand');
        commandExecuted = true;
        break;
      case userMessage.startsWith('.blackpink'):
        await textmakerCommand(sock, chatId, message, userMessage, 'blackpink');
        commandExecuted = true;
        break;
      case userMessage.startsWith('.glitch'):
        await textmakerCommand(sock, chatId, message, userMessage, 'glitch');
        commandExecuted = true;
        break;
      case userMessage.startsWith('.fire'):
        await textmakerCommand(sock, chatId, message, userMessage, 'fire');
        commandExecuted = true;
        break;

      case userMessage.startsWith('.antidelete'): {
        const antideleteMatch = userMessage.slice(11).trim();
        await handleAntideleteCommand(sock, chatId, message, antideleteMatch);
        commandExecuted = true;
        break;
      }

      case userMessage === '.surrender':
        await handleTicTacToeMove(sock, chatId, senderId, 'surrender');
        commandExecuted = true;
        break;

      case userMessage === '.cleartmp':
        await clearTmpCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage === '.setpp':
        await setProfilePicture(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.setgdesc'): {
        const text = rawText.slice(9).trim();
        await setGroupDescription(sock, chatId, senderId, text, message);
        commandExecuted = true;
        break;
      }

      case userMessage.startsWith('.setgname'): {
        const text = rawText.slice(9).trim();
        await setGroupName(sock, chatId, senderId, text, message);
        commandExecuted = true;
        break;
      }

      case userMessage.startsWith('.setgpp'):
        await setGroupPhoto(sock, chatId, senderId, message);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.instagram'):
      case userMessage.startsWith('.insta'):
      case userMessage === '.ig':
      case userMessage.startsWith('.ig '):
        await instagramCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.igsc'):
        await igsCommand(sock, chatId, message, true);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.igs'):
        await igsCommand(sock, chatId, message, false);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.fb'):
      case userMessage.startsWith('.facebook'):
        await facebookCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.music'):
        await playCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.spotify'):
        await spotifyCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.play'):
      case userMessage.startsWith('.mp3'):
      case userMessage.startsWith('.ytmp3'):
      case userMessage.startsWith('.song'):
        await songCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.video'):
      case userMessage.startsWith('.ytmp4'):
        await videoCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.tiktok'):
      case userMessage.startsWith('.tt'):
        await tiktokCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.gpt'):
      case userMessage.startsWith('.gemini'):
        await aiCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.translate'): {
        const commandLength = 10;
        await handleTranslateCommand(
          sock,
          chatId,
          message,
          userMessage.slice(commandLength)
        );
        commandExecuted = true;
        break;
      }

      case userMessage.startsWith('.trt'): {
        const commandLength = 4;
        await handleTranslateCommand(
          sock,
          chatId,
          message,
          userMessage.slice(commandLength)
        );
        commandExecuted = true;
        break;
      }

      case userMessage.startsWith('.ss'):
      case userMessage.startsWith('.ssweb'):
      case userMessage.startsWith('.screenshot'): {
        const ssCommandLength = userMessage.startsWith('.screenshot')
          ? 11
          : userMessage.startsWith('.ssweb')
          ? 6
          : 3;
        await handleSsCommand(
          sock,
          chatId,
          message,
          userMessage.slice(ssCommandLength).trim()
        );
        commandExecuted = true;
        break;
      }

      case userMessage.startsWith('.areact'):
      case userMessage.startsWith('.autoreact'):
      case userMessage.startsWith('.autoreaction'): {
        const isOwnerOrSudoFlag = message.key.fromMe || senderIsSudo;
        await handleAreactCommand(sock, chatId, message, isOwnerOrSudoFlag);
        commandExecuted = true;
        break;
      }

      case userMessage.startsWith('.sudo'): {
        let isSenderAdminX = false;
        if (isGroup) {
          try {
            const st = await isAdmin(sock, chatId, senderId, message);
            isSenderAdminX = !!st.isSenderAdmin;
          } catch {}
        }

        if (!message.key.fromMe && !isSenderAdminX) {
          await sock.sendMessage(
            chatId,
            { text: 'Maaf, hanya admin grup yang bisa memakai perintah ini.' },
            { quoted: message }
          );
          commandExecuted = true;
          break;
        }

        await sudoCommand(sock, chatId, message);
        commandExecuted = true;
        break;
      }

      case userMessage === '.goodnight':
      case userMessage === '.lovenight':
      case userMessage === '.gn':
        await goodnightCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage === '.shayari':
      case userMessage === '.shayri':
        await shayariCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage === '.roseday':
        await rosedayCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.imagine'):
      case userMessage.startsWith('.flux'):
      case userMessage.startsWith('.dalle'):
        await imagineCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage === '.jid':
        await (async function groupJidCommand(sock, chatId, message) {
          const groupJid = message.key.remoteJid;
          if (!groupJid.endsWith('@g.us')) {
            return await sock.sendMessage(chatId, {
              text: '❌ Perintah ini hanya bisa dipakai di grup.'
            });
          }
          await sock.sendMessage(
            chatId,
            { text: `✅ Group JID: ${groupJid}` },
            { quoted: message }
          );
        })(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.autotyping'):
        await autotypingCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.autoread'):
        await autoreadCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage === '.crop':
        await stickercropCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      case userMessage.startsWith('.pies'): {
        const parts = rawText.trim().split(/\s+/);
        const args = parts.slice(1);
        await piesCommand(sock, chatId, message, args);
        commandExecuted = true;
        break;
      }

      case userMessage === '.china':
        await piesAlias(sock, chatId, message, 'china');
        commandExecuted = true;
        break;
      case userMessage === '.indonesia':
        await piesAlias(sock, chatId, message, 'indonesia');
        commandExecuted = true;
        break;
      case userMessage === '.japan':
        await piesAlias(sock, chatId, message, 'japan');
        commandExecuted = true;
        break;
      case userMessage === '.korea':
        await piesAlias(sock, chatId, message, 'korea');
        commandExecuted = true;
        break;
      case userMessage === '.hijab':
        await piesAlias(sock, chatId, message, 'hijab');
        commandExecuted = true;
        break;

      case userMessage.startsWith('.update'): {
        const parts = rawText.trim().split(/\s+/);
        const zipArg = parts[1] && parts[1].startsWith('http') ? parts[1] : '';
        await updateCommand(sock, chatId, message, senderIsSudo, zipArg);
        commandExecuted = true;
        break;
      }

      case userMessage.startsWith('.removebg'):
      case userMessage.startsWith('.rmbg'):
      case userMessage.startsWith('.nobg'):
        await removebgCommand.exec(sock, message, userMessage.split(' ').slice(1));
        commandExecuted = true;
        break;

      case userMessage.startsWith('.remini'):
      case userMessage.startsWith('.enhance'):
      case userMessage.startsWith('.upscale'):
        await reminiCommand(sock, chatId, message, userMessage.split(' ').slice(1));
        commandExecuted = true;
        break;

      case userMessage.startsWith('.sora'):
        await soraCommand(sock, chatId, message);
        commandExecuted = true;
        break;

      // === Top Rank Auto (notif realtime top 20) ===
      case userMessage.startsWith('.toprankauto'): {
        const argsStr = rawText.split(/\s+/).slice(1).join(' ').trim();
        await topRankAutoCommand(sock, chatId, message, argsStr);
        commandExecuted = true;
        break;
      }

      default:
        if (isGroup) {
          if (userMessage) {
            await handleChatbotResponse(sock, chatId, message, userMessage, senderId);
          }
          await handleTagDetection(sock, chatId, message, senderId);
          await handleMentionDetection(sock, chatId, message);
        }
        commandExecuted = false;
        break;
    }

    // Guard global: kalau HEAD command dikenal tapi handler tidak mengeksekusi
    const head = userMessage.split(/\s+/)[0];
    const isCommand = userMessage.startsWith('.') && isKnownCommand(head);
    if (isCommand && commandExecuted === false) {
      await sock.sendMessage(
        chatId,
        { text: '❌ Perintah tidak sesuai.' },
        { quoted: message }
      );
      return;
    }

    if (commandExecuted !== false) {
      await showTypingAfterCommand(sock, chatId);
    }

    if (userMessage.startsWith('.')) {
      await addCommandReaction(sock, message);
    }
  } catch (error) {
    console.error('❌ Error handler pesan:', error.message);
    if (chatId) {
      await sock
        .sendMessage(chatId, { text: '❌ Gagal memproses perintah!', ...channelInfo })
        .catch(() => {});
    }
  }
}

async function handleGroupParticipantUpdate(sock, update) {
  try {
    const { id, participants, action, author } = update;
    if (!id.endsWith('@g.us')) return;

    let isPublic = true;
    try {
      const modeData = JSON.parse(fs.readFileSync('./data/messageCount.json'));
      if (typeof modeData.isPublic === 'boolean') isPublic = modeData.isPublic;
    } catch (e) {}

    if (action === 'promote') {
      if (!isPublic) return;
      await handlePromotionEvent(sock, id, participants, author);
      return;
    }

    if (action === 'demote') {
      if (!isPublic) return;
      await handleDemotionEvent(sock, id, participants, author);
      return;
    }

    if (['add', 'invite', 'approve', 'join'].includes(action)) {
      console.log('👥 Join event:', { id, action, participants });
      await handleJoinEvent(sock, id, participants);
    }

    if (action === 'remove' || action === 'leave') {
      // bersihkan hitungan pesan untuk member yang keluar
      if (Array.isArray(participants)) {
        for (const userJid of participants) {
          try {
            removeUserFromGroupCounts(id, userJid);
          } catch (e) {
            console.error('Gagal hapus hitungan user keluar:', e);
          }
        }
      }
      await handleLeaveEvent(sock, id, participants);
    }
  } catch (error) {
    console.error('Error di handleGroupParticipantUpdate:', error);
  }
}

module.exports = {
  handleMessages,
  handleGroupParticipantUpdate,
  handleStatus: async (sock, status) => {
    await handleStatusUpdate(sock, status);
  }
};
