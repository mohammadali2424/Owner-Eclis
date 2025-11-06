const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const http = require('http');
const express = require('express');

// ----------- تنظیمات (فقط از env؛ بدون .env) -----------
const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const GATEWAY_GROUP_ID = Number(process.env.GATEWAY_GROUP_ID);
const OWNER_ID = Number(process.env.OWNER_ID);
const REPORT_CODE = process.env.REPORT_CODE || '—';
const OWNER_FALLBACK_NAME = process.env.OWNER_FALLBACK_NAME || 'ارباب';

// اعتبارسنجی اولیه env
function requireEnv(name, val) {
  if (!val || (typeof val === 'number' && Number.isNaN(val))) {
    console.error(`❌ Missing required env: ${name}`);
    process.exit(1);
  }
}
requireEnv('BOT_TOKEN', BOT_TOKEN);
requireEnv('SUPABASE_URL', SUPABASE_URL);
requireEnv('SUPABASE_KEY', SUPABASE_KEY);
requireEnv('GATEWAY_GROUP_ID', GATEWAY_GROUP_ID);
requireEnv('OWNER_ID', OWNER_ID);

// ----------- سرور پینگ برای بیدار نگه داشتن سرویس -----------
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_, res) => res.json({
  status: 'active',
  service: 'Ninja4 Bot',
  timestamp: new Date().toISOString(),
  version: '3.0.0'
}));
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Ping server listening on ${PORT}`);
});
setInterval(() => {
  http.get(`http://localhost:${PORT}`).on('error', (err) => {
    console.error('❌ Health ping error:', err?.message);
  });
}, 14 * 60 * 1000);

// ----------- اتصال‌ها -----------
const bot = new Telegraf(BOT_TOKEN);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ----------- کمک‌ها/ابزارها -----------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};
function fullName(u) {
  if (!u) return 'کاربر';
  return (u.first_name || '') + (u.last_name ? (' ' + u.last_name) : '');
}
async function getOwnerNameFallback() {
  try {
    const m = await bot.telegram.getChatMember(GATEWAY_GROUP_ID, OWNER_ID);
    return fullName(m.user) || OWNER_FALLBACK_NAME;
  } catch {
    return OWNER_FALLBACK_NAME;
  }
}

// ----------- دیتابیس: استیکرها -----------
async function saveSticker(type, fileId) {
  try {
    const { error } = await supabase
      .from('stickers')
      .upsert({ type, file_id: fileId, created_at: new Date().toISOString() });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('❌ DB saveSticker:', e);
    return false;
  }
}
async function getSticker(type) {
  try {
    // maybeSingle: خطای PGRST116 رو نمیندازه
    const { data, error } = await supabase
      .from('stickers')
      .select('file_id')
      .eq('type', type)
      .maybeSingle();
    if (error) throw error;
    return data?.file_id || null;
  } catch (e) {
    console.error('❌ DB getSticker:', e);
    return null;
  }
}
async function sendSticker(chatId, type) {
  const fileId = await getSticker(type);
  if (!fileId) {
    console.warn(`⚠️ استیکر ${type} تنظیم نشده است`);
    return false;
  }
  try {
    await bot.telegram.sendSticker(chatId, fileId);
    return true;
  } catch (e) {
    console.error(`❌ sendSticker(${type}):`, e?.message);
    return false;
  }
}

