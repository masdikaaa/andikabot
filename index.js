// index.js — Andika Bot (Baileys v7 SAFE)
// QR-ONLY + QR to logs + keep-alive + safe watchdog + job queue

require('./settings')

const fs         = require('fs')
const { rmSync } = require('fs')
const path       = require('path')

const chalk       = require('chalk')
const axios       = require('axios')
const FileType    = require('file-type')
const qrcode      = require('qrcode-terminal')
const NodeCache   = require('node-cache')
const pino        = require('pino')
const PhoneNumber = require('awesome-phonenumber')
const { Boom }    = require('@hapi/boom')

const {
  handleMessages,
  handleGroupParticipantUpdate,
  handleStatus
} = require('./main')

const {
  imageToWebp,
  videoToWebp,
  writeExifImg,
  writeExifVid
} = require('./lib/exif')

const {
  smsg,
  isUrl,
  generateMessageTag,
  getBuffer,
  getSizeMedia,
  fetch,
  await,
  sleep,
  reSize
} = require('./lib/myfunc')

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  generateForwardMessageContent,
  prepareWAMessageMedia,
  generateWAMessageFromContent,
  generateMessageID,
  downloadContentFromMessage,
  jidDecode,
  proto,
  jidNormalizedUser,
  makeCacheableSignalKeyStore,
  delay
} = require('@whiskeysockets/baileys')

// ✅ Import scheduler
const { initSholatScheduler }   = require('./commands/sholat')
const { initReminderScheduler } = require('./commands/reminder')

// Lightweight store
const store    = require('./lib/lightweight_store')
const settings = require('./settings')

store.readFromFile()
setInterval(() => store.writeToFile(), settings.storeWriteInterval || 10_000)

/* ======================================================================== */
/*  🔧 KONFIGURASI & BRANDING                                               */
/* ======================================================================== */

let phoneNumber = '6287792077608' // hanya default display
let owner       = JSON.parse(fs.readFileSync('./data/owner.json'))

global.botname    = 'Andika Bot'
global.themeemoji = '•'

/** helper bullet biar konsisten */
const bullet = () => (global.themeemoji || '•')

/** Banner divider */
const divider = () => '╌'.repeat(60)

/* ======================================================================== */
/*  🧠 MEMORY GUARD                                                         */
/* ======================================================================== */

setInterval(() => {
  if (!global.gc) return
  try { global.gc() } catch {}
}, 10 * 60_000)

setInterval(() => {
  const mu   = process.memoryUsage()
  const heap = Math.round(mu.heapUsed / 1024 / 1024)
  const rss  = Math.round(mu.rss / 1024 / 1024)

  if (heap > 450 && rss > 900) {
    console.log(
      chalk.redBright(
        `⚠️ Memory tinggi (heap=${heap}MB, rss=${rss}MB) — restart process...`
      )
    )
    process.exit(1)
  }
}, 30_000)

/* ======================================================================== */
/*  🌐 RUNTIME STATE / CONFIG                                               */
/* ======================================================================== */

let __CONNECTION_STATE = 'close'   // 'open' | 'close' | 'connecting'
let __LAST_QR          = ''
let __LAST_ACTIVITY    = Date.now()

const ENABLE_IDLE_WATCHDOG = String(process.env.ANDIKA_WATCHDOG || '0') !== '0'
const WATCHDOG_MINUTES      = parseInt(process.env.ANDIKA_WATCHDOG_MIN || '45', 10) // default 45m

/* ======================================================================== */
/*  📦 SIMPLE GLOBAL QUEUE UNTUK COMMAND                                    */
/* ======================================================================== */
// Biar kuat di banyak grup rame: batasi job paralel + panjang antrean

const MAX_INFLIGHT   = parseInt(process.env.ANDIKA_MAX_INFLIGHT   || '16', 10) // command paralel
const CHAT_QMAX      = parseInt(process.env.ANDIKA_CHAT_QMAX      || '80', 10) // maksimum antrean
const JOB_TIMEOUT_MS = parseInt(process.env.ANDIKA_JOB_TIMEOUT_MS || '90000', 10) // 90 detik

let inflightJobs = 0
const jobQueue   = []

function enqueueJob(job) {
  if (jobQueue.length >= CHAT_QMAX) {
    jobQueue.shift()
    console.warn(chalk.yellow('[QUEUE] antrean penuh, buang 1 job lama'))
  }

  jobQueue.push(job)
  runNextJob()
}

