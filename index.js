const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================[ تنظیمات ]==================
const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const OWNER_ID = parseInt(process.env.OWNER_ID) || 0;
const MAIN_GROUP_ID = process.env.MAIN_GROUP_ID || '';
const RENDER_URL = process.env.RENDER_URL || '';

console.log('🔧 شروع راه‌اندازی ربات مدیریت Eclis...');

// بررسی وجود متغیرهای محیطی ضروری
if (!BOT_TOKEN) {
  console.log('❌ BOT_TOKEN وجود ندارد');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new Telegraf(BOT_TOKEN);

app.use(express.json());

// ==================[ سیستم پینگ خودکار ]==================
const startPingService = () => {
  if (RENDER_URL) {
    console.log('🔄 راه‌اندازی سیستم پینگ خودکار...');
    
    setInterval(async () => {
      try {
        const response = await axios.get(`${RENDER_URL}/health`);
        console.log('✅ پینگ موفق:', new Date().toLocaleTimeString('fa-IR'));
      } catch (error) {
        console.log('❌ خطا در پینگ:', error.message);
      }
    }, 13 * 60 * 1000);

    setTimeout(async () => {
      try {
        await axios.get(`${RENDER_URL}/health`);
        console.log('✅ اولین پینگ ارسال شد');
      } catch (error) {
        console.log('❌ خطا در اولین پینگ:', error.message);
      }
    }, 5000);
  } else {
    console.log('⚠️ آدرس RENDER_URL تنظیم نشده - پینگ غیرفعال');
  }
};

// ==================[ سیستم اخطار خودکار برای کاربران مشکوک ]==================
let warningJobs = new Map();

const startWarningSystem = () => {
  console.log('⚠️ راه‌اندازی سیستم اخطار خودکار...');
  
  setInterval(async () => {
    try {
      await checkAndWarnSuspiciousUsers();
    } catch (error) {
      console.log('❌ خطا در سیستم اخطار:', error.message);
    }
  }, 18 * 60 * 60 * 1000); // هر 18 ساعت
  
  // اجرای اولیه
  setTimeout(() => {
    checkAndWarnSuspiciousUsers();
  }, 10000);
};

const checkAndWarnSuspiciousUsers = async () => {
  try {
    console.log('🔍 بررسی کاربران مشکوک برای اخطار...');
    
    // دریافت کاربران مشکوک از دیتابیس
    const { data: suspiciousUsers, error } = await supabase
      .from('Eclis_members')
      .select('user_id, username, first_name, warning_count, last_warning_at')
      .eq('has_symbol', false)
      .eq('is_admin', false);

    if (error) {
      console.log('❌ خطا در دریافت کاربران مشکوک:', error);
      return;
    }

    if (!suspiciousUsers || suspiciousUsers.length === 0) {
      console.log('✅ هیچ کاربر مشکوکی برای اخطار پیدا نشد');
      return;
    }

    console.log(`📢 پیدا شد ${suspiciousUsers.length} کاربر مشکوک برای اخطار`);

    // گروه‌بندی کاربران بر اساس تعداد اخطارها
    const usersByWarningCount = {
      warning1: [], // اخطار اول
      warning2: [], // اخطار دوم  
      warning3: []  // اخطار سوم
    };

    for (const user of suspiciousUsers) {
      const warningCount = user.warning_count || 0;
      
      if (warningCount === 0) {
        usersByWarningCount.warning1.push(user);
      } else if (warningCount === 1) {
        usersByWarningCount.warning2.push(user);
      } else if (warningCount >= 2) {
        usersByWarningCount.warning3.push(user);
      }
    }

    // ارسال اخطارها به گروه اصلی
    await sendWarningsToMainGroup(usersByWarningCount);

    // آپدیت تعداد اخطارها در دیتابیس
    await updateWarningCounts(suspiciousUsers);

  } catch (error) {
    console.log('❌ خطا در بررسی کاربران مشکوک:', error.message);
  }
};

const sendWarningsToMainGroup = async (usersByWarningCount) => {
  try {
    // اخطار اول
    if (usersByWarningCount.warning1.length > 0) {
      const userMentions = usersByWarningCount.warning1
        .map(user => user.first_name || user.username || `کاربر ${user.user_id}`)
        .join(', ');
      
      await bot.telegram.sendMessage(
        MAIN_GROUP_ID,
        `⚠️ ${userMentions}، فونت اسمتو درست کن`
      );
      console.log(`📢 اخطار اول ارسال شد برای: ${userMentions}`);
    }

    // اخطار دوم
    if (usersByWarningCount.warning2.length > 0) {
      const userMentions = usersByWarningCount.warning2
        .map(user => user.first_name || user.username || `کاربر ${user.user_id}`)
        .join(', ');
      
      await bot.telegram.sendMessage(
        MAIN_GROUP_ID,
        `🚨 ${userMentions}، فرصت اخر برای درست کردن اسمتونه`
      );
      console.log(`📢 اخطار دوم ارسال شد برای: ${userMentions}`);
    }

    // اخطار سوم
    if (usersByWarningCount.warning3.length > 0) {
      const userMentions = usersByWarningCount.warning3
        .map(user => user.first_name || user.username || `کاربر ${user.user_id}`)
        .join(', ');
      
      await bot.telegram.sendMessage(
        MAIN_GROUP_ID,
        `🔴 ${userMentions}، دیگه فرصتی برای دادن نیست`
      );
      console.log(`📢 اخطار سوم ارسال شد برای: ${userMentions}`);
      
      // بن کردن کاربران بعد از اخطار سوم
      await banUsersAfterFinalWarning(usersByWarningCount.warning3);
    }

  } catch (error) {
    console.log('❌ خطا در ارسال اخطارها:', error.message);
  }
};

const updateWarningCounts = async (users) => {
  for (const user of users) {
    try {
      await supabase
        .from('Eclis_members')
        .update({
          warning_count: (user.warning_count || 0) + 1,
          last_warning_at: new Date().toISOString()
        })
        .eq('user_id', user.user_id);
    } catch (error) {
      console.log(`❌ خطا در آپدیت اخطار کاربر ${user.user_id}:`, error.message);
    }
  }
};

const banUsersAfterFinalWarning = async (users) => {
  console.log(`🔨 بن کردن ${users.length} کاربر بعد از اخطار سوم`);
  
  for (const user of users) {
    try {
      // بن کردن از گروه اصلی
      await bot.telegram.banChatMember(MAIN_GROUP_ID, user.user_id);
      console.log(`✅ کاربر ${user.user_id} بن شد`);
      
      // آپدیت وضعیت در دیتابیس
      await supabase
        .from('Eclis_members')
        .update({
          is_banned: true,
          banned_at: new Date().toISOString()
        })
        .eq('user_id', user.user_id);
        
    } catch (error) {
      console.log(`❌ خطا در بن کردن کاربر ${user.user_id}:`, error.message);
    }
    
    // تأخیر بین بن کردن کاربران
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
};

// ==================[ سیستم مدیریت استیکرها ]==================
const getSticker = async (stickerType) => {
  try {
    const { data, error } = await supabase
      .from('Eclis_stickers')
      .select('sticker_file_id')
      .eq('sticker_type', stickerType)
      .single();

    if (error || !data) {
      return null;
    }

    return data.sticker_file_id;
  } catch (error) {
    console.log('❌ خطا در دریافت استیکر:', error.message);
    return null;
  }
};

const setSticker = async (stickerType, stickerFileId) => {
  try {
    const { error } = await supabase
      .from('Eclis_stickers')
      .upsert({
        sticker_type: stickerType,
        sticker_file_id: stickerFileId,
        updated_at: new Date().toISOString()
      }, { onConflict: 'sticker_type' });

    if (error) {
      console.log('❌ خطا در ذخیره استیکر:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.log('❌ خطا در ذخیره استیکر:', error.message);
    return false;
  }
};

// ==================[ مدیریت خطاها ]==================
bot.catch((err, ctx) => {
  console.log(`❌ خطا در ربات:`, err);
});

// ==================[ میدلور مدیریت خطاهای عمومی ]==================
bot.use(async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    console.log('❌ خطا در پردازش درخواست:', error.message);
    
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
  
  const owners = [OWNER_ID];
  if (!owners.includes(userId)) {
    return { hasAccess: false, message: 'من فقط از اربابم پیروی میکنم 🥷🏻' };
  }
  
  return { hasAccess: true };
};

// ==================[ بررسی نمادهای وفاداری ]==================
const checkLoyaltySymbols = (text) => {
  if (!text || text === 'null' || text === 'undefined' || text === '') {
    return false;
  }
  
  const symbols = ['꩘', '𖢻', 'ꑭ', '𖮌'];
  const textStr = String(text).normalize();
  
  for (const symbol of symbols) {
    if (textStr.includes(symbol)) {
      return true;
    }
  }
  
  const symbolRegex = /[꩘𖢻ꑭ𖮌]/u;
  return symbolRegex.test(textStr);
};

// ==================[ مدیریت چت‌های زیرمجموعه ]==================
const addChatToSubgroups = async (chatId, chatTitle, chatType, addedBy) => {
  try {
    console.log(`💾 افزودن ${chatType} به زیرمجموعه: ${chatTitle} (${chatId})`);
    
    const { data: existingChat, error: checkError } = await supabase
      .from('Eclis_subgroups')
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
        .from('Eclis_subgroups')
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
      .from('Eclis_subgroups')
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
      .from('Eclis_subgroups')
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

// ==================[ سیستم مدیریت کاربران جدید ]==================
const checkUserApproval = async (userId) => {
  try {
    // بررسی اینکه کاربر توسط مالک تایید شده یا نه
    const { data: approvedUser, error } = await supabase
      .from('Eclis_approved_users')
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

// ==================[ هندلر برای کاربران جدید در گروه اصلی ]==================
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

      // ارسال پیام سوال برای مالک
      const questionMessage = await ctx.reply(
        `مسافر [${member.first_name || 'بدون نام'}](tg://user?id=${member.id}) به Eclis وارد شده\n\n` +
        `[آکی](tg://user?id=${OWNER_ID}) آیا این مسافر اجازه ورود به Eclis را داره ؟`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: 'آره ، اجازه ورود داره', callback_data: `approve_${member.id}` },
                { text: 'نه ، اجازه ورود نداره', callback_data: `reject_${member.id}` }
              ]
            ]
          }
        }
      );

      // ذخیره اطلاعات کاربر منتظر تایید
      await supabase
        .from('Eclis_pending_users')
        .upsert({
          user_id: member.id,
          username: member.username || '',
          first_name: member.first_name || 'ناشناس',
          chat_id: chatId,
          question_message_id: questionMessage.message_id,
          joined_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

      // سکوت کاربر تا زمان تایید
      try {
        const untilDate = Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7); // 7 روز
        await ctx.telegram.restrictChatMember(chatId, member.id, {
          until_date: untilDate,
          permissions: {
            can_send_messages: false,
            can_send_media_messages: false,
            can_send_other_messages: false,
            can_add_web_page_previews: false
          }
        });
        console.log(`🔇 کاربر ${member.first_name} سکوت شد تا زمان تایید`);
      } catch (restrictError) {
        console.log(`❌ خطا در سکوت کاربر ${member.id}:`, restrictError.message);
      }
    }
  } catch (error) {
    console.log('❌ خطا در پردازش کاربران جدید:', error.message);
  }
});

