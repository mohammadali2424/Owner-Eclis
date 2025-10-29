const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

// ==================[ تنظیمات ]==================
const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const OWNER_ID = parseInt(process.env.OWNER_ID) || 0;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new Telegraf(BOT_TOKEN);

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

// ==================[ دریافت استیکر ]==================
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

// ==================[ دریافت گروه‌های فعال ]==================
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

// ==================[ اسکن اعضای چت‌ها برای وفاداری ]==================
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
        
        // دریافت ادمین‌های چت
        const admins = await ctx.telegram.getChatAdministrators(subgroup.chat_id);
        const adminIds = admins.map(admin => admin.user.id);
        
        let members = [];
        
        if (subgroup.chat_type === 'کانال') {
          // برای کانال فقط ادمین‌ها را بررسی می‌کنیم
          members = admins.map(admin => admin.user).filter(user => !user.is_bot);
        } else {
          // برای گروه ادمین‌ها را بررسی می‌کنیم
          members = admins.map(admin => admin.user).filter(user => !user.is_bot);
          
          // سعی در دریافت لیست کامل اعضا (اگر دسترسی داشته باشیم)
          try {
            // این قسمت نیاز به دسترسی خاص دارد
          } catch (error) {
            console.log(`⚠️ دسترسی به لیست کامل اعضای گروه ${subgroup.chat_title} ممکن نیست`);
          }
        }
        
        for (const member of members) {
          // اگر کاربر ادمین باشد، از لیست مشکوک‌ها حذف می‌شود
          const isAdmin = adminIds.includes(member.id);
          const hasSymbol = checkLoyaltySymbols(member.first_name) || checkLoyaltySymbols(member.username);
          
          if (hasSymbol) {
            loyalMembers++;
            loyalList.push({
              user_id: member.id,
              username: member.username,
              first_name: member.first_name,
              chat_title: subgroup.chat_title,
              is_admin: isAdmin
            });
          } else if (!isAdmin) {
            // فقط کاربران غیر-ادمین بدون نماد مشکوک محسوب می‌شوند
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

// ==================[ بن کردن کاربران مشکوک ]==================
const banSuspiciousMembers = async (ctx, suspiciousList) => {
  try {
    let bannedCount = 0;
    
    for (const member of suspiciousList) {
      const subgroups = await getActiveSubgroups();
      
      for (const subgroup of subgroups) {
        try {
          // بررسی اینکه کاربر در این چت عضو هست یا نه
          const chatMember = await ctx.telegram.getChatMember(subgroup.chat_id, member.user_id);
          if (chatMember.status !== 'left' && chatMember.status !== 'kicked') {
            // بن کردن کاربر
            await ctx.telegram.banChatMember(subgroup.chat_id, member.user_id);
            bannedCount++;
            console.log(`🚫 کاربر ${member.first_name} از ${subgroup.chat_title} بن شد`);
            
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        } catch (error) {
          console.log(`❌ خطا در بن کردن کاربر ${member.user_id} از ${subgroup.chat_title}:`, error.message);
        }
      }
    }
    
    return bannedCount;
  } catch (error) {
    console.log('❌ خطا در بن کردن کاربران مشکوک:', error.message);
    return 0;
  }
};

// ==================[ دستور بررسی وفاداری ]==================
bot.command('بررسی_وفاداری', async (ctx) => {
  try {
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      return ctx.reply(access.message, {
        reply_to_message_id: ctx.message.message_id
      });
    }

    const tempMessage = await ctx.reply('🔍 در حال بررسی وفاداری اعضا... این ممکن است چند دقیقه طول بکشد.', {
      reply_to_message_id: ctx.message.message_id
    });

    const scanResult = await scanAllSubgroupsMembers(ctx);
    
    if (!scanResult.success) {
      try {
        await ctx.deleteMessage(tempMessage.message_id);
      } catch (e) {}
      return ctx.reply('❌ خطا در بررسی وفاداری اعضا.', {
        reply_to_message_id: ctx.message.message_id
      });
    }

    const { totalScanned, loyalMembers, suspiciousMembers } = scanResult;

    let message = `🎯 نتایج بررسی وفاداری\n\n`;
    message += `📊 آمار کلی:\n`;
    message += `• کل اعضای اسکن شده: ${totalScanned}\n`;
    message += `• اعضای وفادار: ${loyalMembers} 👑\n`;
    message += `• اعضای مشکوک: ${suspiciousMembers} ⚠️\n\n`;
    
    message += `آیا میخوای تمام اعضای مشکوک توی اکلیس رو بکشم ؟`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('آره ، همشون رو بکش', 'ban_suspicious')],
      [Markup.button.callback('نه ، نکششون', 'pardon_suspicious')]
    ]);

    try {
      await ctx.deleteMessage(tempMessage.message_id);
    } catch (e) {}
    
    await ctx.reply(message, {
      reply_markup: keyboard.reply_markup,
      reply_to_message_id: ctx.message.message_id
    });

    // ارسال استیکر بررسی وفاداری
    const sticker = await getSticker('loyalty_check');
    if (sticker) {
      await ctx.replyWithSticker(sticker);
    }

  } catch (error) {
    console.log('❌ خطا در دستور بررسی وفاداری:', error.message);
    await ctx.reply('❌ خطا در بررسی وفاداری اعضا.', {
      reply_to_message_id: ctx.message.message_id
    });
  }
});

