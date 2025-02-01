const { logErrorToDiscord } = require("../utils/errorLogger");

module.exports = async (client) => {
  client.on("interactionCreate", async (interaction) => {
    console.log(
      `📡 Interaction reçue : ${interaction.commandName || interaction.customId}`
    );

    try {
      // Traitement des commandes slash
      if (interaction.isCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) {
          console.warn(`⚠️ Commande inconnue : ${interaction.commandName}`);
          return;
        }
        await command.execute(interaction);
        console.log(`✅ Commande exécutée : ${interaction.commandName}`);

      // Traitement des boutons
      } else if (interaction.isButton()) {
        const customId = interaction.customId;

        // Gestion des boutons "approve" et "reject"
        if (customId.startsWith("approve_") || customId.startsWith("reject_")) {
          const voteHandler = require("../handlers/voteHandler");
          await voteHandler(interaction);
        }
        // Gestion des boutons "close"
        else if (customId.startsWith("close_")) {
          const closeHandler = require("../handlers/closeHandler");
          await closeHandler(interaction);
        }
        // Gestion des boutons pour le concours de mèmes ("upvote"/"downvote")
        else if (
          customId.startsWith("upvote_") ||
          customId.startsWith("downvote_")
        ) {
          const memeVoteHandler = require("../handlers/memeVoteHandler");
          await memeVoteHandler(interaction);
        }
        // Aucune gestion définie pour d'autres boutons
        else {
          console.warn(`Aucune gestion définie pour le bouton : ${customId}`);
        }
      }
    } catch (error) {
      console.error("Erreur lors de l'interaction :", error);
      logErrorToDiscord(error, "Interaction");

      // Vérifier si l'interaction a déjà été différée ou répondue pour éviter les réponses multiples
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content:
            "Une erreur est survenue lors du traitement de votre interaction.",
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content:
            "Une erreur est survenue lors du traitement de votre interaction.",
          ephemeral: true,
        });
      }
    }
  });
};