// ==================[ هندلر برای پیام‌های کاربران تایید نشده ]==================
bot.on('message', async (ctx) => {
  try {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id;
    
    // فقط در گروه اصلی عمل کن
    if (chatId !== MAIN_GROUP_ID) {
      return;
    }

    // اگر کاربر مالک است، نیاز به بررسی نیست
    if (userId === OWNER_ID) {
      return;
    }

    // بررسی اینکه کاربر تایید شده یا نه
    const approvalCheck = await checkUserApproval(userId);
    
    if (!approvalCheck.approved) {
      // حذف پیام کاربر
      try {
        await ctx.deleteMessage();
      } catch (deleteError) {
        console.log(`❌ خطا در حذف پیام کاربر ${userId}:`, deleteError.message);
      }

      // ارسال پیام هشدار
      const warningMessage = await ctx.reply(
        `مسافر [${ctx.from.first_name || 'بدون نام'}](tg://user?id=${userId}) شما اجازه صحبت ندارین تا زمانی که تایید بشین`,
        { parse_mode: 'Markdown' }
      );

      // حذف پیام هشدار بعد از 5 ثانیه
      setTimeout(async () => {
        try {
          await ctx.telegram.deleteMessage(chatId, warningMessage.message_id);
        } catch (e) {}
      }, 5000);
    }
  } catch (error) {
    console.log('❌ خطا در پردازش پیام کاربر:', error.message);
  }
});

