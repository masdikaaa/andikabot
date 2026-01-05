const fs = require('fs');

const words = ['javascript', 'bot', 'hangman', 'whatsapp', 'nodejs'];
let hangmanGames = {};

function startHangman(sock, chatId) {
    const word = words[Math.floor(Math.random() * words.length)];
    const maskedWord = '_ '.repeat(word.length).trim();

    hangmanGames[chatId] = {
        word,
        maskedWord: maskedWord.split(' '),
        guessedLetters: [],
        wrongGuesses: 0,
        maxWrongGuesses: 6,
    };

    sock.sendMessage(chatId, { 
        text: `🎮 *Game Hangman dimulai!*\n🧩 Kata: ${maskedWord}\n✍️ Tebak huruf dengan kirim *.guess <huruf>*` 
    });
}

function guessLetter(sock, chatId, letter) {
    if (!hangmanGames[chatId]) {
        sock.sendMessage(chatId, { 
            text: '⚠️ *Belum ada permainan berlangsung.* Mulai baru dengan *.hangman*' 
        });
        return;
    }

    const game = hangmanGames[chatId];
    const { word, guessedLetters, maskedWord, maxWrongGuesses } = game;

    if (guessedLetters.includes(letter)) {
        sock.sendMessage(chatId, { 
            text: `ℹ️ *Huruf "${letter}" sudah ditebak.* Coba huruf lain ya.` 
        });
        return;
    }

    guessedLetters.push(letter);

    if (word.includes(letter)) {
        for (let i = 0; i < word.length; i++) {
            if (word[i] === letter) {
                maskedWord[i] = letter;
            }
        }
        sock.sendMessage(chatId, { 
            text: `✅ *Tebakan benar!* ${maskedWord.join(' ')}` 
        });

        if (!maskedWord.includes('_')) {
            sock.sendMessage(chatId, { 
                text: `🏆 *Selamat!* Kamu berhasil menebak kata: *${word}*` 
            });
            delete hangmanGames[chatId];
        }
    } else {
        game.wrongGuesses += 1;
        const triesLeft = maxWrongGuesses - game.wrongGuesses;
        sock.sendMessage(chatId, { 
            text: `❌ *Salah tebak!* Sisa kesempatan: *${triesLeft}*` 
        });

        if (game.wrongGuesses >= maxWrongGuesses) {
            sock.sendMessage(chatId, { 
                text: `💀 *Game over!* Kata yang benar: *${word}*` 
            });
            delete hangmanGames[chatId];
        }
    }
}

module.exports = { startHangman, guessLetter };
