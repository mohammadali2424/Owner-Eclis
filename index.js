require('dotenv').config(); // بارگذاری متغیرهای محیطی از فایل .env

const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const http = require('http');
const express = require('express');

// تنظیمات از متغیرهای محیطی
const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const GATEWAY_GROUP_ID = parseInt(process.env.GATEWAY_GROUP_ID);
const OWNER_ID = parseInt(process.env.OWNER_ID);

// ایجاد سرور برای پینگ
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.get('/', (req, res) => {
    res.json({ 
        status: 'active', 
        service: 'Ninja4 Bot',
        timestamp: new Date().toISOString(),
        version: '2.0.0'
    });
});

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 سرور پینگ روی پورت ${PORT} فعال شد`);
});

// پینگ هر 14 دقیقه
setInterval(() => {
    http.get(`http://localhost:${PORT}`, (res) => {
        console.log('🔄 پینگ سلامت ارسال شد');
    }).on('error', (err) => {
        console.error('❌ خطا در پینگ سلامت:', err.message);
    });
}, 14 * 60 * 1000);

// اتصال به دیتابیس
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new Telegraf(BOT_TOKEN);

// مدیریت خطاهای Supabase
supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
        console.error('❌ اتصال به Supabase قطع شد');
    }
});

// ========================== سیستم ذخیره‌سازی دیتابیس ==========================
async function saveSticker(type, fileId) {
    try {
        const { data, error } = await supabase
            .from('stickers')
            .upsert({ 
                type, 
                file_id: fileId,
                created_at: new Date().toISOString()
            });
        
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('خطا در ذخیره استیکر:', error);
        return false;
    }
}

// تابع برای ذخیره گروه به عنوان گروه تحت حفاظت به طور خودکار
async function addGroupToProtectedList(groupId, groupName = null) {
    try {
        const { error } = await supabase
            .from('protected_groups')
            .upsert({
                group_id: groupId,
                group_name: groupName,
                added_at: new Date().toISOString(),
                added_by: OWNER_ID
            });
        
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('خطا در اضافه کردن گروه به لیست محافظت شده:', error);
        return false;
    }
}

// تابع برای اضافه کردن گروه به لیست محافظت شده زمانی که ربات به گروه اضافه می‌شود
bot.on('chat_member', async (ctx) => {
    try {
        const chatMember = ctx.chatMember;
        const user = chatMember.new_chat_member.user;
        const chatId = chatMember.chat.id;
        const newStatus = chatMember.new_chat_member.status;

        // اگر گروه جدید به گروه دروازه یا گروه جدیدی اضافه شد
        if (newStatus === 'member' || newStatus === 'administrator') {
            const group = await bot.telegram.getChat(chatId);
            await addGroupToProtectedList(chatId, group.title);
            console.log(`✅ گروه جدید به زیرمجموعه‌ها اضافه شد: ${group.title}`);
        }
    } catch (error) {
        console.error('خطا در مدیریت اضافه شدن گروه:', error);
    }
});

// ========================== عملکردهای اصلی ربات ==========================
async function sendSticker(chatId, type) {
    try {
        const fileId = await getSticker(type);
        if (!fileId) {
            console.warn(`⚠️ استیکر ${type} تنظیم نشده است`);
            return false;
        }
        
        await bot.telegram.sendSticker(chatId, fileId);
        return true;
    } catch (error) {
        console.error(`❌ خطا در ارسال استیکر ${type}:`, error.message);
        return false;
    }
}

// ========================== دستورات مدیریتی ==========================
bot.command('setsticker', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) {
        return await ctx.reply('❌ فقط مالک می‌تواند استیکر تنظیم کند');
    }

    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return await ctx.reply('⚠️ فرمت دستور:\n/setsticker [نوع]\n\nانواع استیکر:\n• start - شروع\n• welcome - خوش آمدگویی\n• reject - رد کاربر\n• intruder - نفوذی\n• kill - کشتن کاربر\n• areas - مناطق');
    }

    const type = args[1];
    const validTypes = ['start', 'welcome', 'reject', 'intruder', 'kill', 'areas'];
    
    if (!validTypes.includes(type)) {
        return await ctx.reply(`❌ نوع استیکر نامعتبر است\n\nانواع مجاز: ${validTypes.join(', ')}`);
    }

    if (!ctx.message.reply_to_message || !ctx.message.reply_to_message.sticker) {
        return await ctx.reply('❌ لطفا روی یک استیکر ریپلای کنید');
    }

    const fileId = ctx.message.reply_to_message.sticker.file_id;
    const success = await saveSticker(type, fileId);

    if (success) {
        await ctx.reply(`✅ استیکر ${type} با موفقیت ذخیره شد`);
    } else {
        await ctx.reply('❌ خطا در ذخیره استیکر');
    }
});

// ========================== راه‌اندازی ربات ==========================
async function initializeBot() {
    try {
        console.log('🔧 در حال راه‌اندازی ربات...');

        // بررسی اتصال به دیتابیس
        const { data: stickers, error } = await supabase
            .from('stickers')
            .select('type')
            .limit(1);
        
        if (error) {
            throw new Error(`خطا در اتصال به دیتابیس: ${error.message}`);
        }

        // بررسی اتصال به تلگرام
        await bot.telegram.getMe();
        
        console.log('✅ تمام اتصالات بررسی شدند');
        return true;
        
    } catch (error) {
        console.error('❌ خطا در راه‌اندازی ربات:', error.message);
        return false;
    }
}

// راه‌اندازی ربات
async function startBot() {
    try {
        const initialized = await initializeBot();
        if (!initialized) {
            throw new Error('خطا در راه‌اندازی اولیه ربات');
        }
        
        await bot.launch();
        console.log('🤖 ربات نینجای چهار راه‌اندازی شد');
        console.log('📍 منتظر فعالیت...');
    } catch (error) {
        console.error('❌ خطا در راه‌اندازی ربات:', error);
        process.exit(1);
    }
}

startBot();