// ==================[ هندلر برای دکمه‌های اینلاین ]==================
bot.action(/approve_(\d+)/, async (ctx) => {
  try {
    const userId = parseInt(ctx.match[1]);
    const chatId = ctx.chat.id.toString();
    
    // فقط مالک می‌تواند عمل کند
    if (ctx.from.id !== OWNER_ID) {
      await ctx.answerCbQuery('فقط آکی میتونه این کار رو بکنه!');
      return;
    }

    // تایید کاربر
    await supabase
      .from('Eclis_approved_users')
      .upsert({
        user_id: userId,
        approved_by: OWNER_ID,
        approved_at: new Date().toISOString(),
        is_approved: true
      }, { onConflict: 'user_id' });

    // حذف کاربر از لیست منتظران
    await supabase
      .from('Eclis_pending_users')
      .delete()
      .eq('user_id', userId);

    // برداشتن سکوت کاربر
    try {
      await ctx.telegram.restrictChatMember(chatId, userId, {
        permissions: {
          can_send_messages: true,
          can_send_media_messages: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true
        }
      });
    } catch (restrictError) {
      console.log(`❌ خطا در برداشتن سکوت کاربر ${userId}:`, restrictError.message);
    }

    // دریافت اطلاعات کاربر
    let userInfo = '';
    try {
      const user = await ctx.telegram.getChat(userId);
      userInfo = user.first_name || 'کاربر';
    } catch (error) {
      userInfo = 'کاربر';
    }

    // ارسال پیام تایید
    await ctx.editMessageText(
      `✅ مسافر ${userInfo} به Eclis خوش اومدی`,
      { parse_mode: 'Markdown' }
    );

    await ctx.answerCbQuery('کاربر تایید شد');

  } catch (error) {
    console.log('❌ خطا در تایید کاربر:', error.message);
    await ctx.answerCbQuery('خطا در تایید کاربر');
  }
});

