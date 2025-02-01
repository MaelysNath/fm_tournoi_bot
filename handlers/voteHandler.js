const { ref, db, get, update } = require('../utils/firebase');
const finalizeMeme = require('./closeHandler'); 

module.exports = async (interaction) => {
  try {
    const customId = interaction.customId;
    const userId = interaction.user.id;

    // Extraction de l'action et de la clé
    const [action, memeKey] = customId.split('_');
    if (!memeKey) {
      return interaction.reply({
        content: "Erreur : Clé du meme introuvable.",
        ephemeral: true,
      });
    }

    // Si l'action est "close", on délègue à finalizeMeme (closeHandler)
    if (action === 'close') {
      const memeRef = ref(db, `memes/${memeKey}`);
      const snapshot = await get(memeRef);

      if (!snapshot.exists()) {
        return interaction.reply({
          content: "Ce meme n'existe plus.",
          ephemeral: true,
        });
      }

      const memeData = snapshot.val();

      // Vérification de la permission du membre
      const member = await interaction.guild.members.fetch(userId);
      if (!member.roles.cache.has(process.env.STAFF_ROLE_ID)) {
        return interaction.reply({
          content: "Vous n'avez pas la permission pour clore le sondage.",
          ephemeral: true,
        });
      }

      // Décision en fonction des votes (le closeHandler pourra ignorer les paramètres supplémentaires)
      const { upvotes, downvotes } = memeData.votes || { upvotes: 0, downvotes: 0 };
      if (upvotes >= downvotes) {
        await finalizeMeme(interaction, memeKey, true); // Valider
      } else {
        await finalizeMeme(interaction, memeKey, false); // Refuser
      }
      return; // Fin de l'exécution pour l'action "close"
    }

    // Pour les actions "approve" et "reject"
    if (action !== 'approve' && action !== 'reject') {
      return interaction.reply({
        content: "Action non reconnue.",
        ephemeral: true,
      });
    }

    // Récupération du meme
    const memeRef = ref(db, `memes/${memeKey}`);
    const snapshot = await get(memeRef);

    if (!snapshot.exists()) {
      return interaction.reply({
        content: "Ce meme n'existe plus.",
        ephemeral: true,
      });
    }

    const memeData = snapshot.val();
    if (!memeData.votes) {
      memeData.votes = { upvotes: 0, downvotes: 0, voters: {} };
    }

    const currentVotes = memeData.votes;
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

    await update(memeRef, { votes: currentVotes });

    // Mise à jour de l'embed dans le message
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
        { name: 'Nom', value: memeData.name },
        { name: 'Description', value: memeData.description },
        { name: 'Demandé par', value: `<@${memeData.submittedBy}>` },
        { name: 'Validations', value: `${currentVotes.upvotes}/${process.env.REQUIRED_VOTES}`, inline: true },
        { name: 'Refus', value: `${currentVotes.downvotes}/${process.env.REQUIRED_VOTES}`, inline: true },
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
  } catch (error) {
    console.error("Erreur lors de la gestion des votes :", error);
    // On vérifie l'état de l'interaction pour choisir reply() ou followUp()
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
