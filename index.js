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

// لیست گروه‌ها و کانال‌های زیرمجموعه - اینجا آیدی‌ها رو وارد کن
const OTHER_GROUPS = [
    -1003147693863, // گروه ۱
    -1002929172320, // گروه ۲
    -1002000000003, // کانال ۱
    -1002000000004, // کانال ۲
    // بقیه رو اینجا اضافه کن
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
    ban: null,
    protected: null,
    not_protected: null
};

// ایجاد جدول در دیتابیس
async function setupDatabase() {
    try {
        // ایجاد جدول استیکرها
        const { error } = await supabase
            .from('stickers')
            .select('*')
            .limit(1);

        if (error) {
            console.log('📦 جدول استیکرها وجود ندارد - از پنل Supabase ایجادش کن');
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

// دستور نینجا - بررسی منطقه
bot.hears('نینجا', async (ctx) => {
    const chatId = ctx.chat.id;
    const isProtected = chatId === GATEWAY_GROUP_ID || OTHER_GROUPS.includes(chatId);
    
    if (isProtected) {
        await ctx.reply('🛡️ این منطقه تحت حفاظت منه');
        if (stickers.protected) {
            await ctx.replyWithSticker(stickers.protected);
        }
    } else {
        await ctx.reply('❌ این منطقه تحت حفاظت من نیست');
        if (stickers.not_protected) {
            await ctx.replyWithSticker(stickers.not_protected);
        }
    }
});

// دستور لیست مناطق
bot.hears('لیست مناطق', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) {
        await ctx.reply('❌ فقط مالک می‌تواند این دستور را اجرا کند');
        return;
    }
    
    let message = '🗺️ لیست مناطق تحت حفاظت:\n\n';
    message += `🚪 دروازه اصلی: ${GATEWAY_GROUP_ID}\n\n`;
    message += '🔒 مناطق زیرمجموعه:\n';
    
    OTHER_GROUPS.forEach((groupId, index) => {
        message += `${index + 1}. ${groupId}\n`;
    });
    
    message += `\n📊 مجموع: ${OTHER_GROUPS.length} منطقه`;
    
    await ctx.reply(message);
});

// دستور لیست استیکرها
bot.hears('لیست استیکرها', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) {
        await ctx.reply('❌ فقط مالک می‌تواند این دستور را اجرا کند');
        return;
    }
    
    let message = '🎭 لیست استیکرهای تنظیم شده:\n\n';
    
    const stickerList = [
        { name: 'شروع', key: 'start' },
        { name: 'خوش‌آمد', key: 'welcome' },
        { name: 'رد کاربر', key: 'reject' },
        { name: 'نفوذی', key: 'intruder' },
        { name: 'بن', key: 'ban' },
        { name: 'تحت حفاظت', key: 'protected' },
        { name: 'عدم حفاظت', key: 'not_protected' }
    ];
    
    stickerList.forEach(item => {
        const status = stickers[item.key] ? '✅' : '❌';
        message += `${status} ${item.name}\n`;
    });
    
    message += '\n💡 برای تنظیم استیکر: "ذخیره استیکر [نام]" + ریپلای روی استیکر';
    
    await ctx.reply(message);
});