// ----------- دیتابیس: کاربران/گروه‌ها -----------
async function isUserApproved(userId) {
  try {
    const { data, error } = await supabase
      .from('approved_users')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return !!data;
  } catch (e) {
    console.error('❌ DB isUserApproved:', e);
    return false;
  }
}
async function saveApprovedUser(userId, userData, approvedBy = OWNER_ID) {
  try {
    const { error } = await supabase
      .from('approved_users')
      .upsert({
        user_id: userId,
        user_name: userData.userName,
        username: userData.username,
        approved_at: new Date().toISOString(),
        approved_by: approvedBy
      });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('❌ DB saveApprovedUser:', e);
    return false;
  }
}
async function savePendingApproval(userId, userData, messageId = null) {
  try {
    const { error } = await supabase
      .from('pending_approvals')
      .upsert({
        user_id: userId,
        user_name: userData.userName,
        username: userData.username,
        join_time: new Date().toISOString(),
        message_id: messageId
      });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('❌ DB savePendingApproval:', e);
    return false;
  }
}
async function getPendingApproval(userId) {
  try {
    const { data, error } = await supabase
      .from('pending_approvals')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  } catch (e) {
    // این همون PGRST116 قبلی رو می‌پوشونه
    console.error('❌ DB getPendingApproval:', e);
    return null;
  }
}
async function removePendingApproval(userId) {
  try {
    const { error } = await supabase
      .from('pending_approvals')
      .delete()
      .eq('user_id', userId);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('❌ DB removePendingApproval:', e);
    return false;
  }
}
async function getProtectedGroups() {
  try {
    const { data, error } = await supabase
      .from('protected_groups')
      .select('group_id, group_name');
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('❌ DB getProtectedGroups:', e);
    return [];
  }
}
async function addProtectedGroup(groupId, groupName = null, addedBy = OWNER_ID) {
  try {
    const { error } = await supabase
      .from('protected_groups')
      .upsert({
        group_id: groupId,
        group_name: groupName,
        added_at: new Date().toISOString(),
        added_by: addedBy
      });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('❌ DB addProtectedGroup:', e);
    return false;
  }
}

// ----------- دسترسی ربات -----------
async function checkBotPermissions(groupId) {
  try {
    const cm = await bot.telegram.getChatMember(groupId, (await bot.telegram.getMe()).id);
    // باید ادمین باشد و حداقل حذف/محدودسازی داشته باشد
    return (
      cm.status === 'administrator' &&
      (cm.can_delete_messages || cm.can_restrict_members || cm.can_invite_users)
    );
  } catch (e) {
    console.error(`❌ checkBotPermissions(${groupId}):`, e?.message);
    return false;
  }
}

// ----------- منطق بَن گروهی (با ظرفیت بالا و بدون گیر کردن به Rate Limit) -----------
async function banInBatches(groupId, userIds, batchSize = 15, pauseMs = 500) {
  const batches = chunk(userIds, batchSize);
  for (const b of batches) {
    await Promise.allSettled(
      b.map(uid => bot.telegram.banChatMember(groupId, uid).catch(e => ({ error: e })))
    );
    await sleep(pauseMs);
  }
}

// ----------- قوانین اصلی ربات -----------

// 1) «شروع» — باید روی پیام مالک ریپلای شود؛ استیکر جداگانه و بدون ریپلای
bot.hears('شروع', async (ctx) => {
  try {
    if (ctx.from.id !== OWNER_ID) return;
    // پاسخ با ریپلای روی پیام مالک
    await ctx.reply('در خدمت شمام ارباب', { reply_to_message_id: ctx.message.message_id });
    // استیکر خارج از ریپلای
    await sendSticker(ctx.chat.id, 'start');
  } catch (e) {
    console.error('❌ hears(شروع):', e);
  }
});

// 2) وقتی «ربات» به گروهی اضافه شد → خودکار به protected_groups اضافه شود
bot.on('my_chat_member', async (ctx) => {
  try {
    const { chat, new_chat_member } = ctx.myChatMember;
    const status = new_chat_member?.status;
    if (chat?.type === 'supergroup' || chat?.type === 'group') {
      if (status === 'administrator' || status === 'member') {
        const title = chat.title || String(chat.id);
        const ok = await addProtectedGroup(chat.id, title);
        if (ok) console.log(`✅ Added protected group: ${title} (${chat.id})`);
      }
    }
  } catch (e) {
    console.error('❌ my_chat_member handler:', e);
  }
});

// 3) ورود کاربر به «گروه دروازه» → اعلام در خود دروازه و پرسش از مالک با دکمه‌ها
async function askApprovalInGateway(user) {
  const ownerName = await getOwnerNameFallback();
  const name = fullName(user);
  const text =
    `👤 مسافر ${name} وارد اکلیس شد\n\n` +
    `${ownerName}، آیا این غریبه اجازه ورود به اکلیس رو داره؟`;
  try {
    const sent = await bot.telegram.sendMessage(GATEWAY_GROUP_ID, text, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ آره، می‌تونه وارد شه', callback_data: `approve_${user.id}` },
            { text: '❌ نه، اجازه ورود نداره', callback_data: `reject_${user.id}` },
          ],
          [{ text: '🔍 پروفایل', url: `tg://user?id=${user.id}` }]
        ]
      }
    });
    await savePendingApproval(user.id, {
      userName: name,
      username: user.username || null
    }, sent.message_id);
  } catch (e) {
    console.error('❌ askApprovalInGateway:', e?.message);
  }
}

