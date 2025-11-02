const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const http = require('http');
const express = require('express');

// تنظیمات اصلی
const BOT_TOKEN = '8135660826:AAHpqzFlEsy_rWcGjWMqvv-KCvE7tzUuT0I';
const SUPABASE_URL = 'https://phdwvxyglwnlqjciipgr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoZHd2eHlnbHdubHFqY2lpcGdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5OTU5MzUsImV4cCI6MjA3NTU3MTkzNX0.__c_CZk7vv9KIiPuDiTpWdblXeHwBo69z88x4vReTtQ';
const GATEWAY_GROUP_ID = -1002483328877;
const OWNER_ID = 7495437597;

// ایجاد سرور برای پینگ
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('🛡️ ربات نینجای چهار فعال است - امنیت Eclis برقرار است');
});

app.listen(PORT, () => {
    console.log(`🚀 سرور پینگ روی پورت ${PORT} فعال شد`);
});

// پینگ هر 14 دقیقه
setInterval(() => {
    http.get(`http://localhost:${PORT}`, (res) => {
        console.log('🔄 پینگ ارسال شد - ربات فعال است');
    });
}, 14 * 60 * 1000);

// اتصال به دیتابیس
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new Telegraf(BOT_TOKEN);

// متغیرهای سیستمی
let approvedUsers = new Set();
let pendingApprovals = new Map();
let stickers = new Map();

// لیست گروه‌ها و کانال‌های زیرمجموعه
let otherGroups = [
    -1002000000001, // گروه نمونه 1
    -1002000000002, // گروه نمونه 2
    -1002000000003, // کانال نمونه 1
    // بقیه گروه‌ها و کانال‌ها رو اینجا اضافه کنید
];

// اطلاعات گروه‌ها برای نمایش در لیست
let groupInfo = new Map([
    [-1002483328877, "🎯 گروه دروازه اکلیس"],
    [-1003147693863, "🛡️ منطقه امنیتی ۱"],
    [-1002929172320, "🔒 منطقه امنیتی ۲"],
    [-1002000000003, "📢 کانال اصلی اکلیس"]
    // اطلاعات بقیه گروه‌ها رو اینجا اضافه کنید
]);

// تابع برای ذخیره استیکر در دیتابیس
async function saveSticker(type, fileId) {
    try {
        const { data, error } = await supabase
            .from('stickers')
            .upsert({ type, file_id: fileId });
        
        if (error) throw error;
        stickers.set(type, fileId);
        return true;
    } catch (error) {
        console.error('خطا در ذخیره استیکر:', error);
        return false;
    }
}

// تابع برای دریافت استیکر از دیتابیس
async function loadStickers() {
    try {
        const { data, error } = await supabase
            .from('stickers')
            .select('*');
        
        if (error) throw error;
        
        stickers.clear();
        data.forEach(item => {
            stickers.set(item.type, item.file_id);
        });
        console.log('✅ استیکرها از دیتابیس بارگذاری شدند');
    } catch (error) {
        console.error('خطا در بارگذاری استیکرها:', error);
    }
}

// ارسال استیکر بر اساس نوع
async function sendSticker(ctx, type, chatId = null) {
    const fileId = stickers.get(type);
    if (fileId) {
        if (chatId) {
            await bot.telegram.sendSticker(chatId, fileId);
        } else {
            await ctx.replyWithSticker(fileId);
        }
    }
}

// ========================== دستورات جدید ==========================

// دستور "لیست استیکرها"
bot.hears('لیست استیکرها', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    
    const stickerTypes = [
        { name: 'شروع', key: 'start' },
        { name: 'خوش آمدگویی', key: 'welcome' },
        { name: 'رد کاربر', key: 'reject' },
        { name: 'نفوذی', key: 'intruder' },
        { name: 'کشته شد', key: 'killed' },
        { name: 'بررسی مناطق', key: 'check_areas' }
    ];
    
    let message = '📋 لیست استیکرهای تنظیم شده:\n\n';
    
    stickerTypes.forEach(type => {
        const status = stickers.has(type.key) ? '✅' : '❌';
        message += `${status} ${type.name}\n`;
    });
    
    message += '\n✅ = تنظیم شده\n❌ = تنظیم نشده';
    
    await ctx.reply(message);
});

