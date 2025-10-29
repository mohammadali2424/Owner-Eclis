const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================[ تنظیمات ]==================
const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const OWNER_ID = parseInt(process.env.OWNER_ID) || 0;
const MAIN_GROUP_ID = process.env.MAIN_GROUP_ID || '';

console.log('🔧 شروع راه‌اندازی ربات مدیریت Eclis...');

if (!BOT_TOKEN || !SUPABASE_URL || !SUPABASE_KEY || !MAIN_GROUP_ID) {
  console.log('❌ تنظیمات ضروری وجود ندارد');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new Telegraf(BOT_TOKEN);

app.use(express.json());

// ==================[ سیستم مدیریت استیکرها ]==================
const getSticker = async (stickerType) => {
  try {
    const { data, error } = await supabase
      .from('eclis_stickers')
      .select('sticker_id')
      .eq('sticker_type', stickerType)
      .single();

    if (error || !data) return null;
    return data.sticker_id;
  } catch (error) {
    console.log('❌ خطا در دریافت استیکر:', error.message);
    return null;
  }
};

const setSticker = async (stickerType, stickerId) => {
  try {
    const { error } = await supabase
      .from('eclis_stickers')
      .upsert({
        sticker_type: stickerType,
        sticker_id: stickerId,
        set_at: new Date().toISOString()
      }, { onConflict: 'sticker_type' });

    return !error;
  } catch (error) {
    console.log('❌ خطا در ذخیره استیکر:', error.message);
    return false;
  }
};

// ==================[ بررسی مالکیت ]==================
const checkOwnerAccess = (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) {
    return { hasAccess: false, message: 'کاربر شناسایی نشد' };
  }
  
  if (userId !== OWNER_ID) {
    return { hasAccess: false, message: 'من فقط از اربابم پیروی میکنم' };
  }
  
  return { hasAccess: true };
};

// ==================[ مدیریت چت‌های زیرمجموعه ]==================
const addChatToSubgroups = async (chatId, chatTitle, chatType, addedBy) => {
  try {
    const { data: existingChat } = await supabase
      .from('eclis_subgroups')
      .select('chat_id')
      .eq('chat_id', chatId)
      .single();

    if (existingChat) {
      const { error: updateError } = await supabase
        .from('eclis_subgroups')
        .update({
          chat_title: chatTitle,
          chat_type: chatType,
          is_active: true,
          last_checked: new Date().toISOString()
        })
        .eq('chat_id', chatId);

      if (updateError) return false;
      return true;
    }

    const { error } = await supabase
      .from('eclis_subgroups')
      .insert({
        chat_id: chatId,
        chat_title: chatTitle,
        chat_type: chatType,
        added_by: addedBy,
        added_at: new Date().toISOString(),
        last_checked: new Date().toISOString(),
        is_active: true
      });

    return !error;
  } catch (error) {
    console.log('❌ خطا در افزودن چت:', error.message);
    return false;
  }
};

const getActiveSubgroups = async () => {
  try {
    const { data, error } = await supabase
      .from('eclis_subgroups')
      .select('chat_id, chat_title, chat_type')
      .eq('is_active', true);

    return error ? [] : (data || []);
  } catch (error) {
    console.log('❌ خطا در دریافت زیرگروه‌ها:', error.message);
    return [];
  }
};

// ==================[ سیستم تایید کاربران ]==================
const checkUserApproval = async (userId) => {
  try {
    // بررسی عضویت در گروه اصلی
    try {
      const mainGroupMember = await bot.telegram.getChatMember(MAIN_GROUP_ID, userId);
      if (mainGroupMember.status !== 'left' && mainGroupMember.status !== 'kicked') {
        return { approved: true, reason: 'عضو گروه اصلی' };
      }
    } catch (error) {
      console.log(`❌ خطا در بررسی عضویت کاربر ${userId} در گروه اصلی:`, error.message);
    }

    // بررسی تایید توسط مالک
    const { data: approvedUser } = await supabase
      .from('eclis_approved_users')
      .select('user_id')
      .eq('user_id', userId)
      .eq('is_approved', true)
      .single();

    if (approvedUser) {
      return { approved: true, reason: 'تایید شده توسط مالک' };
    }

    return { approved: false, reason: 'نیاز به تایید مالک' };
  } catch (error) {
    console.log('❌ خطا در بررسی تایید کاربر:', error.message);
    return { approved: false, reason: 'خطا در بررسی' };
  }
};