function runNextJob() {
  if (inflightJobs >= MAX_INFLIGHT) return

  const job = jobQueue.shift()
  if (!job) return

  inflightJobs++

  // Bungkus job dengan timeout global supaya 1 job beku nggak ngegantung semua
  const wrapped = Promise.race([
    Promise.resolve().then(job),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`[QUEUE] job timeout > ${JOB_TIMEOUT_MS}ms`)),
        JOB_TIMEOUT_MS
      )
    )
  ])

  wrapped
    .catch(err => {
      console.error(chalk.red('[QUEUE] job error:'), err)
    })
    .finally(() => {
      inflightJobs--
      if (jobQueue.length > 0) runNextJob()
    })
}

// Monitor ringan buat lihat kalau queue numpuk / inflight mentok
setInterval(() => {
  if (jobQueue.length === 0 && inflightJobs === 0) return
  console.log(
    chalk.gray(
      `[QUEUE] inflight=${inflightJobs} queued=${jobQueue.length}`
    )
  )
}, 15_000)

/* ======================================================================== */
/*  📲 QR HELPER (docker logs friendly)                                     */
/* ======================================================================== */

function printQR(qr) {
  try {
    console.log('\n' + divider())
    console.log(
      chalk.greenBright(
        '📲 Scan QR ini di WhatsApp (Settings → Linked Devices → Link a Device):'
      )
    )
    console.log(divider())

    qrcode.generate(qr, { small: true }, (ascii) => {
      console.log(ascii)
    })

    console.log(
      chalk.gray('(QR akan diperbarui tiap beberapa detik bila belum discan)\n')
    )
  } catch (e) {
    console.log('RAW QR DATA:', qr)
  }
}

/* ======================================================================== */
/*  🚀 START SOCKET (QR-only)                                               */
/* ======================================================================== */

