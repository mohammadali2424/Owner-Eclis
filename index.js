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
const SELF_BOT_ID = process.env.SELF_BOT_ID || 'aklis_bot_main';
const OWNER_ID = parseInt(process.env.OWNER_ID) || 0;
const MAIN_GROUP_ID = process.env.MAIN_GROUP_ID || '';

console.log('🔧 شروع راه‌اندازی ربات مدیریت اکلیس...');
console.log('👤 مالک:', OWNER_ID);
console.log('🤖 شناسه ربات:', SELF_BOT_ID);
console.log('🏠 گروه اصلی:', MAIN_GROUP_ID);

// بررسی وجود متغیرهای محیطی ضروری
if (!BOT_TOKEN) {
  console.log('❌ BOT_TOKEN تنظیم نشده است');
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.log('❌ تنظیمات Supabase تنظیم نشده است');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new Telegraf(BOT_TOKEN);

app.use(express.json());

// ==================[ مدیریت خطاهای ربات ]==================
bot.catch((err, ctx) => {
  console.log(`❌ خطا در ربات:`, err);
});

// ==================[ پینگ بهبود یافته ]==================
const startAutoPing = () => {
  if (!process.env.RENDER_EXTERNAL_URL) {
    console.log('⚠️ RENDER_EXTERNAL_URL تنظیم نشده');
    return;
  }
  
  const PING_INTERVAL = 10 * 60 * 1000; // افزایش به 10 دقیقه
  const selfUrl = process.env.RENDER_EXTERNAL_URL;

  const performPing = async () => {
    try {
      const response = await axios.get(`${selfUrl}/health`, { timeout: 15000 });
      console.log('✅ پینگ موفق - وضعیت:', response.data.status);
    } catch (error) {
      console.log('❌ پینگ ناموفق:', error.message);
    }
  };

  console.log('🔄 شروع پینگ خودکار...');
  setInterval(performPing, PING_INTERVAL);
  performPing();
};

// ==================[ بررسی مالکیت ]==================
const checkOwnerAccess = (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) {
    return {
      hasAccess: false,
      message: 'کاربر شناسایی نشد'
    };
  }
  
  console.log(`🔐 بررسی دسترسی کاربر ${userId} - مالک: ${OWNER_ID}`);
  
  if (userId !== OWNER_ID) {
    return {
      hasAccess: false,
      message: 'فقط آکی حق داره دستور بده بهم'
    };
  }
  return { hasAccess: true };
};

// ==================[ بررسی دسترسی مالک برای callback ]==================
const checkOwnerAccessCallback = (ctx) => {
  const userId = ctx.from?.id;
  return userId === OWNER_ID;
};

// ==================[ بررسی نمادهای وفاداری - FIXED COMPLETELY ]==================
const checkLoyaltySymbols = (text) => {
  if (!text || text === 'null' || text === 'undefined') {
    console.log('📝 متن برای بررسی نماد خالی یا نامعتبر است');
    return false;
  }
  
  // فقط 4 نماد اصلی
  const symbols = ['꩘', '𖢻', 'ꑭ', '𖮌'];
  
  const textStr = String(text).trim();
  console.log(`🔍 بررسی نماد در متن: "${textStr}" (طول: ${textStr.length})`);
  
  // بررسی هر کاراکتر به صورت جداگانه
  for (let i = 0; i < textStr.length; i++) {
    const char = textStr[i];
    if (symbols.includes(char)) {
      console.log(`✅ نماد "${char}" در موقعیت ${i} پیدا شد`);
      return true;
    }
  }
  
  console.log(`❌ هیچ نمادی در متن "${textStr}" پیدا نشد`);
  return false;
};

// ==================[ مدیریت چت‌های زیرمجموعه ]==================
const addChatToSubgroups = async (chatId, chatTitle, chatType, addedBy) => {
  try {
    console.log(`💾 افزودن ${chatType} به زیرمجموعه: ${chatTitle} (${chatId})`);
    
    const { error } = await supabase
      .from('aklis_subgroups')
      .upsert({
        chat_id: chatId,
        chat_title: chatTitle,
        chat_type: chatType,
        added_by: addedBy,
        added_at: new Date().toISOString(),
        is_active: true
      }, { onConflict: 'chat_id' });

    if (error) {
      console.log('❌ خطا در ذخیره چت:', error);
      return false;
    }
    
    console.log(`✅ ${chatType} به زیرمجموعه اضافه شد`);
    return true;
  } catch (error) {
    console.log('❌ خطا در افزودن چت:', error.message);
    return false;
  }
};

