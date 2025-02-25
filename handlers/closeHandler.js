// CloseHandler.js
const { ref, db, get, update } = require('../utils/firebase');
const axios = require('axios');
const {
  PermissionsBitField,
  EmbedBuilder,
  ChannelType,
  WebhookClient,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

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

    // Gestion pour les demandes d'emoji acceptées (inchangé)
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

        await interaction.guild.emojis.create({ attachment: buffer, name: `fm_${itemData.name}` });
        await webhookClient.send({
          content: `# <:fmLogo:1113551418847133777> **Un nouveau emoji est disponible !** 😀\nNom : **${itemData.name}**\nAjoutez-le à vos messages !`,
          username: 'Eclipsa - FM Requestsᴮᵉᵗᵃ',
        });

      } catch (error) {
        console.error("❌ Erreur lors de l'ajout de l'emoji :", error);
        return interaction.editReply({ content: `❌ Erreur lors de l'ajout de l'emoji au serveur. (${error.message})` });
      }
    }

    // Pour une demande de mème acceptée, demander une confirmation avant de créer le salon dédié
    if (type === 'meme' && isAccepted === true) {
      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`confirm_close_${uniqueId}`)
          .setLabel("Confirmer")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`cancel_close_${uniqueId}`)
          .setLabel("Annuler")
          .setStyle(ButtonStyle.Secondary)
      );
      
      // Envoyer le message de confirmation en réponse éphémère
      const replyMessage = await interaction.editReply({
        content: "Tu es sur.e ? Cette action est irréversible.",
        components: [confirmRow]
      });
      
      // Filtre : seul l'utilisateur qui a lancé l'action peut répondre
      const filter = i => i.user.id === userId && 
                           (i.customId === `confirm_close_${uniqueId}` || i.customId === `cancel_close_${uniqueId}`);
      
      try {
        const confirmationInteraction = await replyMessage.awaitMessageComponent({ filter, time: 15000 });
        if (confirmationInteraction.customId === `cancel_close_${uniqueId}`) {
          await confirmationInteraction.update({ content: "Action annulée.", components: [] });
          return;
        }
        // Si confirmé, on met à jour le message
        await confirmationInteraction.update({ content: "Action confirmée, fermeture en cours...", components: [] });
      } catch (err) {
        await interaction.editReply({ content: "Temps écoulé, action annulée.", components: [] });
        return;
      }
      
      // Création du salon avec des permissions personnalisées (le salon reste désynchronisé de la catégorie)
      const category = interaction.guild.channels.cache.get(process.env.MEME_CATEGORY_ID);
      if (!category) {
        console.error("❌ Catégorie pour les mèmes introuvable !");
        return interaction.editReply({ content: "❌ La catégorie des mèmes est introuvable. Vérifiez la configuration." });
      }
      
      const memeChannel = await interaction.guild.channels.create({
        name: `📁┃${itemData.name}`,
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: [
          {
            id: interaction.guild.roles.everyone.id,
            deny: [PermissionsBitField.Flags.ViewChannel],
          },
          {
            // Ajout d'une permission spécifique pour le bot afin qu'il puisse gérer le salon
            // Le flag "ManageChannels" autorise le bot à gérer les permissions (équivalent à "Gérer les permissions")
            id: interaction.guild.members.me.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.EmbedLinks,
              PermissionsBitField.Flags.ManageChannels
            ],
          },
          {
            // Ajout d'une permission spécifique pour le rôle défini dans l'environnement
            // Ce rôle se verra accorder les mêmes permissions que le bot
            id: process.env.MEME_TOUR_ROLE_ID,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.EmbedLinks,
              PermissionsBitField.Flags.ManageChannels,
              PermissionsBitField.Flags.ReadMessageHistory
            ],
          }
        ],
      });
      // Le salon reste désynchronisé pour conserver ses permissions personnalisées

      // Envoi d'un message d'acceptation dans le nouveau salon
      await memeChannel.send(`** Le Nouveau Memes tourᴮᵉᵗᵃ a été validé par les membres !**\nTitre : ${itemData.name}\nDescription : ${itemData.description}`);
      
      // Envoi d'un message avec un bouton "Ouvrir au public"
      const openRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`openPublic_${memeChannel.id}`)
          .setLabel("Ouvrir au public")
          .setStyle(ButtonStyle.Primary)
      );
      await memeChannel.send({
        content: "Cliquez sur le bouton ci-dessous pour ouvrir ce salon au public.",
        components: [openRow],
      });
      
      await webhookClient.send({
        content: `# <:fmLogo:1113551418847133777> **Nouveau Memes tour disponible !** 🖼️\n📢 Rendez-vous dans <#${memeChannel.id}> pour le découvrir !`,
        username: 'Eclipsa -FM Requestsᴮᵉᵗᵃ',
      });
    }

    // Suppression du message initial de la demande (on enveloppe cette action dans un try/catch pour éviter l'erreur Missing Access)
    try {
      const originalMessage = await interaction.channel.messages.fetch(interaction.message.id);
      await originalMessage.delete();
    } catch (err) {
      console.error("Erreur lors de la suppression du message initial :", err);
    }

    // Mise à jour dans Firebase pour marquer la demande comme terminée
    await update(itemRef, { status: 'terminé' });

    await interaction.channel.send({ embeds: [closureEmbed] });
    return interaction.editReply({ content: `✅ Clôture réussie.`, ephemeral: true, components: [] });

  } catch (error) {
    console.error(`❌ Erreur lors de la clôture du vote (${interaction.customId}) :`, error);
    await interaction.editReply({ content: "❌ Une erreur est survenue lors de la clôture de cette demande." });
  }
};
