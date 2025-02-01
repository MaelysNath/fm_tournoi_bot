const { Client, GatewayIntentBits, Collection, REST, Routes } = require("discord.js");
const fs = require("fs");
const dotenv = require("dotenv");
const path = require("path");
const { logErrorToDiscord } = require("./utils/errorLogger");
dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

client.commands = new Collection();

// Chargement des commandes
console.log("Chargement des commandes...");
const commandFiles = fs.readdirSync("./commands").filter((file) => file.endsWith(".js"));
const commands = [];
for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    if ("data" in command && "execute" in command) {
        client.commands.set(command.data.name, command);
        commands.push(command.data.toJSON());
    } else {
        console.warn(
            `[AVERTISSEMENT] La commande dans "${file}" est incorrectement configurée et n'a pas été chargée.`
        );
    }
}
console.log("Commandes chargées avec succès.");

// Déploiement des commandes
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

// Gestion centralisée des interactions
client.on("interactionCreate", async (interaction) => {
    try {
        if (interaction.isCommand()) {
            // Commandes slash
            const command = client.commands.get(interaction.commandName);
            if (!command) return;

            await command.execute(interaction);
        } else if (interaction.isButton()) {
            // Boutons (approve/reject/close)
            const customId = interaction.customId;

            if (customId.startsWith("approve_") || customId.startsWith("reject_")) {
                const voteHandler = require("./handlers/voteHandler");
                await voteHandler(interaction);
            } else if (customId.startsWith("close_")) {
                const closeHandler = require("./handlers/closeHandler");
                await closeHandler(interaction);
            }
        } else if (interaction.isModalSubmit()) {
            // Modaux
            const modalSubmitHandler = require("./handlers/modalSubmitHandler");
            await modalSubmitHandler(interaction);
        }
    } catch (error) {
        console.error("Erreur lors de l'interaction :", error);
        interaction.reply({
            content: "Une erreur est survenue lors du traitement de votre interaction.",
            ephemeral: true,
        });
    }
});



// Importer les gestionnaires d'événements (memes contest)
require('./events/readyHandler')(client);  
require('./events/interactionHandler')(client);

const eventFiles = fs.readdirSync(path.join(__dirname, 'events')).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const event = require(`./events/${file}`);
    if (event.name) {
        client.on(event.name, (...args) => event.execute(...args));
    }
}

// Gestion des erreurs globales
process.on("unhandledRejection", (error) => {
    console.error("Unhandled promise rejection:", error);
    logErrorToDiscord(error, "Unhandled Promise Rejection");
});

process.on("uncaughtException", (error) => {
    console.error("Uncaught exception:", error);
    logErrorToDiscord(error, "Uncaught Exception");
});

client.on("error", (error) => {
    console.error("Discord.js error:", error);
    logErrorToDiscord(error, "Discord.js Error");
});

client.on("shardError", (error) => {
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