// دستور "بررسی مناطق"
bot.hears('بررسی مناطق', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    
    const allGroups = [GATEWAY_GROUP_ID, ...otherGroups];
    let successCount = 0;
    let failCount = 0;
    
    await ctx.reply('🔍 در حال بررسی مناطق تحت حفاظت...');
    
    for (const groupId of allGroups) {
        try {
            await bot.telegram.sendMessage(groupId, '🛡️ این منطقه تحت نظارت منه');
            await sendSticker(ctx, 'check_areas', groupId);
            successCount++;
            console.log(`✅ پیام نظارت به گروه ${groupId} ارسال شد`);
        } catch (error) {
            failCount++;
            console.error(`❌ خطا در ارسال به گروه ${groupId}:`, error);
        }
        
        // تأخیر بین ارسال پیام‌ها
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    await ctx.reply(`📊 نتیجه بررسی مناطق:\n✅ موفق: ${successCount} منطقه\n❌ ناموفق: ${failCount} منطقه`);
});

// دستور "لیست مناطق" - فقط در گروه دروازه
bot.hears('لیست مناطق', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    if (ctx.chat.id !== GATEWAY_GROUP_ID) {
        await ctx.reply('❌ این دستور فقط در گروه دروازه قابل استفاده است');
        return;
    }
    
    let message = '🗺️ مناطق تحت حفاظت من:\n\n';
    
    // گروه دروازه
    const gatewayInfo = groupInfo.get(GATEWAY_GROUP_ID) || `گروه دروازه (${GATEWAY_GROUP_ID})`;
    message += `🎯 ${gatewayInfo}\n`;
    
    // گروه‌های دیگر
    otherGroups.forEach(groupId => {
        const info = groupInfo.get(groupId) || `گروه ${groupId}`;
        message += `🛡️ ${info}\n`;
    });
    
    message += `\n📊 تعداد کل مناطق: ${otherGroups.length + 1}`;
    
    await ctx.reply(message);
});

// ========================== بهبود دستور بن ==========================

// مدیریت پیام‌های حاوی "بن"
bot.hears(/^بن$/, async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    
    if (!ctx.message.reply_to_message) {
        await ctx.reply('⚠️ لطفا روی پیام کاربر ریپلای کنید و سپس "بن" را ارسال کنید');
        return;
    }
    
    const targetUser = ctx.message.reply_to_message.from;
    await banUserFromAllGroups(targetUser, ctx);
});

// بهبود دستور بن با یوزرنیم
bot.hears(/^بن @(\w+)$/, async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    
    const username = ctx.match[1];
    await ctx.reply('⚠️ این قابلیت در حال حاضر پشتیبانی نمی‌شود. لطفا از روش ریپلای استفاده کنید.');
});

// تابع بهبود یافته بن کردن کاربر از تمام گروه‌ها
async function banUserFromAllGroups(user, ctx) {
    const userName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
    const userId = user.id;
    
    // بررسی اگر کاربر مدیر است
    try {
        const chatMember = await bot.telegram.getChatMember(ctx.chat.id, userId);
        if (['administrator', 'creator'].includes(chatMember.status)) {
            console.log(`⚠️ کاربر ${userName} مدیر است، بن انجام نشد`);
            return; // بدون بن کردن مدیران
        }
    } catch (error) {
        console.error('خطا در بررسی وضعیت کاربر:', error);
    }
    
    try {
        const allGroups = [GATEWAY_GROUP_ID, ...otherGroups];
        let banCount = 0;
        
        // بن کردن از تمام گروه‌ها
        for (const groupId of allGroups) {
            try {
                await bot.telegram.banChatMember(groupId, userId);
                banCount++;
                console.log(`✅ کاربر ${userId} از گروه ${groupId} بن شد`);
            } catch (error) {
                // ممکن است کاربر در گروه نباشد یا دسترسی不足 باشد
            }
        }
        
        approvedUsers.delete(userId);
        pendingApprovals.delete(userId);
        
        // ارسال پیام "کشته شد" با استیکر
        const killMessage = `☠️ ${userName} با موفقیت کشته شد...`;
        
        // ارسال پیام به مالک با ریپلای
        await ctx.reply(killMessage, {
            reply_to_message_id: ctx.message.message_id
        });
        
        // ارسال استیکر
        await sendSticker(ctx, 'killed');
        
        console.log(`✅ کاربر ${userName} از ${banCount} گروه بن شد`);
        
    } catch (error) {
        await ctx.reply('❌ خطا در بن کردن کاربر');
        console.error('خطا در بن کردن کاربر:', error);
    }
}

