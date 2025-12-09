// bot.js
const { Bot } = require("grammy");
require("dotenv").config();

const bot = new Bot(process.env.BOT_TOKEN);

// userId -> массив задач
// [{ id: 1, text: '...', done: false }, ...]
const userChecklists = new Map();

function getDefaultTasks() {
  return [
    { id: 1, text: "Выпить воду", done: false },
    { id: 2, text: "Проверить почту", done: false },
    { id: 3, text: "Запланировать день", done: false },
  ];
}

function buildKeyboard(tasks) {
  const rows = tasks.map((task) => [
    {
      text: `${task.done ? "✅" : "⬜️"} ${task.text}`,
      callback_data: `toggle:${task.id}`,
    },
  ]);

  // Доп. кнопка снизу
  rows.push([
    {
      text: "🔁 Сбросить чеклист",
      callback_data: "reset",
    },
  ]);

  return { inline_keyboard: rows };
}

// Команда /start
bot.command("start", async (ctx) => {
  await ctx.reply(
    "Привет! Я чеклист-бот.\n" + "Напиши /checklist, чтобы получить чеклист."
  );
});

// Команда /checklist
bot.command("checklist", async (ctx) => {
  const userId = ctx.from.id;

  // Создаем или берём существующий чеклист
  let tasks = userChecklists.get(userId);
  if (!tasks) {
    tasks = getDefaultTasks();
    userChecklists.set(userId, tasks);
  }

  await ctx.reply("📋 Твой чеклист на сегодня:", {
    reply_markup: buildKeyboard(tasks),
  });
});

// Обработка нажатий на inline-кнопки
bot.on("callback_query:data", async (ctx) => {
  const userId = ctx.from.id;
  let tasks = userChecklists.get(userId);

  // Если вдруг не нашли (например, бот перезапускался)
  if (!tasks) {
    tasks = getDefaultTasks();
    userChecklists.set(userId, tasks);
  }

  const data = ctx.callbackQuery.data;

  if (data === "reset") {
    // Сброс всех задач
    tasks = getDefaultTasks();
    userChecklists.set(userId, tasks);

    await ctx.editMessageReplyMarkup({
      reply_markup: buildKeyboard(tasks),
    });

    await ctx.answerCallbackQuery({ text: "Чеклист сброшен 🔁" });
    return;
  }

  if (data.startsWith("toggle:")) {
    const id = Number(data.split(":")[1]);
    const task = tasks.find((t) => t.id === id);

    if (task) {
      task.done = !task.done;
    }

    await ctx.editMessageReplyMarkup({
      reply_markup: buildKeyboard(tasks),
    });

    await ctx.answerCallbackQuery(); // просто закрыть "часики"
  }
});

// Старт бота
bot.start();
console.log("Bot started");