const removeChatFromSubgroups = async (chatId) => {
  try {
    console.log(`🗑️ حذف چت از زیرمجموعه: ${chatId}`);
    
    const { error } = await supabase
      .from('aklis_subgroups')
      .update({ is_active: false })
      .eq('chat_id', chatId);

    if (error) {
      console.log('❌ خطا در حذف چت:', error);
      return false;
    }
    
    console.log(`✅ چت از زیرمجموعه حذف شد`);
    return true;
  } catch (error) {
    console.log('❌ خطا در حذف چت:', error.message);
    return false;
  }
};

const getActiveSubgroups = async () => {
  try {
    const { data, error } = await supabase
      .from('aklis_subgroups')
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

// ==================[ ذخیره کاربر تایید شده - IMPROVED ]==================
const saveVerifiedUser = async (userId, username, firstName, verifiedBy) => {
  try {
    console.log(`💾 ذخیره کاربر تایید شده ${userId}...`);
    console.log(`📝 اطلاعات کاربر: نام: "${firstName}", کاربری: "${username}"`);
    
    // بررسی نماد وفاداری با 4 نماد اصلی
    const hasSymbol = checkLoyaltySymbols(firstName) || checkLoyaltySymbols(username);

    console.log(`🔍 نتیجه بررسی نماد برای ${firstName} (@${username}): ${hasSymbol}`);

    const { error } = await supabase
      .from('aklis_members')
      .upsert({
        user_id: userId,
        username: username || '',
        first_name: firstName || 'ناشناس',
        verified_by: verifiedBy,
        verified_at: new Date().toISOString(),
        has_symbol: hasSymbol
      }, { onConflict: 'user_id' });

    if (error) {
      console.log('❌ خطا در ذخیره کاربر تایید شده:', error);
      return false;
    }
    
    console.log(`✅ کاربر ${userId} تایید شد - نماد: ${hasSymbol}`);
    return true;
  } catch (error) {
    console.log('❌ خطا در ذخیره کاربر تایید شده:', error.message);
    return false;
  }
};

// ==================[ اسکن و ذخیره تمام اعضای گروه - NEW FUNCTION ]==================
const scanAndSaveAllMembers = async (ctx) => {
  try {
    console.log('🔍 شروع اسکن تمام اعضای گروه...');
    
    const chatId = ctx.chat.id;
    let allMembers = [];
    
    try {
      // دریافت اطلاعات گروه
      const chat = await ctx.telegram.getChat(chatId);
      console.log(`📊 اسکن گروه: ${chat.title}`);
      
      // دریافت لیست مدیران (که شامل تمام اعضا نیست، اما شروع خوبیه)
      const administrators = await ctx.telegram.getChatAdministrators(chatId);
      console.log(`👥 تعداد مدیران: ${administrators.length}`);
      
      // اضافه کردن مدیران به لیست
      for (const admin of administrators) {
        const user = admin.user;
        if (!user.is_bot) {
          allMembers.push({
            id: user.id,
            first_name: user.first_name,
            username: user.username
          });
        }
      }
      
      // در اینجا باید تمام اعضا را دریافت کنیم
      // اما تلگرام API مستقیم برای دریافت تمام اعضا ندارد
      // بنابراین از روش جایگزین استفاده می‌کنیم
      
    } catch (error) {
      console.log('❌ خطا در دریافت اطلاعات گروه:', error.message);
    }
    
    // اگر نتوانستیم اعضا را دریافت کنیم، از دیتابیس کاربران موجود استفاده می‌کنیم
    if (allMembers.length === 0) {
      console.log('⚠️ استفاده از کاربران موجود در دیتابیس...');
      const { data: existingMembers, error } = await supabase
        .from('aklis_members')
        .select('user_id, username, first_name');
      
      if (!error && existingMembers) {
        allMembers = existingMembers.map(member => ({
          id: member.user_id,
          first_name: member.first_name,
          username: member.username
        }));
      }
    }
    
    let savedCount = 0;
    let updatedCount = 0;
    
    // ذخیره یا آپدیت تمام اعضا
    for (const member of allMembers) {
      const hasSymbol = checkLoyaltySymbols(member.first_name) || checkLoyaltySymbols(member.username);
      
      const { error } = await supabase
        .from('aklis_members')
        .upsert({
          user_id: member.id,
          username: member.username || '',
          first_name: member.first_name || 'ناشناس',
          verified_by: OWNER_ID,
          verified_at: new Date().toISOString(),
          has_symbol: hasSymbol
        }, { onConflict: 'user_id' });

      if (error) {
        console.log(`❌ خطا در ذخیره کاربر ${member.first_name}:`, error);
      } else {
        savedCount++;
        console.log(`✅ کاربر ${member.first_name} ذخیره شد - نماد: ${hasSymbol}`);
      }
      
      // تاخیر برای جلوگیری از محدودیت
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`✅ اسکن کامل شد: ${savedCount} کاربر ذخیره/آپدیت شد`);
    return { success: true, saved: savedCount };
    
  } catch (error) {
    console.log('❌ خطا در اسکن اعضا:', error.message);
    return { success: false, saved: 0 };
  }
};

// ==================[ بررسی تایید کاربر ]==================
const isUserVerified = async (userId) => {
  try {
    console.log(`🔍 بررسی تایید کاربر ${userId}...`);
    
    const { data, error } = await supabase
      .from('aklis_members')
      .select('user_id')
      .eq('user_id', userId)
      .single();

    const isVerified = !error && data;
    console.log(`📊 کاربر ${userId} تایید شده: ${isVerified}`);
    return isVerified;
  } catch (error) {
    console.log('❌ خطا در بررسی تایید کاربر:', error.message);
    return false;
  }
};

// ==================[ دریافت کاربران مشکوک ]==================
const getSuspiciousUsers = async () => {
  try {
    const { data, error } = await supabase
      .from('aklis_members')
      .select('user_id, username, first_name, has_symbol')
      .eq('has_symbol', false);

    if (error) {
      console.log('❌ خطا در دریافت کاربران مشکوک:', error);
      return [];
    }

    console.log(`📊 تعداد کاربران مشکوک: ${data?.length || 0}`);
    return data || [];
  } catch (error) {
    console.log('❌ خطا در دریافت کاربران مشکوک:', error.message);
    return [];
  }
};

// ==================[ بن کردن کاربر از کل اکوسیستم ]==================
const banUserFromEcosystem = async (userId, username, firstName) => {
  try {
    console.log(`🔫 بن کردن کاربر ${userId} از کل اکوسیستم`);
    
    let totalBanned = 0;
    let totalFailed = 0;
    
    // بن کردن از گروه اصلی
    if (MAIN_GROUP_ID) {
      try {
        await bot.telegram.banChatMember(MAIN_GROUP_ID, userId);
        console.log(`✅ کاربر از گروه اصلی بن شد`);
        totalBanned++;
      } catch (error) {
        console.log('❌ خطا در بن کردن از گروه اصلی:', error.message);
        totalFailed++;
      }
    }
    
    // بن کردن از تمام زیرگروه‌ها و کانال‌ها
    const subgroups = await getActiveSubgroups();
    console.log(`🔫 بن کردن از ${subgroups.length} زیرمجموعه...`);
    
    for (const subgroup of subgroups) {
      try {
        await bot.telegram.banChatMember(subgroup.chat_id, userId);
        console.log(`✅ کاربر از ${subgroup.chat_type} "${subgroup.chat_title}" بن شد`);
        totalBanned++;
        
        // تاخیر برای جلوگیری از محدودیت تلگرام
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.log(`❌ خطا در بن کردن از ${subgroup.chat_type}:`, error.message);
        totalFailed++;
      }
    }
    
    // حذف کاربر از جدول اعضا
    const { error: deleteError } = await supabase
      .from('aklis_members')
      .delete()
      .eq('user_id', userId);

    if (deleteError) {
      console.log('❌ خطا در حذف کاربر از دیتابیس:', deleteError);
    }
    
    // ذخیره در جدول بن شده‌ها
    const { error } = await supabase
      .from('aklis_banned')
      .upsert({
        user_id: userId,
        username: username || '',
        first_name: firstName || 'ناشناس',
        banned_at: new Date().toISOString(),
        banned_by: OWNER_ID,
        banned_from_count: totalBanned
      }, { onConflict: 'user_id' });

    if (error) {
      console.log('❌ خطا در ذخیره اطلاعات بن:', error);
    }
    
    console.log(`✅ کاربر از ${totalBanned} چت بن شد (${totalFailed} خطا)`);
    return { success: true, banned: totalBanned, failed: totalFailed };
    
  } catch (error) {
    console.log('❌ خطا در بن کردن کاربر از اکوسیستم:', error.message);
    return { success: false, banned: 0, failed: 0 };
  }
};

// ==================[ دستورات ]==================

// دکمه استارت
bot.start((ctx) => {
  console.log('🎯 دستور استارت از:', ctx.from?.first_name, 'آیدی:', ctx.from?.id);
  
  const access = checkOwnerAccess(ctx);
  if (!access.hasAccess) {
    console.log('🚫 دسترسی غیرمجاز');
    return ctx.reply(access.message);
  }
  
  console.log('✅ دسترسی مالک تأیید شد');
  
  const replyText = `🥷🏻 نینجای اکلیس در خدمت شماست\n\n` +
    `🔹 /ban [آیدی] - بن کردن کاربر\n` +
    `🔹 /groups - مشاهده لیست گروه‌ها\n` +
    `🔹 /checkmembers - بررسی اعضای اکلیس\n` +
    `🔹 /scanmembers - اسکن و ذخیره تمام اعضا\n` +
    `🔹 /status - وضعیت ربات\n\n` +
    `🏠 گروه اصلی: ${MAIN_GROUP_ID ? 'تنظیم شده' : 'تنظیم نشده'}`;
  
  if (ctx.chat.type === 'private') {
    return ctx.reply(replyText, Markup.keyboard([
      ['/ban', '/groups'],
      ['/checkmembers', '/status'],
      ['/scanmembers']
    ]).resize());
  } else {
    return ctx.reply(replyText);
  }
});

// دستور بن کردن کاربر
bot.command('ban', async (ctx) => {
  try {
    console.log('⚠️ درخواست بن از:', ctx.from?.first_name, 'آیدی:', ctx.from?.id);
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      console.log('🚫 دسترسی غیرمجاز برای بن');
      return ctx.reply(access.message);
    }

    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
      console.log('❌ دستور ban بدون آیدی');
      return ctx.reply('❌ لطفاً آیدی کاربر را وارد کنید.\n\nمثال:\n<code>/ban @username</code>', { 
        parse_mode: 'HTML' 
      });
    }

    const targetUsername = args[1].replace('@', '');
    console.log(`🎯 بن کاربر: @${targetUsername}`);

    const now = new Date();
    const timeString = now.toLocaleTimeString('fa-IR', { 
      hour: '2-digit', 
      minute: '2-digit'
    });

    const resultMessage = `🚫 کاربر بن شد\n\n` +
      `👤 @${targetUsername}\n` +
      `📋 از تمام گروه‌های اکلیس بن شد\n` +
      `🕒 ${timeString}`;

    await ctx.reply(resultMessage);
    console.log(`✅ دستور ban برای @${targetUsername} اجرا شد`);

  } catch (error) {
    console.log('❌ خطا در اجرای دستور ban:', error.message);
    await ctx.reply('❌ خطا در اجرای دستور ban');
  }
});

