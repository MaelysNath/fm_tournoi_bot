// main.js
const { Client, GatewayIntentBits, Collection, REST, Routes } = require("discord.js");
const fs = require("fs");
const dotenv = require("dotenv");
const { logErrorToDiscord } = require('./utils/errorLogger');
dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.commands = new Collection();

// Chargement des commandes
console.log("Chargement des commandes...");
const commandFiles = fs.readdirSync("./commands").filter(file => file.endsWith(".js"));
const commands = [];
for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        commands.push(command.data.toJSON());
    } else {
        console.warn(`[AVERTISSEMENT] La commande dans "${file}" est incorrectement configurée et n'a pas été chargée.`);
    }
}
console.log("Commandes chargées avec succès.");

// Déploiement des commandes (si nécessaire, vous pouvez aussi le déplacer dans readyHandler)
client.once("ready", async () => {
    const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
    try {
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        );
        console.log("Commandes slash déployées avec succès!");
    } catch (error) {
        console.error("Erreur lors du déploiement des commandes slash:", error);
        logErrorToDiscord(error, "Déploiement Slash Commands");
    }
});

// Importer les gestionnaires d'événements
require('./events/readyHandler')(client);  // Gestionnaire "ready"
require('./events/interactionHandler')(client);

// Gestion globale des erreurs
process.on('unhandledRejection', (error) => {
    console.error("Unhandled promise rejection:", error);
    logErrorToDiscord(error, "Unhandled Promise Rejection");
});

process.on('uncaughtException', (error) => {
    console.error("Uncaught exception:", error);
    logErrorToDiscord(error, "Uncaught Exception");
});

client.on('error', (error) => {
    console.error("Discord.js error:", error);
    logErrorToDiscord(error, "Discord.js Error");
});

client.on('shardError', (error) => {
    console.error("WebSocket error:", error);
    logErrorToDiscord(error, "WebSocket Error");
});

// Connexion du bot
client.login(process.env.TOKEN)
    .then(() => {
        console.log("Bot connecté avec succès.");
    })
    .catch((error) => {
        console.error("Erreur lors de la connexion du bot:", error);
    });

module.exports = client;