const approveUser = async (userId, approvedBy) => {
  try {
    const { error } = await supabase
      .from('eclis_approved_users')
      .upsert({
        user_id: userId,
        approved_by: approvedBy,
        approved_at: new Date().toISOString(),
        is_approved: true
      }, { onConflict: 'user_id' });

    return !error;
  } catch (error) {
    console.log('❌ خطا در تایید کاربر:', error.message);
    return false;
  }
};

// ==================[ هندلر اضافه شدن ربات به گروه ]==================
bot.on('my_chat_member', async (ctx) => {
  try {
    const chatMember = ctx.myChatMember.new_chat_member;
    const chat = ctx.myChatMember.chat;
    const chatId = chat.id.toString();
    const addedBy = ctx.myChatMember.from;

    if (chatMember.status === 'administrator' || chatMember.status === 'member') {
      const currentMember = await ctx.telegram.getChatMember(chatId, bot.botInfo.id);
      
      if (currentMember.status === 'administrator' || currentMember.status === 'creator') {
        const chatType = chat.type === 'channel' ? 'کانال' : 'گروه';
        const chatTitle = chat.title || 'بدون عنوان';

        // اگر مالک اضافه کرده
        if (addedBy.id === OWNER_ID) {
          const added = await addChatToSubgroups(chatId, chatTitle, chatType, OWNER_ID);
          if (added) {
            await ctx.reply('این بخش به بخش های تحت نظارت نینجای چهارم اضافه شد 🥷🏻');
            const sticker = await getSticker('group_added');
            if (sticker) await ctx.replyWithSticker(sticker);
          }
        } else {
          // اگر شخص دیگری اضافه کرده
          await ctx.reply('این ربات متعلق به مجموعه بزرگ اکلیسه و جز آکی کسی نمیتونه به من دستور بده');
          await ctx.telegram.leaveChat(chatId);
        }
      }
    }
  } catch (error) {
    console.log('❌ خطا در پردازش my_chat_member:', error.message);
  }
});

// ==================[ هندلر کاربران جدید در گروه اصلی ]==================
bot.on('new_chat_members', async (ctx) => {
  try {
    const chatId = ctx.chat.id.toString();
    
    // فقط در گروه اصلی عمل کن
    if (chatId !== MAIN_GROUP_ID) return;

    const newMembers = ctx.message.new_chat_members;
    
    for (const member of newMembers) {
      if (member.id === bot.botInfo.id) continue;

      const userMention = member.username ? `@${member.username}` : member.first_name;
      
      const approvalMessage = `مسافر ${userMention} به اکلیس وارد شده\n\n` +
        `آیا این مسافر اجازه ورود به اکلیس را داره ؟`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('آره ، اجازه ورود داره', `approve_${member.id}`)],
        [Markup.button.callback('نه ، اجازه ورود نداره', `reject_${member.id}`)]
      ]);

      await ctx.reply(approvalMessage, {
        reply_markup: keyboard.reply_markup,
        reply_to_message_id: ctx.message.message_id
      });

      // محدود کردن کاربر تا زمان تایید
      try {
        await ctx.telegram.restrictChatMember(chatId, member.id, {
          can_send_messages: false,
          can_send_media_messages: false,
          can_send_other_messages: false,
          can_add_web_page_previews: false
        });
      } catch (restrictError) {
        console.log(`❌ خطا در محدود کردن کاربر ${member.id}:`, restrictError.message);
      }
    }
  } catch (error) {
    console.log('❌ خطا در پردازش کاربران جدید:', error.message);
  }
});

