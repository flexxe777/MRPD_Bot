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
    leaveUntil: { type: Number, default: null } // YENİ: İzin bitiş süresi
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
const afkTimeouts = new Map();

// --- YARDIMCI FONKSİYONLAR ---
function formatTime(ms) {
    let totalSeconds = Math.floor(ms / 1000);
    // Eksi değerler için düzenleme
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

// --- AYARLAR ---
const TOKEN = process.env.TOKEN;
const LOG_KANAL_ID = '1522260330502291767';
const STRIKE_KANAL_ID = '1475505351108591707';
const IHRAC_KANAL_ID = '1478819151689679039';
const IHRAC_ROL_ID = '1475505209278075131';
const KOMUT_LOG_KANAL_ID = '1528929952412733480'; 

// --- YENİ: İZİN SİSTEMİ AYARLARI ---
const SUNUCU_ID = '1224108385771716749'; // Botun işlem yapacağı ana sunucu ID
const YETKILI_ROL_ID = '1528933720969580634'; // İzinleri onaylayacak kişilerin rol ID'si (Buna DM gider)
const IZINLI_ROL_ID = '1525600296951222323'; // İzni onaylanana verilecek rol ID
const IZIN_LOG_KANAL_ID = '1528933597896114368'; // İzin bildirimlerinin düşeceği log kanalı

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
    new SlashCommandBuilder().setName('top-mesai-bilgi').setDescription('Belirtilen kişinin toplam mesai saatini gösterir.').addUserOption(o=>o.setName('kisi').setDescription('Mesaisi görüntülenecek kişi').setRequired(true)),
    // YENİ KOMUT: İZİN SİSTEMİ
    new SlashCommandBuilder().setName('izin-al').setDescription('Departmandan izin talep edersiniz.').addNumberOption(o=>o.setName('gun').setDescription('Kaç gün izin istiyorsunuz?').setRequired(true)).addStringOption(o=>o.setName('sebep').setDescription('İzin sebebi').setRequired(true))
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.on('ready', async () => {
    console.log(`${client.user.tag} sistemi aktif!`);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });

    // YENİ: İzin Süresi Dolanları Kontrol Eden Sistem (Her 1 dakikada bir kontrol eder)
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
                await u.save();

                if(izinLogKanal) {
                    izinLogKanal.send(`⏰ <@${u.userId}> adlı personelin izni sona erdi. Üzerindeki izinli rolü otomatik alındı.`);
                }
            }
        }
    }, 60000);

    // AFK Kontrolü
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
                            
                            if (logKanal) {
                                logKanal.send(`⚠️ <@${userData.userId}> AFK kontrolüne 10 dakika boyunca yanıt vermediği için mesaisi otomatik sonlandırıldı.`);
                            }
                            
                            try { user.send('❌ 10 dakika yanıt vermediğiniz için mesainiz otomatik bitti.'); } catch(e){}
                        }
                        afkTimeouts.delete(userData.userId);
                    }, 600000); // 10 Dakika süresi (600000 ms)
                    afkTimeouts.set(userData.userId, timeout);
                } catch (e) { console.error('DM gönderilemedi'); }
            }
        }
    }, 2700000);

    // Kadro Güncelleme (5 Dakikada Bir)
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
});