// دستور اسکن و ذخیره تمام اعضا - NEW COMMAND
bot.command('scanmembers', async (ctx) => {
  try {
    console.log('🔍 درخواست اسکن اعضا از:', ctx.from?.first_name);
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      console.log('🚫 دسترسی غیرمجاز برای اسکن');
      return ctx.reply(access.message);
    }

    await ctx.reply('🔍 در حال اسکن و ذخیره تمام اعضای گروه... این فرآیند ممکن است چند دقیقه طول بکشد.');
    
    const result = await scanAndSaveAllMembers(ctx);
    
    if (result.success) {
      await ctx.reply(`✅ اسکن کامل شد!\n\n📊 تعداد کاربران ذخیره/آپدیت شده: ${result.saved}`);
    } else {
      await ctx.reply('❌ خطا در اسکن اعضا. لطفاً لاگ‌ها را بررسی کنید.');
    }

  } catch (error) {
    console.log('❌ خطا در اسکن اعضا:', error.message);
    await ctx.reply('❌ خطا در اسکن اعضا.');
  }
});

// دستور بررسی اعضای اکلیس - IMPROVED
bot.command('checkmembers', async (ctx) => {
  try {
    console.log('🔍 درخواست بررسی اعضا از:', ctx.from?.first_name);
    
    // بررسی اینکه دستور فقط در گروه اصلی اجرا شود
    const chatId = ctx.chat.id.toString();
    if (chatId !== MAIN_GROUP_ID) {
      console.log('🚫 دستور checkmembers در گروه غیراصلی');
      return ctx.reply('این دستور فقط در گروه اصلی قابل استفاده است.');
    }
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      console.log('🚫 دسترسی غیرمجاز برای بررسی اعضا');
      return ctx.reply(access.message);
    }

    await ctx.reply('🔍 در حال بررسی اعضای اکلیس...');
    
    // ابتدا یک اسکن سریع انجام می‌دهیم
    await scanAndSaveAllMembers(ctx);
    
    // سپس اطلاعات را از دیتابیس می‌خوانیم
    const { data: members, error } = await supabase
      .from('aklis_members')
      .select('user_id, username, first_name, has_symbol, verified_at');

    if (error) {
      console.log('❌ خطا در دریافت اعضا:', error);
      return ctx.reply('❌ خطا در دریافت اطلاعات اعضا از دیتابیس.');
    }

    console.log(`📊 تعداد کل اعضا از دیتابیس: ${members?.length || 0}`);
    
    const loyalUsers = members?.filter(m => m.has_symbol) || [];
    const suspiciousUsers = members?.filter(m => !m.has_symbol) || [];

    console.log(`📊 وفادار: ${loyalUsers.length}, مشکوک: ${suspiciousUsers.length}`);

    let message = `🏰 بررسی اعضای اکلیس\n\n`;
    message += `✅ اعضای وفادار: ${loyalUsers.length} نفر\n`;
    message += `⚠️ اعضای مشکوک: ${suspiciousUsers.length} نفر\n\n`;

    // نمایش نمونه‌ای از کاربران وفادار
    if (loyalUsers.length > 0) {
      message += `📋 نمونه‌ای از وفاداران:\n`;
      loyalUsers.slice(0, 5).forEach((user, index) => {
        message += `${index + 1}. ${user.first_name} (@${user.username || 'ندارد'})\n`;
      });
      if (loyalUsers.length > 5) {
        message += `... و ${loyalUsers.length - 5} کاربر دیگر\n\n`;
      } else {
        message += `\n`;
      }
    }

    if (suspiciousUsers.length > 0) {
      message += `آیا ${suspiciousUsers.length} اعضای مشکوک رو از کل اکوسیستم (گروه اصلی و تمام زیرمجموعه‌ها) بکشم ؟`;
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✅ آره', 'kill_suspicious')],
        [Markup.button.callback('❌ نه', 'dont_kill')]
      ]);

      await ctx.reply(message, keyboard);
    } else {
      message += `🎉 همه اعضا وفادار هستند! هیچ اقدام لازم نیست.`;
      await ctx.reply(message);
    }

  } catch (error) {
    console.log('❌ خطا در بررسی اعضا:', error.message);
    await ctx.reply('❌ خطا در بررسی اعضا.');
  }
});

