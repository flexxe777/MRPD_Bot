const express = require('express');
const mongoose = require('mongoose');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(port, () => console.log(`Server is listening on port ${port}`));

// --- MONGOOSE AYARLARI ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Veritabanına bağlandık!'))
  .catch(err => console.error('❌ MongoDB bağlantı hatası:', err));

const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    fivemId: String,
    onDuty: { type: Boolean, default: false },
    startTime: { type: Number, default: null },
    totalTime: { type: Number, default: 0 },
    weeklyTime: { type: Number, default: 0 },
    leaveUntil: { type: Number, default: null }, 
    leaveText: { type: String, default: null }
});
const User = mongoose.model('User', userSchema);

// --- DİSCORD.JS ---
const {
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder,
    ButtonBuilder, ButtonStyle, SlashCommandBuilder, REST, Routes,
    ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates
    ]
});

let aktifKadroMsg = null;
let izinPanelMsg = null;
const afkTimeouts = new Map();

// --- YARDIMCI FONKSİYONLAR ---
function formatTime(ms) {
    let totalSeconds = Math.floor(ms / 1000);
    let isNegative = totalSeconds < 0;
    totalSeconds = Math.abs(totalSeconds);
    let h = Math.floor(totalSeconds / 3600);
    let m = Math.floor((totalSeconds % 3600) / 60);
    let s = totalSeconds % 60;
    return `${isNegative ? '-' : ''}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDate() {
    const d = new Date(Date.now() + 3 * 3600000); // TR Saati
    return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth()+1).padStart(2, '0')}.${d.getUTCFullYear()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function parseEndTime(saatAraligi) {
    try {
        const parts = saatAraligi.split('-').map(s => s.trim());
        const endTimeStr = parts.length > 1 ? parts[1] : parts[0]; 
        const [hStr, mStr] = endTimeStr.replace('.', ':').split(':');
        
        let h = parseInt(hStr, 10);
        let m = parseInt(mStr, 10) || 0;
        if (isNaN(h)) return null;

        const trDate = new Date(Date.now() + 3 * 3600000).toISOString().split('T')[0]; 
        const dateString = `${trDate}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+03:00`;
        
        return Date.parse(dateString);
    } catch (e) {
        return null;
    }
}

async function updateIzinPanel() {
    if (!izinPanelMsg) return;
    try {
        const izinliler = await User.find({ leaveUntil: { $ne: null } });
        let listText = '';
        for (const u of izinliler) {
            try {
                const member = await client.users.fetch(u.userId);
                const name = member ? member.username : 'Bilinmeyen Personel';
                const fId = u.fivemId || 'ID-Yok';
                listText += `▶ ${fId} ${name} - ${u.leaveText || 'Belirtilmedi'}\n`;
            } catch(e) {}
        }
        if (listText === '') listText = 'Şu an izinde personel bulunmuyor.';
        
        const embed = new EmbedBuilder()
            .setColor(0x2b2d31)
            .setTitle('🚓 Davis County Sheriff\'s Office — İzin Sistemi')
            .setDescription(`🏖️ **İzin & Mazeret Paneli**\n\nAşağıdaki butonları kullanarak izinlerinizi bildirebilirsiniz.\n\n📝 **İzin Talebi Oluştur**\nTarih aralığı ve mazeret bilgilerinizle talebinizi gönderin.\n\n⏳ **Saatlik Mazeret**\nSadece bugünü kapsayan saatlik mazeretlerinizi bildirin.\n\n✅ **Onay Süreci**\nTalebiniz onaylandığında rolünüz otomatik verilir.\n\n🔄 **Erken Dönüş**\nErken dönerseniz **İznimi Bitir** butonunu kullanın.\n\n👥 **Şu An İzinli Olanlar — ${izinliler.length} personel**\n${listText}`)
            .setFooter({ text: `${izinliler.length} personel izinde • Son güncelleme: ${formatDate()}` });

        await izinPanelMsg.edit({ embeds: [embed] }).catch(() => {});
    } catch(e) { console.error('Panel guncelleme hatasi:', e); }
}

// --- AYARLAR ---
const TOKEN = process.env.TOKEN;
const LOG_KANAL_ID = process.env.LOG_KANAL_ID || '1522260330502291767';
const STRIKE_KANAL_ID = process.env.STRIKE_KANAL_ID || '1475505351108591707';
const IHRAC_KANAL_ID = process.env.IHRAC_KANAL_ID || '1478819151689679039';
const IHRAC_ROL_ID = process.env.IHRAC_ROL_ID || '1475505209278075131';

const KOMUT_LOG_KANAL_ID = process.env.KOMUT_LOG_KANAL_ID || '1528929952412733480'; 
const SUNUCU_ID = process.env.SUNUCU_ID || '1224108385771716749'; 
const YETKILI_ROL_ID = process.env.YETKILI_ROL_ID || '1528933720969580634'; 
const IZINLI_ROL_ID = process.env.IZINLI_ROL_ID || '1525600296951222323'; 
const IZIN_LOG_KANAL_ID = process.env.IZIN_LOG_KANAL_ID || '1528933597896114368'; 
const MULAKAT_KANAL_ID = process.env.MULAKAT_KANAL_ID || '1475505308292878336'; 
const MULAKAT_YETKILISI_ROL_ID = process.env.MULAKAT_YETKILISI_ROL_ID || '1528933720969580634';
const commands = [
  
    new SlashCommandBuilder().setName('strike').setDescription('Personel strike').addUserOption(o=>o.setName('kisi').setDescription('Kişi').setRequired(true)).addRoleOption(o=>o.setName('rol').setDescription('Rol').setRequired(true)).addStringOption(o=>o.setName('sebep').setDescription('Sebep').setRequired(true)),
    new SlashCommandBuilder().setName('ihrac').setDescription('Personel ihraç').addUserOption(o=>o.setName('kisi').setDescription('Kişi').setRequired(true)).addStringOption(o=>o.setName('sebep').setDescription('Sebep').setRequired(true)),
    new SlashCommandBuilder().setName('duyuru-gonder').setDescription('Belirli bir role DM olarak duyuru atar.').addRoleOption(o=>o.setName('rol').setDescription('Rol').setRequired(true)).addStringOption(o=>o.setName('baslik').setDescription('Başlık').setRequired(true)).addStringOption(o=>o.setName('mesaj').setDescription('İçerik').setRequired(true)),
    new SlashCommandBuilder().setName('aktif-kadro').setDescription('Aktif kadro listesini başlatır.'),
    new SlashCommandBuilder().setName('top-mesai').setDescription('Haftalık mesai liderlik tablosu.'),
    new SlashCommandBuilder().setName('hafta-mesai-sil').setDescription('Tüm haftalık mesaileri sıfırlar.'),
    new SlashCommandBuilder().setName('aktif-kadro-cıkar').setDescription('Mesaideki herkesin sürelerini kaydedip mesailerini bitirir.'),
    new SlashCommandBuilder().setName('mesai-ekle').setDescription('Personele mesai ekler.').addUserOption(o=>o.setName('kisi').setDescription('Kişi').setRequired(true)).addNumberOption(o=>o.setName('saat').setDescription('Saat').setRequired(true)),
    new SlashCommandBuilder().setName('mesai-sil').setDescription('Personelden mesai siler.').addUserOption(o=>o.setName('kisi').setDescription('Kişi').setRequired(true)).addNumberOption(o=>o.setName('saat').setDescription('Saat').setRequired(true)),
    new SlashCommandBuilder().setName('haftalik-mesai-bilgi').setDescription('Haftalık mesai bilgisi').addUserOption(o=>o.setName('kisi').setDescription('Kişi').setRequired(true)),
    new SlashCommandBuilder().setName('top-mesai-bilgi').setDescription('Toplam mesai bilgisi').addUserOption(o=>o.setName('kisi').setDescription('Kişi').setRequired(true)),
    new SlashCommandBuilder().setName('izin-bitir').setDescription('Belirtilen personelin iznini bitirir.').addUserOption(o=>o.setName('kisi').setDescription('Kişi').setRequired(true))
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.on('ready', async () => {
    console.log(`${client.user.tag} sistemi aktif!`);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });

    // --- İZİN SÜRESİ DOLANLARI KONTROL EDEN SİSTEM ---
    setInterval(async () => {
        try {
            const now = Date.now();
            const expiredUsers = await User.find({ leaveUntil: { $lte: now, $ne: null } });
            
            if (expiredUsers.length > 0) {
                const guild = await client.guilds.fetch(SUNUCU_ID).catch(() => null);
                const izinLogKanal = await client.channels.fetch(IZIN_LOG_KANAL_ID).catch(() => null);
                
                for (const u of expiredUsers) {
                    if (guild) {
                        const member = await guild.members.fetch(u.userId).catch(() => null);
                        if (member) {
                            await member.roles.remove(IZINLI_ROL_ID).catch(() => {});
                        }
                    }
                    
                    const oldText = u.leaveText || 'Belirtilmedi';
                    u.leaveUntil = null;
                    u.leaveText = null;
                    await u.save();

                    if (izinLogKanal) {
                        const embedLog = new EmbedBuilder()
                            .setColor(0xe74c3c)
                            .setTitle('⏰ İzin / Mazeret Süresi Doldu')
                            .setDescription(`<@${u.userId}> adlı personelin **${oldText}** süreli izni sona erdi.\n\n✅ **İzinli Memur** rolü otomatik olarak alındı.`)
                            .setTimestamp();
                        await izinLogKanal.send({ embeds: [embedLog] }).catch(() => {});
                    }

                    const targetUser = await client.users.fetch(u.userId).catch(() => null);
                    if (targetUser) targetUser.send(`⏰ **İzin Süreniz Doldu!**\nSüreniz bittiği için izinli rolünüz alınmıştır. Görevinize dönebilirsiniz.`).catch(() => {});
                }
                updateIzinPanel();
            }
        } catch (e) {
            console.error('İzin kontrol döngüsü çökmesi:', e);
        }
    }, 15000);

    // AFK Kontrolü
    setInterval(async () => {
        const activeUsers = await User.find({ onDuty: true });
        const logKanal = await client.channels.fetch(LOG_KANAL_ID).catch(() => null);
        for (const userData of activeUsers) {
            if (!afkTimeouts.has(userData.userId)) {
                try {
                    const user = await client.users.fetch(userData.userId);
                    const embed = new EmbedBuilder()
                        .setColor(0xff0000)
                        .setTitle('💤 AFK Kontrolü')
                        .setDescription('Hala görevde misiniz? (10 dakika içinde yanıt vermezseniz mesainiz kapanır.)');
                    
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('afk_devam').setLabel('Devam Ediyorum').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId('afk_bitir').setLabel('Bitir').setStyle(ButtonStyle.Danger)
                    );
                    
                    await user.send({ embeds: [embed], components: [row] });
                    
                    // Cevap vermek için tanınan 10 dakikalık süre (600000 ms)
                    const timeout = setTimeout(async () => {
                        const freshUser = await User.findOne({ userId: userData.userId });
                        if (freshUser && freshUser.onDuty) {
                            const duration = Date.now() - freshUser.startTime;
                            freshUser.totalTime += duration; 
                            freshUser.weeklyTime += duration;
                            freshUser.onDuty = false; 
                            freshUser.startTime = null; 
                            await freshUser.save();
                            if (logKanal) logKanal.send(`⚠️ <@${userData.userId}> AFK kontrolüne yanıt vermediği için mesaisi kaydedilerek otomatik sonlandırıldı.`);
                        }
                        afkTimeouts.delete(userData.userId);
                    }, 600000); 
                    
                    afkTimeouts.set(userData.userId, timeout);
                } catch (e) {}
            }
        }
    }, 2700000); // <-- SİSTEMİN 45 DAKİKADA BİR ÇALIŞMASINI SAĞLAYAN KISIM (45 * 60 * 1000 milisaniye)

    // Kadro Güncelleme
    setInterval(async () => {
        if (aktifKadroMsg) {
            const onDutyUsers = await User.find({ onDuty: true });
            const embed = new EmbedBuilder().setColor(0x00ff00).setTitle('🟢 Aktif Görevdeki Personel');
            if (onDutyUsers.length > 0) embed.setDescription(onDutyUsers.map(u => `<@${u.userId}> (ID: ${u.fivemId}) - ${formatTime(Date.now() - u.startTime)}`).join('\n'));
            else embed.setDescription('Şu an aktif görevde personel bulunmuyor.');
            embed.setFooter({ text: `${onDutyUsers.length} personel aktif görevde • Son güncelleme ${formatDate()}` });
            aktifKadroMsg.edit({ embeds: [embed] }).catch(() => {});
        }
    }, 300000);
});

client.on('messageCreate', async (message) => {
    if (message.content.startsWith('!kayıt')) {
        const id = message.content.split(' ')[1];
        if (!id) return message.reply('❌ ID gir!');
        await User.findOneAndUpdate({ userId: message.author.id }, { fivemId: id }, { upsert: true, new: true });
        message.reply(`✅ Kaydın yapıldı! ID: ${id}`);
    }
    
    if (message.content === '!panel') {
        const embed = new EmbedBuilder().setColor(0x2b2d31).setTitle('Davis County Sheriff\'s Office — Mesai Yönetim Sistemi')
            .setDescription('DCSO mesai işlemlerinizi aşağıdaki butonlar aracılığıyla hızlıca gerçekleştirebilirsiniz.')
            .addFields(
                { name: '⚪ Mesai Gir', value: 'FiveM şehir ID\'nizi girerek aktif göreve başlayın.' },
                { name: '⚪ Mesaiden Çık', value: 'Mevcut görevinizi sonlandırın ve sürenizi kaydedin.' },
                { name: '📅 Haftalık Mesai', value: 'Bu hafta yaptığınız toplam mesai süresini görün.' },
                { name: '📊 Toplam Mesai', value: 'Şu ana kadar yaptığınız tüm mesaileri görün.' }
            );

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('mesai_gir').setLabel('Mesaiye Gir').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('mesai_cik').setLabel('Mesaiden Çık').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('haftalik_mesai').setLabel('Haftalık Mesai').setStyle(ButtonStyle.Primary)
        );
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('toplam_mesai').setLabel('Toplam Mesai').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('id_guncelle').setLabel('FiveM ID Güncelle').setStyle(ButtonStyle.Secondary)
        );
        await message.channel.send({ embeds: [embed], components: [row1, row2] });
    }

    if (message.content === '!izinpanel') {
        const embed = new EmbedBuilder()
            .setColor(0x2b2d31)
            .setTitle('🚓 Davis County Sheriff\'s Office — İzin Sistemi') // <-- Güncellenen başlık
            .setDescription(`🏖️ **İzin & Mazeret Paneli**\n\nAşağıdaki butonları kullanarak izin işlemlerinizi gerçekleştirebilirsiniz.\n\n👥 **Şu An İzinli Olanlar — Yükleniyor...**`)
            .setFooter({ text: `Son güncelleme: ${formatDate()}` });
        // ...
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_izin_talep').setLabel('📝 İzin Talebi Oluştur').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('btn_saatlik_mazeret').setLabel('⏳ Saatlik Mazeret').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('btn_izin_bitir').setLabel('🔄 İznimi Bitir').setStyle(ButtonStyle.Danger)
        );

        const msg = await message.channel.send({ embeds: [embed], components: [row] });
        izinPanelMsg = msg;
        updateIzinPanel();
    }
});

client.on('interactionCreate', async (interaction) => {

    // 1. --- KOMUT LOG SİSTEMİ ---
    if (interaction.isChatInputCommand()) {
        try {
            const komutLogKanal = await client.channels.fetch(KOMUT_LOG_KANAL_ID).catch(() => null);
            if (komutLogKanal) {
                const options = interaction.options.data.map(opt => `${opt.name}: ${opt.value}`).join(', ') || 'Parametre yok';
                const logEmbed = new EmbedBuilder()
                    .setColor(0x2b2d31)
                    .setTitle('🟫 Slash Komut Kullanıldı')
                    .addFields(
                        { name: 'Kullanan', value: `<@${interaction.user.id}> (${interaction.user.username})`, inline: true },
                        { name: 'Kanal', value: `<#${interaction.channelId}>`, inline: true },
                        { name: 'Komut', value: `**/${interaction.commandName}**\n\`${options}\``, inline: false }
                    )
                    .setTimestamp();
                await komutLogKanal.send({ embeds: [logEmbed] });
            }
        } catch (error) {
            console.error('Komut loglanırken hata oluştu:', error);
        }

        client.on('interactionCreate', async (interaction) => {

    // 1. --- KOMUT LOG SİSTEMİ ---
    if (interaction.isChatInputCommand()) {
        try {
            const komutLogKanal = await client.channels.fetch(KOMUT_LOG_KANAL_ID).catch(() => null);
            if (komutLogKanal) {
                const options = interaction.options.data.map(opt => `${opt.name}: ${opt.value}`).join(', ') || 'Parametre yok';
                const logEmbed = new EmbedBuilder()
                    .setColor(0x2b2d31)
                    .setTitle('🟫 Slash Komut Kullanıldı')
                    .addFields(
                        { name: 'Kullanan', value: `<@${interaction.user.id}> (${interaction.user.username})`, inline: true },
                        { name: 'Kanal', value: `<#${interaction.channelId}>`, inline: true },
                        { name: 'Komut', value: `**/${interaction.commandName}**\n\`${options}\``, inline: false }
                    )
                    .setTimestamp();
                await komutLogKanal.send({ embeds: [logEmbed] });
            }
        } catch (error) {
            console.error('Komut loglanırken hata oluştu:', error);
        }

        // 2. --- SLASH KOMUTLAR VE İŞLEMLER ---
        const { commandName, options } = interaction;

        if (commandName === 'izin-bitir') {
            const kisi = options.getUser('kisi');
            let uDoc = await User.findOne({ userId: kisi.id }); // Artık güvenle async içinde çalışacak!

            if (!uDoc || !uDoc.leaveUntil) {
                return interaction.reply({ content: '❌ Bu personelin aktif bir izni bulunmuyor.', ephemeral: true });
            }

            uDoc.leaveUntil = null;
            uDoc.leaveText = null;
            await uDoc.save();

            const guild = await interaction.client.guilds.fetch(SUNUCU_ID).catch(() => null);
            // ... diğer işlemlerin ...
        }
    }
    
    // 3. --- BUTONLAR VE DİĞER ETKİLEŞİMLER ---
    else if (interaction.isButton()) {
        // buton kodların buraya gelecek
    }

}); // <-- Bütün event'i kapatan TEK ve SON kapanış parantezi burası olacak!
    // 2. --- SLASH KOMUTLAR VE BUTONLAR ---
    if (interaction.isChatInputCommand()) {
        const { commandName, options } = interaction;

        if (commandName === 'izin-bitir') {
            const kisi = options.getUser('kisi');
            let uDoc = await User.findOne({ userId: kisi.id });

            if (!uDoc || !uDoc.leaveUntil) {
                return interaction.reply({ content: '❌ Bu personelin aktif bir izni bulunmuyor.', ephemeral: true });
            }

            uDoc.leaveUntil = null;
            uDoc.leaveText = null;
            await uDoc.save();

            const guild = await interaction.client.guilds.fetch(SUNUCU_ID).catch(() => null);
           if (commandName === 'izin-bitir') {
            const kisi = options.getUser('kisi');
            let uDoc = await User.findOne({ userId: kisi.id });

            if (!uDoc || !uDoc.leaveUntil) {
                return interaction.reply({ content: '❌ Bu personelin aktif bir izni bulunmuyor.', ephemeral: true });
            }

            uDoc.leaveUntil = null;
            uDoc.leaveText = null;
            await uDoc.save();

            const guild = await interaction.client.guilds.fetch(SUNUCU_ID).catch(() => null);
            if (guild) {
                const member = await guild.members.fetch(kisi.id).catch(() => null);
                if (member) await member.roles.remove(IZINLI_ROL_ID).catch(() => null);
            }

            await interaction.reply({ content: `✅ <@${kisi.id}> adlı personelin izni bitirildi ve rolleri geri alındı.`, ephemeral: true });
        }
    }
    else if (interaction.isButton()) {
        // --- Buraya da senin buton kodların (mesai_gir, mesai_cik vs.) gelecek ---
    }

}); // <-- BÜTÜN interactionCreate İŞLEMİ GERÇEKTEN EN SONDA BURADA KAPANIR!
    else if (interaction.isButton()) {
        // --- Buraya da senin buton kodların (mesai_gir, mesai_cik vs.) gelecek ---
    }

 // <-- BÜTÜN interactionCreate İŞLEMİ GERÇEKTEN EN SONDA BURADA KAPANIR!
        

            const izinLog = await interaction.client.channels.fetch(IZIN_LOG_KANAL_ID).catch(() => null);
            if (izinLog) {
                const embedLog = new EmbedBuilder().setColor(0x3498db).setTitle('🔄 Yetkili Tarafından İzin Kapatma')
                    .setDescription(`<@${kisi.id}> adlı personelin izni <@${interaction.user.id}> tarafından bitirildi.\n\n✅ **İzinli Memur** rolü alındı.`).setTimestamp();
                await izinLog.send({ embeds: [embedLog] }).catch(() => {});
            }
            updateIzinPanel();
            return interaction.reply({ content: `✅ <@${kisi.id}> adlı personelin izni başarıyla bitirildi.`, ephemeral: true });
        }

        if (commandName === 'strike') {
            const kisi = options.getUser('kisi');
            const rol = options.getRole('rol');
            const sebep = options.getString('sebep');

            const strikeKanal = await client.channels.fetch(STRIKE_KANAL_ID).catch(() => null);
            const embed = new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle('⚠️ Personel Strike (Uyarı)')
                .addFields(
                    { name: 'Kişi', value: `<@${kisi.id}>`, inline: true },
                    { name: 'Verilen Rol/Ceza', value: `${rol}`, inline: true },
                    { name: 'Sebep', value: sebep, inline: false },
                    { name: 'Yetkili', value: `<@${interaction.user.id}>`, inline: true }
                )
                .setTimestamp();

            if (strikeKanal) await strikeKanal.send({ embeds: [embed] });
            
            const member = await interaction.guild.members.fetch(kisi.id).catch(() => null);
            if (member) await member.roles.add(rol.id).catch(() => {});

            return interaction.reply({ content: `✅ <@${kisi.id}> adlı personele strike uygulandı.`, ephemeral: true });
        }

        if (commandName === 'ihrac') {
            const kisi = options.getUser('kisi');
            const sebep = options.getString('sebep');

            const ihracKanal = await client.channels.fetch(IHRAC_KANAL_ID).catch(() => null);
            const embed = new EmbedBuilder()
                .setColor(0x992d22)
                .setTitle('🚨 Personel İhraç')
                .addFields(
                    { name: 'İhraç Edilen', value: `<@${kisi.id}>`, inline: true },
                    { name: 'Sebep', value: sebep, inline: false },
                    { name: 'Yetkili', value: `<@${interaction.user.id}>`, inline: true }
                )
                .setTimestamp();

            if (ihracKanal) await ihracKanal.send({ embeds: [embed] });

            const member = await interaction.guild.members.fetch(kisi.id).catch(() => null);
            if (member) {
                await member.roles.add(IHRAC_ROL_ID).catch(() => {});
            }

            return interaction.reply({ content: `✅ <@${kisi.id}> kurumdan ihraç edildi.`, ephemeral: true });
        }

        if (commandName === 'duyuru-gonder') {
            const rol = options.getRole('rol');
            const baslik = options.getString('baslik');
            const mesaj = options.getString('mesaj');

            const embed = new EmbedBuilder()
                .setColor(0x3498db)
                .setTitle(`📢 ${baslik}`)
                .setDescription(mesaj)
                .setFooter({ text: `Yetkili: ${interaction.user.tag}` })
                .setTimestamp();

            await interaction.reply({ content: '⏳ Duyuru üyelere DM olarak gönderiliyor, lütfen bekleyin...', ephemeral: true });

            await interaction.guild.members.fetch().catch(() => {});
            const targetMembers = rol.members.filter(m => !m.user.bot);
            
            let basarili = 0;
            let basarisiz = 0;

            for (const [memberId, member] of targetMembers) {
                try {
                    await member.send({ 
                        content: `**${interaction.guild.name}** sunucusundan bir duyurunuz var:`, 
                        embeds: [embed] 
                    });
                    basarili++;
                } catch (error) {
                    basarisiz++;
                }
            }

            await interaction.channel.send({ content: `${rol} rolündeki üyelere duyuru iletildi.`, embeds: [embed] });

            return interaction.editReply({ 
                content: `✅ Duyuru işlemi tamamlandı.\n📥 Başarıyla iletilen: **${basarili}** üye\n❌ DM'i kapalı olan/Ulaşılamayan: **${basarisiz}** üye` 
            });
        }

        if (commandName === 'aktif-kadro') {
            const onDutyUsers = await User.find({ onDuty: true });
            const embed = new EmbedBuilder().setColor(0x00ff00).setTitle('🟢 Aktif Görevdeki Personel');
            if (onDutyUsers.length > 0) embed.setDescription(onDutyUsers.map(u => `<@${u.userId}> (ID: ${u.fivemId}) - ${formatTime(Date.now() - u.startTime)}`).join('\n'));
            else embed.setDescription('Şu an aktif görevde personel bulunmuyor.');
            embed.setFooter({ text: `${onDutyUsers.length} personel aktif görevde • Son güncelleme ${formatDate()}` });
            
            const msg = await interaction.channel.send({ embeds: [embed] });
            aktifKadroMsg = msg;
            return interaction.reply({ content: '✅ Aktif kadro paneli başlatıldı.', ephemeral: true });
        }

        if (commandName === 'top-mesai') {
            const topUsers = await User.find().sort({ weeklyTime: -1 }).limit(10);
            let description = '';
            topUsers.forEach((u, index) => {
                description += `**#${index+1}** — <@${u.userId}> | Haftalık: ${formatTime(u.weeklyTime)}\n`;
            });
            if (!description) description = 'Henüz mesai yapan kimse yok.';

            const embed = new EmbedBuilder()
                .setColor(0xf1c40f)
                .setTitle('🏆 Haftalık Mesai Liderlik Tablosu')
                .setDescription(description)
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (commandName === 'hafta-mesai-sil') {
            await User.updateMany({}, { weeklyTime: 0 });
            return interaction.reply({ content: '✅ Tüm personelin haftalık mesaileri sıfırlandı.', ephemeral: true });
        }

        if (commandName === 'aktif-kadro-cıkar') {
            await interaction.reply({ content: '⏳ Mesaideki personellerin süreleri hesaplanıp kaydediliyor...', ephemeral: true });
            
            const activeUsers = await User.find({ onDuty: true });
            let count = 0;
            const now = Date.now();

            for (const u of activeUsers) {
                if (u.startTime) {
                    const duration = now - u.startTime;
                    u.totalTime += duration;
                    u.weeklyTime += duration;
                }
                u.onDuty = false;
                u.startTime = null;
                await u.save();
                count++;
            }

            return interaction.editReply({ content: `✅ İşlem tamam! **${count}** kişinin süresi hesaplanıp profillerine eklendi ve mesaileri kapatıldı.` });
        }

        if (commandName === 'mesai-ekle') {
            const kisi = options.getUser('kisi');
            const saat = options.getNumber('saat');
            const msToAdd = saat * 3600000;

            let uDoc = await User.findOne({ userId: kisi.id });
            if (!uDoc) uDoc = new User({ userId: kisi.id });
            uDoc.totalTime += msToAdd;
            uDoc.weeklyTime += msToAdd;
            await uDoc.save();

            return interaction.reply({ content: `✅ <@${kisi.id}> adlı kişiye **${saat} saat** mesai eklendi.`, ephemeral: true });
        }

        if (commandName === 'mesai-sil') {
            const kisi = options.getUser('kisi');
            const saat = options.getNumber('saat');
            const msToRemove = saat * 3600000;

            let uDoc = await User.findOne({ userId: kisi.id });
            if (!uDoc) return interaction.reply({ content: '❌ Bu kişinin kayıtlı verisi bulunamadı.', ephemeral: true });
            
            uDoc.totalTime = Math.max(0, uDoc.totalTime - msToRemove);
            uDoc.weeklyTime = Math.max(0, uDoc.weeklyTime - msToRemove);
            await uDoc.save();

            return interaction.reply({ content: `✅ <@${kisi.id}> adlı kişiden **${saat} saat** mesai silindi.`, ephemeral: true });
        }

        if (commandName === 'haftalik-mesai-bilgi') {
            const kisi = options.getUser('kisi');
            const uDoc = await User.findOne({ userId: kisi.id });
            const time = uDoc ? uDoc.weeklyTime : 0;
            return interaction.reply({ content: `📅 <@${kisi.id}> adlı personelin haftalık mesaisi: **${formatTime(time)}**`, ephemeral: true });
        }

        if (commandName === 'top-mesai-bilgi') {
            const kisi = options.getUser('kisi');
            const uDoc = await User.findOne({ userId: kisi.id });
            const time = uDoc ? uDoc.totalTime : 0;
            return interaction.reply({ content: `📊 <@${kisi.id}> adlı personelin toplam mesaisi: **${formatTime(time)}**`, ephemeral: true });
        }
    }
    
    // --- MODAL (FORM) GÖNDERİMLERİ ---
    if (interaction.isModalSubmit()) {
        const guild = await client.guilds.fetch(SUNUCU_ID).catch(() => null);
        const yetkiliRole = guild ? await guild.roles.fetch(YETKILI_ROL_ID).catch(() => null) : null;
        
        if (interaction.customId === 'id_modal') {
            const newId = interaction.fields.getTextInputValue('new_id');
            await User.findOneAndUpdate({ userId: interaction.user.id }, { fivemId: newId }, { upsert: true, new: true });
            return interaction.reply({ content: `✅ FiveM ID'niz başarıyla **${newId}** olarak güncellendi.`, ephemeral: true });
        }

        if (interaction.customId === 'modal_izin_talep') {
            const baslangic = interaction.fields.getTextInputValue('baslangic_tarih');
            const bitis = interaction.fields.getTextInputValue('bitis_tarih');
            const sebep = interaction.fields.getTextInputValue('izin_sebep');

            const bParts = bitis.split('.');
            let leaveUntilMs = null;
            if (bParts.length === 3) {
                leaveUntilMs = Date.parse(`${bParts[2]}-${bParts[1]}-${bParts[0]}T23:59:59+03:00`);
            } else {
                leaveUntilMs = Date.now() + (3 * 24 * 60 * 60 * 1000); 
            }

            const reqEmbed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle('📑 Yeni İzin Talebi (GÜNLÜK)')
        .addFields(
            { name: 'Personel', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Personel ID', value: interaction.user.id, inline: true },
            { name: 'Tarih Özeti', value: `${baslangic} → ${bitis}`, inline: false },
            { name: 'Sebep', value: sebep, inline: false },
            { name: 'BitişMs', value: leaveUntilMs.toString(), inline: false }
        ); // <-- addFields fonksiyonunun kapanış parantezi ve noktalı virgül burada olmalı
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`admin_izin_onay`).setLabel('Onayla').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`admin_izin_red`).setLabel('Reddet').setStyle(ButtonStyle.Danger)
            );

            if (yetkiliRole) {
                yetkiliRole.members.forEach(async (member) => {
                    if (!member.user.bot) member.send({ embeds: [reqEmbed], components: [row] }).catch(()=>{});
                });
            }
            return interaction.reply({ content: `✅ Günlük izin talebiniz yöneticilere iletildi.`, ephemeral: true });
        }

        if (interaction.customId === 'modal_saatlik_mazeret') {
            const saatAraligi = interaction.fields.getTextInputValue('saat_araligi');
            const sebep = interaction.fields.getTextInputValue('mazeret_sebep');

            let leaveUntilMs = parseEndTime(saatAraligi);
            if (!leaveUntilMs) leaveUntilMs = Date.now() + (2 * 60 * 60 * 1000);

            const reqEmbed = new EmbedBuilder().setColor(0xe67e22).setTitle('⏳ Yeni Mazeret Bildirimi (SAATLİK)')
                .addFields(
                    { name: 'Personel', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Personel ID', value: interaction.user.id, inline: true },
                    { name: 'Tarih Özeti', value: `Bugün (${saatAraligi})`, inline: false },
                    { name: 'Sebep', value: sebep, inline: false },
                    { name: 'BitişMs', value: leaveUntilMs.toString(), inline: false }
                );

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`admin_izin_onay`).setLabel('Onayla').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`admin_izin_red`).setLabel('Reddet').setStyle(ButtonStyle.Danger)
            );

            if (yetkiliRole) {
                yetkiliRole.members.forEach(async (member) => {
                    if (!member.user.bot) member.send({ embeds: [reqEmbed], components: [row] }).catch(()=>{});
                });
            }
            return interaction.reply({ content: `✅ Saatlik mazeretiniz iletildi. Bitiş süreniz: **${saatAraligi}**`, ephemeral: true });
        }
    }

    if (interaction.isButton()) {
        const userDoc = await User.findOne({ userId: interaction.user.id });

        // --- İZİN PANELİ BUTONLARI ---
        if (interaction.customId === 'btn_izin_talep') {
            const modal = new ModalBuilder().setCustomId('modal_izin_talep').setTitle('İzin Talebi');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('baslangic_tarih').setLabel('Başlangıç Tarihi').setPlaceholder('GG.AA.YYYY').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('bitis_tarih').setLabel('Bitiş Tarihi').setPlaceholder('GG.AA.YYYY').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('izin_sebep').setLabel('Mazeret Açıklaması').setStyle(TextInputStyle.Paragraph).setRequired(true))
            );
            return interaction.showModal(modal);
        }

        if (interaction.customId === 'btn_saatlik_mazeret') {
            const modal = new ModalBuilder().setCustomId('modal_saatlik_mazeret').setTitle('Saatlik Mazeret Bildirimi');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('saat_araligi').setLabel('Saat Aralığı').setPlaceholder('Örn: 15:00 - 15:30').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('mazeret_sebep').setLabel('Mazeret Açıklaması').setStyle(TextInputStyle.Paragraph).setRequired(true))
            );
            return interaction.showModal(modal);
        }

        if (interaction.customId === 'btn_izin_bitir') {
            if (!userDoc || !userDoc.leaveUntil) return interaction.reply({ content: '❌ Aktif izniniz yok.', ephemeral: true });

            userDoc.leaveUntil = null; userDoc.leaveText = null; await userDoc.save();

            const guild = await client.guilds.fetch(SUNUCU_ID).catch(() => null);
            if (guild) {
                const member = await guild.members.fetch(interaction.user.id).catch(() => null);
                if (member) await member.roles.remove(IZINLI_ROL_ID).catch(() => null);
            }

            const izinLog = await client.channels.fetch(IZIN_LOG_KANAL_ID).catch(() => null);
            if (izinLog) {
                const embedLog = new EmbedBuilder().setColor(0x3498db).setTitle('🔄 Erken İzin Kapatma')
                    .setDescription(`<@${interaction.user.id}> iznini erken bitirdi.\n\n✅ **İzinli Memur** rolü alındı.`).setTimestamp();
                await izinLog.send({ embeds: [embedLog] }).catch(() => {});
            }
            updateIzinPanel();
            return interaction.reply({ content: '✅ İzniniz sonlandırıldı.', ephemeral: true });
        }

        if (interaction.customId === 'admin_izin_onay' || interaction.customId === 'admin_izin_red') {
            const embed = interaction.message.embeds[0];
            const targetUserId = embed.fields.find(f => f.name === 'Personel ID').value;
            const tarihOzet = embed.fields.find(f => f.name === 'Tarih Özeti').value;
            const bitisMs = embed.fields.find(f => f.name === 'BitişMs').value;

            if (interaction.customId === 'admin_izin_onay') {
                let uDoc = await User.findOne({ userId: targetUserId });
                if(!uDoc) uDoc = new User({ userId: targetUserId });
                
                uDoc.leaveUntil = parseInt(bitisMs); uDoc.leaveText = tarihOzet; await uDoc.save();

                const guild = await interaction.client.guilds.fetch(SUNUCU_ID).catch(() => null);
                if (guild) {
                    const member = await guild.members.fetch(targetUserId).catch(() => null);
                    if (member) await member.roles.add(IZINLI_ROL_ID).catch(() => null);
                }

                const izinLog = await interaction.client.channels.fetch(IZIN_LOG_KANAL_ID).catch(() => null);
                if (izinLog) {
                    const embedLog = new EmbedBuilder().setColor(0x2ecc71).setTitle('✅ İzin Talebi Onaylandı')
                        .setDescription(`**Personel:** <@${targetUserId}>\n**Zaman:** ${tarihOzet}\n**Yetkili:** <@${interaction.user.id}>`).setTimestamp();
                    await izinLog.send({ embeds: [embedLog] }).catch(() => {});
                }
                const targetUser = await interaction.client.users.fetch(targetUserId).catch(() => null);
                if (targetUser) targetUser.send(`✅ **İzin Onaylandı!** Zaman: ${tarihOzet}`).catch(() => null);

                updateIzinPanel();
                return interaction.update({ content: `✅ İzni onayladınız.`, embeds: [], components: [] });
            }

            if (interaction.customId === 'admin_izin_red') {
                const targetUser = await interaction.client.users.fetch(targetUserId).catch(() => null);
                if (targetUser) targetUser.send(`❌ **İzin Reddedildi!** Yetkili: <@${interaction.user.id}>`).catch(() => null);
                return interaction.update({ content: `❌ İzni reddettiniz.`, embeds: [], components: [] });
            }
        }

        // Klasik Mesai Butonları
        const logKanal = await client.channels.fetch(LOG_KANAL_ID).catch(() => null);
        if (interaction.customId === 'afk_devam') {
            if (afkTimeouts.has(interaction.user.id)) {
                clearTimeout(afkTimeouts.get(interaction.user.id)); afkTimeouts.delete(interaction.user.id);
                if (logKanal) logKanal.send(`💤 <@${interaction.user.id}> AFK kontrolünü onayladı.`);
                interaction.reply({content: '✅ Devam ediyorsunuz!', ephemeral: true});
            }
        } else if (interaction.customId === 'afk_bitir') {
            if (afkTimeouts.has(interaction.user.id)) {
                clearTimeout(afkTimeouts.get(interaction.user.id)); afkTimeouts.delete(interaction.user.id);
            }
            if (userDoc && userDoc.onDuty) {
                const duration = Date.now() - userDoc.startTime;
                userDoc.totalTime += duration; userDoc.weeklyTime += duration; 
                userDoc.onDuty = false; userDoc.startTime = null; await userDoc.save();
                if (logKanal) logKanal.send(`🔴 <@${interaction.user.id}> AFK menüsünden mesaisini bitirdi.`);
                interaction.reply({ content: '🔴 Mesai bitti.', ephemeral: true });
            }
       } else if (interaction.customId === 'mesai_gir') {
        if (!userDoc || !userDoc.fivemId) return interaction.reply({ content: '❌ `!kayıt <ID>` yap!', ephemeral: true });
        
        if (userDoc.onDuty) {
            return interaction.reply({ content: '❌ Zaten aktif bir mesainiz bulunuyor! Yeni mesai açmadan önce eskisini kapatın.', ephemeral: true });
        }

        userDoc.onDuty = true; 
        userDoc.startTime = Date.now(); 
        await userDoc.save();
        
        if (logKanal) logKanal.send(`🟢 <@${interaction.user.id}> mesaiye başladı.`);
        await interaction.reply({ content: '✅ Mesai başladı.', ephemeral: true });

    } else if (interaction.customId === 'mesai_cik') {
        if (!userDoc || !userDoc.onDuty) return interaction.reply({ content: '❌ Zaten aktif mesainiz yok!', ephemeral: true });
        
        const duration = Date.now() - userDoc.startTime;
        userDoc.totalTime += duration; 
        userDoc.weeklyTime += duration; 
        userDoc.onDuty = false; 
        await userDoc.save();
        
        if (logKanal) logKanal.send(`🔴 <@${interaction.user.id}> mesaiyi bitirdi.`);
        await interaction.reply({ content: '🔴 Mesain bitti!', ephemeral: true });

    } else if (interaction.customId === 'haftalik_mesai') {
        await interaction.reply({ content: `📊 Bu hafta: ${formatTime(userDoc ? userDoc.weeklyTime : 0)}`, ephemeral: true });
    } else if (interaction.customId === 'toplam_mesai') {
        await interaction.reply({ content: `📊 Toplam: ${formatTime(userDoc ? userDoc.totalTime : 0)}`, ephemeral: true });
    } else if (interaction.customId === 'id_guncelle') {
        const modal = new ModalBuilder().setCustomId('id_modal').setTitle('FiveM ID Güncelle');
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('new_id').setLabel('Yeni FiveM ID').setStyle(TextInputStyle.Short)));
        await interaction.showModal(modal);
    



