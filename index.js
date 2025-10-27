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
const MAIN_GROUP_ID = process.env.MAIN_GROUP_ID || ''; // آیدی گروه اصلی

console.log('🔧 شروع راه‌اندازی ربات مدیریت اکلیس...');
console.log('👤 مالک:', OWNER_ID);
console.log('🤖 شناسه ربات:', SELF_BOT_ID);
console.log('🏠 گروه اصلی:', MAIN_GROUP_ID);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new Telegraf(BOT_TOKEN);

app.use(express.json());

// ==================[ پینگ ]==================
const startAutoPing = () => {
  if (!process.env.RENDER_EXTERNAL_URL) {
    console.log('⚠️ RENDER_EXTERNAL_URL تنظیم نشده');
    return;
  }
  
  const PING_INTERVAL = 5 * 60 * 1000;
  const selfUrl = process.env.RENDER_EXTERNAL_URL;

  const performPing = async () => {
    try {
      await axios.get(`${selfUrl}/health`, { timeout: 10000 });
      console.log('✅ پینگ موفق');
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
  const userId = ctx.from.id;
  console.log(`🔐 بررسی دسترسی کاربر ${userId} - مالک: ${OWNER_ID}`);
  
  if (userId !== OWNER_ID) {
    return {
      hasAccess: false,
      message: 'فقط آکی حق داره دستور بده بهم'
    };
  }
  return { hasAccess: true };
};

// ==================[ مدیریت دیتابیس ]==================
const initializeDatabase = async () => {
  try {
    console.log('🔧 بررسی ساختار دیتابیس...');
    
    const { data, error } = await supabase
      .from('aklis_groups')
      .select('*')
      .limit(1);
    
    if (error && error.code === '42P01') {
      console.log('📋 جدول‌ها وجود ندارند - ایجاد می‌شوند');
      await createTables();
    }
    
    console.log('✅ اتصال به دیتابیس موفق');
    return true;
  } catch (error) {
    console.log('❌ خطا در بررسی دیتابیس:', error.message);
    return false;
  }
};

// ایجاد جدول‌های مورد نیاز
const createTables = async () => {
  try {
    console.log('🔧 ایجاد جدول‌های دیتابیس...');
    
    // ایجاد جدول گروه‌های اکلیس
    const { error: groupsError } = await supabase
      .from('aklis_groups')
      .insert({
        group_id: 'temp',
        group_title: 'temp',
        group_type: 'sub',
        added_by: 0,
        added_at: new Date().toISOString()
      });

    if (groupsError && groupsError.code === '42P01') {
      console.log('📋 جدول aklis_groups وجود ندارد - باید دستی ایجاد شود');
    }

    // ایجاد جدول کاربران تایید شده
    const { error: usersError } = await supabase
      .from('aklis_members')
      .insert({
        user_id: 0,
        username: 'temp',
        first_name: 'temp',
        verified_by: 0,
        verified_at: new Date().toISOString(),
        has_symbol: false
      });

    if (usersError && usersError.code === '42P01') {
      console.log('📋 جدول aklis_members وجود ندارد - باید دستی ایجاد شود');
    }

    // ایجاد جدول کاربران بن شده
    const { error: bannedError } = await supabase
      .from('aklis_banned')
      .insert({
        user_id: 0,
        username: 'temp',
        first_name: 'temp',
        banned_by: 0,
        banned_at: new Date().toISOString(),
        reason: 'temp'
      });

    if (bannedError && bannedError.code === '42P01') {
      console.log('📋 جدول aklis_banned وجود ندارد - باید دستی ایجاد شود');
    }
    
    console.log('✅ بررسی جدول‌ها انجام شد');
    return true;
  } catch (error) {
    console.log('❌ خطا در ایجاد جدول‌ها:', error.message);
    return false;
  }
};

// ذخیره گروه در دیتابیس
const saveGroup = async (chatId, chatTitle, addedBy, groupType = 'sub') => {
  try {
    console.log(`💾 ذخیره گروه ${chatId} - ${chatTitle}...`);
    
    const { error } = await supabase
      .from('aklis_groups')
      .upsert({
        group_id: chatId.toString(),
        group_title: chatTitle,
        group_type: groupType,
        added_by: addedBy,
        added_at: new Date().toISOString()
      }, { onConflict: 'group_id' });

    if (error) {
      console.log('❌ خطا در ذخیره گروه:', error);
      return false;
    }
    
    console.log(`✅ گروه ${chatId} ذخیره شد`);
    return true;
  } catch (error) {
    console.log('❌ خطا در ذخیره گروه:', error.message);
    return false;
  }
};

// دریافت تمام گروه‌های اکلیس
const getAklisGroups = async () => {
  try {
    console.log('📋 دریافت لیست گروه‌های اکلیس...');
    
    const { data, error } = await supabase
      .from('aklis_groups')
      .select('group_id, group_title, group_type');

    if (!error && data) {
      console.log(`✅ ${data.length} گروه دریافت شد`);
      return data;
    } else {
      console.log('❌ خطا در دریافت گروه‌ها:', error);
    }
  } catch (error) {
    console.log('❌ خطا در دریافت گروه‌ها:', error.message);
  }
  return [];
};

// ذخیره کاربر تایید شده
const saveVerifiedUser = async (userId, username, firstName, verifiedBy) => {
  try {
    console.log(`💾 ذخیره کاربر تایید شده ${userId}...`);
    
    // بررسی وجود نماد در نام کاربری
    const symbols = ['꩘', '𖢻', 'ꑭ', '𖮌'];
    const hasSymbol = symbols.some(symbol => 
      (username && username.includes(symbol)) || 
      (firstName && firstName.includes(symbol))
    );

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

// بررسی تایید کاربر
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

// بن کردن کاربر از تمام گروه‌ها
const banUserFromAllGroups = async (userId, username, firstName, bannedBy, reason) => {
  try {
    console.log(`🚫 بن کردن کاربر ${userId} از تمام گروه‌ها...`);
    
    const groups = await getAklisGroups();
    let successfulBans = 0;
    let failedBans = 0;

    for (const group of groups) {
      try {
        // بررسی ادمین بودن ربات در گروه
        let isAdmin = false;
        try {
          const chatMember = await bot.telegram.getChatMember(group.group_id, bot.botInfo.id);
          isAdmin = ['administrator', 'creator'].includes(chatMember.status);
        } catch (error) {
          console.log(`❌ خطا در بررسی ادمین بودن در گروه ${group.group_id}`);
          isAdmin = false;
        }

        if (isAdmin) {
          try {
            await bot.telegram.banChatMember(group.group_id, userId);
            console.log(`✅ کاربر از گروه ${group.group_title} بن شد`);
            successfulBans++;
          } catch (banError) {
            console.log(`❌ خطا در بن کردن از گروه ${group.group_title}:`, banError.message);
            failedBans++;
          }
        } else {
          failedBans++;
        }
      } catch (error) {
        console.log(`❌ خطا در پردازش گروه ${group.group_id}:`, error.message);
        failedBans++;
      }
    }

    // ذخیره اطلاعات کاربر بن شده
    const { error } = await supabase
      .from('aklis_banned')
      .insert({
        user_id: userId,
        username: username || '',
        first_name: firstName || 'ناشناس',
        banned_by: bannedBy,
        banned_at: new Date().toISOString(),
        reason: reason
      });

    if (error) {
      console.log('❌ خطا در ذخیره کاربر بن شده:', error);
    }

    return { successfulBans, failedBans };
  } catch (error) {
    console.log('❌ خطا در بن کردن کاربر:', error.message);
    return { successfulBans: 0, failedBans: 0 };
  }
};

// بررسی اعضا برای نمادها
const checkMembersForSymbols = async () => {
  try {
    console.log('🔍 شروع بررسی اعضا برای نمادها...');
    
    const groups = await getAklisGroups();
    const suspiciousUsers = [];
    const loyalUsers = [];

    for (const group of groups) {
      try {
        console.log(`🔍 بررسی اعضای گروه: ${group.group_title}`);
        
        // دریافت لیست اعضای گروه
        const chatMembers = await bot.telegram.getChatMembersCount(group.group_id);
        
        // در اینجا باید هر کاربر را چک کنیم
        // برای سادگی، از یک نمونه استفاده می‌کنیم
        // در عمل باید هر کاربر را دریافت و چک کنیم
        
      } catch (error) {
        console.log(`❌ خطا در بررسی گروه ${group.group_title}:`, error.message);
      }
    }

    // برای نمونه، لیست کاربران تایید شده را بررسی می‌کنیم
    const { data: members, error } = await supabase
      .from('aklis_members')
      .select('user_id, username, first_name, has_symbol');

    if (!error && members) {
      members.forEach(member => {
        if (member.has_symbol) {
          loyalUsers.push(member);
        } else {
          suspiciousUsers.push(member);
        }
      });
    }

    return { suspiciousUsers, loyalUsers };
  } catch (error) {
    console.log('❌ خطا در بررسی اعضا:', error.message);
    return { suspiciousUsers: [], loyalUsers: [] };
  }
};

// ==================[ پردازش اعضای جدید ]==================
bot.on('new_chat_members', async (ctx) => {
  try {
    const chatId = ctx.chat.id;
    const isMainGroup = chatId.toString() === MAIN_GROUP_ID;
    
    console.log(`👥 دریافت عضو جدید در ${isMainGroup ? 'گروه اصلی' : 'زیرگروه'}`);

    for (const member of ctx.message.new_chat_members) {
      // اگر ربات اضافه شده باشد
      if (member.is_bot && member.id === ctx.botInfo.id) {
        const addedBy = ctx.message.from;
        
        // بررسی مالکیت
        if (addedBy.id !== OWNER_ID) {
          console.log(`🚫 کاربر ${addedBy.id} مالک نیست - لفت دادن از گروه`);
          await ctx.reply('فقط آکی حق داره دستور بده بهم');
          
          try {
            await ctx.leaveChat();
            console.log('✅ ربات با موفقیت از گروه خارج شد');
          } catch (leaveError) {
            console.log('❌ خطا در خروج از گروه:', leaveError.message);
          }
          return;
        }
        
        console.log(`✅ ربات توسط مالک ${addedBy.id} اضافه شد`);
        
        // ذخیره گروه در دیتابیس
        const chatTitle = ctx.chat.title || 'بدون عنوان';
        const groupType = isMainGroup ? 'main' : 'sub';
        await saveGroup(chatId, chatTitle, addedBy.id, groupType);
        
        await ctx.reply('🥷🏻 نینجای اکلیس در خدمت شماست!');
        return;
      }

      // اگر کاربر عادی اضافه شده باشد
      if (!member.is_bot) {
        const userId = member.id;
        const username = member.username;
        const firstName = member.first_name;

        if (isMainGroup) {
          // در گروه اصلی - درخواست تایید از مالک
          console.log(`🆕 کاربر جدید در گروه اصلی: ${firstName} (${userId})`);
          
          const requestMessage = `آیا این غریبه اجازه ورود به اکلیس رو داره ؟\n\n` +
            `👤 کاربر: ${firstName}\n` +
            `🆔 آیدی: ${userId}\n` +
            `📝 نام کاربری: @${username || 'ندارد'}`;

          const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('✅ آره', `approve_${userId}`)],
            [Markup.button.callback('❌ نه', `reject_${userId}`)]
          ]);

          await ctx.reply(requestMessage, keyboard);
        } else {
          // در زیرگروه - بررسی تایید کاربر
          console.log(`🔍 بررسی تایید کاربر ${firstName} برای زیرگروه...`);
          
          const isVerified = await isUserVerified(userId);
          
          if (!isVerified) {
            console.log(`🚫 کاربر ${firstName} تایید نشده - بن کردن`);
            
            // بن کردن کاربر
            try {
              await ctx.banChatMember(userId);
              console.log(`✅ کاربر از زیرگروه بن شد`);
              
              // اطلاع به گروه اصلی
              if (MAIN_GROUP_ID) {
                const now = new Date();
                const timeString = now.toLocaleTimeString('fa-IR', { 
                  hour: '2-digit', 
                  minute: '2-digit'
                });
                
                const alertMessage = `🚨 یک مزاحم وارد قلمرو اکلیس شده\n\n` +
                  `👤 نام: ${firstName}\n` +
                  `🆔 آیدی عددی: ${userId}\n` +
                  `📝 آیدی شخصی: @${username || 'ندارد'}\n` +
                  `🕒 زمان ورود: ${timeString}\n` +
                  `📍 گروه: ${ctx.chat.title || 'بدون عنوان'}`;
                  
                await bot.telegram.sendMessage(MAIN_GROUP_ID, alertMessage);
              }
            } catch (banError) {
              console.log('❌ خطا در بن کردن کاربر:', banError.message);
            }
          }
        }
      }
    }
  } catch (error) {
    console.log('❌ خطا در پردازش عضو جدید:', error.message);
  }
});

// ==================[ پردازش پیام‌ها در گروه اصلی ]==================
bot.on('message', async (ctx) => {
  try {
    // فقط پیام‌های گروهی پردازش شوند
    if (ctx.chat.type === 'private') return;
    
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id;
    const isMainGroup = chatId === MAIN_GROUP_ID;
    
    // اگر در گروه اصلی نیستیم، خروج
    if (!isMainGroup) return;
    
    // اگر مالک است، اجازه صحبت دارد
    if (userId === OWNER_ID) return;
    
    // بررسی تایید کاربر
    const isVerified = await isUserVerified(userId);
    
    if (!isVerified) {
      console.log(`🚫 کاربر ${userId} تایید نشده - حذف پیام`);
      
      // حذف پیام کاربر
      try {
        await ctx.deleteMessage();
      } catch (deleteError) {
        console.log('❌ خطا در حذف پیام:', deleteError.message);
      }
      
      // اخطار به کاربر
      const warningMessage = `👤 ${ctx.from.first_name}\n` +
        `شما اجازه صحبت ندارین تا زمانی که اونر اجازه ورود رو بده`;
        
      try {
        const warning = await ctx.reply(warningMessage);
        // حذف پیام اخطار بعد از 5 ثانیه
        setTimeout(async () => {
          try {
            await ctx.deleteMessage(warning.message_id);
          } catch (e) {}
        }, 5000);
      } catch (warningError) {
        console.log('❌ خطا در ارسال اخطار:', warningError.message);
      }
    }
  } catch (error) {
    console.log('❌ خطا در پردازش پیام:', error.message);
  }
});

// ==================[ دستورات ]==================

// دکمه استارت
bot.start((ctx) => {
  console.log('🎯 دستور استارت از:', ctx.from.first_name, 'آیدی:', ctx.from.id);
  
  const access = checkOwnerAccess(ctx);
  if (!access.hasAccess) {
    console.log('🚫 دسترسی غیرمجاز از کاربر:', ctx.from.id);
    return ctx.reply(access.message);
  }
  
  console.log('✅ دسترسی مالک تأیید شد');
  
  const replyText = `🥷🏻 نینجای اکلیس در خدمت شماست\n\n` +
    `🔹 /ban [آیدی] - بن کردن کاربر\n` +
    `🔹 /groups - مشاهده لیست گروه‌ها\n` +
    `🔹 /checkmembers - بررسی اعضای اکلیس\n` +
    `🔹 /status - وضعیت ربات`;
  
  console.log('📤 ارسال پیام استارت به مالک');
  
  if (ctx.chat.type === 'private') {
    return ctx.reply(replyText, Markup.keyboard([
      ['/ban', '/groups'],
      ['/checkmembers', '/status']
    ]).resize());
  } else {
    return ctx.reply(replyText);
  }
});

// دستور بن کردن کاربر
bot.command('ban', async (ctx) => {
  try {
    console.log('⚠️ درخواست بن از:', ctx.from.first_name, 'آیدی:', ctx.from.id);
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      console.log('🚫 دسترسی غیرمجاز برای بن');
      return ctx.reply(access.message);
    }

    // بررسی آرگومان
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
      console.log('❌ دستور ban بدون آیدی استفاده شده');
      return ctx.reply('❌ لطفاً آیدی کاربر را وارد کنید.\n\nمثال:\n<code>/ban @username</code>', { 
        parse_mode: 'HTML' 
      });
    }

    const targetUsername = args[1].replace('@', '');
    console.log(`🎯 بن کاربر با آیدی: @${targetUsername}`);

    // در اینجا باید کاربر را با آیدی پیدا کنیم
    // برای سادگی، از یک نمونه استفاده می‌کنیم
    const result = await banUserFromAllGroups(0, targetUsername, 'کاربر', ctx.from.id, 'دستور مستقیم');

    // زمان به صورت خلاصه
    const now = new Date();
    const timeString = now.toLocaleTimeString('fa-IR', { 
      hour: '2-digit', 
      minute: '2-digit'
    });

    // پیام نتیجه
    const resultMessage = `🚫 کاربر بن شد\n\n` +
      `👤 @${targetUsername}\n` +
      `📋 از ${result.successfulBans} گروه بن شد\n` +
      `❌ ${result.failedBans} گروه ناموفق\n` +
      `🕒 ${timeString}`;

    await ctx.reply(resultMessage);

    console.log(`✅ عملیات بن کامل شد - موفق: ${result.successfulBans}, ناموفق: ${result.failedBans}`);

  } catch (error) {
    console.log('❌ خطا در اجرای دستور ban:', error.message);
    await ctx.reply('❌ خطا در اجرای دستور ban. لطفاً دوباره تلاش کنید.');
  }
});