// ========================== بقیه توابع بدون تغییر ==========================

// دستور برای تنظیم استیکر
bot.command('setsticker', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) {
        return ctx.reply('❌ فقط مالک می‌تواند استیکر تنظیم کند');
    }

    const args = ctx.message.text.split(' ');
    if (args.length < 3) {
        return ctx.reply('⚠️ فرمت دستور:\n/setsticker [نوع] [ریپلای روی استیکر]\n\nانواع استیکر:\nstart - شروع\nwelcome - خوش آمدگویی\nreject - رد کاربر\nintruder - نفوذی\nkilled - کشته شد\ncheck_areas - بررسی مناطق');
    }

    const type = args[1];
    if (!ctx.message.reply_to_message || !ctx.message.reply_to_message.sticker) {
        return ctx.reply('❌ لطفا روی یک استیکر ریپلای کنید');
    }

    const fileId = ctx.message.reply_to_message.sticker.file_id;
    const success = await saveSticker(type, fileId);

    if (success) {
        ctx.reply(`✅ استیکر ${type} با موفقیت ذخیره شد`);
    } else {
        ctx.reply('❌ خطا در ذخیره استیکر');
    }
});

// مدیریت دستور "شروع"
bot.hears('شروع', async (ctx) => {
    if (ctx.from.id === OWNER_ID) {
        const message = await ctx.reply('نینجای چهار در خدمت شماست', {
            reply_to_message_id: ctx.message.message_id
        });
        
        await sendSticker(ctx, 'start');
        console.log('✅ ربات توسط مالک فعال شد');
    }
});

// وقتی کاربر جدید به گروه دروازه می‌پیوندد
bot.on('chat_member', async (ctx) => {
    const chatMember = ctx.chatMember;
    const user = chatMember.new_chat_member.user;
    const chatId = chatMember.chat.id;
    const oldStatus = chatMember.old_chat_member.status;
    const newStatus = chatMember.new_chat_member.status;

    if (chatId === GATEWAY_GROUP_ID && 
        (newStatus === 'member' || newStatus === 'administrator') && 
        (oldStatus === 'left' || oldStatus === 'kicked')) {
        await handleNewUserInGateway(user);
    }
    
    if (chatId === GATEWAY_GROUP_ID && 
        (newStatus === 'left' || newStatus === 'kicked') && 
        (oldStatus === 'member' || oldStatus === 'administrator')) {
        await handleUserLeftGateway(user);
    }
    
    if (otherGroups.includes(chatId) && 
        (newStatus === 'member' || newStatus === 'administrator')) {
        await handleUserInOtherGroups(user, chatId);
    }
});

// مدیریت کاربر جدید در دروازه
async function handleNewUserInGateway(user) {
    const userName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
    
    const messageText = `مسافر ${userName} وارد هال اکلیس شد\n\nارباب این شخص اجازه ورود به اکلیس رو داره؟`;
    
    pendingApprovals.set(user.id, {
        userName,
        username: user.username ? '@' + user.username : 'بدون یوزرنیم',
        userId: user.id,
        joinTime: new Date()
    });
    
    await bot.telegram.sendMessage(
        OWNER_ID,
        messageText,
        {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '✅ بله، اجازه ورود داره', callback_data: `approve_${user.id}` },
                        { text: '❌ نه، اجازه ورود نداره', callback_data: `reject_${user.id}` }
                    ]
                ]
            }
        }
    );
    
    await bot.telegram.sendMessage(
        GATEWAY_GROUP_ID,
        `👤 مسافر ${userName} وارد هال شد...`
    );
}

// مدیریت کلیک روی دکمه‌های تایید
bot.on('callback_query', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) {
        await ctx.answerCbQuery('❌ فقط مالک می‌تواند این کار را انجام دهد');
        return;
    }
    
    const data = ctx.callbackQuery.data;
    
    if (data.startsWith('approve_')) {
        const userId = parseInt(data.split('_')[1]);
        await approveUser(userId, ctx);
    } 
    else if (data.startsWith('reject_')) {
        const userId = parseInt(data.split('_')[1]);
        await rejectUser(userId, ctx);
    }
});