client.on('interactionCreate', async (interaction) => {
    const logKanal = interaction.client.channels.cache.get(LOG_KANAL_ID);
    
    if (interaction.isButton()) {
        const userDoc = await User.findOne({ userId: interaction.user.id });

        // --- YENİ: İZİN ONAY BUTONU ---
        if (interaction.customId.startsWith('izin_onay_')) {
            const parts = interaction.customId.split('_');
            const targetUserId = parts[2];
            const gun = parseFloat(parts[3]);
            
            // Veritabanı güncellemesi (Süre hesaplama)
            let uDoc = await User.findOne({ userId: targetUserId });
            if(!uDoc) { uDoc = new User({ userId: targetUserId }); }
            
            const leaveEndMs = Date.now() + (gun * 24 * 60 * 60 * 1000);
            uDoc.leaveUntil = leaveEndMs;
            await uDoc.save();

            // Rol verme işlemi
            const guild = interaction.client.guilds.cache.get(SUNUCU_ID);
            if(guild) {
                const member = await guild.members.fetch(targetUserId).catch(()=>null);
                if(member) {
                    await member.roles.add(IZINLI_ROL_ID).catch(()=>null);
                }
            }

            // Log kanalına at
            const izinLog = interaction.client.channels.cache.get(IZIN_LOG_KANAL_ID);
            if(izinLog) {
                izinLog.send(`✅ <@${targetUserId}> adlı personelin **${gun} günlük** izni <@${interaction.user.id}> tarafından onaylandı. Üzerine izinli permi verildi.`);
            }

            // Hedef kişiye DM at
            const targetUser = await interaction.client.users.fetch(targetUserId).catch(()=>null);
            if(targetUser) {
                targetUser.send(`✅ **İzin Talebiniz Onaylandı!**\nSüre: **${gun} Gün**\nOnaylayan Yetkili: <@${interaction.user.id}>`).catch(()=>null);
            }

            return interaction.update({ content: `✅ <@${targetUserId}> adlı kişinin iznini onayladınız.`, embeds: [], components: [] });
        }
        
        // --- YENİ: İZİN RED BUTONU ---
        if (interaction.customId.startsWith('izin_red_')) {
            const parts = interaction.customId.split('_');
            const targetUserId = parts[2];
            
            // Hedef kişiye DM at
            const targetUser = await interaction.client.users.fetch(targetUserId).catch(()=>null);
            if(targetUser) {
                targetUser.send(`❌ **İzin Talebiniz Reddedildi!**\nReddeden Yetkili: <@${interaction.user.id}>`).catch(()=>null);
            }

            return interaction.update({ content: `❌ <@${targetUserId}> adlı kişinin iznini reddettiniz.`, embeds: [], components: [] });
        }


        // Mevcut Butonlar
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
    
    if (interaction.isModalSubmit() && interaction.customId === 'id_modal') {
        const newId = interaction.fields.getTextInputValue('new_id');
        await User.findOneAndUpdate({ userId: interaction.user.id }, { fivemId: newId }, { upsert: true });
        interaction.reply({ content: `✅ Yeni ID: ${newId}`, ephemeral: true });
    }

    if (interaction.isChatInputCommand()) {
        const strikeKanal = interaction.client.channels.cache.get(STRIKE_KANAL_ID);
        const ihracKanal = interaction.client.channels.cache.get(IHRAC_KANAL_ID);
        
        // KOMUT KULLANIM LOG SİSTEMİ (Güncellenmiş ID Etiketlemeli)
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

        // --- YENİ: İZİN AL KOMUTU ---
        if (interaction.commandName === 'izin-al') {
            await interaction.deferReply({ ephemeral: true });
            const gun = interaction.options.getNumber('gun');
            const sebep = interaction.options.getString('sebep');
            
            // Onaylayacak yetkilileri bul
            const yetkiliRole = await interaction.guild.roles.fetch(YETKILI_ROL_ID).catch(()=>null);
            if (!yetkiliRole) {
                return interaction.editReply('❌ Sistem hatası: Yetkili rolü bulunamadı. Lütfen yöneticinize bildirin.');
            }

            const reqEmbed = new EmbedBuilder()
                .setColor(0xf1c40f)
                .setTitle('📝 Yeni İzin Talebi')
                .addFields(
                    { name: 'Personel', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Talep Edilen Süre', value: `${gun} Gün`, inline: true },
                    { name: 'Sebep', value: sebep, inline: false }
                )
                .setFooter({ text: `Talep Eden ID: ${interaction.user.id}` });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`izin_onay_${interaction.user.id}_${gun}`).setLabel('Onayla').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`izin_red_${interaction.user.id}`).setLabel('Reddet').setStyle(ButtonStyle.Danger)
            );

            let sentCount = 0;
            // Tüm yetkililere DM gönder
            yetkiliRole.members.forEach(async (member) => {
                if (!member.user.bot) {
                    try {
                        await member.send({ embeds: [reqEmbed], components: [row] });
                        sentCount++;
                    } catch(e){}
                }
            });

            await interaction.editReply(`✅ İzin talebiniz başarıyla alınmış ve ${sentCount} yetkiliye DM üzerinden iletilmiştir. Onay/Red durumu size DM olarak bildirilecektir.`);
        }


        // Mevcut Komutlar
        if (interaction.commandName === 'haftalik-mesai-bilgi') {
            const targetUser = interaction.options.getUser('kisi');
            const userDoc = await User.findOne({ userId: targetUser.id });
            const time = userDoc ? userDoc.weeklyTime : 0;
            
            await interaction.reply({ 
                content: `📅 <@${targetUser.id}> adlı personelin bu haftaki mesaisi: **${formatTime(time)}**` 
            });
        }

        if (interaction.commandName === 'top-mesai-bilgi') {
            const targetUser = interaction.options.getUser('kisi');
            const userDoc = await User.findOne({ userId: targetUser.id });
            const time = userDoc ? userDoc.totalTime : 0;
            
            await interaction.reply({ 
                content: `📊 <@${targetUser.id}> adlı personelin toplam mesaisi: **${formatTime(time)}**` 
            });
        }

        if (interaction.commandName === 'strike') {
            const kisi = interaction.options.getMember('kisi');
            const targetUser = interaction.options.getUser('kisi');
            const rol = interaction.options.getRole('rol');
            const sebep = interaction.options.getString('sebep');
            
            if (kisi && rol) {
                await kisi.roles.add(rol).catch(() => {});
            }

            const embed = new EmbedBuilder()
                .setColor(0xd32f2f)
                .setDescription(
                    `### ⚠️ Strike Verildi\n\n` +
                    `**Kullanıcı:** <@${targetUser.id}>\n` +
                    `**Yetkili:** <@${interaction.user.id}>\n` +
                    `**Rol:** <@&${rol.id}>\n` +
                    `**Sebep:** ${sebep}`
                );

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
                
                if (ihracRole) {
                    await kisi.roles.set([ihracRole.id]).catch(() => {});
                } else {
                    await kisi.roles.set([]).catch(() => {});
                }
            }

            const embed = new EmbedBuilder()
                .setColor(0xd32f2f)
                .setDescription(
                    `### 🛑 Departmandan İhraç\n\n` +
                    `**İhraç Edilecek Kişi:** <@${targetUser.id}>\n` +
                    `**Dc ID:** "${targetUser.id}"\n` +
                    `**Sebep:** "${sebep}"`
                );

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

            const dmEmbed = new EmbedBuilder()
                .setColor(0x2b2d31)
                .setDescription(
                    `📢 # ${baslik}\n\n` +
                    `# ${mesaj}\n\n` +
                    `**Gönderen:** ${interaction.member.displayName}\n` +
                    `**Tarih:** ${formatDate()}`
                );

            await interaction.guild.members.fetch();
            const membersWithRole = rol.members;

            let basarili = 0;
            let basarisiz = 0;

            for (const [id, member] of membersWithRole) {
                if (member.user.bot) continue;
                try {
                    await member.send({ embeds: [dmEmbed] });
                    basarili++;
                } catch (e) {
                    basarisiz++;
                }
            }

            await interaction.editReply({ 
                content: `✅ Duyuru tamamlandı!\n**Başarılı:** ${basarili} kişi | **DM Kapalı/Hata:** ${basarisiz} kişi` 
            });
        }

        if (interaction.commandName === 'aktif-kadro') {
            const onDutyUsers = await User.find({ onDuty: true });
            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('🟢 Aktif Görevdeki Personel');

            if (onDutyUsers.length > 0) {
                embed.setDescription(onDutyUsers.map(u => `<@${u.userId}> (ID: ${u.fivemId}) - ${formatTime(Date.now() - u.startTime)}`).join('\n'));
            } else {
                embed.setDescription('Şu an aktif görevde personel bulunmuyor.');
            }
            embed.setFooter({ text: `${onDutyUsers.length} personel aktif görevde • Son güncelleme ${formatDate()}` });

            const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
            aktifKadroMsg = msg;
        }

        if (interaction.commandName === 'top-mesai') {
            const list = await User.find({ weeklyTime: { $gt: 0 } }).sort({ weeklyTime: -1 });
            
            if (list.length > 0) {
                const description = list.map((u, i) => `**${i+1}.** <@${u.userId}> ➔ **${formatTime(u.weeklyTime)}**`).join('\n');
                const embed = new EmbedBuilder()
                    .setColor(0x3498db)
                    .setTitle('🏆 Haftalık Mesai Liderlik Tablosu')
                    .setDescription(description);
                await interaction.reply({ embeds: [embed] });
            } else {
                await interaction.reply({ content: 'Henüz mesai yapan personel bulunmuyor.' });
            }
        }

        if (interaction.commandName === 'hafta-mesai-sil') {
            await User.updateMany({}, { weeklyTime: 0 });
            interaction.reply({ content: '✅ Sıfırlandı.', ephemeral: true });
        }

        if (interaction.commandName === 'aktif-kadro-cıkar') {
            await interaction.deferReply({ ephemeral: true });

            const activeUsers = await User.find({ onDuty: true });

            if (activeUsers.length === 0) {
                return interaction.editReply({ content: '❌ Şu an aktif mesaide kimse bulunmuyor.' });
            }

            for (const userDoc of activeUsers) {
                if (userDoc.startTime) {
                    const duration = Date.now() - userDoc.startTime;
                    userDoc.totalTime += duration;
                    userDoc.weeklyTime += duration;
                }
                userDoc.onDuty = false;
                userDoc.startTime = null;
                await userDoc.save();
            }

            await interaction.editReply({ 
                content: `✅ Mesaideki **${activeUsers.length}** personelin süresi hesaplanıp **haftalık/toplam mesailerine eklendi** ve mesaileri sonlandırıldı.` 
            });
        }

        if (interaction.commandName === 'mesai-ekle') {
            const targetUser = interaction.options.getUser('kisi');
            const saat = interaction.options.getNumber('saat');
            const msToAdd = saat * 3600000; 

            let userDoc = await User.findOne({ userId: targetUser.id });
            if (!userDoc) {
                return interaction.reply({ content: `❌ <@${targetUser.id}> veritabanında bulunamadı. Önce \`!kayıt <ID>\` yapması gerekiyor.`, ephemeral: true });
            }

            userDoc.totalTime += msToAdd;
            userDoc.weeklyTime += msToAdd;
            await userDoc.save();

            interaction.reply({ content: `✅ <@${targetUser.id}> adlı personele başarıyla **${saat} saat** mesai eklendi.`, ephemeral: true });
        }

        if (interaction.commandName === 'mesai-sil') {
            const targetUser = interaction.options.getUser('kisi');
            const saat = interaction.options.getNumber('saat');
            const msToRemove = saat * 3600000; 

            let userDoc = await User.findOne({ userId: targetUser.id });
            if (!userDoc) {
                return interaction.reply({ content: `❌ <@${targetUser.id}> veritabanında bulunamadı.`, ephemeral: true });
            }

            userDoc.totalTime -= msToRemove;
            userDoc.weeklyTime -= msToRemove;
            await userDoc.save();

            interaction.reply({ content: `✅ <@${targetUser.id}> adlı personelden başarıyla **${saat} saat** mesai silindi.`, ephemeral: true });
        }
    }
});

// --- ANTI-CRASH SİSTEMİ ---
process.on('unhandledRejection', (reason, p) => {
    console.log('❌ [Anti-Crash] Unhandled Rejection/Catch', reason, p);
});
process.on('uncaughtException', (err, origin) => {
    console.log('❌ [Anti-Crash] Uncaught Exception/Catch', err, origin);
});
process.on('uncaughtExceptionMonitor', (err, origin) => {
    console.log('❌ [Anti-Crash] Uncaught Exception/Catch (Monitor)', err, origin);
});

client.login(TOKEN);