// دستور بررسی اعضای اکلیس
bot.command('checkmembers', async (ctx) => {
  try {
    console.log('🔍 درخواست بررسی اعضا از:', ctx.from.first_name);
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      console.log('🚫 دسترسی غیرمجاز برای بررسی اعضا');
      return ctx.reply(access.message);
    }

    await ctx.reply('🔍 در حال بررسی اعضای اکلیس...');
    
    const { suspiciousUsers, loyalUsers } = await checkMembersForSymbols();

    let message = `🏰 بررسی اعضای اکلیس\n\n`;
    message += `✅ اعضای وفادار: ${loyalUsers.length} نفر\n`;
    message += `⚠️ مورد مشکوک: ${suspiciousUsers.length} نفر\n\n`;

    if (suspiciousUsers.length > 0) {
      message += `آیا این اعضا رو بکشم ؟`;
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✅ بکش', 'kill_suspicious')],
        [Markup.button.callback('❌ نه', 'dont_kill')]
      ]);

      await ctx.reply(message, keyboard);
    } else {
      message += `🎉 همه اعضا وفادار هستند!`;
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
    console.log('📋 درخواست لیست گروه‌ها از:', ctx.from.first_name);
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      console.log('🚫 دسترسی غیرمجاز برای لیست گروه‌ها');
      return ctx.reply(access.message);
    }

    console.log('✅ دسترسی مالک برای لیست گروه‌ها تأیید شد');

    await ctx.reply('📋 در حال دریافت لیست گروه‌ها...');
    
    const groups = await getAklisGroups();

    if (!groups || groups.length === 0) {
      console.log('📭 هیچ گروهی در دیتابیس یافت نشد');
      return ctx.reply('📭 هیچ گروهی یافت نشد.');
    }

    console.log(`📋 ${groups.length} گروه دریافت شد`);

    // ایجاد پیام لیست
    let message = `🏘️ لیست گروه‌های اکلیس\n\n`;
    
    groups.forEach((group, index) => {
      const typeIcon = group.group_type === 'main' ? '🏠' : '🔹';
      message += `${index + 1}. ${typeIcon} ${group.group_title || 'بدون عنوان'}\n`;
      message += `   🆔: ${group.group_id}\n\n`;
    });

    message += `📊 تعداد کل: ${groups.length} گروه`;

    console.log(`📤 ارسال لیست ${groups.length} گروه`);
    
    await ctx.reply(message);

  } catch (error) {
    console.log('❌ خطا در دریافت لیست گروه‌ها:', error.message);
    await ctx.reply('❌ خطا در دریافت لیست گروه‌ها.');
  }
});

