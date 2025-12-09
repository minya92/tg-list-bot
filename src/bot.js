import { Bot } from "grammy";
import fs from "node:fs";
import * as dotenv from "dotenv";

dotenv.config();

const bot = new Bot(process.env.BOT_TOKEN);

// Простое тупое хранилище business_connection_id + chat_id
const STORE_FILE = "./business.json";
function loadStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch {
    return {};
  }
}
function saveStore(store) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf8");
}
let store = loadStore();

/**
 * 1) Ловим апдейт с бизнес-коннектом и сохраняем его
 */
bot.on("business_connection", async (ctx) => {
  const bc = ctx.update.business_connection;
  // bc.id  — business_connection_id
  // bc.user_chat_id — приватный чат с владельцем бизнеса
  store = {
    business_connection_id: bc.id,
    chat_id: bc.user_chat_id,
  };
  saveStore(store);

  await ctx.api.sendMessage(
    bc.user_chat_id,
    "✅ Бизнес-подключение сохранено, теперь могу слать чеклисты."
  );
});

/**
 * 2) Команда /checklist — отправляем чеклист
 */
bot.command("checklist", async (ctx) => {
  if (!store.business_connection_id || !store.chat_id) {
    return ctx.reply(
      "Сначала подключи бота к бизнес-аккаунту в настройках Telegram Business, " +
        "и напиши любое сообщение в личку бизнес-аккаунту — тогда я получу business_connection_id."
    );
  }

  // Простой чеклист
  const checklist = {
    title: "Утренний чеклист",
    tasks: [
      { id: 1, text: "Выпить воду" },
      { id: 2, text: "Проверить почту" },
      { id: 3, text: "Запланировать день" },
    ],
    // сюда можно добавить parse_mode, others_can_add_tasks и т.п., если нужно
  };

  await ctx.api.sendChecklist(
    store.business_connection_id, // business_connection_id: string
    store.chat_id, // chat_id: number
    checklist // InputChecklist
  );

  await ctx.reply("📋 Чеклист отправлен от имени бизнес-аккаунта.");
});

bot.start();