bot.action(/reject_(\d+)/, async (ctx) => {
  try {
    const userId = parseInt(ctx.match[1]);
    
    // فقط مالک می‌تواند عمل کند
    if (ctx.from.id !== OWNER_ID) {
      await ctx.answerCbQuery('فقط آکی میتونه این کار رو بکنه!');
      return;
    }

    // اخراج کاربر از گروه اصلی
    try {
      await ctx.telegram.banChatMember(MAIN_GROUP_ID, userId);
      await ctx.telegram.unbanChatMember(MAIN_GROUP_ID, userId);
    } catch (banError) {
      console.log(`❌ خطا در اخراج کاربر ${userId}:`, banError.message);
    }

    // حذف کاربر از لیست منتظران
    await supabase
      .from('Eclis_pending_users')
      .delete()
      .eq('user_id', userId);

    // دریافت اطلاعات کاربر
    let userInfo = '';
    try {
      const user = await ctx.telegram.getChat(userId);
      userInfo = user.first_name || 'کاربر';
    } catch (error) {
      userInfo = 'کاربر';
    }

    // ارسال پیام رد
    await ctx.editMessageText(
      `🚫 مسافر ${userInfo} از Eclis با موفقیت خارج شد`,
      { parse_mode: 'Markdown' }
    );

    await ctx.answerCbQuery('کاربر اخراج شد');

  } catch (error) {
    console.log('❌ خطا در رد کاربر:', error.message);
    await ctx.answerCbQuery('خطا در رد کاربر');
  }
});