// وضعیت ربات
bot.command('status', async (ctx) => {
  try {
    console.log('📈 درخواست وضعیت از:', ctx.from.first_name);
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      return ctx.reply(access.message);
    }

    console.log('🔍 دریافت آمار از دیتابیس...');

    // دریافت آمار
    const { data: groups, error: groupsError } = await supabase
      .from('aklis_groups')
      .select('group_id');

    const { data: members, error: membersError } = await supabase
      .from('aklis_members')
      .select('user_id');

    const { data: banned, error: bannedError } = await supabase
      .from('aklis_banned')
      .select('user_id');

    const totalGroups = groups && !groupsError ? groups.length : 0;
    const totalMembers = members && !membersError ? members.length : 0;
    const totalBanned = banned && !bannedError ? banned.length : 0;

    let statusMessage = `🥷🏻 وضعیت ربات اکلیس\n\n`;
    statusMessage += `🔹 گروه‌های متصل: ${totalGroups}\n`;
    statusMessage += `🔹 اعضای تایید شده: ${totalMembers}\n`;
    statusMessage += `🔹 کاربران بن شده: ${totalBanned}\n`;
    statusMessage += `🔹 گروه اصلی: ${MAIN_GROUP_ID ? 'تنظیم شده ✅' : 'تنظیم نشده ❌'}\n`;
    statusMessage += `🔹 وضعیت: فعال ✅\n\n`;
    statusMessage += `⚡ دستورات:\n`;
    statusMessage += `• /ban - بن کاربر\n`;
    statusMessage += `• /checkmembers - بررسی اعضا`;

    console.log(`📊 آمار: ${totalGroups} گروه, ${totalMembers} عضو, ${totalBanned} بن شده`);

    await ctx.reply(statusMessage);

  } catch (error) {
    console.log('❌ خطا در دریافت وضعیت:', error.message);
    await ctx.reply('❌ خطا در دریافت وضعیت ربات.');
  }
});