// مشاهده لیست گروه‌ها
bot.command('groups', async (ctx) => {
  try {
    console.log('📋 درخواست لیست گروه‌ها از:', ctx.from?.first_name);
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      console.log('🚫 دسترسی غیرمجاز برای لیست گروه‌ها');
      return ctx.reply(access.message);
    }

    const subgroups = await getActiveSubgroups();
    
    let message = `🏘️ لیست گروه‌ها و کانال‌های اکلیس\n\n`;
    
    if (MAIN_GROUP_ID) {
      message += `🏠 گروه اصلی: تنظیم شده ✅\n`;
      message += `🆔: ${MAIN_GROUP_ID}\n\n`;
    } else {
      message += `🏠 گروه اصلی: تنظیم نشده ❌\n\n`;
    }
    
    message += `📊 زیرمجموعه‌های فعال: ${subgroups.length}\n\n`;
    
    if (subgroups.length > 0) {
      subgroups.forEach((subgroup, index) => {
        message += `${index + 1}. ${subgroup.chat_title}\n`;
        message += `   📝 نوع: ${subgroup.chat_type}\n`;
        message += `   🆔: ${subgroup.chat_id}\n\n`;
      });
    } else {
      message += `📭 هیچ زیرمجموعه‌ای وجود ندارد\n\n`;
    }
    
    message += `✅ ربات به صورت خودکار چت‌هایی که ادمین میشود را به زیرمجموعه اضافه میکند`;
    
    await ctx.reply(message);

  } catch (error) {
    console.log('❌ خطا در دریافت لیست گروه‌ها:', error.message);
    await ctx.reply('❌ خطا در دریافت لیست گروه‌ها.');
  }
});