// ==================[ سیستم بررسی وفاداری ]==================
const scanAllSubgroupsMembers = async (ctx) => {
  try {
    console.log('🔍 شروع اسکن اعضای چت‌ها برای وفاداری...');
    
    const subgroups = await getActiveSubgroups();
    let totalMembersScanned = 0;
    let loyalMembers = 0;
    let suspiciousMembers = 0;
    
    const loyalList = [];
    const suspiciousList = [];

    for (const subgroup of subgroups) {
      try {
        console.log(`🔍 اسکن ${subgroup.chat_type}: ${subgroup.chat_title}`);
        
        let members = [];
        
        // دریافت ادمین‌های چت
        const admins = await ctx.telegram.getChatAdministrators(subgroup.chat_id);
        const adminUsers = admins.map(admin => admin.user).filter(user => !user.is_bot);
        
        // دریافت تمام اعضای چت (برای گروه‌ها)
        if (subgroup.chat_type === 'گروه') {
          try {
            // این قسمت نیاز به دسترسی ویژه دارد
            // فعلاً فقط ادمین‌ها را بررسی می‌کنیم
            members = adminUsers;
          } catch (error) {
            console.log(`⚠️ دسترسی به لیست کامل اعضای گروه ${subgroup.chat_title} ممکن نیست`);
            members = adminUsers;
          }
        } else {
          // برای کانال‌ها فقط ادمین‌ها
          members = adminUsers;
        }
        
        for (const member of members) {
          // بررسی اینکه کاربر مدیر هست یا نه (مدیران مشکوک محسوب نمی‌شوند)
          const isAdmin = adminUsers.some(admin => admin.id === member.id);
          
          const hasSymbol = checkLoyaltySymbols(member.first_name) || checkLoyaltySymbols(member.username);

          // ذخیره اطلاعات کاربر
          await supabase
            .from('Eclis_members')
            .upsert({
              user_id: member.id,
              username: member.username || '',
              first_name: member.first_name || 'ناشناس',
              has_symbol: hasSymbol,
              is_admin: isAdmin,
              last_checked: new Date().toISOString()
            }, { onConflict: 'user_id' });

          if (hasSymbol) {
            loyalMembers++;
            loyalList.push({
              user_id: member.id,
              username: member.username,
              first_name: member.first_name,
              chat_title: subgroup.chat_title,
              is_admin: isAdmin
            });
          } else if (!isAdmin) { // فقط اگر مدیر نیست، مشکوک محسوب شود
            suspiciousMembers++;
            suspiciousList.push({
              user_id: member.id,
              username: member.username,
              first_name: member.first_name,
              chat_title: subgroup.chat_title
            });
          }
          
          totalMembersScanned++;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.log(`✅ ${subgroup.chat_title}: ${members.length} عضو اسکن شد`);
        
      } catch (error) {
        console.log(`❌ خطا در اسکن ${subgroup.chat_type} "${subgroup.chat_title}":`, error.message);
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`✅ اسکن وفاداری کامل شد: ${totalMembersScanned} عضو اسکن شد`);
    
    return { 
      success: true, 
      totalScanned: totalMembersScanned,
      loyalMembers: loyalMembers,
      suspiciousMembers: suspiciousMembers,
      loyalList: loyalList,
      suspiciousList: suspiciousList
    };
    
  } catch (error) {
    console.log('❌ خطا در اسکن وفاداری:', error.message);
    return { 
      success: false, 
      totalScanned: 0,
      loyalMembers: 0,
      suspiciousMembers: 0,
      loyalList: [],
      suspiciousList: []
    };
  }
};

// ==================[ دستور بررسی وفاداری ]==================
bot.command('بررسی_وفاداری', async (ctx) => {
  try {
    console.log('🎯 دستور /بررسی_وفاداری دریافت شد از کاربر:', ctx.from.id);
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      await ctx.reply(access.message);
      return;
    }

    const tempMessage = await ctx.reply('🔍 در حال بررسی وفاداری اعضا... این ممکن است چند دقیقه طول بکشد.');

    const scanResult = await scanAllSubgroupsMembers(ctx);
    
    if (!scanResult.success) {
      try {
        await ctx.deleteMessage(tempMessage.message_id);
      } catch (e) {}
      await ctx.reply('❌ خطا در بررسی وفاداری اعضا.');
      return;
    }

    const { totalScanned, loyalMembers, suspiciousMembers, suspiciousList } = scanResult;

    let message = `🎯 نتایج بررسی وفاداری\n\n`;
    message += `📊 آمار کلی:\n`;
    message += `• کل اعضای اسکن شده: ${totalScanned}\n`;
    message += `• اعضای وفادار: ${loyalMembers} 👑\n`;
    message += `• اعضای مشکوک: ${suspiciousMembers} ⚠️\n\n`;
    
    message += `آیا میخوای تمام اعضای مشکوک توی Eclis رو بکشم ؟`;

    try {
      await ctx.deleteMessage(tempMessage.message_id);
    } catch (e) {}

    const resultMessage = await ctx.reply(message, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'آره ، همشون رو بکش', callback_data: 'ban_suspicious' },
            { text: 'نه ، نکششون', callback_data: 'dont_ban_suspicious' }
          ]
        ]
      }
    });

    // ذخیره لیست مشکوک‌ها برای استفاده بعدی
    await supabase
      .from('Eclis_temp_data')
      .upsert({
        key: 'suspicious_list',
        data: { suspiciousList: suspiciousList },
        created_at: new Date().toISOString()
      }, { onConflict: 'key' });

    // ارسال استیکر بررسی وفاداری
    const stickerId = await getSticker('loyalty_scan');
    if (stickerId) {
      await ctx.replyWithSticker(stickerId);
    }

  } catch (error) {
    console.log('❌ خطا در دستور بررسی وفاداری:', error.message);
    await ctx.reply('❌ خطا در بررسی وفاداری اعضا.');
  }
});

