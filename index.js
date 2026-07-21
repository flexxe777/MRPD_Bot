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
    leaveText: { type: String, default: null } // YENİ: Panelde gözükecek izin metni (Tarih/Saat)
});
const User = mongoose.model('User', userSchema);

// --- DİSCORD.JS ---
const { 
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, SlashCommandBuilder, REST, Routes,
    ModalBuilder, TextInputBuilder, TextInputStyle 
} = require('discord.js');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers 
    ] 
});

let aktifKadroMsg = null;
let izinPanelMsg = null; // YENİ: İzin paneli mesajını hafızada tutar
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
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth()+1).padStart(2, '0')}.${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// İzin panelini güncelleyen fonksiyon
async function updateIzinPanel() {
    if (!izinPanelMsg) return;
    try {
        const izinliler = await User.find({ leaveUntil: { $ne: null } });
        let listText = '';
        
        for (const u of izinliler) {
            try {
                const member = await client.users.fetch(u.userId);
                const name = member.username;
                const fId = u.fivemId || 'ID-Yok';
                const text = u.leaveText || 'Belirtilmedi';
                listText += `▶ ${fId} ${name} - ${text}\n`;
            } catch(e) {}
        }
        
        if (listText === '') listText = 'Şu an izinde personel bulunmuyor.';
        
        const embed = new EmbedBuilder()
            .setColor(0x2b2d31)
            .setTitle('🚓 Mission Row Police Department — İzin Sistemi')
            .setDescription(`🏖️ **İzin & Mazeret Paneli**\n\nAşağıdaki butonları kullanarak izin işlemlerinizi gerçekleştirebilirsiniz.\n\n📝 **İzin Talebi Oluştur**\nTarih aralığı ve mazeret bilgilerinizle talebinizi gönderin.\n\n⏳ **Saatlik Mazeret**\nSadece bugünü kapsayan saatlik mazeretlerinizi bildirin.\n\n✅ **Onay Süreci**\nTalebiniz yöneticiler tarafından onaylandığında **İzinli Memur** rolü atanır.\n\n⏰ **Süre Takibi**\nİzin süreniz dolduğunda rol **otomatik** olarak kaldırılır.\n\n🔄 **Erken Dönüş**\nErken dönerseniz **İznimi Bitir** butonuna tıklayarak izninizi kapatın.\n\n👥 **Şu An İzinli Olanlar — ${izinliler.length} personel**\n${listText}`)
            .setFooter({ text: `${izinliler.length} personel izinde • Son güncelleme: ${formatDate()}` });

        await izinPanelMsg.edit({ embeds: [embed] }).catch(() => {});
    } catch(e) { console.error('Panel guncelleme hatasi:', e); }
}

// --- AYARLAR ---
const TOKEN = process.env.TOKEN;
const LOG_KANAL_ID = '1522260330502291767';
const STRIKE_KANAL_ID = '1475505351108591707';
const IHRAC_KANAL_ID = '1478819151689679039';
const IHRAC_ROL_ID = '1475505209278075131';
const KOMUT_LOG_KANAL_ID = '1528929952412733480'; 

const SUNUCU_ID = '1224108385771716749'; 
const YETKILI_ROL_ID = '1528933720969580634'; 
const IZINLI_ROL_ID = '1525600296951222323'; 
const IZIN_LOG_KANAL_ID = '1528933597896114368'; 

const commands = [
    new SlashCommandBuilder().setName('strike').setDescription('Personel strike').addUserOption(o=>o.setName('kisi').setDescription('Kişi').setRequired(true)).addRoleOption(o=>o.setName('rol').setDescription('Rol').setRequired(true)).addStringOption(o=>o.setName('sebep').setDescription('Sebep').setRequired(true)),
    new SlashCommandBuilder().setName('ihrac').setDescription('Personel ihraç').addUserOption(o=>o.setName('kisi').setDescription('Kişi').setRequired(true)).addStringOption(o=>o.setName('sebep').setDescription('Sebep').setRequired(true)),
    new SlashCommandBuilder().setName('duyuru-gonder').setDescription('Duyuru at').addRoleOption(o=>o.setName('rol').setDescription('Rol').setRequired(true)).addStringOption(o=>o.setName('baslik').setDescription('Başlık').setRequired(true)).addStringOption(o=>o.setName('mesaj').setDescription('İçerik').setRequired(true)),
    new SlashCommandBuilder().setName('aktif-kadro').setDescription('Aktif kadro listesini başlatır.'),
    new SlashCommandBuilder().setName('top-mesai').setDescription('Haftalık mesai liderlik tablosu.'),
    new SlashCommandBuilder().setName('hafta-mesai-sil').setDescription('Tüm haftalık mesaileri sıfırlar.'),
    new SlashCommandBuilder().setName('aktif-kadro-cıkar').setDescription('Mesaideki herkesi mesai dışı bırakır.'),
    new SlashCommandBuilder().setName('mesai-ekle').setDescription('Personele belirtilen saat kadar mesai ekler.').addUserOption(o=>o.setName('kisi').setDescription('Kişi').setRequired(true)).addNumberOption(o=>o.setName('saat').setDescription('Eklenecek saat (Örn: 2 veya 1.5)').setRequired(true)),
    new SlashCommandBuilder().setName('mesai-sil').setDescription('Personelden belirtilen saat kadar mesai siler.').addUserOption(o=>o.setName('kisi').setDescription('Kişi').setRequired(true)).addNumberOption(o=>o.setName('saat').setDescription('Silinecek saat (Örn: 2 veya 1.5)').setRequired(true)),
    new SlashCommandBuilder().setName('haftalik-mesai-bilgi').setDescription('Belirtilen kişinin haftalık mesai saatini gösterir.').addUserOption(o=>o.setName('kisi').setDescription('Mesaisi görüntülenecek kişi').setRequired(true)),
    new SlashCommandBuilder().setName('top-mesai-bilgi').setDescription('Belirtilen kişinin toplam mesai saatini gösterir.').addUserOption(o=>o.setName('kisi').setDescription('Mesaisi görüntülenecek kişi').setRequired(true))
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.on('ready', async () => {
    console.log(`${client.user.tag} sistemi aktif!`);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });

    // İzin Süresi Dolanları Kontrol Eden Sistem (Her 1 dakikada bir)
    setInterval(async () => {
        const expiredUsers = await User.find({ leaveUntil: { $lt: Date.now(), $ne: null } });
        if(expiredUsers.length > 0) {
            const guild = client.guilds.cache.get(SUNUCU_ID);
            const izinLogKanal = client.channels.cache.get(IZIN_LOG_KANAL_ID);
            
            for(const u of expiredUsers) {
                if(guild) {
                    const member = await guild.members.fetch(u.userId).catch(()=>null);
                    if(member) {
                        await member.roles.remove(IZINLI_ROL_ID).catch(()=>null);
                    }
                }
                
                u.leaveUntil = null;
                u.leaveText = null;
                await u.save();

                if(izinLogKanal) {
                    izinLogKanal.send(`⏰ <@${u.userId}> adlı personelin izni sona erdi. Üzerindeki izinli rolü otomatik alındı.`);
                }
            }
            updateIzinPanel(); // Listeyi güncelle
        }
    }, 60000);

    // AFK Kontrolü (Aynı)
    setInterval(async () => {
        const activeUsers = await User.find({ onDuty: true });
        const logKanal = client.channels.cache.get(LOG_KANAL_ID);
        
        for (const userData of activeUsers) {
            if (!afkTimeouts.has(userData.userId)) {
                try {
                    const user = await client.users.fetch(userData.userId);
                    const embed = new EmbedBuilder().setColor(0xff0000).setTitle('💤 AFK Kontrolü').setDescription('Hala görevde misiniz? (10 dakika içinde yanıt vermezseniz mesainiz kapanır.)');
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('afk_devam').setLabel('Devam Ediyorum').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId('afk_bitir').setLabel('Bitir').setStyle(ButtonStyle.Danger)
                    );
                    const msg = await user.send({ embeds: [embed], components: [row] });
                    
                    const timeout = setTimeout(async () => {
                        const freshUser = await User.findOne({ userId: userData.userId });
                        if (freshUser && freshUser.onDuty) {
                            const duration = Date.now() - freshUser.startTime;
                            freshUser.totalTime += duration; 
                            freshUser.weeklyTime += duration;
                            freshUser.onDuty = false;
                            freshUser.startTime = null;
                            await freshUser.save();
                            
                            if (logKanal) logKanal.send(`⚠️ <@${userData.userId}> AFK kontrolüne yanıt vermediği için mesaisi otomatik sonlandırıldı.`);
                            try { user.send('❌ 10 dakika yanıt vermediğiniz için mesainiz otomatik bitti.'); } catch(e){}
                        }
                        afkTimeouts.delete(userData.userId);
                    }, 600000);
                    afkTimeouts.set(userData.userId, timeout);
                } catch (e) {}
            }
        }
    }, 2700000);

    // Kadro Güncelleme (Aynı)
    setInterval(async () => {
        if (aktifKadroMsg) {
            const onDutyUsers = await User.find({ onDuty: true });
            const embed = new EmbedBuilder().setColor(0x00ff00).setTitle('🟢 Aktif Görevdeki Personel');
            if (onDutyUsers.length > 0) {
                embed.setDescription(onDutyUsers.map(u => `<@${u.userId}> (ID: ${u.fivemId}) - ${formatTime(Date.now() - u.startTime)}`).join('\n'));
            } else {
                embed.setDescription('Şu an aktif görevde personel bulunmuyor.');
            }
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
        const embed = new EmbedBuilder().setColor(0x2b2d31).setTitle('Mission Row Police Department — Mesai Yönetim Sistemi')
            .setDescription('MRPD mesai işlemlerinizi aşağıdaki butonlar aracılığıyla hızlıca gerçekleştirebilirsiniz.')
            .addFields(
                { name: '⚪ Mesai Gir', value: 'FiveM şehir ID\'nizi girerek aktif göreve başlayın.' },
                { name: '⚪ Mesaiden Çık', value: 'Mevcut görevinizi sonlandırın ve sürenizi kaydedin.' },
                { name: '📅 Haftalık Mesai', value: 'Bu hafta yaptığınız toplam mesai süresini görün.' },
                { name: '📊 Toplam Mesai', value: 'Şu ana kadar yaptığınız tüm mesaileri görün.' },
                { name: '🔄 FiveM ID Güncelle', value: 'Şehir içi FiveM ID\'nizi güncelleyin.' }
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

    // --- YENİ: İZİN PANELİ KOMUTU ---
    if (message.content === '!izinpanel') {
        const embed = new EmbedBuilder()
            .setColor(0x2b2d31)
            .setTitle('🚓 Mission Row Police Department — İzin Sistemi')
            .setDescription(`🏖️ **İzin & Mazeret Paneli**\n\nAşağıdaki butonları kullanarak izin işlemlerinizi gerçekleştirebilirsiniz.\n\n📝 **İzin Talebi Oluştur**\nTarih aralığı ve mazeret bilgilerinizle talebinizi gönderin.\n\n⏳ **Saatlik Mazeret**\nSadece bugünü kapsayan saatlik mazeretlerinizi bildirin.\n\n✅ **Onay Süreci**\nTalebiniz yöneticiler tarafından onaylandığında **İzinli Memur** rolü atanır.\n\n⏰ **Süre Takibi**\nİzin süreniz dolduğunda rol **otomatik** olarak kaldırılır.\n\n🔄 **Erken Dönüş**\nErken dönerseniz **İznimi Bitir** butonuna tıklayarak izninizi kapatın.\n\n👥 **Şu An İzinli Olanlar — Yükleniyor...**\nLütfen bekleyin...`)
            .setFooter({ text: `Son güncelleme: ${formatDate()}` });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_izin_talep').setLabel('📝 İzin Talebi Oluştur').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('btn_saatlik_mazeret').setLabel('⏳ Saatlik Mazeret').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('btn_izin_bitir').setLabel('🔄 İznimi Bitir').setStyle(ButtonStyle.Danger)
        );

        const msg = await message.channel.send({ embeds: [embed], components: [row] });
        izinPanelMsg = msg;
        updateIzinPanel(); // Paneli veritabanındaki kişilerle güncelle
    }
});

client.on('interactionCreate', async (interaction) => {
    const logKanal = interaction.client.channels.cache.get(LOG_KANAL_ID);
    
    // --- MODAL (FORM) GÖNDERİMLERİ ---
    if (interaction.isModalSubmit()) {
        const yetkiliRole = await interaction.guild?.roles.fetch(YETKILI_ROL_ID).catch(()=>null);
        
        if (interaction.customId === 'modal_izin_talep') {
            const baslangic = interaction.fields.getTextInputValue('baslangic_tarih');
            const bitis = interaction.fields.getTextInputValue('bitis_tarih');
            const sebep = interaction.fields.getTextInputValue('izin_sebep');

            // Bitiş tarihini timestamp'e çevirme işlemi (Gün sonu 23:59:59)
            const bParts = bitis.split('.');
            let leaveUntilMs = null;
            if(bParts.length === 3) {
                leaveUntilMs = new Date(`${bParts[2]}-${bParts[1]}-${bParts[0]}T23:59:59`).getTime();
            } else {
                leaveUntilMs = Date.now() + (3 * 24 * 60 * 60 * 1000); // Format hatalıysa varsayılan 3 gün
            }

            const reqEmbed = new EmbedBuilder().setColor(0xf1c40f).setTitle('📝 Yeni İzin Talebi (GÜNLÜK)')
                .addFields(
                    { name: 'Personel', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Personel ID', value: interaction.user.id, inline: true },
                    { name: 'Tarih Özeti', value: `${baslangic} ➔ ${bitis}`, inline: false },
                    { name: 'Sebep', value: sebep, inline: false },
                    { name: 'BitişMs', value: leaveUntilMs.toString(), inline: false } // Sistemsel gizli veri
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
            return interaction.reply({ content: `✅ Günlük izin talebiniz yöneticilere iletildi.`, ephemeral: true });
        }

        if (interaction.customId === 'modal_saatlik_mazeret') {
            const saatAraligi = interaction.fields.getTextInputValue('saat_araligi');
            const sebep = interaction.fields.getTextInputValue('mazeret_sebep');

            // Saatlik mazeret gün sonuna kadar geçerli olur
            const endOfDay = new Date();
            endOfDay.setHours(23, 59, 59, 999);
            const leaveUntilMs = endOfDay.getTime();

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
            return interaction.reply({ content: `✅ Saatlik mazeretiniz yöneticilere iletildi.`, ephemeral: true });
        }
    }

    if (interaction.isButton()) {
        const userDoc = await User.findOne({ userId: interaction.user.id });

        // --- İZİN PANELİ BUTONLARI ---
        if (interaction.customId === 'btn_izin_talep') {
            const modal = new ModalBuilder().setCustomId('modal_izin_talep').setTitle('İzin Talebi');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('baslangic_tarih').setLabel('İzin Başlangıç Tarihi *').setPlaceholder('GG.AA.YYYY (Örn: 25.06.2026)').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('bitis_tarih').setLabel('İzin Bitiş Tarihi *').setPlaceholder('GG.AA.YYYY (Örn: 30.06.2026)').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('izin_sebep').setLabel('İzin / Mazeret Açıklaması *').setPlaceholder('İzin nedeninizi açıklayın...').setStyle(TextInputStyle.Paragraph).setRequired(true))
            );
            return interaction.showModal(modal);
        }

        if (interaction.customId === 'btn_saatlik_mazeret') {
            const modal = new ModalBuilder().setCustomId('modal_saatlik_mazeret').setTitle('Saatlik Mazeret Bildirimi');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('saat_araligi').setLabel('Saat Aralığı *').setPlaceholder('Örn: 14:00 - 18:00').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('mazeret_sebep').setLabel('Mazeret Açıklaması *').setPlaceholder('Mazeretinizi belirtiniz...').setStyle(TextInputStyle.Paragraph).setRequired(true))
            );
            return interaction.showModal(modal);
        }

        if (interaction.customId === 'btn_izin_bitir') {
            if (!userDoc || !userDoc.leaveUntil) {
                return interaction.reply({ content: '❌ Zaten aktif bir izniniz bulunmuyor.', ephemeral: true });
            }

            userDoc.leaveUntil = null;
            userDoc.leaveText = null;
            await userDoc.save();

            const guild = client.guilds.cache.get(SUNUCU_ID);
            if(guild) {
                const member = await guild.members.fetch(interaction.user.id).catch(()=>null);
                if(member) await member.roles.remove(IZINLI_ROL_ID).catch(()=>null);
            }

            const izinLog = client.channels.cache.get(IZIN_LOG_KANAL_ID);
            if(izinLog) izinLog.send(`🔄 <@${interaction.user.id}> adlı personel iznini erken bitirdi. İzinli rolü alındı.`);
            
            updateIzinPanel();
            return interaction.reply({ content: '✅ İzniniz başarıyla sonlandırıldı ve göreve döndünüz.', ephemeral: true });
        }

        // --- YÖNETİCİ DM ONAY/RET BUTONLARI ---
        if (interaction.customId === 'admin_izin_onay' || interaction.customId === 'admin_izin_red') {
            const embed = interaction.message.embeds[0];
            const targetUserId = embed.fields.find(f => f.name === 'Personel ID').value;
            const tarihOzet = embed.fields.find(f => f.name === 'Tarih Özeti').value;
            const bitisMs = embed.fields.find(f => f.name === 'BitişMs').value;

            if (interaction.customId === 'admin_izin_onay') {
                let uDoc = await User.findOne({ userId: targetUserId });
                if(!uDoc) uDoc = new User({ userId: targetUserId });
                
                uDoc.leaveUntil = parseInt(bitisMs);
                uDoc.leaveText = tarihOzet;
                await uDoc.save();

                const guild = interaction.client.guilds.cache.get(SUNUCU_ID);
                if(guild) {
                    const member = await guild.members.fetch(targetUserId).catch(()=>null);
                    if(member) await member.roles.add(IZINLI_ROL_ID).catch(()=>null);
                }

                const izinLog = interaction.client.channels.cache.get(IZIN_LOG_KANAL_ID);
                if(izinLog) izinLog.send(`✅ <@${targetUserId}> adlı personelin **${tarihOzet}** tarihli izni <@${interaction.user.id}> tarafından onaylandı. İzinli permi verildi.`);

                const targetUser = await interaction.client.users.fetch(targetUserId).catch(()=>null);
                if(targetUser) targetUser.send(`✅ **İzin Talebiniz Onaylandı!**\nTarih: **${tarihOzet}**\nOnaylayan Yetkili: <@${interaction.user.id}>`).catch(()=>null);

                updateIzinPanel(); // Paneli güncelle
                return interaction.update({ content: `✅ İzni onayladınız.`, embeds: [], components: [] });
            }

            if (interaction.customId === 'admin_izin_red') {
                const targetUser = await interaction.client.users.fetch(targetUserId).catch(()=>null);
                if(targetUser) targetUser.send(`❌ **İzin Talebiniz Reddedildi!**\nReddeden Yetkili: <@${interaction.user.id}>`).catch(()=>null);
                
                return interaction.update({ content: `❌ İzni reddettiniz.`, embeds: [], components: [] });
            }
        }

        // Mevcut Butonlar (AFK, Mesai Gir vs.)
        if (interaction.customId === 'afk_devam') {
            if (afkTimeouts.has(interaction.user.id)) {
                clearTimeout(afkTimeouts.get(interaction.user.id));
                afkTimeouts.delete(interaction.user.id);
                if (logKanal) logKanal.send(`💤 <@${interaction.user.id}> AFK kontrolünü onayladı, mesaiye devam ediyor.`);
                interaction.reply({content: '✅ Mesaiye devam ediyorsunuz!', ephemeral: true});
            }
        } else if (interaction.customId === 'afk_bitir') {
            if (afkTimeouts.has(interaction.user.id)) {
                clearTimeout(afkTimeouts.get(interaction.user.id));
                afkTimeouts.delete(interaction.user.id);
            }
            if (userDoc && userDoc.onDuty) {
                const duration = Date.now() - userDoc.startTime;
                userDoc.totalTime += duration; 
                userDoc.weeklyTime += duration; 
                userDoc.onDuty = false;
                userDoc.startTime = null;
                await userDoc.save();
                if (logKanal) logKanal.send(`🔴 <@${interaction.user.id}> DM üzerinden mesaisini bitirdi.`);
                interaction.reply({ content: '🔴 Mesainiz DM üzerinden sonlandırıldı.', ephemeral: true });
            } else {
                interaction.reply({ content: '❌ Zaten aktif mesainiz bulunmuyor.', ephemeral: true });
            }
        } else if (interaction.customId === 'mesai_gir') {
            if (!userDoc) return interaction.reply({ content: '❌ `!kayıt <ID>` yap!', ephemeral: true });
            userDoc.onDuty = true; userDoc.startTime = Date.now();
            await userDoc.save();
            if(logKanal) logKanal.send(`🟢 <@${interaction.user.id}> mesaiye başladı.`);
            interaction.reply({ content: '✅ Mesai başladı.', ephemeral: true });
        } else if (interaction.customId === 'mesai_cik') {
            if (!userDoc || !userDoc.onDuty) return interaction.reply({ content: '❌ Aktif mesain yok!', ephemeral: true });
            const duration = Date.now() - userDoc.startTime;
            userDoc.totalTime += duration; userDoc.weeklyTime += duration; userDoc.onDuty = false;
            await userDoc.save();
            if(logKanal) logKanal.send(`🔴 <@${interaction.user.id}> mesaiyi bitirdi.`);
            interaction.reply({ content: `✅ Mesain bitti!`, ephemeral: true });
        } else if (interaction.customId === 'haftalik_mesai') {
            interaction.reply({ content: `📅 Bu hafta: ${formatTime(userDoc ? userDoc.weeklyTime : 0)}`, ephemeral: true });
        } else if (interaction.customId === 'toplam_mesai') {
            interaction.reply({ content: `📊 Toplam: ${formatTime(userDoc ? userDoc.totalTime : 0)}`, ephemeral: true });
        } else if (interaction.customId === 'id_guncelle') {
            const modal = new ModalBuilder().setCustomId('id_modal').setTitle('FiveM ID Güncelle');
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('new_id').setLabel('Yeni FiveM ID').setStyle(TextInputStyle.Short)));
            await interaction.showModal(modal);
        }
    }
    
    // Slash Komutları (Aynı)
    if (interaction.isChatInputCommand()) {
        const strikeKanal = interaction.client.channels.cache.get(STRIKE_KANAL_ID);
        const ihracKanal = interaction.client.channels.cache.get(IHRAC_KANAL_ID);
        
        const komutLogKanal = interaction.client.channels.cache.get(KOMUT_LOG_KANAL_ID);
        if (komutLogKanal) {
            const paramsList = interaction.options.data.map(opt => {
                if (opt.type === 6) return `**${opt.name}:** <@${opt.value}>`;
                if (opt.type === 8) return `**${opt.name}:** <@&${opt.value}>`;
                if (opt.type === 7) return `**${opt.name}:** <#${opt.value}>`;
                return `**${opt.name}:** ${opt.value}`;
            }).join(' | ');

            const cmdLogEmbed = new EmbedBuilder()
                .setColor(0x2b2d31)
                .setTitle('🛠️ Slash Komut Kullanıldı')
                .addFields(
                    { name: 'Kullanan', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Komut', value: `/${interaction.commandName}`, inline: true },
                    { name: 'Parametreler', value: paramsList || 'Yok', inline: false },
                    { name: 'Kanal', value: `<#${interaction.channelId}>`, inline: false }
                )
                .setTimestamp();
            komutLogKanal.send({ embeds: [cmdLogEmbed] }).catch(() => {});
        }

        if (interaction.commandName === 'haftalik-mesai-bilgi') {
            const targetUser = interaction.options.getUser('kisi');
            const userDoc = await User.findOne({ userId: targetUser.id });
            const time = userDoc ? userDoc.weeklyTime : 0;
            await interaction.reply({ content: `📅 <@${targetUser.id}> adlı personelin bu haftaki mesaisi: **${formatTime(time)}**` });
        }

        if (interaction.commandName === 'top-mesai-bilgi') {
            const targetUser = interaction.options.getUser('kisi');
            const userDoc = await User.findOne({ userId: targetUser.id });
            const time = userDoc ? userDoc.totalTime : 0;
            await interaction.reply({ content: `📊 <@${targetUser.id}> adlı personelin toplam mesaisi: **${formatTime(time)}**` });
        }

        if (interaction.commandName === 'strike') {
            const kisi = interaction.options.getMember('kisi');
            const targetUser = interaction.options.getUser('kisi');
            const rol = interaction.options.getRole('rol');
            const sebep = interaction.options.getString('sebep');
            
            if (kisi && rol) await kisi.roles.add(rol).catch(() => {});

            const embed = new EmbedBuilder()
                .setColor(0xd32f2f)
                .setDescription(`### ⚠️ Strike Verildi\n\n**Kullanıcı:** <@${targetUser.id}>\n**Yetkili:** <@${interaction.user.id}>\n**Rol:** <@&${rol.id}>\n**Sebep:** ${sebep}`);

            if (strikeKanal) {
                await strikeKanal.send({ embeds: [embed] });
                await interaction.reply({ content: '✅ Strike loglandı.', ephemeral: true });
            } else {
                await interaction.reply({ embeds: [embed] });
            }
        }

        if (interaction.commandName === 'ihrac') {
            const kisi = interaction.options.getMember('kisi');
            const targetUser = interaction.options.getUser('kisi');
            const sebep = interaction.options.getString('sebep');

            if (kisi) {
                await kisi.setNickname('İHRAÇ').catch(() => {});
                const ihracRole = interaction.guild.roles.cache.get(IHRAC_ROL_ID) || interaction.guild.roles.cache.find(r => r.name.toLowerCase().includes('ihraç') || r.name.toLowerCase().includes('ihrac'));
                if (ihracRole) await kisi.roles.set([ihracRole.id]).catch(() => {});
                else await kisi.roles.set([]).catch(() => {});
            }

            const embed = new EmbedBuilder()
                .setColor(0xd32f2f)
                .setDescription(`### 🛑 Departmandan İhraç\n\n**İhraç Edilecek Kişi:** <@${targetUser.id}>\n**Dc ID:** "${targetUser.id}"\n**Sebep:** "${sebep}"`);

            if (ihracKanal) {
                await ihracKanal.send({ embeds: [embed] });
                await interaction.reply({ content: '✅ Personel ihraç edildi.', ephemeral: true });
            } else {
                await interaction.reply({ embeds: [embed] });
            }
        }

        if (interaction.commandName === 'duyuru-gonder') {
            await interaction.deferReply({ ephemeral: true });
            const rol = interaction.options.getRole('rol');
            const baslik = interaction.options.getString('baslik');
            const mesaj = interaction.options.getString('mesaj');

            const dmEmbed = new EmbedBuilder().setColor(0x2b2d31).setDescription(`📢 # ${baslik}\n\n# ${mesaj}\n\n**Gönderen:** ${interaction.member.displayName}\n**Tarih:** ${formatDate()}`);
            await interaction.guild.members.fetch();
            
            let basarili = 0, basarisiz = 0;
            for (const [id, member] of rol.members) {
                if (member.user.bot) continue;
                try { await member.send({ embeds: [dmEmbed] }); basarili++; } catch (e) { basarisiz++; }
            }
            await interaction.editReply({ content: `✅ Duyuru tamamlandı!\n**Başarılı:** ${basarili} kişi | **DM Kapalı/Hata:** ${basarisiz} kişi` });
        }

        if (interaction.commandName === 'aktif-kadro') {
            const onDutyUsers = await User.find({ onDuty: true });
            const embed = new EmbedBuilder().setColor(0x00ff00).setTitle('🟢 Aktif Görevdeki Personel');
            if (onDutyUsers.length > 0) embed.setDescription(onDutyUsers.map(u => `<@${u.userId}> (ID: ${u.fivemId}) - ${formatTime(Date.now() - u.startTime)}`).join('\n'));
            else embed.setDescription('Şu an aktif görevde personel bulunmuyor.');
            embed.setFooter({ text: `${onDutyUsers.length} personel aktif görevde • Son güncelleme ${formatDate()}` });

            const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
            aktifKadroMsg = msg;
        }

        if (interaction.commandName === 'top-mesai') {
            const list = await User.find({ weeklyTime: { $gt: 0 } }).sort({ weeklyTime: -1 });
            if (list.length > 0) {
                const desc = list.map((u, i) => `**${i+1}.** <@${u.userId}> ➔ **${formatTime(u.weeklyTime)}**`).join('\n');
                await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x3498db).setTitle('🏆 Haftalık Mesai Liderlik Tablosu').setDescription(desc)] });
            } else await interaction.reply({ content: 'Henüz mesai yapan personel bulunmuyor.' });
        }

        if (interaction.commandName === 'hafta-mesai-sil') {
            await User.updateMany({}, { weeklyTime: 0 });
            interaction.reply({ content: '✅ Sıfırlandı.', ephemeral: true });
        }

        if (interaction.commandName === 'aktif-kadro-cıkar') {
            await interaction.deferReply({ ephemeral: true });
            const activeUsers = await User.find({ onDuty: true });
            if (activeUsers.length === 0) return interaction.editReply({ content: '❌ Şu an aktif mesaide kimse bulunmuyor.' });

            for (const userDoc of activeUsers) {
                if (userDoc.startTime) {
                    const duration = Date.now() - userDoc.startTime;
                    userDoc.totalTime += duration; userDoc.weeklyTime += duration;
                }
                userDoc.onDuty = false; userDoc.startTime = null; await userDoc.save();
            }
            await interaction.editReply({ content: `✅ Mesaideki **${activeUsers.length}** personelin süresi hesaplanıp haftalık/toplam mesailerine eklendi ve mesaileri sonlandırıldı.` });
        }

        if (interaction.commandName === 'mesai-ekle') {
            const targetUser = interaction.options.getUser('kisi');
            const msToAdd = interaction.options.getNumber('saat') * 3600000; 

            let userDoc = await User.findOne({ userId: targetUser.id });
            if (!userDoc) return interaction.reply({ content: `❌ <@${targetUser.id}> veritabanında bulunamadı.`, ephemeral: true });

            userDoc.totalTime += msToAdd; userDoc.weeklyTime += msToAdd; await userDoc.save();
            interaction.reply({ content: `✅ <@${targetUser.id}> adlı personele başarıyla mesai eklendi.`, ephemeral: true });
        }

        if (interaction.commandName === 'mesai-sil') {
            const targetUser = interaction.options.getUser('kisi');
            const msToRemove = interaction.options.getNumber('saat') * 3600000; 

            let userDoc = await User.findOne({ userId: targetUser.id });
            if (!userDoc) return interaction.reply({ content: `❌ <@${targetUser.id}> veritabanında bulunamadı.`, ephemeral: true });

            userDoc.totalTime -= msToRemove; userDoc.weeklyTime -= msToRemove; await userDoc.save();
            interaction.reply({ content: `✅ <@${targetUser.id}> adlı personelden başarıyla mesai silindi.`, ephemeral: true });
        }
    }
});

// --- ANTI-CRASH SİSTEMİ ---
process.on('unhandledRejection', (reason, p) => console.log('❌ [Anti-Crash] Unhandled Rejection/Catch', reason, p));
process.on('uncaughtException', (err, origin) => console.log('❌ [Anti-Crash] Uncaught Exception/Catch', err, origin));
process.on('uncaughtExceptionMonitor', (err, origin) => console.log('❌ [Anti-Crash] Uncaught Exception/Catch (Monitor)', err, origin));

client.login(TOKEN);