async function startXeonBotInc() {
  const { version }          = await fetchLatestBaileysVersion()
  const { state, saveCreds } = await useMultiFileAuthState('./session')
  const msgRetryCounterCache = new NodeCache()

  const XeonBotInc = makeWASocket({
    version,
    logger: pino({ level: process.env.DEBUG ? 'info' : 'silent' }),
    // ganti device string → Ubuntu 25.10
    browser: ['Ubuntu 25.10', 'Chrome', '25.10'],
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(
        state.keys,
        pino({ level: 'fatal' }).child({ level: 'fatal' })
      )
    },
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    getMessage: async (key) => {
      const jid = jidNormalizedUser(key.remoteJid)
      const msg = await store.loadMessage(jid, key.id)
      return msg?.message || ''
    },
    msgRetryCounterCache,
    defaultQueryTimeoutMs: undefined
  })

  store.bind(XeonBotInc.ev)

  /* -------------------------------------------------------------------- */
  /*  📩 MESSAGE HANDLER (pakai QUEUE, nggak blokir event loop)           */
  /* -------------------------------------------------------------------- */

  XeonBotInc.ev.on('messages.upsert', (chatUpdate) => {
    __LAST_ACTIVITY = Date.now()

    enqueueJob(async () => {
      try {
        const mek = chatUpdate.messages?.[0]
        if (!mek?.message) return

        // unwrap ephemeral
        if (Object.keys(mek.message)[0] === 'ephemeralMessage') {
          mek.message = mek.message.ephemeralMessage.message
        }

        // unwrap device-sent wrapper (Android multi-device)
        if (mek.message?.deviceSentMessage?.message) {
          mek.message = mek.message.deviceSentMessage.message
        }

        // status handler
        if (mek.key?.remoteJid === 'status@broadcast') {
          await handleStatus(XeonBotInc, chatUpdate)
          return
        }

        // ❗️JANGAN drop ID "BAE5..." — bisa bikin pesan valid ke-skip
        if (XeonBotInc?.msgRetryCounterCache) {
          XeonBotInc.msgRetryCounterCache.clear()
        }

        await handleMessages(XeonBotInc, chatUpdate, true)
      } catch (err) {
        console.error(chalk.red('Error in messages.upsert job:'), err)
        try {
          const jid = chatUpdate?.messages?.[0]?.key?.remoteJid
          if (!jid) return

          await XeonBotInc.sendMessage(jid, {
            text: '❌ Terjadi error saat memproses pesan kamu, coba lagi sebentar lagi ya.',
            contextInfo: {
              forwardingScore: 1,
              isForwarded: true,
              forwardedNewsletterMessageInfo: {
                newsletterJid: '120363421594431163@newsletter',
                newsletterName: 'Andika Bot',
                serverMessageId: -1
              }
            }
          })
        } catch {}
      }
    })
  })

  /* -------------------------------------------------------------------- */
  /*  🧾 HELPERS                                                           */
  /* -------------------------------------------------------------------- */

  XeonBotInc.decodeJid = (jid) => {
    if (!jid) return jid
    if (/:\d+@/gi.test(jid)) {
      const d = jidDecode(jid) || {}
      return (d.user && d.server) ? `${d.user}@${d.server}` : jid
    }
    return jid
  }

  XeonBotInc.ev.on('contacts.update', (update) => {
    for (const contact of update) {
      const id = XeonBotInc.decodeJid(contact.id)
      if (store && store.contacts) {
        store.contacts[id] = { id, name: contact.notify }
      }
    }
  })

  XeonBotInc.getName = (jid, withoutContact = false) => {
    const id = XeonBotInc.decodeJid(jid)
    withoutContact = XeonBotInc.withoutContact || withoutContact
    let v

    if (id.endsWith('@g.us')) {
      return new Promise(async (resolve) => {
        v = store.contacts[id] || {}
        if (!(v.name || v.subject)) {
          v = await XeonBotInc.groupMetadata(id).catch(() => ({})) || {}
        }
        resolve(
          v.name ||
          v.subject ||
          PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international')
        )
      })
    }

    v = id === '0@s.whatsapp.net'
      ? { id, name: 'WhatsApp' }
      : id === XeonBotInc.decodeJid(XeonBotInc.user.id)
        ? XeonBotInc.user
        : (store.contacts[id] || {})

    return (withoutContact ? '' : v.name) ||
      v.subject ||
      v.verifiedName ||
      PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international')
  }

  XeonBotInc.public     = true
  XeonBotInc.serializeM = (m) => smsg(XeonBotInc, m, store)

  /* -------------------------------------------------------------------- */
  /*  🔌 CONNECTION.UPDATE (QR + fancy banner)                             */
  /* -------------------------------------------------------------------- */

  XeonBotInc.ev.on('connection.update', async (s) => {
    __LAST_ACTIVITY = Date.now()

    const { connection, lastDisconnect, qr } = s
    __CONNECTION_STATE = connection || __CONNECTION_STATE

    // Selalu cetak QR ke stdout (agar muncul di docker logs)
    if (qr) {
      if (qr !== __LAST_QR) {
        __LAST_QR = qr
        printQR(qr)
      }
    } else {
      __LAST_QR = ''
    }

    if (connection === 'open') {
      // 🔔 INIT SCHEDULER
      initSholatScheduler(XeonBotInc)
      console.log(chalk.green('🕌 Sholat scheduler aktif'))

      initReminderScheduler(XeonBotInc)
      console.log(chalk.green('⏰ Reminder scheduler aktif'))

      // Kirim notif ke nomor bot sendiri
      const botNumber = XeonBotInc.user.id.split(':')[0] + '@s.whatsapp.net'
      await XeonBotInc.sendMessage(botNumber, {
        text:
          `🤖 Bot Connected Successfully!\n\n` +
          `⏰ Time   : ${new Date().toLocaleString()}\n` +
          `✅ Status : Online and Ready!\n\n` +
          `✅ Make sure to join channel di bawah ya.`,
        contextInfo: {
          forwardingScore: 1,
          isForwarded: true,
          forwardedNewsletterMessageInfo: {
            newsletterJid: '120363421594431163@newsletter',
            newsletterName: 'Andika Bot',
            serverMessageId: -1
          }
        }
      })

      await delay(1500)

      // 🎨 FANCY BANNER DI LOG
      const line = '═'.repeat(60)
      const sub  = '─'.repeat(60)

      console.log('\n' + chalk.cyan(line))
      console.log(
        chalk.magentaBright.bold(
          `   🤖  ${global.botname || 'ANDIKA BOT'} — CONNECTED`
        )
      )
      console.log(chalk.cyan(line))

      // Session info singkat
      const sessionId =
        XeonBotInc.user?.id || 'unknown-session'
      const pushName =
        XeonBotInc.user?.name || XeonBotInc.user?.notify || 'Andika Bot'

      console.log(
        chalk.gray(
          `   Logged in as : ${chalk.white(pushName)}`
        )
      )
      console.log(
        chalk.gray(
          `   Session ID   : ${chalk.white(sessionId)}`
        )
      )
      console.log(
        chalk.gray(
          `   Version      : ${chalk.white(settings.version)}`
        )
      )
      console.log(
        chalk.gray(
          `   Device       : ${chalk.white('Ubuntu 25.10 • Chrome')}`
        )
      )

      console.log(chalk.cyan(sub))
      console.log(chalk.magenta(`${bullet()} CHANNEL WA : Andika Bot`))
      console.log(chalk.magenta(`${bullet()} GITHUB     : masdikaaa`))
      console.log(chalk.magenta(`${bullet()} WA OWNER   : ${owner}`))
      console.log(chalk.magenta(`${bullet()} CREDIT     : Andika`))
      console.log(chalk.green(`${bullet()} STATUS     : Bot Connected Successfully ✅`))
      console.log(chalk.cyan(line) + '\n')
    }

    if (connection === 'close') {
      const err = lastDisconnect?.error
      const sc  = err?.output?.statusCode || err?.data?.statusCode

      const wipeCodes = new Set([
        401,
        403,
        419,
        DisconnectReason.badSession,
        DisconnectReason.loggedOut,
        DisconnectReason.timedOut
      ])

      if (wipeCodes.has(sc)) {
        try { rmSync('./session', { recursive: true, force: true }) } catch {}
        console.log(chalk.red(`🔁 Session wiped (status=${sc}). Relogin...`))
      } else {
        console.log(chalk.yellow(`🔁 Reconnecting (status=${sc})...`))
      }

      startXeonBotInc()
    }
  })

  /* -------------------------------------------------------------------- */
  /*  📵 ANTICALL                                                          */
  /* -------------------------------------------------------------------- */

  const antiCallNotified = new Set()

  XeonBotInc.ev.on('call', async (calls) => {
    try {
      const { readState: readAnticallState } = require('./commands/anticall')
      const state = readAnticallState()
      if (!state.enabled) return

      for (const call of calls) {
        const callerJid = call.from || call.peerJid || call.chatId
        if (!callerJid) continue

        try {
          try {
            if (typeof XeonBotInc.rejectCall === 'function' && call.id) {
              await XeonBotInc.rejectCall(call.id, callerJid)
            } else if (typeof XeonBotInc.sendCallOfferAck === 'function' && call.id) {
              await XeonBotInc.sendCallOfferAck(call.id, callerJid, 'reject')
            }
          } catch {}

          if (!antiCallNotified.has(callerJid)) {
            antiCallNotified.add(callerJid)
            setTimeout(() => antiCallNotified.delete(callerJid), 60_000)

            await XeonBotInc.sendMessage(callerJid, {
              text: '📵 Anticall is enabled. Your call was rejected and you will be blocked.'
            })
          }
        } catch {}

        setTimeout(async () => {
          try { await XeonBotInc.updateBlockStatus(callerJid, 'block') } catch {}
        }, 800)
      }
    } catch {}
  })

  /* -------------------------------------------------------------------- */
  /*  📣 EVENTS LAIN                                                       */
  /* -------------------------------------------------------------------- */

  XeonBotInc.ev.on('creds.update', saveCreds)

  XeonBotInc.ev.on('group-participants.update', async (update) => {
    await handleGroupParticipantUpdate(XeonBotInc, update)
    try { require('./lib/isAdmin').invalidate(update.id) } catch {}
  })

  // status events
  XeonBotInc.ev.on('status.update',     async (status) => { await handleStatus(XeonBotInc, status) })
  XeonBotInc.ev.on('messages.reaction', async (status) => { await handleStatus(XeonBotInc, status) })

  /* -------------------------------------------------------------------- */
  /*  💓 KEEP-ALIVE presence tiap 5 menit                                  */
  /* -------------------------------------------------------------------- */

  setInterval(async () => {
    try {
      if (__CONNECTION_STATE !== 'open') return
      const botNumber = XeonBotInc.user?.id?.split(':')[0] + '@s.whatsapp.net'
      if (!botNumber) return

      await XeonBotInc.presenceSubscribe(botNumber)
      await XeonBotInc.sendPresenceUpdate('available', botNumber)
    } catch {}
  }, 5 * 60 * 1000)

  /* -------------------------------------------------------------------- */
  /*  🐶 WATCHDOG (aman & default OFF)                                    */
  /* -------------------------------------------------------------------- */

  setInterval(() => {
    if (!ENABLE_IDLE_WATCHDOG) return
    if (__CONNECTION_STATE !== 'open') return
    if (__LAST_QR) return // kalau masih QR, biarkan

    const idleMs    = Date.now() - __LAST_ACTIVITY
    const threshold = WATCHDOG_MINUTES * 60 * 1000

    if (idleMs > threshold) {
      console.log(
        chalk.yellow(
          `⏱️ Idle > ${WATCHDOG_MINUTES} menit, soft reconnect...`
        )
      )
      try { XeonBotInc.ws?.close() } catch {}
      __LAST_ACTIVITY = Date.now() // cegah spam
    }
  }, 60_000)

  return XeonBotInc
}

/* ======================================================================== */
/*  🏁 ENTRYPOINT                                                           */
/* ======================================================================== */

;(async () => {
  await startXeonBotInc()
})().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})

process.on('uncaughtException',  (err) => console.error('Uncaught Exception:', err))
process.on('unhandledRejection', (err) => console.error('Unhandled Rejection:', err))

let file = require.resolve(__filename)
fs.watchFile(file, () => {
  fs.unwatchFile(file)
  console.log(chalk.redBright(`Update ${__filename}`))
  delete require.cache[file]
  require(file)
})