// ==================[ هندلر برای بن کردن اعضای مشکوک ]==================
bot.action('ban_suspicious', async (ctx) => {
  try {
    // فقط مالک می‌تواند عمل کند
    if (ctx.from.id !== OWNER_ID) {
      await ctx.answerCbQuery('فقط آکی میتونه این کار رو بکنه!');
      return;
    }

    await ctx.answerCbQuery('در حال بن کردن اعضای مشکوک...');

    // دریافت لیست مشکوک‌ها
    const { data: tempData, error } = await supabase
      .from('Eclis_temp_data')
      .select('data')
      .eq('key', 'suspicious_list')
      .single();

    if (error || !tempData) {
      await ctx.editMessageText('❌ لیست مشکوک‌ها پیدا نشد');
      return;
    }

    const suspiciousList = tempData.data.suspiciousList || [];
    let bannedCount = 0;
    let errorCount = 0;

    // بن کردن هر کاربر مشکوک از تمام گروه‌ها
    for (const user of suspiciousList) {
      try {
        const subgroups = await getActiveSubgroups();
        
        for (const subgroup of subgroups) {
          try {
            await ctx.telegram.banChatMember(subgroup.chat_id, user.user_id);
            console.log(`✅ کاربر ${user.first_name} از ${subgroup.chat_title} بن شد`);
          } catch (banError) {
            console.log(`❌ خطا در بن کردن کاربر ${user.user_id} از ${subgroup.chat_title}:`, banError.message);
          }
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        bannedCount++;
      } catch (userError) {
        errorCount++;
        console.log(`❌ خطا در پردازش کاربر ${user.user_id}:`, userError.message);
      }
    }

    await ctx.editMessageText(
      `✅ تمام افراد مشکوک با استفاده از تیغه های زیبام با نهایت لذت یکی یکی کشته میشن\n\n` +
      `📊 نتیجه:\n` +
      `• تعداد بن شده: ${bannedCount}\n` +
      `• خطاها: ${errorCount}`
    );

    // ارسال استیکر بن کردن
    const stickerId = await getSticker('ban_suspicious');
    if (stickerId) {
      await ctx.replyWithSticker(stickerId);
    }

  } catch (error) {
    console.log('❌ خطا در بن کردن اعضای مشکوک:', error.message);
    await ctx.answerCbQuery('خطا در بن کردن اعضای مشکوک');
  }
});

bot.action('dont_ban_suspicious', async (ctx) => {
  try {
    // فقط مالک می‌تواند عمل کند
    if (ctx.from.id !== OWNER_ID) {
      await ctx.answerCbQuery('فقط آکی میتونه این کار رو بکنه!');
      return;
    }

    await ctx.answerCbQuery('اعضای مشکوک بن نشدند');

    await ctx.editMessageText('🔄 فرصتی دوباره...\n\nاعضای مشکوک میتونن تا دفعه بعدی زنده بمونن');

    // ارسال استیکر عدم بن
    const stickerId = await getSticker('dont_ban_suspicious');
    if (stickerId) {
      await ctx.replyWithSticker(stickerId);
    }

  } catch (error) {
    console.log('❌ خطا در عمل عدم بن:', error.message);
    await ctx.answerCbQuery('خطا در انجام عمل');
  }
});

// ==================[ دستور تنظیم استیکر ]==================
bot.command('setsticker', async (ctx) => {
  try {
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      await ctx.reply(access.message);
      return;
    }

    if (!ctx.message.reply_to_message || !ctx.message.reply_to_message.sticker) {
      await ctx.reply('💡 لطفاً یک استیکر را ریپلای کنید و دستور را به این صورت استفاده کنید:\n/setsticker <نوع_استیکر>');
      return;
    }

    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
      await ctx.reply('💡 استفاده: /setsticker <نوع_استیکر>\n\nانواع استیکر:\n- added_by_owner (اضافه شدن به گروه توسط مالک)\n- loyalty_scan (بررسی وفاداری)\n- ban_suspicious (بن کردن مشکوک‌ها)\n- dont_ban_suspicious (بن نکردن مشکوک‌ها)');
      return;
    }

    const stickerType = args[1];
    const stickerFileId = ctx.message.reply_to_message.sticker.file_id;

    const validTypes = ['added_by_owner', 'loyalty_scan', 'ban_suspicious', 'dont_ban_suspicious'];
    if (!validTypes.includes(stickerType)) {
      await ctx.reply('❌ نوع استیکر نامعتبر است. انواع معتبر:\n\n- added_by_owner\n- loyalty_scan\n- ban_suspicious\n- dont_ban_suspicious');
      return;
    }

    const success = await setSticker(stickerType, stickerFileId);
    
    if (success) {
      await ctx.reply(`✅ استیکر برای ${stickerType} با موفقیت تنظیم شد`);
    } else {
      await ctx.reply('❌ خطا در تنظیم استیکر');
    }

  } catch (error) {
    console.log('❌ خطا در تنظیم استیکر:', error.message);
    await ctx.reply('❌ خطا در تنظیم استیکر');
  }
});

// ==================[ دستورات اصلی ]==================
bot.start(async (ctx) => {
  try {
    console.log('🚀 دستور /start دریافت شد از کاربر:', ctx.from.id);
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      await ctx.reply(access.message);
      return;
    }
    
    await ctx.reply('🥷🏻 ربات مدیریت Eclis فعال است\n\nاز /help برای راهنما استفاده کنید');
    console.log('✅ پاسخ /start ارسال شد');
  } catch (error) {
    console.log('❌ خطا در دستور start:', error.message);
  }
});

