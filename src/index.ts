import { Telegraf, Markup } from "telegraf";
import * as dotenv from "dotenv";

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN || "");

// Типы для задач
interface Task {
  id: number;
  text: string;
  done: boolean;
}

// Хранилище чеклистов пользователей: userId -> { taskNumber, tasks, title }
interface UserChecklist {
  taskNumber: string;
  tasks: Task[];
  title: string;
}

const userChecklists = new Map<number, UserChecklist>();

// Хардкодированный список задач (шаблон)
const taskTemplates = [
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

// Создание чеклиста из шаблона
function createChecklist(taskNumber: string): Task[] {
  return taskTemplates.map((text, index) => ({
    id: index + 1,
    text: text,
    done: false,
  }));
}

// Построение inline keyboard из задач
function buildKeyboard(tasks: Task[]) {
  const buttons = tasks.map((task) => [
    Markup.button.callback(
      `${task.done ? "✅" : "⬜️"} ${task.id}. ${task.text}`,
      `toggle:${task.id}`
    ),
  ]);

  // Добавляем кнопку сброса
  buttons.push([Markup.button.callback("🔁 Сбросить чеклист", "reset")]);

  return Markup.inlineKeyboard(buttons);
}

// Команда /start
bot.command("start", (ctx) => {
  ctx.reply(
    "Привет! Я бот для создания интерактивных чеклистов задач.\n\n" +
      "📋 Команды:\n" +
      "/create_list XXX - создать чеклист для задачи (где XXX - номер)\n" +
      "Например: /create_list 1234\n\n" +
      "✨ Чеклист будет интерактивным - нажимайте на задачи, чтобы отметить их выполненными!"
  );
});

// Команда /create_list
bot.command("create_list", async (ctx) => {
  const userId = ctx.from?.id;

  if (!userId) {
    return ctx.reply("❌ Не удалось определить ваш ID");
  }

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

  // Создаем или обновляем чеклист пользователя
  const tasks = createChecklist(taskNumber);
  userChecklists.set(userId, {
    taskNumber,
    tasks,
    title,
  });

  // Отправляем интерактивный чеклист
  await ctx.reply(title, buildKeyboard(tasks));

  console.log(
    `✅ Interactive checklist created for user ${userId}, task ${taskNumber}`
  );
});

// Обработка нажатий на inline-кнопки
bot.on("callback_query", async (ctx) => {
  const userId = ctx.from?.id;

  if (!userId) {
    return ctx.answerCbQuery("❌ Ошибка идентификации");
  }

  // Получаем чеклист пользователя
  let userChecklist = userChecklists.get(userId);

  // Если чеклист не найден (бот перезапускался), создаем новый
  if (!userChecklist) {
    await ctx.answerCbQuery(
      "⚠️ Чеклист не найден. Создайте новый с помощью /create_list"
    );
    return;
  }

  // @ts-ignore - callback_query.data существует для data callback queries
  const data = ctx.callbackQuery.data;

  if (!data) {
    return ctx.answerCbQuery("❌ Некорректный callback");
  }

  if (data === "reset") {
    // Сброс всех задач
    userChecklist.tasks = createChecklist(userChecklist.taskNumber);
    userChecklists.set(userId, userChecklist);

    await ctx.editMessageReplyMarkup(
      buildKeyboard(userChecklist.tasks).reply_markup
    );

    await ctx.answerCbQuery("🔁 Чеклист сброшен");
    console.log(`🔁 Checklist reset for user ${userId}`);
    return;
  }

  if (data.startsWith("toggle:")) {
    const taskId = Number(data.split(":")[1]);
    const task = userChecklist.tasks.find((t) => t.id === taskId);

    if (task) {
      task.done = !task.done;

      // Обновляем клавиатуру
      await ctx.editMessageReplyMarkup(
        buildKeyboard(userChecklist.tasks).reply_markup
      );

      await ctx.answerCbQuery(
        task.done ? "✅ Задача выполнена" : "⬜️ Задача не выполнена"
      );

      console.log(
        `${task.done ? "✅" : "⬜️"} Task ${taskId} toggled for user ${userId}`
      );
    } else {
      await ctx.answerCbQuery("❌ Задача не найдена");
    }
  }
});

// Запуск бота
bot.launch().then(() => {
  console.log("🚀 Bot started successfully!");
  console.log("📋 Using standard Telegram inline keyboard API");
});

// Graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