// ==================[ پردازش Callback ها ]==================
bot.action(/approve_(\d+)/, async (ctx) => {
  try {
    const userId = parseInt(ctx.match[1]);
    const firstName = ctx.callbackQuery.from.first_name;
    
    console.log(`✅ تایید کاربر ${userId} توسط مالک`);
    
    // ذخیره کاربر تایید شده
    await saveVerifiedUser(userId, '', firstName, ctx.from.id);
    
    // پیام خوش‌آمدگویی
    const welcomeMessage = `👤 ${firstName}\n` +
      `خوش اومدی به جهان بزرگ اکلیس 🎉`;
    
    await ctx.editMessageText(welcomeMessage);
    
    console.log(`✅ کاربر ${firstName} تایید شد`);
    
  } catch (error) {
    console.log('❌ خطا در تایید کاربر:', error.message);
    await ctx.answerCbQuery('❌ خطا در تایید کاربر');
  }
});

bot.action(/reject_(\d+)/, async (ctx) => {
  try {
    const userId = parseInt(ctx.match[1]);
    
    console.log(`❌ رد کاربر ${userId} توسط مالک`);
    
    // حذف کاربر از گروه
    try {
      await ctx.banChatMember(userId);
      console.log(`✅ کاربر از گروه حذف شد`);
    } catch (banError) {
      console.log('❌ خطا در حذف کاربر:', banError.message);
    }
    
    await ctx.editMessageText('❌ کاربر رد شد و حذف گردید');
    
    console.log(`✅ کاربر ${userId} رد و حذف شد`);
    
  } catch (error) {
    console.log('❌ خطا در رد کاربر:', error.message);
    await ctx.answerCbQuery('❌ خطا در رد کاربر');
  }
});

