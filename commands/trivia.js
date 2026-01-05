const axios = require('axios');

let triviaGames = {};

async function startTrivia(sock, chatId) {
    if (triviaGames[chatId]) {
        sock.sendMessage(chatId, { text: 'Permainan trivia sedang berlangsung!' });
        return;
    }

    try {
        const response = await axios.get('https://opentdb.com/api.php?amount=1&type=multiple');
        const questionData = response.data.results[0];

        triviaGames[chatId] = {
            question: questionData.question,
            correctAnswer: questionData.correct_answer,
            options: [...questionData.incorrect_answers, questionData.correct_answer].sort(),
        };

        sock.sendMessage(chatId, {
            text: `🧠 *Waktu Trivia!*\n\n❓ *Pertanyaan:* ${triviaGames[chatId].question}\n\n🔢 *Opsi:*\n${triviaGames[chatId].options.join('\n')}`
        });
    } catch (error) {
        sock.sendMessage(chatId, { text: '❌ Gagal mengambil pertanyaan trivia. Coba lagi nanti.' });
    }
}

function answerTrivia(sock, chatId, answer) {
    if (!triviaGames[chatId]) {
        sock.sendMessage(chatId, { text: 'Belum ada permainan trivia yang berjalan.' });
        return;
    }

    const game = triviaGames[chatId];

    if (answer.toLowerCase() === game.correctAnswer.toLowerCase()) {
        sock.sendMessage(chatId, { text: `✅ Benar! Jawabannya adalah: ${game.correctAnswer}` });
    } else {
        sock.sendMessage(chatId, { text: `❌ Salah! Jawaban yang benar: ${game.correctAnswer}` });
    }

    delete triviaGames[chatId];
}

module.exports = { startTrivia, answerTrivia };
