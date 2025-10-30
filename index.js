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
    
    // سمبل‌های وفاداری
    const symbols = ['꩘', '𖮌', 'ꑭ', '𖢻'];
    const textStr = String(text).normalize();
    
    for (const symbol of symbols) {
      if (textStr.includes(symbol)) {
        return true;
      }
    }
    
    return false;
  };

  // ==================[ سیستم استیکرها ]==================
  const getSticker = async (stickerType) => {
    try {
      const { data, error } = await supabase
        .from('eclis_stickers')
        .select('sticker_file_id, is_active')
        .eq('sticker_type', stickerType)
        .single();

      if (error || !data || !data.is_active) {
        return null;
      }

      return data.sticker_file_id;
    } catch (error) {
      console.log('❌ خطا در دریافت استیکر:', error.message);
      return null;
    }
  };

  const sendStickerAfterMessage = async (ctx, stickerType) => {
    try {
      const stickerId = await getSticker(stickerType);
      if (stickerId) {
        await ctx.replyWithSticker(stickerId);
        console.log(`🎭 استیکر ${stickerType} ارسال شد`);
        return true;
      }
      return false;
    } catch (error) {
      console.log(`❌ خطا در ارسال استیکر ${stickerType}:`, error.message);
      return false;
    }
  };

  // تابع برای ارسال استیکر بدون context
  const sendStickerToChatAfterMessage = async (chatId, stickerType) => {
    try {
      const stickerId = await getSticker(stickerType);
      if (stickerId) {
        await bot.telegram.sendSticker(chatId, stickerId);
        console.log(`🎭 استیکر ${stickerType} به چت ${chatId} ارسال شد`);
        return true;
      }
      return false;
    } catch (error) {
      console.log(`❌ خطا در ارسال استیکر ${stickerType} به چت ${chatId}:`, error.message);
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

  // ==================[ سیستم مدیریت کاربران تایید شده ]==================
  const isUserApproved = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('eclis_approved_users')
        .select('user_id')
        .eq('user_id', userId)
        .eq('is_approved', true)
        .single();

      if (error) {
        return false;
      }

      return !!data;
    } catch (error) {
      console.log('❌ خطا در بررسی کاربر تایید شده:', error.message);
      return false;
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

  // ==================[ دستورات اصلی - فارسی ]==================
  
  // شروع ربات
  bot.hears(['شروع', 'start', '/start'], async (ctx) => {
    try {
      if (!isOwner(ctx.from.id)) {
        await ctx.reply('من فقط از اربابم پیروی میکنم 🥷🏻');
        return;
      }
      
      await ctx.reply('🥷🏻 ربات مدیریت Eclis فعال است\n\nاز "راهنما" برای کمک استفاده کنید');
      await sendStickerAfterMessage(ctx, 'start_command');
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
      await sendStickerAfterMessage(ctx, 'help_command');
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
      await sendStickerAfterMessage(ctx, 'status_command');
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
      await sendStickerAfterMessage(ctx, 'groups_command');
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

      // ارسال استیکر بررسی وفاداری بعد از پیام
      await sendStickerAfterMessage(ctx, 'loyalty_scan_command');

      // اگر کاربر مشکوکی وجود ندارد
      if (suspiciousMembers === 0) {
        try {
          await ctx.deleteMessage(tempMessage.message_id);
        } catch (e) {}
        message += `✅ هیچ عضو مشکوکی پیدا نشد! همه وفادار هستند.`;
        await ctx.reply(message);
        return;
      }
      
      // اگر کاربر مشکوک وجود دارد
      message += `آیا میخوای تمام اعضای مشکوک توی Eclis رو بکشم ؟`;

      try {
        await ctx.deleteMessage(tempMessage.message_id);
      } catch (e) {}

      const resultMessage = await ctx.reply(message, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🥷 بکششون', callback_data: 'ban_suspicious' },
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
        'dont_ban_suspicious': 'بن نکردن مشکوک‌ها',
        'user_approved': 'تایید کاربر',
        'user_rejected': 'رد کاربر',
        'new_user_question': 'سوال برای کاربر جدید',
        'user_cannot_speak': 'کاربر اجازه صحبت ندارد'
      };

      let message = '🎭 لیست استیکرهای قابل تنظیم:\n\n';
      
      for (const [key, description] of Object.entries(stickerConfigs)) {
        const hasSticker = await getSticker(key);
        const status = hasSticker ? '✅' : '❌';
        message += `${status} ${key} - ${description}\n`;
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
      if (!isOwner(ctx.from.id)) {
        await ctx.reply('من فقط از اربابم پیروی میکنم 🥷🏻');
        return;
      }
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
          // دریافت تمام اعضای گروه
          let members = [];
          try {
            const chatMembers = await ctx.telegram.getChatMembersCount(subgroup.chat_id);
            console.log(`👥 گروه ${subgroup.chat_title} دارای ${chatMembers} عضو`);
            
            // برای گروه‌های کوچک می‌توانیم تمام اعضا را دریافت کنیم
            if (chatMembers <= 200) {
              // این یک راه ساده است، برای گروه‌های بزرگتر نیاز به pagination داریم
              const admins = await ctx.telegram.getChatAdministrators(subgroup.chat_id);
              members = admins.map(admin => admin.user);
              
              // اضافه کردن سایر اعضا (این بخش ساده شده است)
              // در عمل برای گروه‌های بزرگ باید از pagination استفاده کرد
            }
          } catch (error) {
            console.log(`❌ خطا در دریافت اعضای گروه ${subgroup.chat_title}:`, error.message);
          }
          
          // اگر نتوانستیم اعضا را دریافت کنیم، فقط ادمین‌ها را چک می‌کنیم
          if (members.length === 0) {
            const admins = await ctx.telegram.getChatAdministrators(subgroup.chat_id);
            members = admins.map(admin => admin.user);
          }
          
          for (const member of members) {
            const hasSymbol = checkLoyaltySymbols(member.first_name) || 
                             checkLoyaltySymbols(member.username) ||
                             checkLoyaltySymbols(member.last_name);

            await supabase
              .from('eclis_members')
              .upsert({
                user_id: member.id,
                username: member.username || '',
                first_name: member.first_name || 'ناشناس',
                last_name: member.last_name || '',
                has_symbol: hasSymbol,
                is_admin: member.is_admin || false,
                last_checked: new Date().toISOString()
              }, { onConflict: 'user_id' });

            if (hasSymbol) {
              loyalMembers++;
              loyalList.push({
                user_id: member.id,
                username: member.username,
                first_name: member.first_name,
                chat_title: subgroup.chat_title
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

      // ارسال استیکر بن کردن بعد از پیام
      await sendStickerToChatAfterMessage(ctx.chat.id, 'ban_suspicious');

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

      // ارسال استیکر بن نکردن بعد از پیام
      await sendStickerToChatAfterMessage(ctx.chat.id, 'dont_ban_suspicious');

    } catch (error) {
      console.log('❌ خطا در عمل عدم بن:', error.message);
      await ctx.answerCbQuery('خطا در انجام عمل');
    }
  });

  // ==================[ سیستم مدیریت کاربران جدید در گروه اصلی ]==================
  bot.on('new_chat_members', async (ctx) => {
    try {
      const chatId = ctx.chat.id.toString();
      
      // فقط در گروه اصلی این سیستم فعال باشد
      if (chatId !== MAIN_GROUP_ID) {
        return;
      }

      const newMembers = ctx.message.new_chat_members;
      
      for (const member of newMembers) {
        // اگر ربات خودش باشد، عبور کند
        if (member.id === bot.botInfo.id) {
          continue;
        }

        // ارسال استیکر کاربر جدید
        await sendStickerToChatAfterMessage(chatId, 'new_user_question');

        const questionMessage = await ctx.reply(
          `مسافر [${member.first_name || 'بدون نام'}](tg://user?id=${member.id}) وارد Eclis شد\n\n` +
          `[آکی](tg://user?id=${OWNER_ID}) اجازه ورود به Eclis رو دارن ؟`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: 'آره ، اجازه هست', callback_data: `approve_${member.id}` },
                  { text: 'نه ، اجازه نداره', callback_data: `reject_${member.id}` }
                ]
              ]
            }
          }
        );

        // ذخیره کاربر در انتظار تایید
        await supabase
          .from('eclis_pending_users')
          .upsert({
            user_id: member.id,
            username: member.username || '',
            first_name: member.first_name || 'ناشناس',
            chat_id: chatId,
            question_message_id: questionMessage.message_id,
            joined_at: new Date().toISOString()
          }, { onConflict: 'user_id' });

        // محدود کردن کاربر تا زمان تایید
        try {
          await ctx.telegram.restrictChatMember(chatId, member.id, {
            permissions: {
              can_send_messages: false,
              can_send_media_messages: false,
              can_send_other_messages: false,
              can_add_web_page_previews: false
            }
          });
        } catch (restrictError) {
          console.log(`❌ خطا در محدود کردن کاربر ${member.id}:`, restrictError.message);
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
      
      // فقط در گروه اصلی بررسی شود
      if (chatId !== MAIN_GROUP_ID) {
        return;
      }

      // اگر مالک باشد، نیاز به بررسی نیست
      if (userId === OWNER_ID) {
        return;
      }

      // بررسی آیا کاربر تایید شده است
      const isApproved = await isUserApproved(userId);
      
      if (!isApproved) {
        // حذف پیام کاربر
        try {
          await ctx.deleteMessage();
        } catch (deleteError) {
          console.log(`❌ خطا در حذف پیام کاربر ${userId}:`, deleteError.message);
        }

        // ارسال اخطار
        const warningMessage = await ctx.reply(
          `[${ctx.from.first_name || 'بدون نام'}](tg://user?id=${userId}) تا زمانی تایید نشدین نمیتونین از جاتون تکون بخورین`,
          { parse_mode: 'Markdown' }
        );

        // ارسال استیکر اخطار
        await sendStickerToChatAfterMessage(chatId, 'user_cannot_speak');

        // حذف پیام اخطار بعد از 5 ثانیه
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

  // ==================[ هندلر برای تایید کاربران ]==================
  bot.action(/approve_(\d+)/, async (ctx) => {
    try {
      const userId = parseInt(ctx.match[1]);
      
      if (ctx.from.id !== OWNER_ID) {
        await ctx.answerCbQuery('فقط آکی میتونه این کار رو بکنه!');
        return;
      }

      // تایید کاربر
      const approved = await approveUser(userId, OWNER_ID);
      
      if (!approved) {
        await ctx.answerCbQuery('خطا در تایید کاربر');
        return;
      }

      // حذف از لیست انتظار
      await supabase
        .from('eclis_pending_users')
        .delete()
        .eq('user_id', userId);

      // برداشتن محدودیت‌ها
      try {
        await ctx.telegram.restrictChatMember(MAIN_GROUP_ID, userId, {
          permissions: {
            can_send_messages: true,
            can_send_media_messages: true,
            can_send_other_messages: true,
            can_add_web_page_previews: true
          }
        });
      } catch (restrictError) {
        console.log(`❌ خطا در برداشتن محدودیت کاربر ${userId}:`, restrictError.message);
      }

      // دریافت اطلاعات کاربر
      let userInfo = '';
      try {
        const user = await ctx.telegram.getChat(userId);
        userInfo = user.first_name || 'کاربر';
      } catch (error) {
        userInfo = 'کاربر';
      }

      await ctx.editMessageText(`✅ مسافر ${userInfo} به Eclis خوش اومدی`);
      
      // ارسال استیکر تایید کاربر
      await sendStickerToChatAfterMessage(ctx.chat.id, 'user_approved');
      
      await ctx.answerCbQuery('کاربر تایید شد');

    } catch (error) {
      console.log('❌ خطا در تایید کاربر:', error.message);
      await ctx.answerCbQuery('خطا در تایید کاربر');
    }
  });

  bot.action(/reject_(\d+)/, async (ctx) => {
    try {
      const userId = parseInt(ctx.match[1]);
      
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

      // حذف از لیست انتظار
      await supabase
        .from('eclis_pending_users')
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

      await ctx.editMessageText(`🚫 مسافر ${userInfo} از Eclis با موفقیت بیرون رانده شد`);
      
      // ارسال استیکر رد کاربر
      await sendStickerToChatAfterMessage(ctx.chat.id, 'user_rejected');
      
      await ctx.answerCbQuery('کاربر اخراج شد');

    } catch (error) {
      console.log('❌ خطا در رد کاربر:', error.message);
      await ctx.answerCbQuery('خطا در رد کاربر');
    }
  });

  // ==================[ سیستم مدیریت عضویت در زیرگروه‌ها ]==================
  bot.on('new_chat_members', async (ctx) => {
    try {
      const chatId = ctx.chat.id.toString();
      
      // اگر گروه اصلی نیست (یعنی یکی از زیرگروه‌هاست)
      if (chatId === MAIN_GROUP_ID) {
        return;
      }

      const newMembers = ctx.message.new_chat_members;
      
      for (const member of newMembers) {
        // اگر ربات خودش باشد، عبور کند
        if (member.id === bot.botInfo.id) {
          continue;
        }

        // بررسی آیا کاربر تایید شده است
        const isApproved = await isUserApproved(member.id);
        
        if (!isApproved) {
          // اگر کاربر تایید نشده، از زیرگروه اخراج شود
          try {
            await ctx.telegram.banChatMember(chatId, member.id);
            console.log(`🚫 کاربر ${member.id} از زیرگروه ${chatId} اخراج شد (تایید نشده)`);
          } catch (banError) {
            console.log(`❌ خطا در اخراج کاربر ${member.id} از زیرگروه:`, banError.message);
          }
        }
        // اگر کاربر تایید شده باشد، اجازه ورود دارد
      }
    } catch (error) {
      console.log('❌ خطا در پردازش عضویت در زیرگروه:', error.message);
    }
  });

  // ==================[ هندلر برای وقتی که ربات به چتی اضافه می‌شود ]==================
  bot.on('my_chat_member', async (ctx) => {
    try {
      const chatMember = ctx.myChatMember.new_chat_member;
      const chat = ctx.myChatMember.chat;
      const chatId = chat.id.toString();
      const addedBy = ctx.myChatMember.from.id;
      
      // اگر ربات به عنوان ادمین یا عضو اضافه شده
      if (chatMember.status === 'administrator' || chatMember.status === 'member') {
        if (addedBy === OWNER_ID) {
          try {
            const currentMember = await ctx.telegram.getChatMember(chatId, bot.botInfo.id);
            
            // اگر ربات ادمین باشد
            if (currentMember.status === 'administrator' || currentMember.status === 'creator') {
              const chatType = chat.type === 'channel' ? 'کانال' : 'گروه';
              const chatTitle = chat.title || 'بدون عنوان';
              
              const added = await addChatToSubgroups(chatId, chatTitle, chatType, OWNER_ID);
              
              if (added) {
                await ctx.reply('🥷🏻 این بخش به بخش های تحت نظارت نینجای چهارم اضافه شد');
                await sendStickerAfterMessage(ctx, 'added_by_owner');
              }
            }
          } catch (error) {
            console.log(`❌ خطا در بررسی چت ${chatId}:`, error.message);
          }
        } else {
          await ctx.reply('🚫 این ربات متعلق به مجموعه بزرگ Eclis است و جز آکی کسی نمیتونه به من دستور بده');
          
          try {
            await ctx.telegram.leaveChat(chatId);
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
          allowed_updates: ['message', 'callback_query', 'my_chat_member']
        }
      });
      
      console.log('✅ ربات با موفقیت فعال شد و در حال گوش دادن است...');
      
      // اطلاع به مالک
      try {
        await bot.telegram.sendMessage(
          OWNER_ID, 
          `🤖 ربات ${botInfo.first_name} فعال شد\n\n` +
          `✅ سیستم مدیریت کامل Eclis راه‌اندازی شد:\n` +
          `• مدیریت کاربران جدید در گروه اصلی\n` +
          `• سیستم تایید کاربران\n` +
          `• قفل زیرگروه‌ها برای کاربران تایید نشده\n` +
          `• بررسی وفاداری اعضا\n` +
          `• سیستم استیکر پیشرفته\n\n` +
          `از "راهنما" برای مشاهده دستورات استفاده کن`
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
      bot: 'Eclis Manager - سیستم کامل',
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
