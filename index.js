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
let pendingApprovals = new Map(); // ذخیره کاربران در انتظار تایید
let stickers = new Map(); // ذخیره استیکرها

// لیست گروه‌ها و کانال‌های زیرمجموعه - اینجا رو پر کنید
let otherGroups = [
    -1002929172320, // گروه نمونه 1 - آیدی واقعی رو وارد کنید
    -1003147693863, // گروه نمونه 2 - آیدی واقعی رو وارد کنید
    -1002000000003, // کانال نمونه 1 - آیدی واقعی رو وارد کنید
    // بقیه گروه‌ها و کانال‌ها رو اینجا اضافه کنید
];

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

// دستور برای تنظیم استیکر
bot.command('setsticker', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) {
        return ctx.reply('❌ فقط مالک می‌تواند استیکر تنظیم کند');
    }

    const args = ctx.message.text.split(' ');
    if (args.length < 3) {
        return ctx.reply('⚠️ فرمت دستور:\n/setsticker [نوع] [ریپلای روی استیکر]\n\nانواع استیکر:\nstart - شروع\nwelcome - خوش آمدگویی\nreject - رد کاربر\nintruder - نفوذی');
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

// ارسال استیکر بر اساس نوع
async function sendSticker(ctx, type) {
    const fileId = stickers.get(type);
    if (fileId) {
        await ctx.replyWithSticker(fileId);
    }
}

// مدیریت دستور "شروع" - فقط برای مالک
bot.hears('شروع', async (ctx) => {
    if (ctx.from.id === OWNER_ID) {
        const message = await ctx.reply('نینجای چهار در خدمت شماست', {
            reply_to_message_id: ctx.message.message_id
        });
        
        // ارسال استیکر شروع
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

    // اگر کاربر جدید به گروه دروازه پیوست
    if (chatId === GATEWAY_GROUP_ID && 
        (newStatus === 'member' || newStatus === 'administrator') && 
        (oldStatus === 'left' || oldStatus === 'kicked')) {
        
        await handleNewUserInGateway(user);
    }
    
    // اگر کاربر از گروه دروازه خارج شد
    if (chatId === GATEWAY_GROUP_ID && 
        (newStatus === 'left' || newStatus === 'kicked') && 
        (oldStatus === 'member' || oldStatus === 'administrator')) {
        
        await handleUserLeftGateway(user);
    }
    
    // اگر کاربر به گروه‌های دیگر پیوست
    if (otherGroups.includes(chatId) && 
        (newStatus === 'member' || newStatus === 'administrator')) {
        
        await handleUserInOtherGroups(user, chatId);
    }
});

// مدیریت کاربر جدید در دروازه
async function handleNewUserInGateway(user) {
    const userName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
    const username = user.username ? '@' + user.username : 'بدون یوزرنیم';
    
    const messageText = `مسافر ${userName} وارد هال اکلیس شد\n\nارباب این شخص اجازه ورود به اکلیس رو داره؟`;
    
    // ذخیره کاربر در انتظار تایید
    pendingApprovals.set(user.id, {
        userName,
        username,
        userId: user.id,
        joinTime: new Date()
    });
    
    // ارسال پیام به مالک
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
    
    // ارسال پیام به گروه دروازه
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
    await ctx.editMessageText(`✅ مسافر ${userData.userName} تایید شد`);
    
    // ارسال پیام خوش آمدگویی
    await bot.telegram.sendMessage(
        GATEWAY_GROUP_ID,
        `🎉 مسافر ${userData.userName} به جهان بزرگ اکلیس خوش اومدی`
    );
    
    // ارسال استیکر خوش آمدگویی
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
    
    // بن کردن از گروه دروازه
    try {
        await bot.telegram.banChatMember(GATEWAY_GROUP_ID, userId);
        await ctx.answerCbQuery('❌ کاربر بن شد');
        await ctx.editMessageText(`❌ ${userData.userName} از اکلیس بیرون رانده شد`);
        
        // ارسال استیکر رد
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
        // بن کردن از گروه
        await bot.telegram.banChatMember(groupId, user.id);
        
        // ارسال گزارش
        const report = `🚨 مکرد مشکوک ${userName} در منطقه ${groupId} در تاریخ ${joinTime} قصد نفوذ داشت ، که با موفقیت پیدا ، شکار و کشته شد`;
        
        await bot.telegram.sendMessage(OWNER_ID, report);
        
        // ارسال استیکر نفوذی
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
    
    // بن کردن از تمام گروه‌های دیگر
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

// دستور بن با ریپلای
bot.on('message', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    
    const message = ctx.message.text;
    
    // اگر پیام حاوی "بن" باشد و ریپلای شده باشد
    if (message && message.includes('بن') && ctx.message.reply_to_message) {
        const targetUser = ctx.message.reply_to_message.from;
        await banUserFromAllGroups(targetUser, ctx);
    }
    
    // اگر پیام حاوی "بن @یوزرنیم" باشد
    if (message && message.startsWith('بن @')) {
        const username = message.split(' ')[0].replace('بن @', '');
        await banUserByUsername(username, ctx);
    }
});

// بن کردن کاربر از تمام گروه‌ها
async function banUserFromAllGroups(user, ctx) {
    const userName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
    
    try {
        // بن کردن از گروه دروازه
        await bot.telegram.banChatMember(GATEWAY_GROUP_ID, user.id);
        
        // بن کردن از تمام گروه‌های دیگر
        for (const groupId of otherGroups) {
            try {
                await bot.telegram.banChatMember(groupId, user.id);
            } catch (error) {
                // ممکن است کاربر در گروه نباشد
            }
        }
        
        approvedUsers.delete(user.id);
        pendingApprovals.delete(user.id);
        
        await ctx.reply(`✅ کاربر ${userName} از تمام گروه‌ها بن شد`);
        console.log(`✅ کاربر ${user.id} از تمام گروه‌ها بن شد`);
    } catch (error) {
        await ctx.reply('❌ خطا در بن کردن کاربر');
        console.error('خطا در بن کردن کاربر:', error);
    }
}

// بن کردن کاربر با یوزرنیم
async function banUserByUsername(username, ctx) {
    try {
        // اینجا باید کاربر رو با یوزرنیم پیدا کنیم
        // در تلگرام این کار سخت است، بهتر است از ریپلای استفاده شود
        await ctx.reply('⚠️ برای بن کردن بهتر است روی پیام کاربر ریپلای کنید و بنویسید "بن"');
    } catch (error) {
        console.error('خطا در بن کردن با یوزرنیم:', error);
    }
}

// تابع برای اضافه کردن گروه جدید
function addGroup(groupId) {
    if (!otherGroups.includes(groupId)) {
        otherGroups.push(groupId);
        console.log(`✅ گروه جدید اضافه شد: ${groupId}`);
    }
}

// تابع برای حذف گروه
function removeGroup(groupId) {
    otherGroups = otherGroups.filter(id => id !== groupId);
    console.log(`❌ گروه حذف شد: ${groupId}`);
}

// راه‌اندازی ربات
async function startBot() {
    try {
        // بارگذاری استیکرها از دیتابیس
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