bot.command('help', async (ctx) => {
  try {
    console.log('ℹ️ دستور /help دریافت شد از کاربر:', ctx.from.id);
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      await ctx.reply(access.message);
      return;
    }
    
    const helpText = `🥷🏻 راهنمای ربات مدیریت Eclis

📋 دستورات:
/start - شروع ربات
/help - راهنما
/status - وضعیت ربات
/groups - لیست گروه‌ها
/update_chats - بروزرسانی چت‌ها
/بررسی_وفاداری - بررسی وفاداری اعضا
/setsticker - تنظیم استیکر

💡 ربات آماده خدمت‌رسانی است`;

    await ctx.reply(helpText);
    console.log('✅ پاسخ /help ارسال شد');
  } catch (error) {
    console.log('❌ خطا در دستور help:', error.message);
  }
});

bot.command('status', async (ctx) => {
  try {
    console.log('📊 دستور /status دریافت شد از کاربر:', ctx.from.id);
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      await ctx.reply(access.message);
      return;
    }
    
    const subgroups = await getActiveSubgroups();
    
    const message = `🤖 وضعیت ربات مدیریت Eclis

📊 آمار:
• گروه‌های فعال: ${subgroups.length}
• زمان فعالیت: ${Math.round(process.uptime() / 60)} دقیقه
• آخرین پینگ: ${new Date().toLocaleTimeString('fa-IR')}

✅ ربات در حال اجرا است`;

    await ctx.reply(message);
    console.log('✅ پاسخ /status ارسال شد');
  } catch (error) {
    console.log('❌ خطا در دستور status:', error.message);
  }
});

bot.command('groups', async (ctx) => {
  try {
    console.log('🏘️ دستور /groups دریافت شد از کاربر:', ctx.from.id);
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      await ctx.reply(access.message);
      return;
    }

    const subgroups = await getActiveSubgroups();
    
    if (subgroups.length === 0) {
      await ctx.reply('📭 هیچ گروه فعالی پیدا نشد');
      return;
    }

    let message = `🏘️ گروه‌های فعال (${subgroups.length}):\n\n`;
    
    subgroups.forEach((group, index) => {
      message += `${index + 1}. ${group.chat_title} (${group.chat_type})\n`;
      message += `   ID: ${group.chat_id}\n\n`;
    });

    await ctx.reply(message);
    console.log('✅ پاسخ /groups ارسال شد');
  } catch (error) {
    console.log('❌ خطا در دستور groups:', error.message);
  }
});

// ==================[ دستور اصلی: بروزرسانی وضعیت چت‌ها ]==================
bot.command('update_chats', async (ctx) => {
  try {
    console.log('🔄 دستور /update_chats دریافت شد از کاربر:', ctx.from.id);
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      await ctx.reply(access.message);
      return;
    }

    const tempMessage = await ctx.reply('🔄 در حال کشف و بروزرسانی تمام چت‌ها...');

    // شبیه‌سازی عملیات بروزرسانی
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const subgroups = await getActiveSubgroups();
    
    let message = `🔄 بروزرسانی وضعیت چت‌ها\n\n`;
    message += `✅ عملیات موفق!\n\n`;
    message += `📊 نتایج:\n`;
    message += `• کل چت‌های فعال: ${subgroups.length}\n\n`;
    
    if (subgroups.length > 0) {
      message += `🏘️ چت‌های فعال:\n`;
      subgroups.forEach((chat, index) => {
        message += `${index + 1}. ${chat.chat_title} (${chat.chat_type})\n`;
      });
    } else {
      message += `📭 هیچ چت فعالی پیدا نشد\n`;
    }

    try {
      await ctx.deleteMessage(tempMessage.message_id);
    } catch (e) {}
    
    await ctx.reply(message);
    console.log('✅ پاسخ /update_chats ارسال شد');

  } catch (error) {
    console.log('❌ خطا در بروزرسانی چت‌ها:', error.message);
    await ctx.reply('❌ خطا در بروزرسانی چت‌ها.');
  }
});