// وقتی کاربر جدید به گروه دروازه می‌پیوندد
bot.on('chat_member', async (ctx) => {
    const chatMember = ctx.chatMember;
    const user = chatMember.new_chat_member.user;
    const chatId = chatMember.chat.id;
    const oldStatus = chatMember.old_chat_member.status;
    const newStatus = chatMember.new_chat_member.status;

    console.log(`🔍 فعالیت در چت ${chatId} - کاربر ${user.id} - وضعیت جدید: ${newStatus}`);

    // فقط برای گروه دروازه
    if (chatId === GATEWAY_GROUP_ID) {
        // کاربر جدید جوین شده
        if ((newStatus === 'member' || newStatus === 'administrator') && 
            (oldStatus === 'left' || oldStatus === 'kicked')) {
            
            console.log(`👤 کاربر جدید ${user.id} وارد دروازه شد`);
            
            // اطلاع‌رسانی ورود کاربر جدید
            const userName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
            const message = `مسافر ${userName} وارد هال اکلیس شد\n\nارباب این شخص اجازه ورود به اکلیس رو داره؟`;
            
            try {
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
                console.log(`📨 درخواست تایید برای کاربر ${user.id} ارسال شد`);
            } catch (error) {
                console.error('❌ خطا در ارسال درخواست تایید:', error);
            }
        }
        
        // کاربر از گروه خارج شده
        if ((newStatus === 'left' || newStatus === 'kicked') && 
            (oldStatus === 'member' || oldStatus === 'administrator')) {
            console.log(`🚶 کاربر ${user.id} از دروازه خارج شد`);
            await handleUserLeftGateway(user);
        }
    }
    
    // بررسی گروه‌های دیگر برای نفوذی
    if (OTHER_GROUPS.includes(chatId) && (newStatus === 'member' || newStatus === 'administrator')) {
        console.log(`🔒 بررسی کاربر ${user.id} در منطقه ${chatId}`);
        
        const isApproved = approvedUsers.has(user.id);
        const inGateway = await checkUserInGateway(user.id);
        
        console.log(`👤 کاربر ${user.id} - تایید شده: ${isApproved}, در دروازه: ${inGateway}`);
        
        if (!isApproved || !inGateway) {
            console.log(`🚨 نفوذی شناسایی شد: ${user.id}`);
            await handleIntruder(user, chatId);
        } else {
            console.log(`✅ کاربر ${user.id} مجاز است`);
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
        const chatMember = await ctx.telegram.getChatMember(GATEWAY_GROUP_ID, userId);
        targetUser = chatMember.user;
    } catch (error) {
        console.error('خطا در دریافت اطلاعات کاربر:', error);
        await ctx.answerCbQuery('❌ خطا در دریافت اطلاعات کاربر');
        return;
    }
    
    const userName = targetUser.first_name + (targetUser.last_name ? ' ' + targetUser.last_name : '');
    
    // ویرایش پیام قبلی
    try {
        await ctx.editMessageText(`✅ مسافر ${userName} به جهان بزرگ اکلیس خوش اومدی`);
    } catch (error) {
        console.error('خطا در ویرایش پیام:', error);
    }
    
    // ارسال استیکر خوش‌آمد
    if (stickers.welcome) {
        try {
            await ctx.telegram.sendSticker(GATEWAY_GROUP_ID, stickers.welcome);
        } catch (error) {
            console.error('خطا در ارسال استیکر:', error);
        }
    }
    
    await ctx.answerCbQuery('✅ کاربر تایید شد');
    console.log(`✅ کاربر ${userId} تایید شد`);
}

// رد کاربر
async function rejectUser(userId, ctx) {
    // دریافت اطلاعات کاربر
    let targetUser;
    try {
        const chatMember = await ctx.telegram.getChatMember(GATEWAY_GROUP_ID, userId);
        targetUser = chatMember.user;
    } catch (error) {
        console.error('خطا در دریافت اطلاعات کاربر:', error);
        await ctx.answerCbQuery('❌ خطا در دریافت اطلاعات کاربر');
        return;
    }
    
    const userName = targetUser.first_name + (targetUser.last_name ? ' ' + targetUser.last_name : '');
    
    // بن کردن از گروه دروازه
    try {
        await ctx.telegram.banChatMember(GATEWAY_GROUP_ID, userId);
        console.log(`✅ کاربر ${userId} از دروازه بن شد`);
    } catch (error) {
        console.error('خطا در بن کردن کاربر:', error);
    }
    
    // ویرایش پیام قبلی
    try {
        await ctx.editMessageText(`❌ ${userName} از اکلیس بیرون رانده شد`);
    } catch (error) {
        console.error('خطا در ویرایش پیام:', error);
    }
    
    // ارسال استیکر رد
    if (stickers.reject) {
        try {
            await ctx.telegram.sendSticker(GATEWAY_GROUP_ID, stickers.reject);
        } catch (error) {
            console.error('خطا در ارسال استیکر:', error);
        }
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
        
        console.log(`🚨 نفوذی ${user.id} شناسایی و بن شد از منطقه ${groupId}`);
    } catch (error) {
        console.error('خطا در بن کردن نفوذی:', error);
    }
}

// مدیریت خروج کاربر از دروازه
async function handleUserLeftGateway(user) {
    approvedUsers.delete(user.id);
    
    console.log(`🚶 کاربر ${user.id} از دروازه خارج شد - حذف از لیست تایید شده‌ها`);

    // بن کردن از تمام گروه‌های دیگر
    for (const groupId of OTHER_GROUPS) {
        try {
            await bot.telegram.banChatMember(groupId, user.id);
            console.log(`✅ کاربر ${user.id} از منطقه ${groupId} بن شد`);
        } catch (error) {
            // ممکن است کاربر در گروه نباشد
        }
    }
    
    console.log(`✅ کاربر ${user.id} از تمام مناطق حذف شد`);
}

// بررسی حضور کاربر در گروه دروازه
async function checkUserInGateway(userId) {
    try {
        const member = await bot.telegram.getChatMember(GATEWAY_GROUP_ID, userId);
        const isInGateway = member.status === 'member' || member.status === 'administrator' || member.status === 'creator';
        console.log(`🔎 بررسی دروازه برای ${userId}: ${isInGateway}`);
        return isInGateway;
    } catch (error) {
        console.error('❌ خطا در بررسی حضور کاربر در دروازه:', error);
        return false;
    }
}

// دستور تنظیم استیکر
bot.hears(/^ذخیره استیکر (شروع|خوشآمد|رد|نفوذی|بن|تحت حفاظت|عدم حفاظت)$/, async (ctx) => {
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
    
    // تبدیل نام فارسی به کلید انگلیسی
    const typeMap = {
        'شروع': 'start',
        'خوشآمد': 'welcome',
        'رد': 'reject',
        'نفوذی': 'intruder',
        'بن': 'ban',
        'تحت حفاظت': 'protected',
        'عدم حفاظت': 'not_protected'
    };
    
    const englishType = typeMap[stickerType];
    
    if (!englishType) {
        await ctx.reply('❌ نوع استیکر نامعتبر است');
        return;
    }
    
    // ذخیره در متغیر
    stickers[englishType] = stickerFileId;
    
    // ذخیره در دیتابیس
    try {
        // حذف استیکر قبلی اگر وجود دارد
        const { error: deleteError } = await supabase
            .from('stickers')
            .delete()
            .eq('type', englishType);
        
        // اضافه کردن استیکر جدید
        const { error } = await supabase
            .from('stickers')
            .insert({
                type: englishType,
                file_id: stickerFileId
            });
        
        if (error) throw error;
        
        console.log(`✅ استیکر ${stickerType} ذخیره شد: ${stickerFileId}`);
    } catch (error) {
        console.error('❌ خطا در ذخیره استیکر:', error);
    }
    
    await ctx.reply(`✅ استیکر ${stickerType} با موفقیت ذخیره شد`);
});

// دستور بن با ریپلای - نسخه اصلاح شده
bot.hears('بن', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) {
        await ctx.reply('❌ فقط مالک می‌تواند بن کند');
        return;
    }
    
    let targetUserId;
    let userName = 'نامشخص';
    
    // اگر ریپلای شده
    if (ctx.message.reply_to_message) {
        targetUserId = ctx.message.reply_to_message.from.id;
        userName = ctx.message.reply_to_message.from.first_name + 
                  (ctx.message.reply_to_message.from.last_name ? ' ' + ctx.message.reply_to_message.from.last_name : '');
    } 
    // اگر متن همراه بن است (مثل بن @username)
    else if (ctx.message.text.length > 3) {
        await ctx.reply('❌ این قابلیت نیاز به توسعه بیشتر دارد. لطفاً با ریپلای استفاده کنید.');
        return;
    } else {
        await ctx.reply('❌ لطفاً به کاربر مورد نظر ریپلای کنید');
        return;
    }
    
    // بن از تمام گروه‌ها
    try {
        // بن از دروازه
        await bot.telegram.banChatMember(GATEWAY_GROUP_ID, targetUserId);
        
        // بن از مناطق دیگر
        for (const groupId of OTHER_GROUPS) {
            try {
                await bot.telegram.banChatMember(groupId, targetUserId);
            } catch (error) {
                // ممکن است کاربر در گروه نباشد
            }
        }
        
        // حذف از لیست تایید شده‌ها
        approvedUsers.delete(targetUserId);
        
        await ctx.reply(`✅ کاربر ${userName} از تمام گروه‌ها بن شد`);
        
        // ارسال استیکر بن
        if (stickers.ban) {
            await ctx.replyWithSticker(stickers.ban);
        }
        
        console.log(`✅ کاربر ${targetUserId} توسط مالک بن شد`);
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
        
        if (data && data.length > 0) {
            data.forEach(item => {
                stickers[item.type] = item.file_id;
            });
            console.log('✅ استیکرها از دیتابیس بارگذاری شدند');
        } else {
            console.log('ℹ️ هیچ استیکری در دیتابیس ذخیره نشده است');
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
        console.log('🔒 تعداد مناطق تحت حفاظت:', OTHER_GROUPS.length);
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
