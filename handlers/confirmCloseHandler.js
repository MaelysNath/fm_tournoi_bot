// handlers/confirmCloseHandler.js
module.exports = async (interaction) => {
    try {
      // Ce handler est appelé si, pour une raison quelconque,
      // le bouton de confirmation ou d'annulation est cliqué après
      // que le collector de CloseHandler a déjà traité l'action.
      await interaction.deferUpdate();
      await interaction.followUp({
        content: "Cette action a déjà été traitée.",
        ephemeral: true,
      });
    } catch (error) {
      console.error("Erreur dans confirmCloseHandler:", error);
    }
  };
  