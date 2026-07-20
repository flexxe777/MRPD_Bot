// --- 1. WEB SUNUCUSU (Render'ın uyumaması için) ---
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(port, () => console.log(`Server is listening on port ${port}`));

// --- 2. BOT BAĞLANTISI ---
const { 
    Client, GatewayIntentBits, ModalBuilder, TextInputBuilder, 
    TextInputStyle, ActionRowBuilder, EmbedBuilder 
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once('ready', () => {
    console.log(`${client.user.tag} olarak giriş yapıldı!`);
});

// --- 3. BUTON VE MODAL İŞLEMLERİ (Beyin kısmı) ---
client.on('interactionCreate', async interaction => {
    
    // BUTONLARA BASILINCA
    if (interaction.isButton()) {
        if (interaction.customId === 'mesai_gir') {
            const modal = new ModalBuilder()
                .setCustomId('mesai_gir_modal')
                .setTitle('Mesai Giriş Sistemi');
            
            const idInput = new TextInputBuilder()
                .setCustomId('sehir_id')
                .setLabel('FiveM Şehir ID\'niz')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(idInput));
            await interaction.showModal(modal);
        }
        
        else if (interaction.customId === 'id_guncelle') {
            const modal = new ModalBuilder()
                .setCustomId('id_guncelle_modal')
                .setTitle('FiveM ID Güncelleme');
            
            const idInput = new TextInputBuilder()
                .setCustomId('yeni_id')
                .setLabel('Yeni Şehir ID\'niz')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(idInput));
            await interaction.showModal(modal);
        }
        
        // Diğer basit butonlar için hızlı yanıt
        else if (interaction.customId === 'mesai_cikis') {
            await interaction.reply({ content: 'Mesai çıkış işleminiz kaydedildi.', ephemeral: true });
        }
    }

    // MODAL (FORM) GÖNDERİLİNCE
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'mesai_gir_modal') {
            const id = interaction.fields.getTextInputValue('sehir_id');
            await interaction.reply({ content: `Başarılı! ${id} ID ile mesaiye başladınız.`, ephemeral: true });
        }
        else if (interaction.customId === 'id_guncelle_modal') {
            const id = interaction.fields.getTextInputValue('yeni_id');
            await interaction.reply({ content: `ID'niz ${id} olarak güncellendi.`, ephemeral: true });
        }
    }
});

client.login(process.env.TOKEN);
