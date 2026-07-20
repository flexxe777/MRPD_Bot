const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Bot is running!');
});

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});

const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers
    ]
});

// Bot hazır olduğunda çalışacak kısım
client.once('ready', () => {
    console.log(`${client.user.tag} olarak giriş yapıldı!`);
});

// Buraya kendi bot komutlarını/kodlarını ekleyebilirsin...

// Botu çalıştıran en önemli kısım (Bunu unutmuştuk)
client.login(process.env.DISCORD_TOKEN);