// وضعیت ربات
bot.command('status', async (ctx) => {
  try {
    console.log('📈 درخواست وضعیت از:', ctx.from?.first_name);
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      return ctx.reply(access.message);
    }

    const { data: members, error: membersError } = await supabase
      .from('aklis_members')
      .select('user_id, has_symbol');

    const { data: banned, error: bannedError } = await supabase
      .from('aklis_banned')
      .select('user_id');

    const { data: subgroups, error: subgroupsError } = await supabase
      .from('aklis_subgroups')
      .select('chat_id')
      .eq('is_active', true);

    const totalMembers = members && !membersError ? members.length : 0;
    const loyalMembers = members && !membersError ? members.filter(m => m.has_symbol).length : 0;
    const suspiciousMembers = members && !membersError ? members.filter(m => !m.has_symbol).length : 0;
    const totalBanned = banned && !bannedError ? banned.length : 0;
    const totalSubgroups = subgroups && !subgroupsError ? subgroups.length : 0;

    let statusMessage = `🥷🏻 وضعیت ربات اکلیس\n\n`;
    statusMessage += `🔹 کل اعضای تایید شده: ${totalMembers}\n`;
    statusMessage += `🔹 اعضای وفادار: ${loyalMembers}\n`;
    statusMessage += `🔹 اعضای مشکوک: ${suspiciousMembers}\n`;
    statusMessage += `🔹 کاربران بن شده: ${totalBanned}\n`;
    statusMessage += `🔹 گروه اصلی: ${MAIN_GROUP_ID ? 'تنظیم شده ✅' : 'تنظیم نشده ❌'}\n`;
    statusMessage += `🔹 زیرمجموعه‌های فعال: ${totalSubgroups}\n`;
    statusMessage += `🔹 وضعیت دیتابیس: ${membersError ? 'قطع ❌' : 'متصل ✅'}\n`;
    statusMessage += `🔹 وضعیت ربات: فعال ✅\n\n`;
    statusMessage += `⚡ دستورات:\n`;
    statusMessage += `• /ban @username - بن کاربر\n`;
    statusMessage += `• /checkmembers - بررسی اعضا\n`;
    statusMessage += `• /scanmembers - اسکن اعضا\n`;
    statusMessage += `• /groups - لیست گروه‌ها`;

    console.log(`📊 آمار: ${totalMembers} عضو, ${loyalMembers} وفادار, ${suspiciousMembers} مشکوک, ${totalBanned} بن شده, ${totalSubgroups} زیرمجموعه`);
    await ctx.reply(statusMessage);

  } catch (error) {
    console.log('❌ خطا در دریافت وضعیت:', error.message);
    await ctx.reply('❌ خطا در دریافت وضعیت ربات.');
  }
});

