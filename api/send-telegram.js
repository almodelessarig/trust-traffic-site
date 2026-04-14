// Vercel Serverless Function для отправки заявок в Telegram и amoCRM
import { createClient } from 'redis';

export default async function handler(req, res) {
  // Настройки Telegram бота
  const TELEGRAM_BOT_TOKEN = '6507491346:AAGQwFbaY2rRIDRXfAyf6gmd9rEzGVaRUjo';
  const TELEGRAM_CHAT_ID = '-730111975';

  // Настройки amoCRM
  const AMOCRM_SUBDOMAIN = 'elessar4amo';
  const AMOCRM_INTEGRATION_ID = '9d3f6a17-528a-4cfa-afd3-ee47760cc02d';
  const AMOCRM_SECRET_KEY = 'xNO0WJpTpPsGY6hkHz6zr0giq4KdjBmwwO7UiIshkVkCw35cVIEwDxVWj3TvLGOe';
  const AMOCRM_REDIRECT_URI = 'https://trust-traffic.kz';

  // Воронка для новых заявок
  const AMOCRM_PIPELINE_ID = 7527826; // Продажи Trust Traffic

  // Redis клиент
  let redis = null;

  async function getRedisClient() {
    if (!redis) {
      redis = createClient({ url: process.env.REDIS_URL });
      redis.on('error', err => console.error('Redis error:', err));
      await redis.connect();
    }
    return redis;
  }

  // Получение токенов из Redis
  async function getTokens() {
    try {
      const client = await getRedisClient();
      const accessToken = await client.get('amocrm_access_token');
      const refreshToken = await client.get('amocrm_refresh_token');
      return { accessToken, refreshToken };
    } catch (error) {
      console.error('Error getting tokens from Redis:', error);
      return { accessToken: null, refreshToken: null };
    }
  }

  // Сохранение токенов в Redis
  async function saveTokens(accessToken, refreshToken) {
    try {
      const client = await getRedisClient();
      await client.set('amocrm_access_token', accessToken);
      await client.set('amocrm_refresh_token', refreshToken);
      await client.set('amocrm_token_updated_at', new Date().toISOString());
      return true;
    } catch (error) {
      console.error('Error saving tokens to Redis:', error);
      return false;
    }
  }

  // Функция обновления amoCRM токена
  async function refreshAmoCRMToken(currentRefreshToken) {
    try {
      const tokenUrl = `https://${AMOCRM_SUBDOMAIN}.amocrm.ru/oauth2/access_token`;

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: AMOCRM_INTEGRATION_ID,
          client_secret: AMOCRM_SECRET_KEY,
          grant_type: 'refresh_token',
          refresh_token: currentRefreshToken,
          redirect_uri: AMOCRM_REDIRECT_URI
        })
      });

      const data = await response.json();

      if (data.access_token) {
        await saveTokens(data.access_token, data.refresh_token);
        return {
          success: true,
          accessToken: data.access_token,
          refreshToken: data.refresh_token
        };
      }

      console.error('Token refresh failed:', data);
      return { success: false };
    } catch (error) {
      console.error('Token refresh error:', error);
      return { success: false };
    }
  }

  // CORS заголовки
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Обработка preflight запроса
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Проверка метода запроса
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, message: 'Метод не разрешен' });
    return;
  }

  try {
    // Получение данных из запроса
    const data = req.body;

    // Валидация обязательных полей
    if (!data.phone) {
      res.status(400).json({ success: false, message: 'Укажите номер телефона' });
      return;
    }

    // Извлечение данных
    const phone = String(data.phone || '').trim();

    // Данные квиза
    const teamSize = String(data.step1 || 'Не указано').trim();
    const adExperience = String(data.step2 || 'Не указано').trim();
    const budget = String(data.step3 || 'Не указано').trim();
    const source = String(data.source || 'Форма на странице').trim();

    // UTM метки
    const utm_source = String(data.utm_source || 'Прямой заход').trim();
    const utm_medium = String(data.utm_medium || '-').trim();
    const utm_campaign = String(data.utm_campaign || '-').trim();
    const utm_content = String(data.utm_content || '-').trim();
    const utm_adname = String(data.utm_adname || '-').trim();

    // Дополнительные данные
    const page_url = String(data.page_url || '-').trim();
    const referrer = String(data.referrer || '-').trim();
    const timestamp = new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' });

    // Маппинг значений квиза на понятный текст
    const teamSizeMap = {
      'solo': '👤 Работаю один',
      '1': '👥 1 юрист',
      '2-3': '👥 2-3 юриста',
      '4+': '🏢 4+ юристов'
    };

    const adExperienceMap = {
      'none': '❌ Никогда не пробовал',
      'bad': '😔 Пробовал, слил бюджет',
      'good': '✅ Есть опыт, хочу масштабировать'
    };

    const budgetMap = {
      '0': '💸 Нет бюджета',
      'low': '💰 До 300K ₸/мес',
      'med': '💰💰 300K - 1M ₸/мес',
      'high': '💰💰💰 Более 1M ₸/мес'
    };

    // Текстовые версии для amoCRM
    const teamSizeText = {
      'solo': 'Работаю один',
      '1': '1 юрист',
      '2-3': '2-3 юриста',
      '4+': '4+ юристов'
    };

    const adExperienceText = {
      'none': 'Никогда не пробовал',
      'bad': 'Пробовал, слил бюджет',
      'good': 'Есть опыт, хочу масштабировать'
    };

    const budgetText = {
      '0': 'Нет бюджета',
      'low': 'До 300K ₸/мес',
      'med': '300K - 1M ₸/мес',
      'high': 'Более 1M ₸/мес'
    };

    // Формирование сообщения для Telegram
    let message = "🔔 <b>Новая заявка с сайта TRUST TRAFFIC</b>\n\n";
    message += `📱 <b>Телефон:</b> ${phone}\n`;
    message += `📍 <b>Источник:</b> ${source}\n`;
    message += `🕐 <b>Время:</b> ${timestamp}\n\n`;

    message += "📋 <b>Ответы на квиз:</b>\n";
    message += `├ Команда: ${teamSizeMap[teamSize] || teamSize}\n`;
    message += `├ Опыт рекламы: ${adExperienceMap[adExperience] || adExperience}\n`;
    message += `└ Бюджет: ${budgetMap[budget] || budget}\n\n`;

    message += "📊 <b>UTM-метки:</b>\n";
    message += `├ Source: ${utm_source}\n`;
    message += `├ Medium: ${utm_medium}\n`;
    message += `├ Campaign: ${utm_campaign}\n`;
    message += `├ Content: ${utm_content}\n`;
    message += `└ Ad Name: ${utm_adname}\n\n`;

    message += "🌐 <b>Дополнительно:</b>\n";
    message += `├ Страница: ${page_url}\n`;
    message += `└ Источник перехода: ${referrer}`;

    // Отправка сообщения в Telegram
    const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

    const telegramResponse = await fetch(telegramApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML'
      })
    });

    const telegramData = await telegramResponse.json();

    if (!telegramData.ok) {
      console.error('Telegram API error:', telegramData);
      res.status(500).json({
        success: false,
        message: 'Ошибка отправки заявки в Telegram'
      });
      return;
    }

    // Отправка данных в amoCRM
    try {
      // Получаем токены из Redis
      let { accessToken, refreshToken } = await getTokens();

      if (!accessToken || !refreshToken) {
        console.error('No tokens found in Redis');
        res.status(200).json({
          success: true,
          message: 'Заявка отправлена в Telegram, но токены amoCRM не настроены'
        });
        return;
      }

      // Формирование названия сделки
      const teamText = teamSizeText[teamSize] || teamSize;
      const budgetLabel = budgetText[budget] || budget;
      const leadName = `Trust Traffic: ${teamText}, ${budgetLabel}`;

      // Функция создания неразобранной заявки (unsorted lead)
      async function createUnsortedLead(token) {
        const url = `https://${AMOCRM_SUBDOMAIN}.amocrm.ru/api/v4/leads/unsorted/forms`;
        const uid = `trusttraffic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const payload = [{
          source_name: source,
          source_uid: uid,
          pipeline_id: AMOCRM_PIPELINE_ID,
          _embedded: {
            leads: [{
              name: leadName,
              custom_fields_values: [
                // Кастомные поля сделки
                { field_id: 612901, values: [{ value: teamSizeText[teamSize] || teamSize }] }, // Размер команды
                { field_id: 612903, values: [{ value: adExperienceText[adExperience] || adExperience }] }, // Опыт рекламы
                { field_id: 612905, values: [{ value: budgetText[budget] || budget }] }, // Бюджет
                { field_id: 612907, values: [{ value: utm_adname }] }, // UTM Ad Name
                { field_id: 612909, values: [{ value: page_url }] }, // Страница заявки
                { field_id: 612911, values: [{ value: referrer }] } // Источник перехода
              ]
            }],
            contacts: [{
              name: `Лид: ${phone}`,
              custom_fields_values: [
                { field_code: 'PHONE', values: [{ value: phone, enum_code: 'WORK' }] },
                // UTM поля контакта (правильные ID)
                { field_id: 605819, values: [{ value: utm_source }] }, // utm_source
                { field_id: 605821, values: [{ value: utm_medium }] }, // utm_medium
                { field_id: 605823, values: [{ value: utm_campaign }] }, // utm_campaign
                { field_id: 605825, values: [{ value: utm_content }] } // utm_content
              ]
            }]
          },
          metadata: {
            form_id: 'trust_traffic_quiz',
            form_name: 'Квиз Trust Traffic',
            form_page: page_url,
            form_sent_at: Math.floor(Date.now() / 1000),
            referer: referrer
          }
        }];

        return await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });
      }

      // Создаём неразобранную заявку
      let unsortedResponse = await createUnsortedLead(accessToken);

      // Если токен истёк, обновляем
      if (unsortedResponse.status === 401) {
        console.log('amoCRM token expired, refreshing...');
        const refreshResult = await refreshAmoCRMToken(refreshToken);
        if (refreshResult.success) {
          accessToken = refreshResult.accessToken;
          unsortedResponse = await createUnsortedLead(accessToken);
        } else {
          console.error('Failed to refresh amoCRM token');
          res.status(200).json({
            success: true,
            message: 'Заявка отправлена в Telegram, но возникла ошибка при обновлении токена amoCRM'
          });
          return;
        }
      }

      const unsortedResult = await unsortedResponse.json();
      const unsortedId = unsortedResult._embedded?.unsorted?.[0]?.uid;

      if (unsortedId) {
        // Заявка создана в "Неразобранное"
        // Примечание добавится автоматически после принятия заявки
        console.log('Unsorted lead created:', unsortedId);

        res.status(200).json({
          success: true,
          message: 'Заявка успешно отправлена в Telegram и amoCRM!'
        });
      } else {
        console.error('amoCRM API error:', JSON.stringify(unsortedResult));
        res.status(200).json({
          success: true,
          message: 'Заявка отправлена в Telegram, но возникла ошибка при создании сделки в amoCRM'
        });
      }
    } catch (amoError) {
      console.error('amoCRM error:', amoError);
      res.status(200).json({
        success: true,
        message: 'Заявка отправлена в Telegram, но возникла ошибка при отправке в amoCRM'
      });
    }
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка сервера'
    });
  } finally {
    // Закрываем Redis соединение
    if (redis) {
      await redis.quit().catch(() => {});
    }
  }
}