// ==================[ هندلر بن کردن کاربران مشکوک ]==================
bot.action('ban_suspicious', async (ctx) => {
  try {
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      await ctx.answerCbQuery('فقط آکی میتونه این کار رو بکنه!');
      return;
    }

    await ctx.answerCbQuery('در حال بن کردن اعضای مشکوک...');

    // اسکن مجدد برای اطمینان از لیست به‌روز
    const scanResult = await scanAllSubgroupsMembers(ctx);
    
    if (!scanResult.success) {
      await ctx.editMessageText('❌ خطا در بن کردن اعضای مشکوک.');
      return;
    }

    const bannedCount = await banSuspiciousMembers(ctx, scanResult.suspiciousList);

    await ctx.editMessageText(`تمام افراد مشکوک با استفاده از تیغه های زیبام با نهایت لذت یکی یکی کشته میشن\n\nتعداد بن شده: ${bannedCount}`);

    // ارسال استیکر بن کردن
    const sticker = await getSticker('loyalty_ban');
    if (sticker) {
      await ctx.replyWithSticker(sticker);
    }

  } catch (error) {
    console.log('❌ خطا در بن کردن کاربران مشکوک:', error.message);
    await ctx.answerCbQuery('خطا در بن کردن');
  }
});

// ==================[ هندلر بخشیدن کاربران مشکوک ]==================
bot.action('pardon_suspicious', async (ctx) => {
  try {
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      await ctx.answerCbQuery('فقط آکی میتونه این کار رو بکنه!');
      return;
    }

    await ctx.answerCbQuery('اعضای مشکوک بخشیده شدند');
    await ctx.editMessageText('فرصتی دوباره...\n\nاعضای مشکوک میتونن تا دفعه بعدی زنده بمونن');

    // ارسال استیکر بخشیدن
    const sticker = await getSticker('loyalty_pardon');
    if (sticker) {
      await ctx.replyWithSticker(sticker);
    }

  } catch (error) {
    console.log('❌ خطا در بخشیدن کاربران مشکوک:', error.message);
    await ctx.answerCbQuery('خطا در بخشیدن');
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

// ==================[ راه‌اندازی ]==================
const startSymbolBot = async () => {
  try {
    console.log('🤖 راه‌اندازی ربات بررسی وفاداری...');
    
    await bot.launch({
      dropPendingUpdates: true,
    });
    
    console.log('✅ ربات بررسی وفاداری فعال شد');
    
  } catch (error) {
    console.log('❌ خطا در راه‌اندازی ربات بررسی وفاداری:', error.message);
  }
};

// اگر فایل مستقل اجرا شد
if (require.main === module) {
  startSymbolBot();
}

module.exports = {
  scanAllSubgroupsMembers,
  checkLoyaltySymbols
};