// هم ورودی‌های chat_member و هم message.new_chat_members را پوشش بده
bot.on('chat_member', async (ctx) => {
  try {
    const cm = ctx.chatMember;
    const chatId = cm.chat.id;
    const oldSt = cm.old_chat_member.status;
    const newSt = cm.new_chat_member.status;
    const user = cm.new_chat_member.user;

    // ورود به دروازه
    if (chatId === GATEWAY_GROUP_ID &&
        (newSt === 'member' || newSt === 'administrator') &&
        (oldSt === 'left' || oldSt === 'kicked' || oldSt === 'restricted')) {
      await askApprovalInGateway(user);
      // کاربر در حالت انتظار: خاموشش کن تا تایید شود
      try {
        await bot.telegram.restrictChatMember(GATEWAY_GROUP_ID, user.id, { can_send_messages: false });
      } catch (e) { /* ignore */ }
    }

    // خروج از دروازه → از همه زیرمجموعه‌ها بن شود
    if (chatId === GATEWAY_GROUP_ID &&
        (oldSt === 'member' || oldSt === 'administrator') &&
        (newSt === 'left' || newSt === 'kicked')) {
      try {
        await removePendingApproval(user.id);
      } catch { /* ignore */ }

      const protectedGroups = (await getProtectedGroups())
        .map(g => g.group_id)
        .filter(id => id && id !== GATEWAY_GROUP_ID);

      // بن دسته‌ای با ظرفیت بالا
      await Promise.allSettled(protectedGroups.map(id =>
        bot.telegram.banChatMember(id, user.id).catch(() => null)
      ));

      await bot.telegram.sendMessage(
        GATEWAY_GROUP_ID,
        `🚪 مسافر ${fullName(user)} از دروازه خارج شد و از تمام مناطق زیرمجموعه بن شد`
      );
    }

    // ورود کاربر به گروه‌های زیرمجموعه بدون تایید → نفوذی
    if (chatId !== GATEWAY_GROUP_ID &&
        (newSt === 'member' || newSt === 'administrator') &&
        (oldSt === 'left' || oldSt === 'kicked' || oldSt === 'restricted')) {

      const approved = await isUserApproved(user.id);
      // باید دروازه عضو باشد (برای سخت‌گیری بیشتر)
      let inGateway = false;
      try {
        const mem = await bot.telegram.getChatMember(GATEWAY_GROUP_ID, user.id);
        inGateway = ['member','administrator','creator'].includes(mem.status);
      } catch { /* ignore */ }

      if (!approved || !inGateway) {
        await banIntruder(user, chatId);
      }
    }
  } catch (e) {
    console.error('❌ chat_member handler:', e);
  }
});

// پیام new_chat_members در بعضی مشتری‌ها فقط در message می‌آید
bot.on('message', async (ctx, next) => {
  try {
    const m = ctx.message;
    // اگر پیام جدید شامل اعضای جدید بود و دروازه است، همان askApproval را بزن
    if (m?.new_chat_members?.length && m.chat?.id === GATEWAY_GROUP_ID) {
      for (const u of m.new_chat_members) {
        await askApprovalInGateway(u);
        try {
          await bot.telegram.restrictChatMember(GATEWAY_GROUP_ID, u.id, { can_send_messages: false });
        } catch { /* ignore */ }
      }
    }
  } catch (e) {
    console.error('❌ message(new_chat_members) handler:', e);
  }
  return next();
});

// 4) اگر کاربر «تایید نشده» در دروازه چیزی بفرستد → پاک + سکوت
bot.on('message', async (ctx) => {
  try {
    const chatId = ctx.chat.id;
    if (chatId !== GATEWAY_GROUP_ID) return;
    const uid = ctx.from.id;
    const pending = await getPendingApproval(uid);
    if (pending) {
      // حذف پیام
      try { await bot.telegram.deleteMessage(chatId, ctx.message.message_id); } catch {}
      // هشدار
      await ctx.reply(
        `مسافر ${pending.user_name} شما تا قبل از تایید ارباب اجازه انجام هیچ حرکتی رو نداری`,
        { reply_to_message_id: undefined } // بدون ریپلای
      );
      // سکوت
      try {
        await bot.telegram.restrictChatMember(chatId, uid, { can_send_messages: false });
      } catch {}
    }
  } catch (e) {
    console.error('❌ message(pending-user) handler:', e);
  }
});