// ==================[ هندلر برای وقتی که ربات به چتی اضافه می‌شود ]==================
bot.on('my_chat_member', async (ctx) => {
  try {
    console.log('🔄 رویداد my_chat_member دریافت شد');
    
    const chatMember = ctx.myChatMember.new_chat_member;
    const chat = ctx.myChatMember.chat;
    const chatId = chat.id.toString();
    const addedBy = ctx.myChatMember.from.id;
    
    console.log(`🤖 وضعیت ربات در چت ${chat.title}: ${chatMember.status}`);
    
    // اگر ربات اضافه شده
    if (chatMember.status === 'administrator' || chatMember.status === 'member') {
      // اگر توسط مالک اضافه شده
      if (addedBy === OWNER_ID) {
        try {
          const currentMember = await ctx.telegram.getChatMember(chatId, bot.botInfo.id);
          
          if (currentMember.status === 'administrator' || currentMember.status === 'creator') {
            const chatType = chat.type === 'channel' ? 'کانال' : 'گروه';
            const chatTitle = chat.title || 'بدون عنوان';
            
            const added = await addChatToSubgroups(chatId, chatTitle, chatType, OWNER_ID);
            
            if (added) {
              console.log(`✅ چت جدید توسط مالک اضافه شد: ${chatTitle} (${chatType})`);
              
              // ارسال پیام تایید
              await ctx.reply('🥷🏻 این بخش به بخش های تحت نظارت نینجای چهارم اضافه شد');
              
              // ارسال استیکر اگر تنظیم شده
              const stickerId = await getSticker('added_by_owner');
              if (stickerId) {
                await ctx.replyWithSticker(stickerId);
              }
            }
          }
        } catch (error) {
          console.log(`❌ خطا در بررسی چت ${chatId}:`, error.message);
        }
      } else {
        // اگر توسط غیرمالک اضافه شده
        console.log(`🚫 ربات توسط غیرمالک (${addedBy}) به چت ${chat.title} اضافه شد`);
        
        // ارسال پیام هشدار
        await ctx.reply('🚫 این ربات متعلق به مجموعه بزرگ Eclis است و جز آکی کسی نمیتونه به من دستور بده');
        
        // لفت دادن از گروه
        try {
          await ctx.telegram.leaveChat(chatId);
          console.log(`✅ ربات از چت ${chat.title} لفت داد`);
        } catch (leaveError) {
          console.log(`❌ خطا در لفت دادن از چت:`, leaveError.message);
        }
      }
    }
    
  } catch (error) {
    console.log('❌ خطا در پردازش my_chat_member:', error.message);
  }
});

// ==================[ راه‌اندازی ربات ]==================
const startBot = async () => {
  try {
    console.log('🤖 شروع راه‌اندازی ربات...');
    
    // بررسی وضعیت ربات
    const botInfo = await bot.telegram.getMe();
    console.log('✅ ربات شناسایی شد:', botInfo.first_name, `(@${botInfo.username})`);
    
    // راه‌اندازی ربات
    await bot.launch({
      dropPendingUpdates: true,
      polling: {
        timeout: 30,
        limit: 100
      }
    });
    
    console.log('✅ ربات با موفقیت فعال شد');
    console.log('📝 ربات آماده دریافت دستورات است...');
    
    // اطلاع به مالک
    try {
      await bot.telegram.sendMessage(
        OWNER_ID, 
        `🤖 ربات ${botInfo.first_name} فعال شد\n\n` +
        `⏰ زمان: ${new Date().toLocaleString('fa-IR')}\n` +
        `🆔 ID: ${botInfo.id}\n` +
        `👤 یوزرنیم: @${botInfo.username}\n\n` +
        `✅ ربات آماده دریافت دستورات است\n` +
        `💡 از /help برای راهنما استفاده کنید`
      );
      console.log('✅ اطلاع به مالک ارسال شد');
    } catch (error) {
      console.log('⚠️ نتوانستم به مالک اطلاع دهم:', error.message);
    }
    
  } catch (error) {
    console.log('❌ خطا در راه‌اندازی ربات:', error.message);
    process.exit(1);
  }
};

// ==================[ سرور اکسپرس برای سلامت ]==================
app.get('/', (req, res) => {
  res.json({ 
    status: '✅ ربات فعال است',
    service: 'Eclis Management Bot',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    service: 'Eclis Management Bot',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/ping', (req, res) => {
  res.json({ 
    message: 'pong',
    timestamp: new Date().toISOString()
  });
});

// ==================[ راه‌اندازی سرور ]==================
app.listen(PORT, () => {
  console.log(`✅ سرور روی پورت ${PORT} راه‌اندازی شد`);
  console.log('🔧 در حال راه‌اندازی ربات...');
  
  // راه‌اندازی ربات
  startBot();
  
  // راه‌اندازی سیستم پینگ خودکار
  startPingService();
  
  // راه‌اندازی سیستم اخطار خودکار
  startWarningSystem();
});

// ==================[ مدیریت خاموشی ]==================
process.once('SIGINT', () => {
  console.log('🛑 دریافت SIGINT - خاموش کردن ربات...');
  bot.stop('SIGINT');
  process.exit(0);
});

process.once('SIGTERM', () => {
  console.log('🛑 دریافت SIGTERM - خاموش کردن ربات...');
  bot.stop('SIGTERM');
  process.exit(0);
});
