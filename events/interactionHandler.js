const { logErrorToDiscord } = require("../utils/errorLogger");

module.exports = async (client) => {
    client.on("interactionCreate", async (interaction) => {
        console.log(`📡 Interaction reçue : ${interaction.commandName || interaction.customId}`);

        if (interaction.isCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) {
                console.warn(`⚠️ Commande inconnue : ${interaction.commandName}`);
                return;
            }

            try {
                await command.execute(interaction);
                console.log(`✅ Commande exécutée : ${interaction.commandName}`);
            } catch (error) {
                console.error(`❌ Erreur lors de l'exécution de ${interaction.commandName} :`, error);
                logErrorToDiscord(error, "Commande");

                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: "❌ Une erreur est survenue lors de l'exécution de cette commande !",
                        ephemeral: true
                    });
                }
            }
        } else if (interaction.isButton()) {
            const customId = interaction.customId;

            // Redirection vers memeVoteHandler.js pour la gestion des votes du concours de mèmes
            if (customId.startsWith("upvote_") || customId.startsWith("downvote_")) {
                const memeVoteHandler = require("../handlers/memeVoteHandler");
                return memeVoteHandler(interaction);
            }

            // Ajoutez ici d'autres gestions de boutons si nécessaire
        }
    });
};
