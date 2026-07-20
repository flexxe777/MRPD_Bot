const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(port, () => console.log(`Server is listening on port ${port}`));

const { Client, GatewayIntentBits } = require('discord.js');
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

// --- BUTON İŞLEME MERKEZİ ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    // Burada butonlarının 'customId'leri neyse onu yazmalısın
    // Örnek: interaction.customId === 'mesai_gir' gibi
    
    try {
        if (interaction.customId === 'mesai_gir') {
            await interaction.reply({ content: 'Mesai giriş işlemin başarıyla başlatıldı.', ephemeral: true });
        } 
        else if (interaction.customId === 'mesai_cikis') {
            await interaction.reply({ content: 'Mesai çıkış işlemin kaydedildi.', ephemeral: true });
        }
        else if (interaction.customId === 'haftalik_mesai') {
            await interaction.reply({ content: 'Haftalık mesai süren hesaplanıyor...', ephemeral: true });
        }
        else if (interaction.customId === 'toplam_mesai') {
            await interaction.reply({ content: 'Toplam mesai süren getiriliyor...', ephemeral: true });
        }
        else if (interaction.customId === 'id_guncelle') {
            await interaction.reply({ content: 'FiveM ID güncelleme penceresi açılıyor...', ephemeral: true });
        }
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: 'Bir hata oluştu!', ephemeral: true });
    }
});

client.login(process.env.TOKEN);
