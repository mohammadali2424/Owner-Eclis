const { Telegraf, Markup, session } = require('telegraf');
const { message } = require('telegraf/filters');

// تنظیمات ربات
const BOT_TOKEN = 'YOUR_BOT_TOKEN_HERE';
const OWNER_ID = YOUR_OWNER_USER_ID_HERE; // جایگزین کنید با آی‌دی عددی مالک

const bot = new Telegraf(BOT_TOKEN);

// استفاده از session برای ذخیره وضعیت
bot.use(session());

// ذخیره‌سازی گروه‌ها
const groups = new Map();

// وضعیت‌های ممکن برای مالک
const OwnerState = {
  IDLE: 'idle',
  AWAITING_MESSAGE: 'awaiting_message',
  AWAITING_GROUP_SELECTION: 'awaiting_group_selection'
};

// راه‌اندازی ربات
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  
  if (userId === OWNER_ID) {
    // مالک ربات
    ctx.session.ownerState = OwnerState.IDLE;
    await ctx.reply(
      'ربات در خدمت شماست ارباب! 🙇‍♂️\n\n' +
      'از منوی زیر اقدام مورد نظر را انتخاب کنید:',
      Markup.keyboard([
        ['📤 ارسال پیام به گروه‌ها'],
        ['🌐 ارسال سراسری']
      ]).resize()
    );
  } else {
    // کاربر عادی
    await ctx.reply('من فقط از اربابم دستور می‌گیرم! 👮‍♂️');
  }
});

// مدیریت اضافه شدن به گروه
bot.on(message('new_chat_members'), async (ctx) => {
  const newMembers = ctx.message.new_chat_members;
  const botId = ctx.botInfo.id;
  
  // بررسی آیا ربات به گروه اضافه شده
  const isBotAdded = newMembers.some(member => member.id === botId);
  
  if (isBotAdded) {
    const chatId = ctx.chat.id;
    const chatTitle = ctx.chat.title || 'گروه بدون نام';
    
    // ذخیره اطلاعات گروه
    groups.set(chatId, {
      id: chatId,
      title: chatTitle,
      addedAt: new Date()
    });
    
    // اطلاع به مالک
    await bot.telegram.sendMessage(
      OWNER_ID,
      `🤖 ربات به گروه "${chatTitle}" اضافه شد.\n\n` +
      `آی‌دی گروه: ${chatId}`
    );
  }
});

// مدیریت حذف از گروه
bot.on(message('left_chat_member'), async (ctx) => {
  const leftMember = ctx.message.left_chat_member;
  const botId = ctx.botInfo.id;
  
  if (leftMember.id === botId) {
    const chatId = ctx.chat.id;
    const groupInfo = groups.get(chatId);
    
    // حذف گروه از لیست
    groups.delete(chatId);
    
    // اطلاع به مالک
    if (groupInfo) {
      await bot.telegram.sendMessage(
        OWNER_ID,
        `❌ ربات از گروه "${groupInfo.title}" حذف شد.`
      );
    }
  }
});

// مدیریت پیام‌های مالک در حالت عادی
bot.on(message('text'), async (ctx) => {
  const userId = ctx.from.id;
  const messageText = ctx.message.text;
  
  // فقط مالک می‌تواند دستور دهد
  if (userId !== OWNER_ID) return;
  
  // بررسی وضعیت جلسه
  if (!ctx.session.ownerState) {
    ctx.session.ownerState = OwnerState.IDLE;
  }
  
  // مدیریت دستورات منو
  if (ctx.session.ownerState === OwnerState.IDLE) {
    if (messageText === '📤 ارسال پیام به گروه‌ها') {
      if (groups.size === 0) {
        await ctx.reply('⚠️ ربات به هیچ گروهی اضافه نشده است.');
        return;
      }
      
      ctx.session.ownerState = OwnerState.AWAITING_MESSAGE;
      await ctx.reply(
        'لطفا پیام، عکس یا استیکری که می‌خواهید ارسال کنید را بفرستید:',
        Markup.removeKeyboard()
      );
    } else if (messageText === '🌐 ارسال سراسری') {
      if (groups.size === 0) {
        await ctx.reply('⚠️ ربات به هیچ گروهی اضافه نشده است.');
        return;
      }
      
      ctx.session.ownerState = OwnerState.AWAITING_MESSAGE;
      await ctx.reply(
        'لطفا پیام، عکس یا استیکری که می‌خواهید به تمام گروه‌ها ارسال کنید را بفرستید:',
        Markup.removeKeyboard()
      );
      ctx.session.isBroadcast = true;
    }
  }
});

