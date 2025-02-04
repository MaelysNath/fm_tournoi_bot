const { ref, db, get, update } = require('../utils/firebase');
const axios = require('axios');
const { PermissionsBitField, EmbedBuilder, ChannelType, WebhookClient } = require('discord.js');

module.exports = async (interaction) => {
  try {
    const customId = interaction.customId;
    const userId = interaction.user.id;

    await interaction.deferReply({ ephemeral: true });

    const params = customId.split('_');
    if (params.length < 3) {
      console.error(`❌ Erreur : Format de customId incorrect -> ${customId}`);
      return interaction.editReply({ content: "❌ Erreur interne : Format de l'interaction invalide." });
    }

    const [action, type, uniqueId] = params;
    if (!uniqueId || (type !== 'meme' && type !== 'emoji')) {
      console.error(`❌ Erreur : Type ou ID incorrect -> type: ${type}, uniqueId: ${uniqueId}`);
      return interaction.editReply({ content: "❌ Erreur : Type de demande inconnu." });
    }

    console.log(`🔍 Tentative de clôture de l'élément (${type}) avec ID: ${uniqueId}`);

    const itemRef = ref(db, type === 'meme' ? `memes/${uniqueId}` : `emoji_requests/${uniqueId}`);
    const snapshot = await get(itemRef);
    if (!snapshot.exists()) {
      return interaction.editReply({ 
        content: `❌ Cette demande de ${type === 'meme' ? 'mème' : 'emoji'} n'existe plus.`,
        ephemeral: true,
      });
    }

    const itemData = snapshot.val();

    // Vérification des permissions STAFF
    const member = await interaction.guild.members.fetch(userId);
    if (!member.roles.cache.has(process.env.STAFF_ROLE_ID)) {
      return interaction.editReply({ content: "❌ Vous n'avez pas la permission de clore cette demande." });
    }

    const { upvotes = 0, downvotes = 0 } = itemData.votes || {};
    console.log(`🔢 Votes - Acceptations: ${upvotes}, Refus: ${downvotes}`);
    let isAccepted = upvotes > downvotes ? true : downvotes > upvotes ? false : null;

    const webhookClient = new WebhookClient({ url: process.env.WEBHOOK_NOTIFICATION_URL });

    const closureEmbed = new EmbedBuilder()
      .setTitle(`FRANCE MEMES Requestsᴮᵉᵗᵃ : ${type === 'meme' ? 'mème' : 'emoji'}`)
      .addFields(
        { name: '📌 Nom/Titre', value: itemData.name },
        { name: '📝 Description', value: itemData.description },
        { name: '👤 Demandé(e) par', value: `<@${itemData.submittedBy}>` },
        { name: '👍 Acceptations', value: `${upvotes}`, inline: true },
        { name: '👎 Refus', value: `${downvotes}`, inline: true },
        { name: '🛑 Résultat', value: isAccepted === true ? "✅ **Accepté**" : isAccepted === false ? "❌ **Refusé**" : "⚠️ **Égalité - en attente**" }
      )
      .setColor(isAccepted === true ? 0x00FF00 : isAccepted === false ? 0xFF0000 : 0xFFFF00)
      .setTimestamp();

    // Pour un emoji accepté, on tente de l'ajouter au serveur
    if (type === 'emoji' && isAccepted === true) {
      try {
        const response = await axios.get(itemData.url, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data, 'binary');

        const botMember = await interaction.guild.members.fetchMe();
        if (!botMember.permissions.has(PermissionsBitField.Flags.ManageEmojisAndStickers)) {
          return interaction.editReply({ content: "❌ Le bot n'a pas la permission **Gérer les Emojis et Stickers**. Vérifiez les permissions." });
        }

        const existingEmoji = interaction.guild.emojis.cache.find(e => e.name === itemData.name);
        if (existingEmoji) {
          return interaction.editReply({ content: `⚠️ L'emoji **${itemData.name}** existe déjà sur le serveur.` });
        }

        await interaction.guild.emojis.create({ attachment: buffer, name: `fm_${itemData.name}` }); // nom de l'emoji

        await webhookClient.send({
          content: `# <:fmLogo:1113551418847133777> **Un nouveau emoji est disponible !** 😀\nNom : **${itemData.name}**\nAjoutez-le à vos messages !`,
          username: 'Eclipsa - FM Requestsᴮᵉᵗᵃ',
        });

      } catch (error) {
        console.error("❌ Erreur lors de l'ajout de l'emoji :", error);
        return interaction.editReply({ content: `❌ Erreur lors de l'ajout de l'emoji au serveur. (${error.message})` });
      }
    }

    // Pour un meme accepté, création du salon dédié
    if (type === 'meme' && isAccepted === true) {
      const category = interaction.guild.channels.cache.get(process.env.MEME_CATEGORY_ID);
      if (!category) {
        console.error("❌ Catégorie pour les mèmes introuvable !");
        return interaction.editReply({ content: "❌ La catégorie des mèmes est introuvable. Vérifiez la configuration." });
      }

      const memeChannel = await interaction.guild.channels.create({
        name: `📁┃${itemData.name}`,
        type: ChannelType.GuildText,
        parent: category.id,
      });

      await memeChannel.send(
        `** Le Nouveau Memes tourᴮᵉᵗᵃ a été validé par les membres !**\nTitre : ${itemData.name}\nDescription : ${itemData.description}`
      );

      await webhookClient.send({
        content: `# <:fmLogo:1113551418847133777> **Nouveau Memes tour disponible !** 🖼️\n📢 Rendez-vous dans <#${memeChannel.id}> pour le découvrir !`,
        username: 'Eclipsa -FM Requestsᴮᵉᵗᵃ',
      });
    }

    // Suppression du message initial de la demande
    const message = await interaction.channel.messages.fetch(interaction.message.id);
    await message.delete();

    // Mise à jour dans Firebase pour marquer la demande comme terminée
    await update(itemRef, { status: 'terminé' });

    await interaction.channel.send({ embeds: [closureEmbed] });
    return interaction.editReply({ content: `✅ Clôture réussie.`, ephemeral: true });

  } catch (error) {
    console.error(`❌ Erreur lors de la clôture du vote (${interaction.customId}) :`, error);
    await interaction.editReply({ content: "❌ Une erreur est survenue lors de la clôture de cette demande." });
  }
};