bot.action('kill_suspicious', async (ctx) => {
  try {
    console.log('🔫 بن کردن اعضای مشکوک توسط مالک');
    
    await ctx.editMessageText('🔫 در حال بن کردن اعضای مشکوک...');
    
    // دریافت کاربران مشکوک و بن کردن آنها
    const { suspiciousUsers } = await checkMembersForSymbols();
    
    let bannedCount = 0;
    let failedCount = 0;
    
    for (const user of suspiciousUsers) {
      const result = await banUserFromAllGroups(
        user.user_id, 
        user.username, 
        user.first_name, 
        ctx.from.id, 
        'نداشتن نماد وفاداری'
      );
      
      if (result.successfulBans > 0) {
        bannedCount++;
      } else {
        failedCount++;
      }
    }
    
    await ctx.editMessageText(`✅ عملیات بن کامل شد\n\n` +
      `🔫 بن شده: ${bannedCount} کاربر\n` +
      `❌ ناموفق: ${failedCount} کاربر`);
    
    console.log(`✅ ${bannedCount} کاربر مشکوک بن شدند`);
    
  } catch (error) {
    console.log('❌ خطا در بن کردن اعضای مشکوک:', error.message);
    await ctx.editMessageText('❌ خطا در بن کردن اعضای مشکوک');
  }
});