// 5) دکمه‌های تایید/رد در همان گروه دروازه
bot.on('callback_query', async (ctx) => {
  try {
    // فقط مالک اجازه دارد
    if (ctx.from.id !== OWNER_ID) {
      await ctx.answerCbQuery('فقط ارباب می‌تونه این کار رو انجام بده', { show_alert: true });
      return;
    }
    const data = ctx.callbackQuery.data || '';
    if (!/^approve_|^reject_/.test(data)) return;

    const uid = Number(data.split('_')[1]);
    const pending = await getPendingApproval(uid);
    const name = pending?.user_name || `کاربر ${uid}`;

    if (data.startsWith('approve_')) {
      // خروج از سکوت
      try {
        await bot.telegram.restrictChatMember(GATEWAY_GROUP_ID, uid, {
          can_send_messages: true, can_send_audios: true, can_send_documents: true,
          can_send_photos: true, can_send_videos: true, can_send_video_notes: true,
          can_send_voice_notes: true, can_send_polls: true, can_send_other_messages: true,
          can_add_web_page_previews: true
        });
      } catch { /* ignore */ }

      await saveApprovedUser(uid, { userName: name, username: pending?.username || null });
      await removePendingApproval(uid);

      await ctx.answerCbQuery('تایید شد');
      //ویرایش پیام دکمه‌ها (در صورت وجود)
      try {
        await ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n✅ تأیید شد توسط ارباب`);
      } catch { /* ignore */ }

      await bot.telegram.sendMessage(
        GATEWAY_GROUP_ID,
        `🎉 مسافر ${name} به جهان بزرگ اکلیس خوش آمدید`
      );
      await sendSticker(GATEWAY_GROUP_ID, 'welcome');
    } else {
      // رد + بن از دروازه و همه زیرمجموعه‌ها
      await removePendingApproval(uid);

      try { await bot.telegram.banChatMember(GATEWAY_GROUP_ID, uid); } catch {}
      const protectedGroups = (await getProtectedGroups())
        .map(g => g.group_id)
        .filter(id => id);
      await Promise.allSettled(protectedGroups.map(id =>
        bot.telegram.banChatMember(id, uid).catch(() => null)
      ));

      await ctx.answerCbQuery('رد شد و حذف گردید');
      try {
        await ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n❌ رد شد و بن شد`);
      } catch { /* ignore */ }

      await bot.telegram.sendMessage(
        GATEWAY_GROUP_ID,
        `❌ غریبه ${name} از هال اکلیس بیرون رانده شد`
      );
      await sendSticker(GATEWAY_GROUP_ID, 'reject');
    }
  } catch (e) {
    console.error('❌ callback_query handler:', e);
    try { await ctx.answerCbQuery('خطا رخ داد'); } catch {}
  }
});

// 6) نفوذی: اگر بدون عبور از دروازه وارد زیرمجموعه شود
async function banIntruder(user, groupId) {
  try {
    const name = fullName(user);
    const ts = new Date().toLocaleString('fa-IR');
    try { await bot.telegram.banChatMember(groupId, user.id); } catch {}
    let groupTitle = `گروه ${groupId}`;
    try {
      const chat = await bot.telegram.getChat(groupId);
      groupTitle = chat?.title || groupTitle;
    } catch {}
    const report =
      `${name}\n` +
      `آیدی کاربر: ${user.id}\n` +
      `آیدیِ قابل‌تنظیم: ${REPORT_CODE}\n` +
      `تاریخ ورود: ${ts}\n` +
      `نام گروه/کانال: ${groupTitle}\n\n` +
      `این شخص قصد نفوذ به مجموعه اکلیس رو داشت، اما قبل از اینکه متوجه بشه کشته شد.`;
    await bot.telegram.sendMessage(GATEWAY_GROUP_ID, report);
    await sendSticker(GATEWAY_GROUP_ID, 'intruder');
  } catch (e) {
    console.error('❌ banIntruder:', e);
  }
}