// مدیریت تمام انواع پیام‌ها از مالک
bot.on(['message', 'photo', 'sticker', 'document', 'video'], async (ctx) => {
  const userId = ctx.from.id;
  
  // فقط مالک می‌تواند دستور دهد
  if (userId !== OWNER_ID) return;
  
  // اگر در حالت انتظار برای دریافت پیام است
  if (ctx.session.ownerState === OwnerState.AWAITING_MESSAGE) {
    // ذخیره پیام برای ارسال
    ctx.session.messageToSend = {
      type: ctx.message.content_type,
      content: ctx.message
    };
    
    // اگر ارسال سراسری است
    if (ctx.session.isBroadcast) {
      await sendToAllGroups(ctx);
      ctx.session.ownerState = OwnerState.IDLE;
      delete ctx.session.isBroadcast;
      await showMainMenu(ctx);
    } else {
      // نمایش لیست گروه‌ها برای انتخاب
      ctx.session.ownerState = OwnerState.AWAITING_GROUP_SELECTION;
      await showGroupSelection(ctx);
    }
  }
});

// نمایش لیست گروه‌ها برای انتخاب
async function showGroupSelection(ctx) {
  const buttons = [];
  
  // ایجاد دکمه‌ها برای هر گروه
  groups.forEach((group, id) => {
    buttons.push([Markup.button.callback(group.title, `send_to_group_${id}`)]);
  });
  
  // دکمه ارسال به همه گروه‌ها
  buttons.push([Markup.button.callback('🌐 ارسال به همه گروه‌ها', 'send_to_all_groups')]);
  
  await ctx.reply(
    'لطفا گروه مقصد را انتخاب کنید:',
    Markup.inlineKeyboard(buttons)
  );
}

// ارسال پیام به تمام گروه‌ها
async function sendToAllGroups(ctx) {
  const messageData = ctx.session.messageToSend;
  let successCount = 0;
  let failCount = 0;
  
  await ctx.reply(`🔄 در حال ارسال پیام به ${groups.size} گروه...`);
  
  for (const [groupId, groupInfo] of groups) {
    try {
      await sendMessageToGroup(ctx, groupId, messageData);
      successCount++;
    } catch (error) {
      console.error(`خطا در ارسال به گروه ${groupInfo.title}:`, error);
      failCount++;
    }
  }
  
  await ctx.reply(
    `✅ ارسال پیام به گروه‌ها تکمیل شد:\n\n` +
    `✅ موفق: ${successCount}\n` +
    `❌ ناموفق: ${failCount}`
  );
}

// ارسال پیام به یک گروه خاص
async function sendMessageToGroup(ctx, groupId, messageData) {
  try {
    switch (messageData.type) {
      case 'text':
        await ctx.telegram.sendMessage(groupId, messageData.content.text);
        break;
      case 'photo':
        const photo = messageData.content.photo[messageData.content.photo.length - 1];
        await ctx.telegram.sendPhoto(
          groupId, 
          photo.file_id,
          messageData.content.caption ? { caption: messageData.content.caption } : {}
        );
        break;
      case 'sticker':
        await ctx.telegram.sendSticker(groupId, messageData.content.sticker.file_id);
        break;
      case 'document':
        await ctx.telegram.sendDocument(
          groupId,
          messageData.content.document.file_id,
          messageData.content.caption ? { caption: messageData.content.caption } : {}
        );
        break;
      case 'video':
        await ctx.telegram.sendVideo(
          groupId,
          messageData.content.video.file_id,
          messageData.content.caption ? { caption: messageData.content.caption } : {}
        );
        break;
      default:
        throw new Error('نوع پیام پشتیبانی نمی‌شود');
    }
    return true;
  } catch (error) {
    throw error;
  }
}

// نمایش منوی اصلی
async function showMainMenu(ctx) {
  await ctx.reply(
    'از منوی زیر اقدام مورد نظر را انتخاب کنید:',
    Markup.keyboard([
      ['📤 ارسال پیام به گروه‌ها'],
      ['🌐 ارسال سراسری']
    ]).resize()
  );
}

// مدیریت کلیک روی دکمه‌های اینلاین
bot.action(/send_to_group_(\-\d+)/, async (ctx) => {
  const groupId = ctx.match[1];
  const messageData = ctx.session.messageToSend;
  const groupInfo = groups.get(groupId);
  
  if (!groupInfo) {
    await ctx.answerCbQuery('❌ گروه یافت نشد!');
    return;
  }
  
  await ctx.answerCbQuery();
  
  try {
    await sendMessageToGroup(ctx, groupId, messageData);
    await ctx.editMessageText(`✅ پیام با موفقیت به گروه "${groupInfo.title}" ارسال شد.`);
  } catch (error) {
    await ctx.editMessageText(`❌ خطا در ارسال پیام به گروه "${groupInfo.title}"`);
  }
  
  ctx.session.ownerState = OwnerState.IDLE;
  await showMainMenu(ctx);
});

bot.action('send_to_all_groups', async (ctx) => {
  await ctx.answerCbQuery();
  await sendToAllGroups(ctx);
  ctx.session.ownerState = OwnerState.IDLE;
  await showMainMenu(ctx);
});

// راه‌اندازی ربات
bot.launch().then(() => {
  console.log('🤖 ربات راه‌اندازی شد...');
});

// مدیریت خاتمه تمیز
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
