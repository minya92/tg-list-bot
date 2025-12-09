import { Telegraf } from "telegraf";
import * as dotenv from "dotenv";

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN || "");

// Хранилище для business connections
const businessConnections = new Map<number, string>();

// Типы для Telegram Bot API 9.1 Checklists
// https://core.telegram.org/bots/api#inputchecklisttask
interface InputChecklistTask {
  id: number; // Уникальный идентификатор задачи (должен быть числом!)
  text: string; // Текст задачи
  checked?: boolean; // Статус выполнения
}

// https://core.telegram.org/bots/api#inputchecklist
interface InputChecklist {
  title?: string;
  tasks: InputChecklistTask[];
}

// Тип для ответа Telegram Bot API
interface TelegramApiResponse {
  ok: boolean;
  description?: string;
  result?: any;
}

// Хардкодированный список задач
const tasks = [
  "Передвинуть задачу в Сфере",
  "Создать ветку от релизной",
  "Выполнить задачу",
  "Обновить сторибук",
  "Обновить тесты (npm test -- -u ./src/components/MyComponent)",
  "Поднять версии компонентов и сбилдить их",
  "Залить компоненты на дев",
  "Собрать страницу",
  "Проверить версии компонентов и Комит",
  "ПР в дев",
  "Код-ревью",
  "Написать в задаче ссыль на п.3 и версии компонентов",
  "Мёрдж в дев",
  "Поменять в баге исполнителя либо закрыть задачу",
  "Списать время с задачи в Сфере",
  "Написать тестеру",
  "Создать пр в релизную ветку со статусами тестирование не вливать и проверить название",
  "После тестирования поменять статус",
];

// Обработка business_connection - когда бот подключается к Business Account
// Примечание: Telegraf может не поддерживать этот тип обновлений напрямую
// Используем обработчик для всех обновлений
bot.use(async (ctx, next) => {
  // @ts-ignore - business_connection может быть не в типах
  if (ctx.update && ctx.update.business_connection) {
    // @ts-ignore
    const connection = ctx.update.business_connection;
    if (connection && connection.user) {
      console.log(
        `✅ Business connection established with user ${connection.user.id}`
      );
      console.log(`Connection ID: ${connection.id}`);

      // Сохраняем connection ID для этого пользователя
      businessConnections.set(connection.user.id, connection.id);

      if (connection.is_enabled) {
        console.log("Business connection is active!");
      }
    }
  }
  return next();
});

// Команда /start
bot.command("start", (ctx) => {
  const hasBusinessConnection =
    ctx.from && businessConnections.has(ctx.from.id);

  let message =
    "Привет! Используйте команду /create_list XXX, чтобы создать список задач.\n" +
    "Например: /create_list 1234\n\n";

  if (hasBusinessConnection) {
    message +=
      "✅ Бот подключен к вашему Business Account!\n" +
      "Чеклисты будут отправлены в нативном формате Telegram.";
  } else {
    message +=
      "ℹ️ Для работы с нативными чеклистами подключите бота к Telegram Business:\n" +
      "Настройки → Telegram для бизнеса → Подключить чат-бота\n\n" +
      "Без Business Account чеклисты будут отправлены текстом с эмодзи.";
  }

  ctx.reply(message);
});

// Команда для проверки статуса Business подключения
bot.command("debug", (ctx) => {
  const userId = ctx.from?.id;

  if (!userId) {
    return ctx.reply("❌ Не удалось определить ваш ID");
  }

  const hasConnection = businessConnections.has(userId);
  const connectionId = businessConnections.get(userId);

  let message = "🔍 **Статус подключения:**\n\n";
  message += `Ваш ID: \`${userId}\`\n`;
  message += `Business Connection: ${
    hasConnection ? "✅ Активно" : "❌ Не подключено"
  }\n`;

  if (hasConnection && connectionId) {
    message += `Connection ID: \`${connectionId}\`\n`;
  }

  message += `\n📊 Всего активных подключений: ${businessConnections.size}`;

  ctx.reply(message, { parse_mode: "Markdown" });
});