// --- ANTI-CRASH SİSTEMİ ---
process.on('unhandledRejection', (reason) => console.log('❌ [Anti-Crash]', reason));
process.on('uncaughtException', (err) => console.log('❌ [Anti-Crash]', err));
process.on('uncaughtExceptionMonitor', (err) => console.log('❌ [Anti-Crash]', err));
client.on('voiceStateUpdate', async (oldState, newState) => {
    // Kullanıcı sadece belirlediğimiz kanala giriş yaptığında tetiklensin
    // (Susturma/sağırlaştırma işlemlerinde tekrar tetiklenmemesi için kontrol)
    if (newState.channelId === MULAKAT_KANAL_ID && oldState.channelId !== MULAKAT_KANAL_ID) {
        try {
            const member = newState.member;
            if (member.user.bot) return; // Bota bildirim atma

            const guild = newState.guild;
            await guild.members.fetch(); 
            const yetkiliRol = guild.roles.cache.get(MULAKAT_YETKILISI_ROL_ID);
            
            if (!yetkiliRol) return console.log('❌ Mülakat yetkilisi rolü bulunamadı.');

            const embed = new EmbedBuilder()
                .setColor(0x3498db) // Görseldeki mavi çizgi rengi
                .setTitle('🤝 Mülakat Bekleme Odasında Biri Var!')
                .setDescription(`Mülakat kanalına bir kullanıcı giriş yaptı.\n\n**Mülakat Bekleyen Kişi:** <@${member.id}> - ${member.user.username}`)
                .setFooter({ text: 'DCSO Mülakat Bildirim Sistemi' });

            // Mülakat yetkilisi rolündeki herkese DM olarak gönder
            yetkiliRol.members.forEach(async (yetkili) => {
                if (!yetkili.user.bot) {
                    await yetkili.send({ embeds: [embed] }).catch(() => {
                        // Eğer kullanıcının DM'i kapalıysa hata vermemesi için catch boş bırakıldı
                    });
                }
            });

        } catch (error) {
            console.error('Mülakat bildirim sistemi hatası:', error);
        }
    }
});

client.login(TOKEN);
