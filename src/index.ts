import { Telegraf, Markup } from "telegraf";
import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN || "");

// ==== Типы ====

interface Task {
  id: number;
  text: string;
  done: boolean;
}

interface UserChecklist {
  taskNumber: string;
  tasks: Task[];
  title: string;
}

// ==== Файловое хранилище ====

const STORE_PATH = path.resolve(__dirname, "userChecklists.json");

// userId -> { taskNumber, tasks, title }
const userChecklists = new Map<number, UserChecklist>();

// Загрузка данных из файла при старте
function loadStoreFromFile() {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      console.log("ℹ️ Файл хранилища не найден, начинаем с пустой базы");
      return;
    }

    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    if (!raw.trim()) {
      console.log("ℹ️ Файл хранилища пустой");
      return;
    }

    const parsed = JSON.parse(raw) as Record<string, UserChecklist>;

    Object.entries(parsed).forEach(([idStr, checklist]) => {
      const userId = Number(idStr);
      if (!Number.isNaN(userId) && checklist) {
        userChecklists.set(userId, checklist);
      }
    });

    console.log(
      `📂 Загружено чеклистов из файла: ${userChecklists.size} пользователей`
    );
  } catch (err) {
    console.error("❌ Ошибка при загрузке хранилища из файла:", err);
  }
}

// Сохранение Map -> файл
function saveStoreToFile() {
  try {
    const obj: Record<string, UserChecklist> = {};
    for (const [userId, checklist] of userChecklists.entries()) {
      obj[String(userId)] = checklist;
    }

    fs.writeFileSync(STORE_PATH, JSON.stringify(obj, null, 2), "utf-8");
    // console.log("💾 Хранилище сохранено");
  } catch (err) {
    console.error("❌ Ошибка при сохранении хранилища в файл:", err);
  }
}

// ==== Логика чеклиста ====

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

function createChecklist(taskNumber: string): Task[] {
  return taskTemplates.map((text, index) => ({
    id: index + 1,
    text,
    done: false,
  }));
}

function buildKeyboard(tasks: Task[]) {
  const buttons = tasks.map((task) => [
    Markup.button.callback(
      `${task.done ? "✅" : "⬜️"} ${task.id}. ${task.text}`,
      `toggle:${task.id}`
    ),
  ]);

  buttons.push([Markup.button.callback("🔁 Сбросить чеклист", "reset")]);

  return Markup.inlineKeyboard(buttons);
}

// ==== Команды ====

bot.command("start", (ctx) => {
  ctx.reply(
    "Привет! Я бот для создания интерактивных чеклистов задач.\n\n" +
      "📋 Команды:\n" +
      "/list XXX - создать чеклист для задачи (где XXX - номер)\n" +
      "Например: /list 1234\n\n" +
      "✨ Чеклист будет интерактивным — нажимайте на задачи, чтобы отметить их выполненными!"
  );
});

bot.command("list", async (ctx) => {
  const userId = ctx.from?.id;

  if (!userId) {
    return ctx.reply("❌ Не удалось определить ваш ID");
  }

  const args = ctx.message.text.split(" ");

  if (args.length < 2) {
    return ctx.reply("Пожалуйста, укажите номер задачи. Например: /list 1234");
  }

  const taskNumber = args[1];

  if (!/^\d+$/.test(taskNumber)) {
    return ctx.reply("Номер задачи должен содержать только цифры");
  }

  const title = `#task ${taskNumber}. https://sfera-t1.ru/tasks/task/TCOMCLOUD-${taskNumber}`;

  const tasks = createChecklist(taskNumber);
  userChecklists.set(userId, {
    taskNumber,
    tasks,
    title,
  });

  // 💾 сохраняем после изменения
  saveStoreToFile();

  await ctx.reply(title, buildKeyboard(tasks));

  console.log(
    `✅ Interactive checklist created for user ${userId}, task ${taskNumber}`
  );
});

// ==== Callback-кнопки ====

bot.on("callback_query", async (ctx) => {
  const userId = ctx.from?.id;

  if (!userId) {
    return ctx.answerCbQuery("❌ Ошибка идентификации");
  }

  let userChecklist = userChecklists.get(userId);

  if (!userChecklist) {
    await ctx.answerCbQuery(
      "⚠️ Чеклист не найден. Создайте новый с помощью /list"
    );
    return;
  }

  // @ts-ignore
  const data = ctx.callbackQuery.data as string | undefined;

  if (!data) {
    return ctx.answerCbQuery("❌ Некорректный callback");
  }

  if (data === "reset") {
    userChecklist.tasks = createChecklist(userChecklist.taskNumber);
    userChecklists.set(userId, userChecklist);

    // 💾 сохраняем после изменения
    saveStoreToFile();

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

      // 💾 сохраняем после изменения
      saveStoreToFile();

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

// ==== Старт бота ====

loadStoreFromFile();

bot
  .launch()
  .then(() => {
    console.log("🚀 Bot started successfully!");
    console.log("📋 Using standard Telegram inline keyboard API");
    console.log(`📂 Хранилище: ${STORE_PATH}`);
  })
  .catch((err) => {
    console.error("❌ Ошибка при запуске бота:", err);
  });

// Graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