// Команда /create_list
bot.command("create_list", async (ctx) => {
  // Получаем аргументы команды
  const args = ctx.message.text.split(" ");

  if (args.length < 2) {
    return ctx.reply(
      "Пожалуйста, укажите номер задачи. Например: /create_list 1234"
    );
  }

  const taskNumber = args[1];

  // Проверяем, что это число
  if (!/^\d+$/.test(taskNumber)) {
    return ctx.reply("Номер задачи должен содержать только цифры");
  }

  // Формируем заголовок
  const title = `#task ${taskNumber}. https://sfera-t1.ru/tasks/task/TCOMCLOUD-${taskNumber}`;

  // Формируем InputChecklistTask согласно Bot API 9.1
  const checklistTasks: InputChecklistTask[] = tasks.map((task, index) => ({
    id: index + 1, // Уникальный ID для каждой задачи (числовой!)
    text: `${index + 1}. ${task}`,
    checked: false,
  }));

  // Формируем InputChecklist
  const checklist: InputChecklist = {
    title: title,
    tasks: checklistTasks,
  };

  // Проверяем, есть ли business connection для этого пользователя
  const businessConnectionId = ctx.from
    ? businessConnections.get(ctx.from.id)
    : undefined;

  try {
    // Используем официальный Telegram Bot API метод sendChecklist
    // https://core.telegram.org/bots/api#sendchecklist

    const botToken = process.env.BOT_TOKEN || "";
    const apiUrl = `https://api.telegram.org/bot${botToken}/sendChecklist`;

    const requestBody: any = {
      chat_id: ctx.chat?.id,
      checklist: checklist,
    };

    // Если есть business connection, добавляем его ID
    if (businessConnectionId) {
      requestBody.business_connection_id = businessConnectionId;
      console.log(`Using business connection: ${businessConnectionId}`);
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const result = (await response.json()) as TelegramApiResponse;

    if (!response.ok || !result.ok) {
      throw new Error(result.description || "API request failed");
    }

    console.log("✅ Checklist sent successfully!");
  } catch (error) {
    console.error("❌ Error sending checklist:", error);

    // Если API не поддерживается, отправляем как обычное сообщение с эмодзи
    try {
      await ctx.reply(title);

      const formattedTasks = tasks
        .map((task, index) => `☐ ${index + 1}. ${task}`)
        .join("\n");

      await ctx.reply(formattedTasks);

      // Показываем более информативное сообщение об ошибке
      const errorString = String(error);
      let errorMessage =
        "⚠️ Официальный API чеклистов недоступен. Список отправлен текстом.\n\n";

      // Проверяем тип ошибки
      if (errorString.includes("PREMIUM_ACCOUNT_REQUIRED")) {
        errorMessage +=
          "❌ Ошибка: PREMIUM_ACCOUNT_REQUIRED\n\n" +
          "Для использования нативных чеклистов требуется:\n" +
          "• Telegram Premium подписка у получателя\n" +
          "• Чат должен быть личным (не группа)\n" +
          "• Функция доступна только для Business аккаунтов\n\n" +
          "К сожалению, нативные чеклисты Telegram доступны только для Premium пользователей.";
      } else if (!businessConnectionId) {
        errorMessage +=
          "💡 Как включить нативные чеклисты:\n\n" +
          "1. Убедитесь, что у вас Telegram Premium\n" +
          "2. Настройки → Telegram для бизнеса → активируйте\n" +
          "3. Откройте @BotFather → выберите этого бота → Bot Settings → включите Business Mode\n" +
          "4. Настройки → Telegram для бизнеса → Подключить чат-бота → выберите этого бота\n\n" +
          "📖 Подробнее: см. файл BUSINESS_SETUP.md в репозитории";
      } else {
        errorMessage +=
          "Бот подключен к Business Account, но API вернул ошибку:\n" +
          errorString.substring(0, 200);
      }

      await ctx.reply(errorMessage);
    } catch (fallbackError) {
      console.error("Error sending fallback message:", fallbackError);
      ctx.reply("Произошла ошибка при отправке списка задач");
    }
  }
});

// Запуск бота
bot.launch().then(() => {
  console.log("Bot started successfully!");
});

// Graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
