const { Telegraf, Markup } = require('telegraf');

// تنظیمات ربات
const BOT_TOKEN = process.env.BOT_TOKEN;
const OWNER_ID = parseInt(process.env.OWNER_ID);

// بررسی تنظیمات
if (!BOT_TOKEN || !OWNER_ID) {
    console.error('❌ BOT_TOKEN و OWNER_ID را تنظیم کنید');
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const groups = new Map();

// وضعیت‌های کاربر
const UserState = {
    IDLE: 'idle',
    COMPOSING_MESSAGE: 'composing_message',
    AWAITING_GROUP_SELECTION: 'awaiting_group_selection'
};

// راه‌اندازی ربات
bot.start(async (ctx) => {
    if (ctx.from.id === OWNER_ID) {
        ctx.session = { 
            state: UserState.IDLE,
            messages: [] // آرایه برای ذخیره چند پیام
        };
        await showMainMenu(ctx);
    } else {
        await ctx.reply('❌ من فقط از اربابم دستور می‌گیرم!');
    }
});

// استفاده از session
bot.use((ctx, next) => {
    if (!ctx.session) ctx.session = { 
        state: UserState.IDLE,
        messages: []
    };
    return next();
});

// ذخیره گروه‌ها
bot.on('new_chat_members', async (ctx) => {
    const botId = ctx.botInfo.id;
    const isBotAdded = ctx.message.new_chat_members.some(member => member.id === botId);
    
    if (isBotAdded) {
        const chatId = ctx.chat.id;
        groups.set(chatId, {
            id: chatId,
            title: ctx.chat.title || 'گروه بدون نام'
        });
        
        await bot.telegram.sendMessage(OWNER_ID, `✅ ربات به گروه "${ctx.chat.title}" اضافه شد`);
    }
});

// منوی اصلی
async function showMainMenu(ctx) {
    await ctx.reply('🤖 انتخاب کنید:', Markup.keyboard([
        ['📝 شروع کامپوز پیام', '📤 ارسال کامپوز'],
        ['🗑 پاک کردن کامپوز', '🌐 ارسال فوری به همه']
    ]).resize());
}

// مدیریت پیام‌های مالک
bot.on('text', async (ctx) => {
    if (ctx.from.id !== OWNER_ID || ctx.chat.type !== 'private') return;

    const text = ctx.message.text;

    if (ctx.session.state === UserState.IDLE) {
        if (text === '📝 شروع کامپوز پیام') {
            ctx.session.state = UserState.COMPOSING_MESSAGE;
            ctx.session.messages = [];
            await ctx.reply('🎬 در حال کامپوز پیام...\n\nهر پیامی می‌فرستید ذخیره می‌شود.\nبرای اتمام و ارسال، گزینه "📤 ارسال کامپوز" را بزنید.');
        } else if (text === '📤 ارسال کامپوز') {
            if (ctx.session.messages.length === 0) {
                await ctx.reply('⚠️ هیچ پیامی برای ارسال ندارید!');
                return;
            }
            await showGroupSelection(ctx);
        } else if (text === '🗑 پاک کردن کامپوز') {
            ctx.session.messages = [];
            await ctx.reply('✅ کامپوز پیام پاک شد');
        } else if (text === '🌐 ارسال فوری به همه') {
            if (groups.size === 0) {
                await ctx.reply('⚠️ ربات به هیچ گروهی اضافه نشده است!');
                return;
            }
            await forwardToAllGroups(ctx, [ctx.message]);
        }
    } else if (ctx.session.state === UserState.COMPOSING_MESSAGE) {
        // ذخیره پیام در کامپوز
        ctx.session.messages.push(ctx.message);
        await ctx.reply(`✅ پیام ذخیره شد (${ctx.session.messages.length} پیام)`);
    }
});

// مدیریت سایر انواع پیام در حالت کامپوز
bot.on(['photo', 'sticker', 'document', 'video', 'audio', 'voice'], async (ctx) => {
    if (ctx.from.id !== OWNER_ID || ctx.chat.type !== 'private') return;

    if (ctx.session.state === UserState.COMPOSING_MESSAGE) {
        // ذخیره پیام در کامپوز
        ctx.session.messages.push(ctx.message);
        await ctx.reply(`✅ پیام ذخیره شد (${ctx.session.messages.length} پیام)`);
    }
});

// نمایش لیست گروه‌ها برای انتخاب
async function showGroupSelection(ctx) {
    const buttons = [];
    
    groups.forEach((group) => {
        buttons.push([Markup.button.callback(group.title, `send_compose_${group.id}`)]);
    });

    buttons.push([Markup.button.callback('🌐 ارسال به همه گروه‌ها', 'send_compose_all')]);

    await ctx.reply(`🎯 گروه مقصد را انتخاب کنید (${ctx.session.messages.length} پیام):`, 
        Markup.inlineKeyboard(buttons));
    ctx.session.state = UserState.AWAITING_GROUP_SELECTION;
}

// ارسال کامپوز به گروه خاص
async function forwardComposeToGroup(ctx, groupId) {
    let successCount = 0;
    let failCount = 0;

    for (const message of ctx.session.messages) {
        try {
            await ctx.telegram.copyMessage(groupId, ctx.chat.id, message.message_id);
            successCount++;
            
            // تاخیر کوتاه بین ارسال پیام‌ها
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
            console.error(`خطا در ارسال پیام:`, error);
            failCount++;
        }
    }

    await ctx.reply(`✅ کامپوز ارسال شد:\n📤 ${successCount} موفق | ❌ ${failCount} ناموفق`);
    
    // پاک کردن کامپوز پس از ارسال
    ctx.session.messages = [];
    ctx.session.state = UserState.IDLE;
}

// ارسال کامپوز به همه گروه‌ها
async function forwardComposeToAllGroups(ctx) {
    if (groups.size === 0) {
        await ctx.reply('⚠️ ربات به هیچ گروهی اضافه نشده است!');
        return;
    }

    let totalSuccess = 0;
    let totalFail = 0;
    const totalMessages = ctx.session.messages.length;

    await ctx.reply(`🔄 در حال ارسال ${totalMessages} پیام به ${groups.size} گروه...`);

    for (const [groupId, groupInfo] of groups) {
        let groupSuccess = 0;
        
        for (const message of ctx.session.messages) {
            try {
                await ctx.telegram.copyMessage(groupId, ctx.chat.id, message.message_id);
                groupSuccess++;
                
                // تاخیر کوتاه بین ارسال پیام‌ها
                await new Promise(resolve => setTimeout(resolve, 300));
            } catch (error) {
                console.error(`خطا در ارسال به ${groupInfo.title}:`, error);
            }
        }
        
        totalSuccess += groupSuccess;
        totalFail += (totalMessages - groupSuccess);
    }

    await ctx.reply(
        `📊 گزارش ارسال کامپوز:\n\n` +
        `📤 پیام‌ها: ${totalMessages}\n` +
        `👥 گروه‌ها: ${groups.size}\n` +
        `✅ موفق: ${totalSuccess}\n` +
        `❌ ناموفق: ${totalFail}`
    );
    
    // پاک کردن کامپوز پس از ارسال
    ctx.session.messages = [];
    ctx.session.state = UserState.IDLE;
}

// ارسال فوری به همه گروه‌ها
async function forwardToAllGroups(ctx, messages) {
    let successCount = 0;
    let failCount = 0;

    for (const [groupId, groupInfo] of groups) {
        try {
            for (const message of messages) {
                await ctx.telegram.copyMessage(groupId, ctx.chat.id, message.message_id);
                await new Promise(resolve => setTimeout(resolve, 300));
            }
            successCount++;
        } catch (error) {
            console.error(`خطا در ارسال به ${groupInfo.title}:`, error);
            failCount++;
        }
    }

    await ctx.reply(`📤 ارسال فوری:\n✅ ${successCount} موفق | ❌ ${failCount} ناموفق`);
}

// مدیریت کلیک روی دکمه‌های اینلاین
bot.action(/send_compose_(-?\d+)/, async (ctx) => {
    const groupId = ctx.match[1];
    await forwardComposeToGroup(ctx, groupId);
    await showMainMenu(ctx);
    await ctx.answerCbQuery();
});

bot.action('send_compose_all', async (ctx) => {
    await forwardComposeToAllGroups(ctx);
    await showMainMenu(ctx);
    await ctx.answerCbQuery();
});

// راه‌اندازی ربات
bot.launch().then(() => {
    console.log('🤖 ربات راه‌اندازی شد!');
}).catch(console.error);
