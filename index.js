const { Telegraf } = require('telegraf');
const http = require('http');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

// تنظیمات اصلی
const BOT_TOKEN = '8135660826:AAHpqzFlEsy_rWcGjWMqvv-KCvE7tzUuT0I';
const SUPABASE_URL = 'https://phdwvxyglwnlqjciipgr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoZHd2eHlnbHdubHFqY2lpcGdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5OTU5MzUsImV4cCI6MjA3NTU3MTkzNX0.__c_CZk7vv9KIiPuDiTpWdblXeHwBo69z88x4vReTtQ';
const GATEWAY_GROUP_ID = -1002483328877;
const OWNER_ID = 7495437597;

// لیست گروه‌ها و کانال‌های زیرمجموعه
const OTHER_GROUPS = [
    -1002929172320, // گروه 1 - اینجا آیدی گروه‌ها رو وارد کن
    -1003147693863, // گروه 2
    -1002000000003, // کانال 1
    -1002000000004, // کانال 2
    // بقیه گروه‌ها و کانال‌ها رو اینجا اضافه کن
];

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
    console.log('🔄 پینگ ارسال شد - ربات فعال است');
}, 14 * 60 * 1000);

// اتصال به دیتابیس
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new Telegraf(BOT_TOKEN);

// متغیرهای سیستمی
let approvedUsers = new Set();
let stickers = {
    start: null,
    welcome: null,
    reject: null,
    intruder: null,
    ban: null
};

// ایجاد جدول استیکرها در دیتابیس
async function setupDatabase() {
    try {
        const { data, error } = await supabase
            .from('stickers')
            .select('*')
            .limit(1);

        if (error && error.code === '42P01') {
            // جدول وجود ندارد، ایجاد می‌کنیم
            console.log('📦 در حال ایجاد جدول استیکرها...');
            // اینجا باید از پنل Supabase جدول را دستی ایجاد کنی
        }
    } catch (error) {
        console.log('⚠️ خطا در بررسی دیتابیس:', error.message);
    }
}

// دستور شروع
bot.hears('شروع', async (ctx) => {
    if (ctx.from.id === OWNER_ID) {
        // ریپلای به پیام مالک
        await ctx.reply('نینجای چهار در خدمت شماست', {
            reply_to_message_id: ctx.message.message_id
        });
        
        // ارسال استیکر شروع
        if (stickers.start) {
            await ctx.replyWithSticker(stickers.start);
        }
        
        console.log('✅ ربات توسط مالک فعال شد');
    } else {
        await ctx.reply('❌ فقط مالک ربات می‌تواند این دستور را اجرا کند');
    }
});

// وقتی کاربر جدید به گروه دروازه می‌پیوندد
bot.on('chat_member', async (ctx) => {
    const chatMember = ctx.chatMember;
    const user = chatMember.new_chat_member.user;
    const chatId = chatMember.chat.id;
    const oldStatus = chatMember.old_chat_member.status;
    const newStatus = chatMember.new_chat_member.status;

    // فقط برای گروه دروازه
    if (chatId === GATEWAY_GROUP_ID) {
        // کاربر جدید جوین شده
        if ((newStatus === 'member' || newStatus === 'administrator') && 
            (oldStatus === 'left' || oldStatus === 'kicked')) {
            
            // اطلاع‌رسانی ورود کاربر جدید
            const userName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
            const message = `مسافر ${userName} وارد هال اکلیس شد\n\nارباب این شخص اجازه ورود به اکلیس رو داره؟`;
            
            await ctx.telegram.sendMessage(
                GATEWAY_GROUP_ID,
                message,
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
        }
        
        // کاربر از گروه خارج شده
        if ((newStatus === 'left' || newStatus === 'kicked') && 
            (oldStatus === 'member' || oldStatus === 'administrator')) {
            await handleUserLeftGateway(user);
        }
    }
    
    // بررسی گروه‌های دیگر برای نفوذی
    if (OTHER_GROUPS.includes(chatId) && (newStatus === 'member' || newStatus === 'administrator')) {
        const isApproved = approvedUsers.has(user.id);
        const inGateway = await checkUserInGateway(user.id);
        
        if (!isApproved || !inGateway) {
            await handleIntruder(user, chatId);
        }
    }
});

// مدیریت پاسخ‌های اینلاین
bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const user = ctx.callbackQuery.from;
    
    if (user.id !== OWNER_ID) {
        await ctx.answerCbQuery('❌ فقط ارباب می‌تواند تصمیم بگیرد');
        return;
    }
    
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
    approvedUsers.add(userId);
    
    // دریافت اطلاعات کاربر
    let targetUser;
    try {
        targetUser = await ctx.telegram.getChatMember(GATEWAY_GROUP_ID, userId);
    } catch (error) {
        console.error('خطا در دریافت اطلاعات کاربر:', error);
        return;
    }
    
    const userName = targetUser.user.first_name + (targetUser.user.last_name ? ' ' + targetUser.user.last_name : '');
    
    // ارسال پیام تأیید
    await ctx.editMessageText(`مسافر ${userName} به جهان بزرگ اکلیس خوش اومدی`);
    
    // ارسال استیکر خوش‌آمد
    if (stickers.welcome) {
        await ctx.telegram.sendSticker(GATEWAY_GROUP_ID, stickers.welcome);
    }
    
    await ctx.answerCbQuery('✅ کاربر تایید شد');
    console.log(`✅ کاربر ${userId} تایید شد`);
}

