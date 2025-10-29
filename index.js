const { Telegraf } = require('telegraf');
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

// بررسی وجود متغیرهای محیطی ضروری
if (!BOT_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
  console.log('❌ متغیرهای محیطی ضروری وجود ندارند');
  process.exit(1);
}

// راه‌اندازی سرویس‌ها
try {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const bot = new Telegraf(BOT_TOKEN);

  app.use(express.json());

  // ==================[ مدیریت خطاها ]==================
  bot.catch((err, ctx) => {
    console.log('❌ خطا در ربات:', err);
  });

  // ==================[ میدلور لاگ‌گیری ]==================
  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    const chatType = ctx.chat?.type;
    const text = ctx.message?.text || ctx.callbackQuery?.data || 'بدون متن';
    
    console.log(`📨 ${chatType} - کاربر ${userId} - متن: ${text.substring(0, 50)}`);
    
    try {
      await next();
    } catch (error) {
      console.log('❌ خطا در پردازش:', error.message);
    }
  });

  // ==================[ بررسی مالکیت ]==================
  const isOwner = (userId) => {
    return userId === OWNER_ID;
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
    
    return false;
  };

  // ==================[ دستورات اصلی - فارسی ]==================
  
  // شروع ربات
  bot.hears(['شروع', 'start', '/start'], async (ctx) => {
    try {
      if (!isOwner(ctx.from.id)) {
        await ctx.reply('من فقط از اربابم پیروی میکنم 🥷🏻');
        return;
      }
      
      await ctx.reply('🥷🏻 ربات مدیریت Eclis فعال است\n\nاز "راهنما" برای کمک استفاده کنید');
    } catch (error) {
      console.log('❌ خطا در دستور شروع:', error.message);
    }
  });

  // راهنما
  bot.hears(['راهنما', 'help', '/help'], async (ctx) => {
    try {
      if (!isOwner(ctx.from.id)) {
        await ctx.reply('من فقط از اربابم پیروی میکنم 🥷🏻');
        return;
      }
      
      const helpText = `🥷🏻 راهنمای ربات مدیریت Eclis

📋 دستورات فارسی:
"شروع" - شروع ربات
"راهنما" - این راهنما
"وضعیت" - وضعیت ربات
"وضعیت گروه ها" - لیست گروه‌ها
"بررسی وفاداری" - بررسی وفاداری اعضا
"تنظیم استیکر" - تنظیم استیکر
"لیست استیکرها" - لیست استیکرها

💡 ربات آماده خدمت‌رسانی است`;

      await ctx.reply(helpText);
    } catch (error) {
      console.log('❌ خطا در دستور راهنما:', error.message);
    }
  });

  // وضعیت ربات
  bot.hears(['وضعیت', 'status', '/status'], async (ctx) => {
    try {
      if (!isOwner(ctx.from.id)) {
        await ctx.reply('من فقط از اربابم پیروی میکنم 🥷🏻');
        return;
      }
      
      const subgroups = await getActiveSubgroups();
      
      const message = `🤖 وضعیت ربات مدیریت Eclis

📊 آمار:
• گروه‌های فعال: ${subgroups.length}
• زمان فعالیت: ${Math.round(process.uptime() / 60)} دقیقه
• حافظه استفاده شده: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB

✅ ربات در حال اجرا است`;

      await ctx.reply(message);
    } catch (error) {
      console.log('❌ خطا در دستور وضعیت:', error.message);
    }
  });

  // وضعیت گروه‌ها
  bot.hears(['وضعیت گروه ها', 'لیست گروه ها', 'groups', '/groups'], async (ctx) => {
    try {
      if (!isOwner(ctx.from.id)) {
        await ctx.reply('من فقط از اربابم پیروی میکنم 🥷🏻');
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
      });

      await ctx.reply(message);
    } catch (error) {
      console.log('❌ خطا در دستور وضعیت گروه‌ها:', error.message);
    }
  });

  // بررسی وفاداری
  bot.hears(['بررسی وفاداری', 'اسکن وفاداری', 'بررسی اعضا'], async (ctx) => {
    try {
      if (!isOwner(ctx.from.id)) {
        await ctx.reply('من فقط از اربابم پیروی میکنم 🥷🏻');
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

      await supabase
        .from('eclis_temp_data')
        .upsert({
          key: 'suspicious_list',
          data: { suspiciousList: suspiciousList },
          created_at: new Date().toISOString()
        }, { onConflict: 'key' });

    } catch (error) {
      console.log('❌ خطا در دستور بررسی وفاداری:', error.message);
      await ctx.reply('❌ خطا در بررسی وفاداری اعضا.');
    }
  });

  // تنظیم استیکر
  bot.hears(['تنظیم استیکر', 'setsticker', '/setsticker'], async (ctx) => {
    try {
      if (!isOwner(ctx.from.id)) {
        await ctx.reply('من فقط از اربابم پیروی میکنم 🥷🏻');
        return;
      }

      await ctx.reply('💡 برای تنظیم استیکر، یک استیکر رو ریپلای کن و بنویس:\n\n"تنظیم استیکر [نوع استیکر]"');
    } catch (error) {
      console.log('❌ خطا در دستور تنظیم استیکر:', error.message);
    }
  });

  // لیست استیکرها
  bot.hears(['لیست استیکرها', 'stickerlist', '/stickerlist'], async (ctx) => {
    try {
      if (!isOwner(ctx.from.id)) {
        await ctx.reply('من فقط از اربابم پیروی میکنم 🥷🏻');
        return;
      }

      const stickerConfigs = {
        'start_command': 'شروع ربات',
        'help_command': 'ارسال راهنما',
        'status_command': 'وضعیت ربات',
        'groups_command': 'لیست گروه‌ها',
        'loyalty_scan_command': 'بررسی وفاداری',
        'ban_suspicious': 'بن کردن مشکوک‌ها',
        'user_approved': 'تایید کاربر',
        'user_rejected': 'رد کاربر'
      };

      let message = '🎭 لیست استیکرهای قابل تنظیم:\n\n';
      
      for (const [key, description] of Object.entries(stickerConfigs)) {
        message += `• ${key} - ${description}\n`;
      }
      
      message += '\n💡 برای تنظیم استیکر:\n"تنظیم استیکر نوع_استیکر"';

      await ctx.reply(message);

    } catch (error) {
      console.log('❌ خطا در نمایش لیست استیکرها:', error.message);
      await ctx.reply('❌ خطا در نمایش لیست استیکرها');
    }
  });

  // تست ربات
  bot.hears(['تست', 'test', '/test'], async (ctx) => {
    try {
      await ctx.reply('✅ ربات پاسخ می‌دهد! همه چیز درست کار می‌کند.');
    } catch (error) {
      console.log('❌ خطا در دستور تست:', error.message);
    }
  });

  // ==================[ هندلر برای ریپلای استیکر ]==================
  bot.on('message', async (ctx) => {
    try {
      // اگر پیام ریپلای شده و متن مربوط به تنظیم استیکر داره
      if (ctx.message.reply_to_message && 
          ctx.message.reply_to_message.sticker &&
          ctx.message.text && 
          ctx.message.text.includes('تنظیم استیکر')) {
        
        if (!isOwner(ctx.from.id)) {
          await ctx.reply('من فقط از اربابم پیروی میکنم 🥷🏻');
          return;
        }

        const args = ctx.message.text.split(' ');
        const stickerType = args[2]; // تنظیم استیکر [نوع]
        
        if (!stickerType) {
          await ctx.reply('❌ لطفاً نوع استیکر را مشخص کنید:\n\n"تنظیم استیکر [نوع]"');
          return;
        }

        const stickerFileId = ctx.message.reply_to_message.sticker.file_id;
        
        // ذخیره استیکر در دیتابیس
        const { error } = await supabase
          .from('eclis_stickers')
          .upsert({
            sticker_type: stickerType,
            sticker_file_id: stickerFileId,
            is_active: true,
            updated_at: new Date().toISOString()
          }, { onConflict: 'sticker_type' });

        if (error) {
          await ctx.reply('❌ خطا در ذخیره استیکر');
          return;
        }

        await ctx.reply(`✅ استیکر برای "${stickerType}" با موفقیت تنظیم شد 🎭`);
        await ctx.replyWithSticker(stickerFileId);
      }
    } catch (error) {
      console.log('❌ خطا در پردازش ریپلای استیکر:', error.message);
    }
  });

  // ==================[ سیستم بررسی وفاداری ]==================
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
          let members = [];
          
          const admins = await ctx.telegram.getChatAdministrators(subgroup.chat_id);
          const adminUsers = admins.map(admin => admin.user).filter(user => !user.is_bot);
          
          // فقط ادمین‌ها رو چک می‌کنیم
          members = adminUsers;
          
          for (const member of members) {
            const isAdmin = true; // چون از لیست ادمین‌ها گرفتیم
            const hasSymbol = checkLoyaltySymbols(member.first_name) || checkLoyaltySymbols(member.username);

            await supabase
              .from('eclis_members')
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
            } else {
              suspiciousMembers++;
              suspiciousList.push({
                user_id: member.id,
                username: member.username,
                first_name: member.first_name,
                chat_title: subgroup.chat_title
              });
            }
            
            totalMembersScanned++;
          }
          
        } catch (error) {
          console.log(`❌ خطا در اسکن ${subgroup.chat_type} "${subgroup.chat_title}":`, error.message);
        }
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

  // ==================[ هندلر برای دکمه‌های اینلاین ]==================
  bot.action('ban_suspicious', async (ctx) => {
    try {
      if (ctx.from.id !== OWNER_ID) {
        await ctx.answerCbQuery('فقط آکی میتونه این کار رو بکنه!');
        return;
      }

      await ctx.answerCbQuery('در حال بن کردن اعضای مشکوک...');

      const { data: tempData, error } = await supabase
        .from('eclis_temp_data')
        .select('data')
        .eq('key', 'suspicious_list')
        .single();

      if (error || !tempData) {
        await ctx.editMessageText('❌ لیست مشکوک‌ها پیدا نشد');
        return;
      }

      const suspiciousList = tempData.data.suspiciousList || [];
      let bannedCount = 0;

      for (const user of suspiciousList) {
        try {
          const subgroups = await getActiveSubgroups();
          
          for (const subgroup of subgroups) {
            try {
              await ctx.telegram.banChatMember(subgroup.chat_id, user.user_id);
              console.log(`✅ کاربر ${user.user_id} از ${subgroup.chat_title} بن شد`);
            } catch (banError) {
              console.log(`❌ خطا در بن کردن کاربر ${user.user_id} از ${subgroup.chat_title}:`, banError.message);
            }
          }
          
          bannedCount++;
        } catch (userError) {
          console.log(`❌ خطا در پردازش کاربر ${user.user_id}:`, userError.message);
        }
      }

      await ctx.editMessageText(
        `✅ تمام افراد مشکوک با استفاده از تیغه های زیبام با نهایت لذت یکی یکی کشته میشن\n\n` +
        `📊 تعداد بن شده: ${bannedCount}`
      );

    } catch (error) {
      console.log('❌ خطا در بن کردن اعضای مشکوک:', error.message);
      await ctx.answerCbQuery('خطا در بن کردن اعضای مشکوک');
    }
  });

  bot.action('dont_ban_suspicious', async (ctx) => {
    try {
      if (ctx.from.id !== OWNER_ID) {
        await ctx.answerCbQuery('فقط آکی میتونه این کار رو بکنه!');
        return;
      }

      await ctx.answerCbQuery('اعضای مشکوک بن نشدند');
      await ctx.editMessageText('🔄 فرصتی دوباره...\n\nاعضای مشکوک میتونن تا دفعه بعدی زنده بمونن');

    } catch (error) {
      console.log('❌ خطا در عمل عدم بن:', error.message);
      await ctx.answerCbQuery('خطا در انجام عمل');
    }
  });

  // ==================[ راه‌اندازی ربات ]==================
  const startBot = async () => {
    try {
      console.log('🤖 شروع راه‌اندازی ربات...');
      
      const botInfo = await bot.telegram.getMe();
      console.log('✅ ربات شناسایی شد:', botInfo.first_name, `(@${botInfo.username})`);
      
      // تست اتصال به Supabase
      const { data, error } = await supabase.from('eclis_members').select('count').limit(1);
      if (error) {
        console.log('⚠️ خطا در اتصال به Supabase:', error.message);
      } else {
        console.log('✅ اتصال به Supabase برقرار شد');
      }
      
      // راه‌اندازی ربات
      await bot.launch({
        dropPendingUpdates: true,
        polling: {
          timeout: 30,
          limit: 100,
          allowed_updates: ['message', 'callback_query']
        }
      });
      
      console.log('✅ ربات با موفقیت فعال شد و در حال گوش دادن است...');
      
      // اطلاع به مالک
      try {
        await bot.telegram.sendMessage(
          OWNER_ID, 
          `🤖 ربات ${botInfo.first_name} فعال شد\n\n` +
          `✅ حالا می‌تونی از دستورات فارسی استفاده کنی:\n` +
          `• "راهنما" - نمایش راهنما\n` +
          `• "وضعیت" - وضعیت ربات\n` +
          `• "وضعیت گروه ها" - لیست گروه‌ها\n` +
          `• "بررسی وفاداری" - اسکن اعضا\n` +
          `• "تست" - تست ربات`
        );
        console.log('✅ پیام فعال شدن به مالک ارسال شد');
      } catch (error) {
        console.log('⚠️ نتوانستم به مالک اطلاع دهم:', error.message);
      }
      
    } catch (error) {
      console.log('❌ خطا در راه‌اندازی ربات:', error.message);
      process.exit(1);
    }
  };

  // ==================[ سرور اکسپرس ]==================
  app.get('/', (req, res) => {
    res.json({ 
      status: '✅ ربات فعال است',
      bot: 'Eclis Manager - فارسی',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()) + ' ثانیه'
    });
  });

  app.get('/health', (req, res) => {
    res.json({ 
      status: 'healthy',
      timestamp: new Date().toISOString() 
    });
  });

  // راه‌اندازی سرور و ربات
  app.listen(PORT, () => {
    console.log(`✅ سرور روی پورت ${PORT} راه‌اندازی شد`);
    startBot();
  });

  // مدیریت خروج تمیز
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

} catch (error) {
  console.log('❌ خطا در راه‌اندازی اولیه:', error.message);
  process.exit(1);
}