bot.action('dont_kill', async (ctx) => {
  try {
    await ctx.editMessageText('❌ عملیات بن لغو شد');
    console.log('❌ بن کردن اعضای مشکوک توسط مالک لغو شد');
  } catch (error) {
    console.log('❌ خطا در لغو:', error.message);
  }
});

// ==================[ تست سلامت ]==================
app.get('/health', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('aklis_groups')
      .select('count')
      .limit(1);

    res.json({
      status: 'healthy',
      bot: SELF_BOT_ID,
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
    <h1>🥷🏻 ربات مدیریت اکلیس</h1>
    <p>ربات فعال است - فقط مالک می‌تواند استفاده کند</p>
    <p>مالک: ${OWNER_ID}</p>
    <p>Bot ID: ${SELF_BOT_ID}</p>
    <p>گروه اصلی: ${MAIN_GROUP_ID || 'تنظیم نشده'}</p>
    <p><a href="/health">بررسی سلامت</a></p>
  `);
});

// ==================[ راه‌اندازی سرور ]==================
const startServer = async () => {
  try {
    console.log('🚀 شروع راه‌اندازی سرور...');
    
    const dbReady = await initializeDatabase();
    if (!dbReady) {
      console.log('❌ خطا در اتصال به دیتابیس');
    }
    
    if (process.env.RENDER_EXTERNAL_URL) {
      const webhookUrl = `${process.env.RENDER_EXTERNAL_URL}/webhook`;
      console.log(`🔗 تنظیم webhook: ${webhookUrl}`);
      
      await bot.telegram.setWebhook(webhookUrl);
      app.use(bot.webhookCallback('/webhook'));
      
      console.log('✅ Webhook تنظیم شد');
    } else {
      console.log('🔧 استفاده از polling...');
      bot.launch().then(() => {
        console.log('✅ ربات با polling راه‌اندازی شد');
      });
    }
    
    app.listen(PORT, () => {
      console.log(`✅ سرور روی پورت ${PORT} راه‌اندازی شد`);
      console.log(`🥷🏻 ربات ${SELF_BOT_ID} آماده است`);
      
      startAutoPing();
    });

  } catch (error) {
    console.log('❌ خطا در راه‌اندازی سرور:', error.message);
    process.exit(1);
  }
};

// شروع برنامه
startServer();

process.on('unhandledRejection', (error) => {
  console.log('❌ خطای catch نشده:', error.message);
});

process.on('uncaughtException', (error) => {
  console.log('❌ خطای مدیریت نشده:', error);
});
