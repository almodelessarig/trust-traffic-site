// Vercel Serverless Function для отправки заявок в Telegram

export default async function handler(req, res) {
  // Настройки Telegram бота
  const TELEGRAM_BOT_TOKEN = '6507491346:AAGQwFbaY2rRIDRXfAyf6gmd9rEzGVaRUjo';
  const TELEGRAM_CHAT_ID = '-730111975';

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
        message: 'Ошибка отправки заявки'
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Заявка успешно отправлена!'
    });

  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка сервера'
    });
  }
}