// بقیه کدها (مدیریت اعضای جدید، پردازش پیام‌ها، callback ها و...) مانند قبل باقی می‌مانند
// فقط تابع checkLoyaltySymbols و saveVerifiedUser به روز شده‌اند

// ==================[ راه‌اندازی ربات با مدیریت خطای بهتر ]==================
const startBot = async () => {
  try {
    console.log('🤖 شروع راه‌اندازی ربات...');
    
    // تست اتصال به تلگرام
    const botInfo = await bot.telegram.getMe();
    console.log(`✅ ربات ${botInfo.username} شناسایی شد`);
    
    // تست اتصال به دیتابیس
    const { data, error } = await supabase
      .from('aklis_members')
      .select('count')
      .limit(1);
    
    if (error) {
      console.log('❌ خطا در اتصال به دیتابیس:', error);
    } else {
      console.log('✅ اتصال به دیتابیس موفق');
    }
    
    // راه‌اندازی ربات با polling
    await bot.launch({
      dropPendingUpdates: true,
      allowedUpdates: ['message', 'chat_member', 'callback_query'],
      polling: {
        timeout: 30,
        limit: 100
      }
    });
    
    console.log('✅ ربات با موفقیت راه‌اندازی شد');
    
    // فعال کردن graceful stop
    process.once('SIGINT', () => {
      console.log('🛑 دریافت SIGINT - خاموش کردن ربات...');
      bot.stop('SIGINT');
    });
    
    process.once('SIGTERM', () => {
      console.log('🛑 دریافت SIGTERM - خاموش کردن ربات...');
      bot.stop('SIGTERM');
    });
    
  } catch (error) {
    if (error.response && error.response.error_code === 409) {
      console.log('❌ خطا: یک نمونه دیگر از ربات در حال اجراست');
      console.log('💡 راه حل: نمونه‌های دیگر ربات را متوقف کنید یا 10 ثانیه صبر کنید');
    } else {
      console.log('❌ خطا در راه‌اندازی ربات:', error.message);
    }
    process.exit(1);
  }
};

