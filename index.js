const { Telegraf, Markup, session } = require('telegraf');

// تنظیمات ربات
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const OWNER_ID = parseInt(process.env.OWNER_ID) || 123456789; // آی‌دی عددی خودت رو اینجا بذار

// بررسی تنظیمات
if (!BOT_TOKEN || BOT_TOKEN === 'YOUR_BOT_TOKEN_HERE') {
    console.error('❌ BOT_TOKEN را تنظیم کنید');
    process.exit(1);
}

if (!OWNER_ID || OWNER_ID === 123456789) {
    console.error('❌ OWNER_ID را تنظیم کنید');
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

// استفاده از session
bot.use(session({ 
    defaultSession: () => ({ 
        state: UserState.IDLE,
        messages: []
    })
}));

// راه‌اندازی ربات با هندلینگ خطا
async function startBot() {
    try {
        // حذف webhook قبلی برای جلوگیری از conflict
        await bot.telegram.deleteWebhook();
        
        // راه‌اندازی ربات
        await bot.launch();
        console.log('🤖 ربات راه‌اندازی شد!');
        
        // هندل graceful shutdown
        process.once('SIGINT', () => bot.stop('SIGINT'));
        process.once('SIGTERM', () => bot.stop('SIGTERM'));
        
    } catch (error) {
        if (error.description && error.description.includes('Conflict')) {
            console.log('⚠️ ربات در جای دیگری در حال اجراست. 10 ثانیه صبر کنید...');
            await new Promise(resolve => setTimeout(resolve, 10000));
            return startBot(); // تلاش مجدد
        }
        console.error('❌ خطا در راه‌اندازی ربات:', error);
        process.exit(1);
    }
}

// مدیریت شروع
bot.start(async (ctx) => {
    if (ctx.from.id === OWNER_ID) {
        ctx.session.state = UserState.IDLE;
        ctx.session.messages = [];
        await showMainMenu(ctx);
    } else {
        await ctx.reply('❌ من فقط از اربابم دستور می‌گیرم!');
    }
});

// ذخیره گروه‌ها
bot.on('new_chat_members', async (ctx) => {
    const botId = ctx.botInfo.id;
    const isBotAdded = ctx.message.new_chat_members.some(member => member.id === botId);
    
    if (isBotAdded) {
        const chatId = ctx.chat.id;
        const groupTitle = ctx.chat.title || 'گروه بدون نام';
        
        groups.set(chatId, {
            id: chatId,
            title: groupTitle
        });
        
        try {
            await bot.telegram.sendMessage(OWNER_ID, `✅ ربات به گروه "${groupTitle}" اضافه شد`);
        } catch (error) {
            console.error('خطا در اطلاع به مالک:', error);
        }
    }
});

// منوی اصلی
async function showMainMenu(ctx) {
    const menu = Markup.keyboard([
        ['📝 شروع کامپوز پیام', '📤 ارسال کامپوز'],
        ['🗑 پاک کردن کامپوز', '🌐 ارسال فوری به همه']
    ]).resize();
    
    await ctx.reply('🤖 انتخاب کنید:', menu);
}

// مدیریت پیام‌های مالک
bot.on('text', async (ctx) => {
    if (ctx.from.id !== OWNER_ID || ctx.chat.type !== 'private') return;

    const text = ctx.message.text;
    const session = ctx.session;

    if (session.state === UserState.IDLE) {
        switch (text) {
            case '📝 شروع کامپوز پیام':
                session.state = UserState.COMPOSING_MESSAGE;
                session.messages = [];
                await ctx.reply('🎬 در حال کامپوز پیام...\nهر پیامی می‌فرستید ذخیره می‌شود.');
                break;
                
            case '📤 ارسال کامپوز':
                if (!session.messages || session.messages.length === 0) {
                    await ctx.reply('⚠️ هیچ پیامی برای ارسال ندارید!');
                    return;
                }
                await showGroupSelection(ctx);
                break;
                
            case '🗑 پاک کردن کامپوز':
                session.messages = [];
                await ctx.reply('✅ کامپوز پیام پاک شد');
                break;
                
            case '🌐 ارسال فوری به همه':
                if (groups.size === 0) {
                    await ctx.reply('⚠️ ربات به هیچ گروهی اضافه نشده است!');
                    return;
                }
                await forwardToAllGroups(ctx, [ctx.message]);
                break;
        }
    } else if (session.state === UserState.COMPOSING_MESSAGE) {
        // ذخیره پیام در کامپوز
        if (!session.messages) session.messages = [];
        session.messages.push(ctx.message);
        await ctx.reply(`✅ پیام ذخیره شد (${session.messages.length} پیام)`);
    }
});

// مدیریت سایر انواع پیام در حالت کامپوز
bot.on(['photo', 'sticker', 'document', 'video'], async (ctx) => {
    if (ctx.from.id !== OWNER_ID || ctx.chat.type !== 'private') return;

    const session = ctx.session;
    
    if (session.state === UserState.COMPOSING_MESSAGE) {
        if (!session.messages) session.messages = [];
        session.messages.push(ctx.message);
        await ctx.reply(`✅ پیام ذخیره شد (${session.messages.length} پیام)`);
    }
});

// نمایش لیست گروه‌ها برای انتخاب
async function showGroupSelection(ctx) {
    if (groups.size === 0) {
        await ctx.reply('⚠️ ربات به هیچ گروهی اضافه نشده است!');
        ctx.session.state = UserState.IDLE;
        return;
    }

    const buttons = [];
    
    groups.forEach((group) => {
        buttons.push([Markup.button.callback(group.title, `send_${group.id}`)]);
    });

    buttons.push([Markup.button.callback('🌐 ارسال به همه', 'send_all')]);

    await ctx.reply(
        `🎯 گروه مقصد را انتخاب کنید (${ctx.session.messages.length} پیام):`, 
        Markup.inlineKeyboard(buttons)
    );
    ctx.session.state = UserState.AWAITING_GROUP_SELECTION;
}

// ارسال کامپوز به گروه خاص
async function forwardToGroup(ctx, groupId) {
    const messages = ctx.session.messages || [];
    let successCount = 0;

    for (const message of messages) {
        try {
            await ctx.telegram.copyMessage(groupId, ctx.chat.id, message.message_id);
            successCount++;
            await new Promise(resolve => setTimeout(resolve, 300));
        } catch (error) {
            console.error('خطا در ارسال پیام:', error);
        }
    }

    await ctx.reply(`✅ ${successCount} از ${messages.length} پیام ارسال شد`);
    ctx.session.state = UserState.IDLE;
    ctx.session.messages = [];
}

// ارسال به همه گروه‌ها
async function forwardToAllGroups(ctx, messages = null) {
    const msgs = messages || ctx.session.messages || [];
    
    if (groups.size === 0) {
        await ctx.reply('⚠️ ربات به هیچ گروهی اضافه نشده است!');
        return;
    }

    let totalSent = 0;
    const totalGroups = groups.size;

    for (const [groupId] of groups) {
        try {
            for (const message of msgs) {
                await ctx.telegram.copyMessage(groupId, ctx.chat.id, message.message_id);
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            totalSent++;
        } catch (error) {
            console.error('خطا در ارسال به گروه:', error);
        }
    }

    await ctx.reply(`📤 ${totalSent} از ${totalGroups} گروه دریافت کردند`);
    
    if (!messages) {
        ctx.session.state = UserState.IDLE;
        ctx.session.messages = [];
    }
}

// مدیریت کلیک روی دکمه‌ها
bot.action(/send_(-?\d+)/, async (ctx) => {
    const groupId = ctx.match[1];
    await forwardToGroup(ctx, groupId);
    await showMainMenu(ctx);
    await ctx.answerCbQuery();
});

bot.action('send_all', async (ctx) => {
    await forwardToAllGroups(ctx);
    await showMainMenu(ctx);
    await ctx.answerCbQuery();
});

// شروع ربات
startBot();
