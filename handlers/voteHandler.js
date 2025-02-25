// handlers/VoteHandler.js
const { ref, db, get, update } = require('../utils/firebase');

// Système de cooldown
const voteCooldowns = new Map();
const COOLDOWN_TIME = 3000; // 3 secondes
const GIF_URL = "https://cdn.discordapp.com/attachments/1312465047280156772/1336338156521525341/doucement.gif?ex=67a37164&is=67a21fe4&hm=b91b17e14687b226e576673566f51e28fc7e122f4e54ad4e44c07c8115f500b0&";

// Import du gestionnaire de clôture
const { closeRequest } = require('../utils/closureManager');

module.exports = async (interaction) => {
  try {
    const customId = interaction.customId;
    const userId = interaction.user.id;

    // Vérification du cooldown
    const now = Date.now();
    if (voteCooldowns.has(userId) && now - voteCooldowns.get(userId) < COOLDOWN_TIME) {
      return interaction.reply({
        content: "Oh malheureux ! Doucement avec le bouton !",
        ephemeral: true,
        embeds: [{ image: { url: GIF_URL } }],
      });
    }
    voteCooldowns.set(userId, now);

    const [action, type, uniqueId] = customId.split('_');
    if (!uniqueId || (type !== 'meme' && type !== 'emoji')) {
      return interaction.reply({
        content: "Erreur : Type ou ID de l'élément introuvable.",
        ephemeral: true,
      });
    }

    console.log(`🔍 Tentative de vote sur l'élément (${type}) avec ID: ${uniqueId}`);

    const itemRef = ref(db, type === 'meme' ? `memes/${uniqueId}` : `emoji_requests/${uniqueId}`);
    const snapshot = await get(itemRef);
    if (!snapshot.exists()) {
      return interaction.reply({
        content: `❌ Cette demande de ${type} n'existe plus.`,
        ephemeral: true,
      });
    }

    const itemData = snapshot.val();
    if (itemData.status && itemData.status === 'terminé') {
      return interaction.reply({
        content: "❌ Les votes pour cette demande sont déjà clôturés.",
        ephemeral: true,
      });
    }

    if (!itemData.votes) {
      itemData.votes = { upvotes: 0, downvotes: 0, voters: {} };
    }
    const currentVotes = itemData.votes;
    if (!currentVotes.voters) {
      currentVotes.voters = {};
    }

    const userPreviousVote = currentVotes.voters[userId];
    let isVoteAdded = false;
    if (action === 'approve') {
      if (userPreviousVote === 'approve') {
        currentVotes.upvotes = Math.max(currentVotes.upvotes - 1, 0);
        delete currentVotes.voters[userId];
        isVoteAdded = false;
      } else {
        if (userPreviousVote === 'reject') {
          currentVotes.downvotes = Math.max(currentVotes.downvotes - 1, 0);
        }
        currentVotes.upvotes += 1;
        currentVotes.voters[userId] = 'approve';
        isVoteAdded = true;
      }
    } else if (action === 'reject') {
      if (userPreviousVote === 'reject') {
        currentVotes.downvotes = Math.max(currentVotes.downvotes - 1, 0);
        delete currentVotes.voters[userId];
        isVoteAdded = false;
      } else {
        if (userPreviousVote === 'approve') {
          currentVotes.upvotes = Math.max(currentVotes.upvotes - 1, 0);
        }
        currentVotes.downvotes += 1;
        currentVotes.voters[userId] = 'reject';
        isVoteAdded = true;
      }
    }

    await update(itemRef, { votes: currentVotes });

    const message = await interaction.channel.messages.fetch(interaction.message.id);
    const embed = message.embeds[0];
    if (!embed) {
      return interaction.reply({
        content: "Erreur : Impossible de mettre à jour l'embed.",
        ephemeral: true,
      });
    }

    const updatedEmbed = {
      title: embed.title,
      description: embed.description,
      fields: [
        { name: 'Nom', value: itemData.name },
        { name: 'Description', value: itemData.description },
        { name: 'Demandé par', value: `<@${itemData.submittedBy}>` },
        { name: 'Validations', value: `${currentVotes.upvotes}/${process.env.REQUIRED_VOTES}`, inline: true },
        { name: 'Refus', value: `${currentVotes.downvotes}/${process.env.REQUIRED_VOTES}`, inline: true }
      ],
      color: embed.color,
    };

    if (embed.image) updatedEmbed.image = embed.image;
    await message.edit({ embeds: [updatedEmbed] });

    await interaction.reply({
      content: isVoteAdded
        ? `Votre vote a été enregistré : ${action === 'approve' ? '✅ Validation' : '❌ Refus'}.`
        : `Votre vote a été retiré.`,
      ephemeral: true,
    });

    // Déclenche la clôture si un des compteurs atteint le seuil requis
    if (currentVotes.upvotes >= parseInt(process.env.REQUIRED_VOTES, 10) ||
        currentVotes.downvotes >= parseInt(process.env.REQUIRED_VOTES, 10)) {
      console.log(`✅ Seuil de votes atteint pour l'élément ${uniqueId} (${type}). Clôture immédiate.`);
      await closeRequest({
        guild: interaction.guild,
        channel: interaction.channel,
        message, // message d'origine à supprimer (si trouvé)
        type,
        uniqueId,
        itemData,
        currentVotes
      });
    }

  } catch (error) {
    console.error(`❌ Erreur lors du vote (${type}) :`, error);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({
        content: "Une erreur est survenue lors du traitement de votre vote.",
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: "Une erreur est survenue lors du traitement de votre vote.",
        ephemeral: true,
      });
    }
  }
};