// 7) دستورات مدیریتی استیکرها
bot.command('setsticker', async (ctx) => {
  try {
    if (ctx.from.id !== OWNER_ID) return;
    const args = (ctx.message.text || '').trim().split(/\s+/);
    if (args.length < 2) {
      return ctx.reply(
        'فرمت:\n/setsticker [نوع]\n\nانواع: start, welcome, reject, intruder, kill, areas'
      );
    }
    const type = args[1];
    const valid = ['start','welcome','reject','intruder','kill','areas'];
    if (!valid.includes(type)) return ctx.reply('نوع نامعتبر');

    const replySticker = ctx.message.reply_to_message?.sticker;
    if (!replySticker?.file_id) return ctx.reply('روی یک استیکر ریپلای کنید');

    const ok = await saveSticker(type, replySticker.file_id);
    return ctx.reply(ok ? `ثبت شد: ${type}` : 'خطا در ذخیره');
  } catch (e) {
    console.error('❌ setsticker:', e);
  }
});

bot.command('liststickers', async (ctx) => {
  try {
    if (ctx.from.id !== OWNER_ID) return;
    const list = [
      { label: 'شروع', key: 'start' },
      { label: 'خوش‌آمدگویی', key: 'welcome' },
      { label: 'رد', key: 'reject' },
      { label: 'نفوذی', key: 'intruder' },
      { label: 'کُشتن', key: 'kill' },
      { label: 'مناطق', key: 'areas' },
    ];
    let msg = '📋 لیست استیکرهای قابل تنظیم:\n\n';
    for (const it of list) {
      const f = await getSticker(it.key);
      msg += `${f ? '✅' : '❌'} ${it.label} (${it.key})\n`;
    }
    msg += '\nبرای تنظیم: /setsticker [نوع] و روی استیکر ریپلای کنید.';
    await ctx.reply(msg);
  } catch (e) {
    console.error('❌ liststickers:', e);
  }
});

// 8) راهنما
bot.command('help', async (ctx) => {
  const help =
`📚 راهنما:

• "شروع" — فقط مالک: پاسخ «در خدمت شمام ارباب» به صورت ریپلای روی پیام مالک + ارسال استیکر (بدون ریپلای)
• تأیید دروازه — وقتی مسافر وارد دروازه می‌شود، در همان گروه از ارباب با دکمه‌ها می‌پرسد:
   ✅ آره، می‌تونه وارد شه
   ❌ نه، اجازه ورود نداره
• کاربرِ منتظرِ تأیید اگر چیزی بفرسته: پیام پاک + سکوت تا زمان تأیید
• خروج از دروازه: بن از تمام مناطق زیرمجموعه
• نفوذ به زیرمجموعه بدون دروازه: بن فوری + گزارش در دروازه

دستورات:
  /setsticker [نوع]   ← روی یک استیکر ریپلای کنید؛ انواع: start,welcome,reject,intruder,kill,areas
  /liststickers       ← وضعیت استیکرهای قابل تنظیم
  /help               ← همین راهنما

نکات:
- متغیر REPORT_CODE را برای درج «آیدیِ قابل‌تنظیم» در گزارش نفوذ ست کنید.
- ربات باید در همه گروه‌های محافظت‌شده ادمین با قابلیت Ban/Delete باشد.`;
  try { await ctx.reply(help); } catch (e) { console.error('❌ help:', e); }
});

// ----------- بوت‌استرپ/لاگینگ -----------
bot.catch((err, ctx) => {
  try {
    console.error('❌ Unhandled bot error:', err);
    if (ctx?.update) {
      console.error('Update snapshot:', JSON.stringify(ctx.update, null, 2));
    }
  } catch {}
});

process.on('unhandledRejection', (r) => {
  console.error('❌ unhandledRejection:', r);
});
process.on('uncaughtException', (e) => {
  console.error('❌ uncaughtException:', e);
  // برای Render بهتره خاموش نکنیم مگر致命ی باشه
});

(async function start() {
  try {
    // اتصال اولیه تلگرام و بررسی دروازه
    await bot.telegram.getMe();
    const hasPerm = await checkBotPermissions(GATEWAY_GROUP_ID);
    if (!hasPerm) {
      console.warn('⚠️ Bot may miss admin permissions in gateway group.');
    }
    await bot.launch();
    console.log('🤖 Ninja4 bot is up.');
    console.log(`👤 OWNER_ID: ${OWNER_ID}`);
    console.log(`🚪 GATEWAY_GROUP_ID: ${GATEWAY_GROUP_ID}`);
  } catch (e) {
    console.error('❌ Bot failed to start:', e);
    process.exit(1);
  }
})();
