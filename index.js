const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

// ایمپورت فایل symbol.js
const symbolModule = require('./symbol.js');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================[ تنظیمات ]==================
const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const OWNER_ID = parseInt(process.env.OWNER_ID) || 0;
const MAIN_GROUP_ID = process.env.MAIN_GROUP_ID || '';

console.log('🔧 شروع راه‌اندازی ربات مدیریت Eclis...');

// بررسی وجود متغیرهای محیطی ضروری
if (!BOT_TOKEN) {
  console.log('❌ BOT_TOKEN وجود ندارد');
  process.exit(1);
}
if (!SUPABASE_URL) {
  console.log('❌ SUPABASE_URL وجود ندارد');
  process.exit(1);
}
if (!SUPABASE_KEY) {
  console.log('❌ SUPABASE_KEY وجود ندارد');
  process.exit(1);
}
if (!MAIN_GROUP_ID) {
  console.log('❌ MAIN_GROUP_ID وجود ندارد');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new Telegraf(BOT_TOKEN);

app.use(express.json());

// ==================[ سیستم محدودیت نرخ ]==================
const rateLimit = new Map();

const checkRateLimit = (userId) => {
  const now = Date.now();
  const userRequests = rateLimit.get(userId) || [];
  
  const recentRequests = userRequests.filter(time => now - time < 60000);
  
  if (recentRequests.length >= 10) {
    return false;
  }
  
  recentRequests.push(now);
  rateLimit.set(userId, recentRequests);
  return true;
};

// ==================[ سیستم لاگ‌گیری ]==================
const logActivity = async (type, details, userId = null, chatId = null) => {
  try {
    await supabase
      .from('eclis_activity_logs')
      .insert({
        activity_type: type,
        details: details,
        user_id: userId,
        chat_id: chatId,
        created_at: new Date().toISOString()
      });
  } catch (error) {
    console.log('❌ خطا در لاگ فعالیت:', error.message);
  }
};

// ==================[ مدیریت خطاها ]==================
bot.catch((err, ctx) => {
  console.log(`❌ خطا در ربات:`, err);
  logActivity('bot_error', { error: err.message }, ctx.from?.id, ctx.chat?.id);
});

// ==================[ میدلور اصلی ]==================
bot.use(async (ctx, next) => {
  // بررسی محدودیت نرخ
  if (ctx.from && !checkRateLimit(ctx.from.id)) {
    await ctx.reply('⏳ لطفاً کمی صبر کنید و سپس دوباره امتحان کنید...', {
      reply_to_message_id: ctx.message?.message_id
    });
    return;
  }

  try {
    await next();
  } catch (error) {
    console.log('❌ خطا در پردازش درخواست:', error.message);
    
    try {
      await supabase
        .from('eclis_errors')
        .insert({
          error_message: error.message,
          user_id: ctx.from?.id,
          chat_id: ctx.chat?.id,
          created_at: new Date().toISOString()
        });
    } catch (dbError) {
      console.log('❌ خطا در ذخیره خطا:', dbError.message);
    }
    
    if (ctx.from && ctx.from.id === OWNER_ID) {
      try {
        await ctx.reply(`❌ خطا در پردازش دستور:\n${error.message.substring(0, 1000)}`, {
          reply_to_message_id: ctx.message?.message_id
        });
      } catch (replyError) {
        console.log('❌ خطا در ارسال پیام خطا:', replyError.message);
      }
    }
  }
});

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

// ==================[ مدیریت استیکرها ]==================
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

// ==================[ مدیریت چت‌های زیرمجموعه ]==================
const addChatToSubgroups = async (chatId, chatTitle, chatType, addedBy) => {
  try {
    console.log(`💾 افزودن ${chatType} به زیرمجموعه: ${chatTitle} (${chatId})`);
    
    const { data: existingChat, error: checkError } = await supabase
      .from('eclis_subgroups')
      .select('chat_id')
      .eq('chat_id', chatId)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.log('❌ خطا در بررسی چت موجود:', checkError);
      return false;
    }

    if (existingChat) {
      console.log(`⚠️ چت ${chatId} از قبل وجود دارد`);
      const { error: updateError } = await supabase
        .from('eclis_subgroups')
        .update({
          chat_title: chatTitle,
          chat_type: chatType,
          is_active: true,
          last_checked: new Date().toISOString()
        })
        .eq('chat_id', chatId);

      if (updateError) {
        console.log('❌ خطا در آپدیت چت:', updateError);
        return false;
      }
      
      console.log(`✅ اطلاعات چت آپدیت شد: ${chatTitle}`);
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

    if (error) {
      console.log('❌ خطا در ذخیره چت جدید:', error);
      return false;
    }
    
    console.log(`✅ چت جدید اضافه شد: ${chatTitle}`);
    return true;
    
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

    if (error) {
      console.log('❌ خطا در دریافت زیرگروه‌ها:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.log('❌ خطا در دریافت زیرگروه‌ها:', error.message);
    return [];
  }
};

// ==================[ کشف چت‌های جدید ]==================
const discoverAdminChats = async (ctx) => {
  try {
    console.log('🔄 شروع کشف چت‌های ادمین...');
    
    const discoveredChats = [];
    let newChatsAdded = 0;
    
    const currentChats = await getActiveSubgroups();
    const knownChatIds = currentChats.map(chat => chat.chat_id);
    
    if (MAIN_GROUP_ID && !knownChatIds.includes(MAIN_GROUP_ID)) {
      knownChatIds.push(MAIN_GROUP_ID);
    }
    
    console.log(`📊 چت‌های شناخته شده: ${knownChatIds.length}`);
    
    // بررسی وضعیت ادمین در چت‌های شناخته شده
    for (const chatId of knownChatIds) {
      try {
        const chatMember = await ctx.telegram.getChatMember(chatId, bot.botInfo.id);
        
        if (chatMember.status === 'administrator' || chatMember.status === 'creator') {
          const chatInfo = await ctx.telegram.getChat(chatId);
          const chatType = chatInfo.type === 'channel' ? 'کانال' : 'گروه';
          const chatTitle = chatInfo.title || 'بدون عنوان';
          
          discoveredChats.push({
            chat_id: chatId,
            chat_title: chatTitle,
            chat_type: chatType,
            status: chatMember.status
          });
          
          console.log(`✅ ربات در ${chatType} "${chatTitle}" ادمین است`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
      } catch (error) {
        console.log(`❌ خطا در بررسی چت ${chatId}:`, error.message);
      }
    }
    
    console.log(`✅ کشف چت‌ها کامل شد: ${discoveredChats.length} چت, ${newChatsAdded} چت جدید`);
    
    return { 
      success: true, 
      total: discoveredChats.length,
      newAdded: newChatsAdded,
      discoveredChats: discoveredChats
    };
    
  } catch (error) {
    console.log('❌ خطا در کشف چت‌ها:', error.message);
    return { success: false, total: 0, newAdded: 0, discoveredChats: [] };
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
    const { data: approvedUser, error } = await supabase
      .from('eclis_approved_users')
      .select('user_id, approved_by, approved_at')
      .eq('user_id', userId)
      .eq('is_approved', true)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.log('❌ خطا در بررسی کاربر تایید شده:', error);
      return { approved: false, reason: 'خطا در بررسی' };
    }

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
    console.log('🔄 رویداد my_chat_member دریافت شد');
    
    const chatMember = ctx.myChatMember.new_chat_member;
    const chat = ctx.myChatMember.chat;
    const chatId = chat.id.toString();
    const addedBy = ctx.myChatMember.from;

    console.log(`🤖 وضعیت ربات در چت ${chat.title}: ${chatMember.status}`);
    
    if (chatMember.status === 'administrator' || chatMember.status === 'member') {
      try {
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
              if (sticker) {
                await ctx.replyWithSticker(sticker);
              }
            }
          } else {
            // اگر شخص دیگری اضافه کرده
            await ctx.reply('این ربات متعلق به مجموعه بزرگ اکلیسه و جز آکی کسی نمیتونه به من دستور بده');
            await ctx.telegram.leaveChat(chatId);
          }
        }
      } catch (error) {
        console.log(`❌ خطا در بررسی چت ${chatId}:`, error.message);
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
    if (chatId !== MAIN_GROUP_ID) {
      return;
    }

    const newMembers = ctx.message.new_chat_members;
    
    for (const member of newMembers) {
      // اگر ربات خودش باشه، صرف نظر کن
      if (member.id === bot.botInfo.id) {
        continue;
      }

      const userMention = member.username ? `@${member.username}` : `[${member.first_name}](tg://user?id=${member.id})`;
      
      const approvalMessage = `مسافر ${userMention} به اکلیس وارد شده\n\n` +
        `آیا این مسافر اجازه ورود به اکلیس را داره ؟`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('آره ، اجازه ورود داره', `approve_${member.id}`)],
        [Markup.button.callback('نه ، اجازه ورود نداره', `reject_${member.id}`)]
      ]);

      await ctx.reply(approvalMessage, {
        reply_markup: keyboard.reply_markup,
        parse_mode: 'Markdown',
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
        console.log(`🔒 کاربر ${member.first_name} محدود شد`);
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
        console.log(`🗑️ پیام کاربر ${ctx.from.first_name} حذف شد`);
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
      
      const userMention = ctx.from.username ? `@${ctx.from.username}` : `[${ctx.from.first_name}](tg://user?id=${ctx.from.id})`;
      await ctx.reply(`مسافر ${userMention} شما اجازه صحبت ندارین تا زمانی که تایید بشین`, {
        parse_mode: 'Markdown'
      });
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
        console.log(`✅ کاربر ${userId} آزاد شد`);
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
      console.log(`🚫 کاربر ${userId} اخراج شد`);
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

// ==================[ دستور بروزرسانی چت‌ها ]==================
bot.command('update_chats', async (ctx) => {
  try {
    console.log('🔄 درخواست بروزرسانی وضعیت چت‌ها');
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      return ctx.reply(access.message, {
        reply_to_message_id: ctx.message.message_id
      });
    }

    await logActivity('update_chats_started', {}, ctx.from.id, ctx.chat.id);

    const tempMessage = await ctx.reply('🔄 در حال کشف و بروزرسانی تمام چت‌ها...', {
      reply_to_message_id: ctx.message.message_id
    });
    
    const discoveryResult = await discoverAdminChats(ctx);
    
    if (!discoveryResult.success) {
      try {
        await ctx.deleteMessage(tempMessage.message_id);
      } catch (e) {}
      await logActivity('update_chats_failed', { error: 'Discovery failed' }, ctx.from.id, ctx.chat.id);
      return ctx.reply('❌ خطا در بروزرسانی چت‌ها.', {
        reply_to_message_id: ctx.message.message_id
      });
    }

    const { total, newAdded, discoveredChats } = discoveryResult;
    
    let message = `🔄 بروزرسانی وضعیت چت‌ها\n\n`;
    message += `✅ عملیات موفق!\n\n`;
    message += `📊 نتایج:\n`;
    message += `• کل چت‌های فعال: ${total}\n`;
    message += `• چت‌های جدید: ${newAdded}\n\n`;
    
    if (discoveredChats.length > 0) {
      message += `🏘️ چت‌های فعال:\n`;
      discoveredChats.forEach((chat, index) => {
        const statusIcon = chat.status === 'creator' ? '👑' : '⚡';
        const newIcon = chat.is_new ? ' 🆕' : '';
        message += `${index + 1}. ${chat.chat_title} (${chat.chat_type}) ${statusIcon}${newIcon}\n`;
      });
    } else {
      message += `📭 هیچ چت فعالی پیدا نشد\n`;
    }

    try {
      await ctx.deleteMessage(tempMessage.message_id);
    } catch (e) {}
    
    await ctx.reply(message, {
      reply_to_message_id: ctx.message.message_id
    });

    await logActivity('update_chats_completed', discoveryResult, ctx.from.id, ctx.chat.id);

  } catch (error) {
    console.log('❌ خطا در بروزرسانی چت‌ها:', error.message);
    await logActivity('update_chats_error', { error: error.message }, ctx.from.id, ctx.chat.id);
    await ctx.reply('❌ خطا در بروزرسانی چت‌ها.', {
      reply_to_message_id: ctx.message.message_id
    });
  }
});

// ==================[ دستور اضافه کردن دستی چت ]==================
bot.command('add_chat', async (ctx) => {
  try {
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      return ctx.reply(access.message, {
        reply_to_message_id: ctx.message.message_id
      });
    }

    const args = ctx.message.text.split(' ');
    if (args.length >= 2) {
      const chatId = args[1];
      
      try {
        const chatInfo = await ctx.telegram.getChat(chatId);
        const chatMember = await ctx.telegram.getChatMember(chatId, bot.botInfo.id);
        
        if (chatMember.status === 'administrator' || chatMember.status === 'creator') {
          const chatType = chatInfo.type === 'channel' ? 'کانال' : 'گروه';
          const chatTitle = chatInfo.title || 'بدون عنوان';
          
          const added = await addChatToSubgroups(chatId, chatTitle, chatType, OWNER_ID);
          
          if (added) {
            await logActivity('add_chat_success', { chatId, chatTitle, chatType }, ctx.from.id, ctx.chat.id);
            await ctx.reply(`✅ ${chatType} "${chatTitle}" با موفقیت اضافه شد`, {
              reply_to_message_id: ctx.message.message_id
            });
          } else {
            await logActivity('add_chat_failed', { chatId, error: 'Database error' }, ctx.from.id, ctx.chat.id);
            await ctx.reply('❌ خطا در ذخیره چت', {
              reply_to_message_id: ctx.message.message_id
            });
          }
        } else {
          await logActivity('add_chat_not_admin', { chatId }, ctx.from.id, ctx.chat.id);
          await ctx.reply('❌ ربات در این چت ادمین نیست', {
            reply_to_message_id: ctx.message.message_id
          });
        }
      } catch (error) {
        await logActivity('add_chat_error', { chatId, error: error.message }, ctx.from.id, ctx.chat.id);
        await ctx.reply(`❌ خطا: ${error.message}`, {
          reply_to_message_id: ctx.message.message_id
        });
      }
      return;
    }

    const helpText = `💡 برای افزودن دستی چت:\n\n` +
      `/add_chat <chat_id>\n\n` +
      `📝 برای دریافت chat_id از @userinfobot استفاده کنید`;

    await ctx.reply(helpText, {
      reply_to_message_id: ctx.message.message_id
    });

  } catch (error) {
    console.log('❌ خطا در افزودن چت:', error.message);
    await logActivity('add_chat_command_error', { error: error.message }, ctx.from.id, ctx.chat.id);
    await ctx.reply('❌ خطا در افزودن چت', {
      reply_to_message_id: ctx.message.message_id
    });
  }
});

// ==================[ دستور تایید کاربر ]==================
bot.command('approve', async (ctx) => {
  try {
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      return ctx.reply(access.message, {
        reply_to_message_id: ctx.message.message_id
      });
    }

    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
      return ctx.reply('💡 استفاده: /approve <user_id>', {
        reply_to_message_id: ctx.message.message_id
      });
    }

    const userId = parseInt(args[1]);
    if (isNaN(userId)) {
      return ctx.reply('❌ user_id باید عدد باشد', {
        reply_to_message_id: ctx.message.message_id
      });
    }

    // ذخیره کاربر تایید شده
    const { error } = await supabase
      .from('eclis_approved_users')
      .upsert({
        user_id: userId,
        approved_by: OWNER_ID,
        approved_at: new Date().toISOString(),
        is_approved: true
      }, { onConflict: 'user_id' });

    if (error) {
      console.log('❌ خطا در تایید کاربر:', error);
      return ctx.reply('❌ خطا در تایید کاربر', {
        reply_to_message_id: ctx.message.message_id
      });
    }

    await logActivity('user_approved', { userId }, ctx.from.id, ctx.chat.id);
    
    await ctx.reply(`✅ کاربر ${userId} با موفقیت تایید شد و می‌تواند به گروه‌های زیرمجموعه وارد شود.`, {
      reply_to_message_id: ctx.message.message_id
    });

  } catch (error) {
    console.log('❌ خطا در دستور approve:', error.message);
    await ctx.reply('❌ خطا در تایید کاربر', {
      reply_to_message_id: ctx.message.message_id
    });
  }
});

// ==================[ ایمپورت و استفاده از ماژول symbol ]==================
// استفاده از تابع بررسی وفاداری از symbol.js
bot.command('بررسی_وفاداری', async (ctx) => {
  const access = checkOwnerAccess(ctx);
  if (!access.hasAccess) {
    return ctx.reply('من فقط از اربابم پیروی میکنم', {
      reply_to_message_id: ctx.message?.message_id
    });
  }

  // استفاده از تابع از symbol.js
  await symbolModule.handleLoyaltyCheck(ctx, bot, supabase, getSticker, getActiveSubgroups);
});

// هندلرهای callback برای symbol.js
bot.action('ban_suspicious', async (ctx) => {
  await symbolModule.handleBanSuspicious(ctx, bot, supabase, getSticker, getActiveSubgroups);
});

bot.action('pardon_suspicious', async (ctx) => {
  await symbolModule.handlePardonSuspicious(ctx, bot, getSticker);
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
/update_chats - کشف و بروزرسانی چت‌ها
/add_chat - افزودن دستی چت
/approve <user_id> - تایید کاربر برای ورود به گروه‌ها
/setsticker - تنظیم استیکر برای رویدادها
/بررسی_وفاداری - بررسی وفاداری اعضا
/groups - لیست گروه‌ها
/status - وضعیت ربات

💡 نکات:
- ربات به صورت خودکار چت‌های جدید را تشخیص می‌دهد
- کاربران جدید باید در گروه اصلی باشند یا توسط مالک تایید شوند
- از /update_chats برای اسکن دستی استفاده کنید`;

  ctx.reply(helpText, {
    reply_to_message_id: ctx.message.message_id
  });
});

bot.command('status', async (ctx) => {
  const access = checkOwnerAccess(ctx);
  if (!access.hasAccess) {
    return ctx.reply(access.message, {
      reply_to_message_id: ctx.message.message_id
    });
  }
  
  const subgroups = await getActiveSubgroups();
  
  const message = `🤖 وضعیت ربات مدیریت Eclis

📊 آمار:
• گروه‌های فعال: ${subgroups.length}
• زمان فعالیت: ${Math.round(process.uptime() / 60)} دقیقه

✅ ربات در حال اجرا است`;

  await ctx.reply(message, {
    reply_to_message_id: ctx.message.message_id
  });
});

bot.command('groups', async (ctx) => {
  const access = checkOwnerAccess(ctx);
  if (!access.hasAccess) {
    return ctx.reply(access.message, {
      reply_to_message_id: ctx.message.message_id
    });
  }

  const subgroups = await getActiveSubgroups();
  
  if (subgroups.length === 0) {
    return ctx.reply('📭 هیچ گروه فعالی پیدا نشد', {
      reply_to_message_id: ctx.message.message_id
    });
  }

  let message = `🏘️ گروه‌های فعال (${subgroups.length}):\n\n`;
  
  subgroups.forEach((group, index) => {
    message += `${index + 1}. ${group.chat_title} (${group.chat_type})\n`;
    message += `   ID: ${group.chat_id}\n\n`;
  });

  await ctx.reply(message, {
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

// ==================[ سرور اکسپرس برای سلامت ]==================
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

// ==================[ مدیریت خاموشی ]==================
process.once('SIGINT', () => {
  console.log('🛑 دریافت SIGINT - خاموش کردن ربات...');
  bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
  console.log('🛑 دریافت SIGTERM - خاموش کردن ربات...');
  bot.stop('SIGTERM');
});
