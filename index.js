// --- RENDER İÇİN GEREKLİ WEB SUNUCUSU (Sadece bu eklendi, kodun geri kalanı tamamen aynı) ---
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(port, () => console.log(`Server is listening on port ${port}`));

// --- SENİN KODUN (ASLA DEĞİŞMEDİ) ---
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

const userDB = new Map(); 
let aktifKadroMsg = null; // Aktif kadro mesajını tutar

// --- YARDIMCI FONKSİYONLAR ---
function formatTime(ms) {
    let totalSeconds = Math.floor(ms / 1000);
    let h = Math.floor(totalSeconds / 3600);
    let m = Math.floor((totalSeconds % 3600) / 60);
    let s = totalSeconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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

// --- KOMUT KAYDI ---
const commands = [
    new SlashCommandBuilder().setName('strike').setDescription('Personel strike').addUserOption(o=>o.setName('kisi').setDescription('Kişi').setRequired(true)).addRoleOption(o=>o.setName('rol').setDescription('Rol').setRequired(true)).addStringOption(o=>o.setName('sebep').setDescription('Sebep').setRequired(true)),
    new SlashCommandBuilder().setName('ihrac').setDescription('Personel ihraç').addUserOption(o=>o.setName('kisi').setDescription('Kişi').setRequired(true)).addStringOption(o=>o.setName('sebep').setDescription('Sebep').setRequired(true)),
    new SlashCommandBuilder().setName('duyuru-gonder').setDescription('Duyuru at').addRoleOption(o=>o.setName('rol').setDescription('Rol').setRequired(true)).addStringOption(o=>o.setName('baslik').setDescription('Başlık').setRequired(true)).addStringOption(o=>o.setName('mesaj').setDescription('İçerik').setRequired(true)),
    new SlashCommandBuilder().setName('aktif-kadro').setDescription('Aktif kadro listesini başlatır.'),
    new SlashCommandBuilder().setName('top-mesai').setDescription('Haftalık mesai liderlik tablosu.'),
    new SlashCommandBuilder().setName('hafta-mesai-sil').setDescription('Tüm haftalık mesaileri sıfırlar.'),
    new SlashCommandBuilder().setName('aktif-kadro-cıkar').setDescription('Mesaideki herkesi mesai dışı bırakır.')
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.on('ready', async () => {
    console.log(`${client.user.tag} sistemi aktif!`);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });

    // AFK KONTROL (45 Dakikada bir)
    setInterval(async () => {
        userDB.forEach(async (userData, userId) => {
            if (userData.onDuty && !userData.afkTimeout) {
                try {
                    const user = await client.users.fetch(userId);
                    const embed = new EmbedBuilder().setColor(0xff0000).setTitle('💤 AFK Kontrolü').setDescription('Hala görevde misiniz? 1 dakika içinde yanıt vermezseniz mesainiz bitecek.');
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('afk_devam').setLabel('Devam Ediyorum').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId('afk_bitir').setLabel('Bitir').setStyle(ButtonStyle.Danger)
                    );
                    await user.send({ embeds: [embed], components: [row] });
                    
                    userData.afkTimeout = setTimeout(async () => {
                        const duration = Date.now() - userData.startTime;
                        userData.totalTime += duration; userData.weeklyTime += duration;
                        userData.onDuty = false; userData.startTime = null; userData.afkTimeout = null;
                        const logKanal = client.channels.cache.get(LOG_KANAL_ID);
                        if(logKanal) logKanal.send(`🔴 <@${userId}> yanıt vermediği için mesaiyi DM üzerinden otomatik sonlandırdı. Süre: ${formatTime(duration)}`);
                        user.send(`❌ Yanıt vermediğiniz için mesainiz otomatik bitti. Süre: ${formatTime(duration)}`);
                    }, 60000);
                } catch (e) { console.error('DM gönderilemedi'); }
            }
        });
    }, 2700000);

    // AKTİF KADRO GÜNCELLEME (5 Dakikada bir)
    setInterval(async () => {
        if (aktifKadroMsg) {
            const onDutyUsers = [];
            userDB.forEach((v, k) => { if(v.onDuty) onDutyUsers.push({id: k, time: v.startTime, fivem: v.fivemId}); });
            
            const embed = new EmbedBuilder().setColor(0x00ff00).setTitle('🟢 Aktif Görevdeki Personel');
            if (onDutyUsers.length > 0) {
                embed.setDescription(onDutyUsers.map(u => `<@${u.id}> (ID: ${u.fivem}) - ${formatTime(Date.now() - u.time)}`).join('\n'));
            } else {
                embed.setDescription('Şu an aktif görevde personel bulunmuyor.');
            }
            embed.setFooter({ text: `${onDutyUsers.length} personel aktif görevde • Son güncelleme ${formatDate()}` });
            aktifKadroMsg.edit({ embeds: [embed] }).catch(() => {});
        }
    }, 300000);
});