// تایید کاربر
async function approveUser(userId, ctx) {
    const userData = pendingApprovals.get(userId);
    if (!userData) {
        await ctx.answerCbQuery('❌ کاربر یافت نشد');
        return;
    }
    
    approvedUsers.add(userId);
    pendingApprovals.delete(userId);
    
    await ctx.answerCbQuery('✅ کاربر تایید شد');
    await ctx.editMessageText(`✅ مسافر ${userData.userName} تایید ��د`);
    
    await bot.telegram.sendMessage(
        GATEWAY_GROUP_ID,
        `🎉 مسافر ${userData.userName} به جهان بزرگ اکلیس خوش اومدی`
    );
    
    const stickerCtx = { replyWithSticker: (fileId) => bot.telegram.sendSticker(GATEWAY_GROUP_ID, fileId) };
    await sendSticker(stickerCtx, 'welcome');
    
    console.log(`✅ کاربر ${userId} تایید شد`);
}

// رد کاربر
async function rejectUser(userId, ctx) {
    const userData = pendingApprovals.get(userId);
    if (!userData) {
        await ctx.answerCbQuery('❌ کاربر یافت نشد');
        return;
    }
    
    pendingApprovals.delete(userId);
    
    try {
        await bot.telegram.banChatMember(GATEWAY_GROUP_ID, userId);
        await ctx.answerCbQuery('❌ کاربر بن شد');
        await ctx.editMessageText(`❌ ${userData.userName} از اکلیس بیرون رانده شد`);
        
        const stickerCtx = { replyWithSticker: (fileId) => bot.telegram.sendSticker(OWNER_ID, fileId) };
        await sendSticker(stickerCtx, 'reject');
        
        console.log(`❌ کاربر ${userId} بن شد`);
    } catch (error) {
        console.error('خطا در بن کردن کاربر:', error);
    }
}

// مدیریت کاربر در گروه‌های دیگر
async function handleUserInOtherGroups(user, groupId) {
    if (!approvedUsers.has(user.id) || !(await checkUserInGateway(user.id))) {
        await banIntruder(user, groupId);
    }
}

// بن کردن نفوذی
async function banIntruder(user, groupId) {
    const userName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
    const joinTime = new Date().toLocaleString('fa-IR');
    
    try {
        await bot.telegram.banChatMember(groupId, user.id);
        
        const report = `🚨 مکرد مشکوک ${userName} در منطقه ${groupId} در تاریخ ${joinTime} قصد نفوذ داشت ، که با موفقیت پیدا ، شکار و کشته شد`;
        
        await bot.telegram.sendMessage(OWNER_ID, report);
        
        const stickerCtx = { replyWithSticker: (fileId) => bot.telegram.sendSticker(OWNER_ID, fileId) };
        await sendSticker(stickerCtx, 'intruder');
        
        console.log(`🚨 نفوذی ${user.id} در گروه ${groupId} شناسایی و بن شد`);
    } catch (error) {
        console.error('خطا در بن کردن نفوذی:', error);
    }
}

// مدیریت خروج کاربر از دروازه
async function handleUserLeftGateway(user) {
    approvedUsers.delete(user.id);
    pendingApprovals.delete(user.id);
    
    for (const groupId of otherGroups) {
        try {
            await bot.telegram.banChatMember(groupId, user.id);
        } catch (error) {
            // ممکن است کاربر در گروه نباشد
        }
    }
    
    console.log(`✅ کاربر ${user.id} از تمام گروه‌ها حذف شد`);
}

// بررسی حضور کاربر در گروه دروازه
async function checkUserInGateway(userId) {
    try {
        const member = await bot.telegram.getChatMember(GATEWAY_GROUP_ID, userId);
        return member.status === 'member' || member.status === 'administrator' || member.status === 'creator';
    } catch (error) {
        return false;
    }
}

// راه‌اندازی ربات
async function startBot() {
    try {
        await loadStickers();
        await bot.launch();
        console.log('🤖 ربات نینجای چهار راه‌اندازی شد');
        console.log('📍 منتظر فعالیت...');
        console.log(`👤 مالک: ${OWNER_ID}`);
        console.log(`🚪 گروه دروازه: ${GATEWAY_GROUP_ID}`);
        console.log(`🔒 تعداد گروه‌های تحت حفاظت: ${otherGroups.length}`);
        
    } catch (error) {
        console.error('❌ خطا در راه‌اندازی ربات:', error);
    }
}

// مدیریت خاموشی
process.once('SIGINT', () => {
    console.log('🛑 ربات در حال خاموش شدن...');
    bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
    console.log('🛑 ربات در حال خاموش شدن...');
    bot.stop('SIGTERM');
});

// شروع ربات
startBot();