// ==================[ هندلر پیام‌های کاربران تایید نشده ]==================
bot.on('message', async (ctx) => {
  try {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id;
    
    // فقط در گروه اصلی چک کن
    if (chatId !== MAIN_GROUP_ID) return;
    
    // اگر ربات یا مالک هست، صرف نظر کن
    if (userId === bot.botInfo.id || userId === OWNER_ID) return;
    
    const approvalCheck = await checkUserApproval(userId);
    
    if (!approvalCheck.approved) {
      // حذف پیام کاربر
      try {
        await ctx.deleteMessage();
      } catch (deleteError) {
        console.log('❌ خطا در حذف پیام:', deleteError.message);
      }
      
      // اطمینان از محدود بودن کاربر
      try {
        await ctx.telegram.restrictChatMember(chatId, userId, {
          can_send_messages: false,
          can_send_media_messages: false,
          can_send_other_messages: false,
          can_add_web_page_previews: false
        });
      } catch (restrictError) {
        console.log(`❌ خطا در محدود کردن کاربر ${userId}:`, restrictError.message);
      }
      
      const userMention = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
      await ctx.reply(`مسافر ${userMention} شما اجازه صحبت ندارین تا زمانی که تایید بشین`);
    }
  } catch (error) {
    console.log('❌ خطا در پردازش پیام کاربر تایید نشده:', error.message);
  }
});

// ==================[ هندلرهای callback برای تایید کاربران ]==================
bot.action(/approve_(\d+)/, async (ctx) => {
  try {
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      await ctx.answerCbQuery('فقط آکی میتونه این کار رو بکنه!');
      return;
    }

    const userId = parseInt(ctx.match[1]);
    const userMention = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;

    const approved = await approveUser(userId, OWNER_ID);
    
    if (approved) {
      // آزاد کردن کاربر از محدودیت
      try {
        await ctx.telegram.restrictChatMember(MAIN_GROUP_ID, userId, {
          can_send_messages: true,
          can_send_media_messages: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true
        });
      } catch (restrictError) {
        console.log(`❌ خطا در آزاد کردن کاربر ${userId}:`, restrictError.message);
      }

      await ctx.editMessageText(`مسافر ${userMention} به اکلیس خوش اومدی`);
      await ctx.answerCbQuery('کاربر تایید شد');
    } else {
      await ctx.answerCbQuery('خطا در تایید کاربر');
    }
  } catch (error) {
    console.log('❌ خطا در تایید کاربر:', error.message);
    await ctx.answerCbQuery('خطا در تایید کاربر');
  }
});

bot.action(/reject_(\d+)/, async (ctx) => {
  try {
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      await ctx.answerCbQuery('فقط آکی میتونه این کار رو بکنه!');
      return;
    }

    const userId = parseInt(ctx.match[1]);
    const userMention = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;

    // اخراج کاربر از گروه اصلی
    try {
      await ctx.telegram.banChatMember(MAIN_GROUP_ID, userId);
      setTimeout(async () => {
        await ctx.telegram.unbanChatMember(MAIN_GROUP_ID, userId);
      }, 1000);
    } catch (kickError) {
      console.log(`❌ خطا در اخراج کاربر ${userId}:`, kickError.message);
    }

    await ctx.editMessageText(`مسافر ${userMention} رو از اکلیس با موفقیت خارج میکنم`);
    await ctx.answerCbQuery('کاربر اخراج شد');
  } catch (error) {
    console.log('❌ خطا در رد کاربر:', error.message);
    await ctx.answerCbQuery('خطا در رد کاربر');
  }
});

