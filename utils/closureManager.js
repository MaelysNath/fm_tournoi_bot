// utils/closureManager.js
const { ref, db, update } = require('./firebase');
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

async function closeRequest({ guild, channel, message, type, uniqueId, itemData, currentVotes }) {
  const requiredVotes = parseInt(process.env.REQUIRED_VOTES, 10);
  // La demande est considérée comme acceptée si les upvotes atteignent le seuil
  let isAccepted = currentVotes.upvotes >= requiredVotes;
  
  // Référence dans Firebase
  const itemRef = ref(db, type === 'meme' ? `memes/${uniqueId}` : `emoji_requests/${uniqueId}`);
  
  // Instanciation du webhook (pour notification, si besoin)
  const webhookClient = new WebhookClient({ url: process.env.WEBHOOK_NOTIFICATION_URL });
  
  if (type === 'emoji') {
    // --- Logique pour les demandes d'emoji ---
    if (isAccepted) {
      try {
        const response = await axios.get(itemData.url, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data, 'binary');
        if (!guild.members.me.permissions.has(PermissionsBitField.Flags.ManageEmojisAndStickers)) {
          console.error("Le bot n'a pas la permission de gérer les emojis.");
        } else {
          const existingEmoji = guild.emojis.cache.find(e => e.name === itemData.name);
          if (!existingEmoji) {
            await guild.emojis.create({ attachment: buffer, name: `fm_${itemData.name}` });
            await webhookClient.send({
              content: `# <:fmLogo:1113551418847133777> **Un nouveau emoji est disponible !** 😀\nNom : **${itemData.name}**\nAjoutez-le à vos messages !`,
              username: 'Eclipsa - FM Requestsᴮᵉᵗᵃ',
            });
          }
        }
      } catch (error) {
        console.error("❌ Erreur lors de l'ajout de l'emoji :", error);
      }
    }
    // Création d'un embed de clôture pour les emojis
    const closureEmbed = new EmbedBuilder()
      .setTitle(`FRANCE MEMES Requestsᴮᵉᵗᵃ : emoji`)
      .addFields(
        { name: '📌 Nom/Titre', value: itemData.name },
        { name: '📝 Description', value: itemData.description },
        { name: '👤 Demandé(e) par', value: `<@${itemData.submittedBy}>` },
        { name: '👍 Acceptations', value: `${currentVotes.upvotes}`, inline: true },
        { name: '👎 Refus', value: `${currentVotes.downvotes}`, inline: true },
        { name: '🛑 Résultat', value: isAccepted ? "✅ **Accepté**" : "❌ **Refusé**" }
      )
      .setColor(isAccepted ? 0x00FF00 : 0xFF0000)
      .setTimestamp();

    if (message) {
      try {
        await message.delete();
      } catch (error) {
        console.error("❌ Erreur lors de la suppression du message :", error);
      }
    }
    await update(itemRef, { status: 'terminé' });
    await channel.send({ embeds: [closureEmbed] });
    
  } else if (type === 'meme') {
    if (isAccepted) {
      // --- Pour une demande de mème acceptée, création du salon privé ---
      const category = guild.channels.cache.get(process.env.MEME_CATEGORY_ID);
      if (!category) {
        console.error("❌ Catégorie des mèmes introuvable.");
      } else {
        try {
          // Création du salon avec des permissions restreintes (le rôle @everyone ne peut pas le voir)
          const memeChannel = await guild.channels.create({
            name: `📁┃${itemData.name}`,
            type: ChannelType.GuildText,
            parent: category.id,
            permissionOverwrites: [
              {
                id: guild.roles.everyone.id,
                deny: [PermissionsBitField.Flags.ViewChannel],
              },
            ],
          });
          // IMPORTANT : Désynchroniser le salon avec la catégorie afin qu'il conserve ses permissions personnalisées
          await memeChannel.setParent(category.id, { lockPermissions: false });
          
          // Envoi d'un message d'acceptation dans le salon créé
          await memeChannel.send(`La demande **${itemData.name}** a été acceptée. Ce salon est actuellement privé.`);
          
          // Création et envoi d'un message contenant le bouton "Ouvrir au public"
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`openPublic_${memeChannel.id}`)
              .setLabel('Ouvrir au public')
              .setStyle(ButtonStyle.Primary)
          );
          await memeChannel.send({
            content: "Cliquez sur le bouton ci-dessous pour ouvrir ce salon au public.",
            components: [row],
          });

          // Notification via webhook (optionnelle)
          await webhookClient.send({
            content: `# <:fmLogo:1113551418847133777> **Nouveau Memes tour disponible !** 🖼️\nLe salon <#${memeChannel.id}> a été créé et attend son ouverture au public.`,
            username: 'Eclipsa -FM Requestsᴮᵉᵗᵃ',
          });
        } catch (error) {
          console.error("❌ Erreur lors de la création du salon mème :", error);
        }
      }
    } else {
      // En cas de refus, on envoie un embed de clôture dans le canal d'origine
      const closureEmbed = new EmbedBuilder()
        .setTitle(`FRANCE MEMES Requestsᴮᵉᵗᵃ : meme`)
        .addFields(
          { name: '📌 Nom/Titre', value: itemData.name },
          { name: '📝 Description', value: itemData.description },
          { name: '👤 Demandé(e) par', value: `<@${itemData.submittedBy}>` },
          { name: '👍 Acceptations', value: `${currentVotes.upvotes}`, inline: true },
          { name: '👎 Refus', value: `${currentVotes.downvotes}`, inline: true },
          { name: '🛑 Résultat', value: "❌ **Refusé**" }
        )
        .setColor(0xFF0000)
        .setTimestamp();
      if (message) {
        try {
          await message.delete();
        } catch (error) {
          console.error("❌ Erreur lors de la suppression du message :", error);
        }
      }
      await update(itemRef, { status: 'terminé' });
      await channel.send({ embeds: [closureEmbed] });
    }
  }
}

module.exports = { closeRequest };