// --- MESAJLAR ---
client.on('messageCreate', async (message) => {
    if (message.content.startsWith('!kayıt')) {
        const id = message.content.split(' ')[1];
        if (!id) return message.reply('❌ ID gir!');
        userDB.set(message.author.id, { fivemId: id, onDuty: false, startTime: null, totalTime: 0, weeklyTime: 0, afkTimeout: null });
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
            ).setFooter({ text: 'MRPD Merkezi Sistemi • Mesai Takip • 2026' });

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

// --- İŞLEMLER ---
client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton()) {
        const user = userDB.get(interaction.user.id);
        const logKanal = interaction.client.channels.cache.get(LOG_KANAL_ID);

        if (interaction.customId === 'afk_devam') {
            if (user && user.afkTimeout) { clearTimeout(user.afkTimeout); user.afkTimeout = null; if(logKanal) logKanal.send(`🟢 <@${interaction.user.id}> mesaiye DM üzerinden devam etti.`); interaction.reply({content: '✅ Devam!', ephemeral: true}); }
        } else if (interaction.customId === 'afk_bitir') {
            if (user && user.afkTimeout) { 
                const duration = Date.now() - user.startTime;
                user.totalTime += duration; user.weeklyTime += duration;
                clearTimeout(user.afkTimeout); user.afkTimeout = null; user.onDuty = false; 
                if(logKanal) logKanal.send(`🔴 <@${interaction.user.id}> mesaiyi DM üzerinden sonlandırdı. Süre: ${formatTime(duration)}`);
                interaction.reply({content: `🔴 Mesai bitti. Süre: ${formatTime(duration)}`, ephemeral: true}); 
            }
        } else if (interaction.customId === 'mesai_gir') {
            if (!user) return interaction.reply({ content: '❌ `!kayıt <ID>` yap!', ephemeral: true });
            user.onDuty = true; user.startTime = Date.now();
            if(logKanal) logKanal.send(`🟢 <@${interaction.user.id}> mesaiye başladı. (ID: ${user.fivemId})`);
            interaction.reply({ content: '✅ Mesai başladı.', ephemeral: true });
        } else if (interaction.customId === 'mesai_cik') {
            if (!user || !user.onDuty) return interaction.reply({ content: '❌ Aktif mesain yok!', ephemeral: true });
            const duration = Date.now() - user.startTime;
            user.totalTime += duration; user.weeklyTime += duration; user.onDuty = false;
            if(logKanal) logKanal.send(`🔴 <@${interaction.user.id}> mesaiyi bitirdi. Süre: ${formatTime(duration)}`);
            interaction.reply({ content: `✅ Mesain bitti!`, ephemeral: true });
        } else if (interaction.customId === 'haftalik_mesai') {
            interaction.reply({ content: `📅 Bu hafta: ${formatTime(user ? user.weeklyTime : 0)}`, ephemeral: true });
        } else if (interaction.customId === 'toplam_mesai') {
            interaction.reply({ content: `📊 Toplam: ${formatTime(user ? user.totalTime : 0)}`, ephemeral: true });
        } else if (interaction.customId === 'id_guncelle') {
            const modal = new ModalBuilder().setCustomId('id_modal').setTitle('FiveM ID Güncelle');
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('new_id').setLabel('Yeni FiveM ID').setStyle(TextInputStyle.Short)));
            await interaction.showModal(modal);
        }
    }
    
    if (interaction.isModalSubmit() && interaction.customId === 'id_modal') {
        const newId = interaction.fields.getTextInputValue('new_id');
        const user = userDB.get(interaction.user.id);
        if (user) user.fivemId = newId;
        interaction.reply({ content: `✅ Yeni ID: ${newId}`, ephemeral: true });
    }

    if (interaction.isChatInputCommand()) {
        const logKanal = interaction.client.channels.cache.get(LOG_KANAL_ID);
        const strikeKanal = interaction.client.channels.cache.get(STRIKE_KANAL_ID);
        const ihracKanal = interaction.client.channels.cache.get(IHRAC_KANAL_ID);

        if (interaction.commandName === 'strike') {
            const kisi = interaction.options.getMember('kisi');
            const rol = interaction.options.getRole('rol');
            const sebep = interaction.options.getString('sebep');
            await kisi.roles.add(rol);
            const embed = new EmbedBuilder().setColor(0xff0000).setTitle('⚠️ Strike Verildi')
                .setDescription(`**Kullanıcı:** ${kisi}\n**Yetkili:** ${interaction.member}\n**Rol:** ${rol}\n**Sebep:** ${sebep}`);
            if (strikeKanal) strikeKanal.send({ embeds: [embed] });
            interaction.reply({ content: '✅ Strike loglandı.', ephemeral: true });
        }

        if (interaction.commandName === 'ihrac') {
            const kisi = interaction.options.getMember('kisi');
            const sebep = interaction.options.getString('sebep');
            await kisi.roles.set([IHRAC_ROL_ID]);
            await kisi.setNickname('İhraç');
            const embed = new EmbedBuilder().setColor(0xff0000).setTitle('🛑 Departmandan İhraç')
                .setDescription(`**İhraç Edilen:** ${kisi}\n**Sebep:** "${sebep}"`);
            if (ihracKanal) ihracKanal.send({ embeds: [embed] });
            interaction.reply({ content: '✅ Kişi ihraç edildi.', ephemeral: true });
        }

        if (interaction.commandName === 'duyuru-gonder') {
            await interaction.deferReply({ ephemeral: true });
            const rol = interaction.options.getRole('rol');
            const embed = new EmbedBuilder().setColor(0x2b2d31).setTitle(`📢 ${interaction.options.getString('baslik')}`)
                .setDescription(`${interaction.options.getString('mesaj')}\n\n**Gönderen:** ${interaction.member.displayName}\n**Tarih:** ${formatDate()}`);
            let g = 0, h = 0;
            for (const member of rol.members.values()) {
                try { await member.send({ embeds: [embed] }); g++; } catch (e) { h++; }
            }
            await interaction.editReply({ content: `✅ Duyuru tamamlandı! Başarılı: ${g}, Hata: ${h}` });
        }

        // YENİ KOMUTLAR
        if (interaction.commandName === 'aktif-kadro') {
            const msg = await interaction.reply({ content: '⚙️ Kadro listesi oluşturuluyor...', fetchReply: true });
            aktifKadroMsg = msg;
            // İlk tetikleme
            const onDutyUsers = [];
            userDB.forEach((v, k) => { if(v.onDuty) onDutyUsers.push({id: k, time: v.startTime, fivem: v.fivemId}); });
            const embed = new EmbedBuilder().setColor(0x00ff00).setTitle('🟢 Aktif Görevdeki Personel');
            if (onDutyUsers.length > 0) embed.setDescription(onDutyUsers.map(u => `<@${u.id}> (ID: ${u.fivem}) - ${formatTime(Date.now() - u.time)}`).join('\n'));
            else embed.setDescription('Şu an aktif görevde personel bulunmuyor.');
            embed.setFooter({ text: `${onDutyUsers.length} personel aktif görevde • Son güncelleme ${formatDate()}` });
            msg.edit({ content: null, embeds: [embed] });
        }

        if (interaction.commandName === 'top-mesai') {
            const list = [];
            userDB.forEach((v, k) => { if(v.weeklyTime > 0) list.push({id: k, time: v.weeklyTime}); });
            list.sort((a,b) => b.time - a.time);
            const embed = new EmbedBuilder().setColor(0xffff00).setTitle('🏆 Haftalık Mesai Liderleri');
            embed.setDescription(list.length > 0 ? list.map((u, i) => `${i+1}. <@${u.id}>: **${formatTime(u.time)}**`).join('\n') : 'Henüz mesai yapan yok.');
            interaction.reply({ embeds: [embed] });
        }

        if (interaction.commandName === 'hafta-mesai-sil') {
            userDB.forEach(v => v.weeklyTime = 0);
            interaction.reply({ content: '✅ Haftalık mesailer sıfırlandı.', ephemeral: true });
        }

        if (interaction.commandName === 'aktif-kadro-cıkar') {
            userDB.forEach(v => { v.onDuty = false; v.startTime = null; });
            interaction.reply({ content: '✅ Mesaideki herkes zorunlu olarak çıkarıldı.', ephemeral: true });
        }
    }
});

client.login(process.env.TOKEN);