// ==================[ دستور تنظیم استیکر ]==================
bot.command('setsticker', async (ctx) => {
  const access = checkOwnerAccess(ctx);
  if (!access.hasAccess) {
    return ctx.reply(access.message, {
      reply_to_message_id: ctx.message.message_id
    });
  }

  const args = ctx.message.text.split(' ');
  if (args.length < 2 || !ctx.message.reply_to_message?.sticker) {
    return ctx.reply('💡 استفاده: در پاسخ یک استیکر، بنویس /setsticker <نوع>\n\nانواع استیکر:\n- group_added (اضافه شدن به گروه)\n- loyalty_check (بررسی وفاداری)\n- loyalty_ban (بن کردن مشکوک‌ها)\n- loyalty_pardon (بخشیدن مشکوک‌ها)', {
      reply_to_message_id: ctx.message.message_id
    });
  }

  const stickerType = args[1];
  const stickerId = ctx.message.reply_to_message.sticker.file_id;

  const validTypes = ['group_added', 'loyalty_check', 'loyalty_ban', 'loyalty_pardon'];
  if (!validTypes.includes(stickerType)) {
    return ctx.reply('❌ نوع استیکر نامعتبر است', {
      reply_to_message_id: ctx.message.message_id
    });
  }

  const success = await setSticker(stickerType, stickerId);
  
  if (success) {
    await ctx.reply(`✅ استیکر برای ${stickerType} ذخیره شد`, {
      reply_to_message_id: ctx.message.message_id
    });
  } else {
    await ctx.reply('❌ خطا در ذخیره استیکر', {
      reply_to_message_id: ctx.message.message_id
    });
  }
});

// ==================[ دستورات اصلی ]==================
bot.start((ctx) => {
  const access = checkOwnerAccess(ctx);
  if (!access.hasAccess) {
    return ctx.reply(access.message, {
      reply_to_message_id: ctx.message.message_id
    });
  }
  
  return ctx.reply('🥷🏻 ربات مدیریت Eclis فعال است\n\nاز /help برای راهنما استفاده کنید', {
    reply_to_message_id: ctx.message.message_id
  });
});

bot.command('help', (ctx) => {
  const access = checkOwnerAccess(ctx);
  if (!access.hasAccess) {
    return ctx.reply(access.message, {
      reply_to_message_id: ctx.message.message_id
    });
  }
  
  const helpText = `🥷🏻 راهنمای ربات مدیریت Eclis

📋 دستورات:
/setsticker - تنظیم استیکر برای رویدادها
/help - راهنما

💡 ربات به صورت خودکار:
- گروه‌های زیرمجموعه را مدیریت می‌کند
- کاربران جدید را تایید می‌کند
- کاربران تایید نشده را محدود می‌کند`;

  ctx.reply(helpText, {
    reply_to_message_id: ctx.message.message_id
  });
});

// ==================[ راه‌اندازی ]==================
const startBot = async () => {
  try {
    console.log('🤖 راه‌اندازی ربات...');
    
    const botInfo = await bot.telegram.getMe();
    console.log(`✅ ربات ${botInfo.username} شناسایی شد`);
    
    await bot.launch({
      dropPendingUpdates: true,
      allowedUpdates: ['message', 'chat_member', 'my_chat_member', 'new_chat_members', 'callback_query'],
    });
    
    console.log('✅ ربات فعال شد');
    
  } catch (error) {
    console.log('❌ خطا در راه‌اندازی ربات:', error.message);
    process.exit(1);
  }
};

app.get('/', (req, res) => {
  res.json({ 
    status: '✅ ربات فعال است',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.listen(PORT, () => {
  console.log(`✅ سرور روی پورت ${PORT} راه‌اندازی شد`);
  startBot();
});

process.once('SIGINT', () => {
  console.log('🛑 دریافت SIGINT - خاموش کردن ربات...');
  bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
  console.log('🛑 دریافت SIGTERM - خاموش کردن ربات...');
  bot.stop('SIGTERM');
});