// رد کاربر
async function rejectUser(userId, ctx) {
    // دریافت اطلاعات کاربر
    let targetUser;
    try {
        targetUser = await ctx.telegram.getChatMember(GATEWAY_GROUP_ID, userId);
    } catch (error) {
        console.error('خطا در دریافت اطلاعات کاربر:', error);
        return;
    }
    
    const userName = targetUser.user.first_name + (targetUser.user.last_name ? ' ' + targetUser.user.last_name : '');
    
    // بن کردن از گروه دروازه
    try {
        await ctx.telegram.banChatMember(GATEWAY_GROUP_ID, userId);
    } catch (error) {
        console.error('خطا در بن کردن کاربر:', error);
    }
    
    // ارسال پیام رد
    await ctx.editMessageText(`${userName} از اکلیس بیرون رانده شد`);
    
    // ارسال استیکر رد
    if (stickers.reject) {
        await ctx.telegram.sendSticker(GATEWAY_GROUP_ID, stickers.reject);
    }
    
    await ctx.answerCbQuery('❌ کاربر رد و بن شد');
    console.log(`❌ کاربر ${userId} رد و بن شد`);
}

// مدیریت نفوذی
async function handleIntruder(user, groupId) {
    try {
        // بن کردن از گروه
        await bot.telegram.banChatMember(groupId, user.id);
        
        // ارسال گزارش
        const report = `مکرد مشکوک ${user.first_name}${user.last_name ? ' ' + user.last_name : ''} در منطقه ${groupId} در تاریخ ${new Date().toLocaleString('fa-IR')} قصد نفوذ داشت ، که با موفقیت پیدا ، شکار و کشته شد`;
        
        await bot.telegram.sendMessage(OWNER_ID, report);
        
        // ارسال استیکر نفوذی
        if (stickers.intruder) {
            await bot.telegram.sendSticker(OWNER_ID, stickers.intruder);
        }
        
        console.log(`🚨 نفوذی ${user.id} شناسایی و بن شد`);
    } catch (error) {
        console.error('خطا در بن کردن نفوذی:', error);
    }
}

