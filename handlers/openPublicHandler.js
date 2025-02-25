// openPublicHandler.js
module.exports = async (interaction) => {
    try {
      await interaction.deferUpdate();
  
      // Extraction de l'ID du salon depuis le customId
      const parts = interaction.customId.split('_');
      const channelId = parts[1];
      const channel = interaction.guild.channels.cache.get(channelId);
      if (!channel) {
        return interaction.followUp({ content: "Salon introuvable.", ephemeral: true });
      }
  
      // Mise à jour manuelle des permissions pour @everyone afin d'autoriser l'accès
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });
  
      // Mise à jour des permissions pour le bot afin qu'il puisse gérer le salon
      await channel.permissionOverwrites.edit(interaction.guild.members.me.id, {
        ViewChannel: true,
        SendMessages: true,
        ManageChannels: true,
        EmbedLinks: true,
        ReadMessageHistory: true,
      });
  
      // Supprimer le message contenant le bouton
      await interaction.message.delete();
  
      // Envoi d'un message de confirmation dans le salon
      await channel.send("Ce salon est maintenant ouvert au public !");
    } catch (error) {
      console.error("Erreur dans openPublicHandler:", error);
      if (!interaction.replied) {
        await interaction.followUp({ content: "Une erreur est survenue.", ephemeral: true });
      }
    }
  };
  