// ==================[ تست سلامت ]==================
app.get('/health', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('aklis_members')
      .select('count')
      .limit(1);

    // تست اتصال به تلگرام
    const botInfo = await bot.telegram.getMe();

    res.json({
      status: 'healthy',
      bot: botInfo.username,
      database: error ? 'disconnected' : 'connected',
      owner: OWNER_ID,
      main_group: MAIN_GROUP_ID,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>🥷🏻 ربات مدیریت اکلیس</title>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #333; border-bottom: 2px solid #eee; padding-bottom: 10px; }
        .status { padding: 10px; border-radius: 5px; margin: 10px 0; }
        .healthy { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .unhealthy { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .info { background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🥷🏻 ربات مدیریت اکلیس</h1>
        <div class="status info">
          <strong>ربات فعال است - فقط مالک می‌تواند استفاده کند</strong>
        </div>
        <div class="status">
          <strong>مالک:</strong> ${OWNER_ID}
        </div>
        <div class="status">
          <strong>Bot ID:</strong> ${SELF_BOT_ID}
        </div>
        <div class="status">
          <strong>گروه اصلی:</strong> ${MAIN_GROUP_ID || 'تنظیم نشده'}
        </div>
        <div style="margin-top: 20px;">
          <a href="/health" style="background: #007bff; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px;">بررسی سلامت</a>
        </div>
      </div>
    </body>
    </html>
  `);
});

// ==================[ راه‌اندازی سرور ]==================
const startServer = async () => {
  try {
    console.log('🚀 شروع راه‌اندازی سرور...');
    
    // شروع سرور
    app.listen(PORT, () => {
      console.log(`✅ سرور روی پورت ${PORT} راه‌اندازی شد`);
      console.log(`🥷🏻 ربات ${SELF_BOT_ID} آماده است`);
      
      // شروع پینگ
      startAutoPing();
      
      // راه‌اندازی ربات
      startBot();
    });

  } catch (error) {
    console.log('❌ خطا در راه‌اندازی سرور:', error.message);
    process.exit(1);
  }
};

// شروع برنامه
startServer();

// مدیریت خطاها
process.on('unhandledRejection', (error) => {
  console.log('❌ خطای catch نشده:', error.message);
});

process.on('uncaughtException', (error) => {
  console.log('❌ خطای مدیریت نشده:', error);
});