// مدیریت خروج کاربر از دروازه
async function handleUserLeftGateway(user) {
    approvedUsers.delete(user.id);
    
    // بن کردن از تمام گروه‌های دیگر
    for (const groupId of OTHER_GROUPS) {
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

// دستور تنظیم استیکر
bot.hears(/^ذخیره استیکر (شروع|خوشآمد|رد|نفوذی|بن)$/, async (ctx) => {
    if (ctx.from.id !== OWNER_ID) {
        await ctx.reply('❌ فقط مالک می‌تواند استیکر تنظیم کند');
        return;
    }
    
    if (!ctx.message.reply_to_message || !ctx.message.reply_to_message.sticker) {
        await ctx.reply('❌ لطفاً به یک استیکر ریپلای کنید');
        return;
    }
    
    const stickerType = ctx.match[1];
    const stickerFileId = ctx.message.reply_to_message.sticker.file_id;
    
    // ذخیره در متغیر
    stickers[stickerType === 'خوشآمد' ? 'welcome' : 
             stickerType === 'شروع' ? 'start' :
             stickerType === 'رد' ? 'reject' :
             stickerType === 'نفوذی' ? 'intruder' : 'ban'] = stickerFileId;
    
    // ذخیره در دیتابیس
    try {
        const { error } = await supabase
            .from('stickers')
            .upsert({
                type: stickerType === 'خوشآمد' ? 'welcome' : 
                      stickerType === 'شروع' ? 'start' :
                      stickerType === 'رد' ? 'reject' :
                      stickerType === 'نفوذی' ? 'intruder' : 'ban',
                file_id: stickerFileId
            });
        
        if (error) throw error;
    } catch (error) {
        console.error('خطا در ذخیره استیکر:', error);
    }
    
    await ctx.reply(`✅ استیکر ${stickerType} با موفقیت ذخیره شد`);
});

// دستور بن با ریپلای
bot.hears('بن', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) {
        await ctx.reply('❌ فقط مالک می‌تواند بن کند');
        return;
    }
    
    let targetUser;
    
    // اگر ریپلای شده
    if (ctx.message.reply_to_message) {
        targetUser = ctx.message.reply_to_message.from;
    } 
    // اگر یوزرنیم داده شده
    else if (ctx.message.text.includes('@')) {
        const username = ctx.message.text.split('@')[1].split(' ')[0];
        // اینجا باید کاربر را با یوزرنیم پیدا کنی
        // فعلاً پیام خطا می‌دهیم
        await ctx.reply('❌ این قابلیت نیاز به توسعه بیشتر دارد');
        return;
    } else {
        await ctx.reply('❌ لطفاً به کاربر مورد نظر ریپلای کنید یا یوزرنیم وارد کنید');
        return;
    }
    
    // بن از تمام گروه‌ها
    try {
        await bot.telegram.banChatMember(GATEWAY_GROUP_ID, targetUser.id);
        
        for (const groupId of OTHER_GROUPS) {
            try {
                await bot.telegram.banChatMember(groupId, targetUser.id);
            } catch (error) {
                // ممکن است کاربر در گروه نباشد
            }
        }
        
        approvedUsers.delete(targetUser.id);
        
        await ctx.reply(`✅ کاربر ${targetUser.first_name} از تمام گروه‌ها بن شد`);
        
        // ارسال استیکر بن
        if (stickers.ban) {
            await ctx.replyWithSticker(stickers.ban);
        }
        
        console.log(`✅ کاربر ${targetUser.id} توسط مالک بن شد`);
    } catch (error) {
        await ctx.reply('❌ خطا در بن کردن کاربر');
        console.error('خطا در بن کردن:', error);
    }
});

// بارگذاری استیکرها از دیتابیس
async function loadStickers() {
    try {
        const { data, error } = await supabase
            .from('stickers')
            .select('*');
        
        if (error) throw error;
        
        if (data) {
            data.forEach(item => {
                stickers[item.type] = item.file_id;
            });
            console.log('✅ استیکرها از دیتابیس بارگذاری شدند');
        }
    } catch (error) {
        console.log('⚠️ خطا در بارگذاری استیکرها:', error.message);
    }
}

// راه‌اندازی ربات
async function startBot() {
    try {
        // ایجاد جدول‌ها
        await setupDatabase();
        
        // بارگذاری استیکرها
        await loadStickers();
        
        // راه‌اندازی ربات
        await bot.launch();
        
        console.log('🤖 ربات نینجای چهار راه‌اندازی شد');
        console.log('👤 مالک:', OWNER_ID);
        console.log('🚪 گروه دروازه:', GATEWAY_GROUP_ID);
        console.log('🔒 تعداد گروه‌های تحت حفاظت:', OTHER_GROUPS.length);
        console.log('📍 منتظر دستور "شروع" از طرف مالک...');
        
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
