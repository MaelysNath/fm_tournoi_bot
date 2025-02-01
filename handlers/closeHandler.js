const { ref, db, get, remove } = require('../utils/firebase');
const cloudinary = require('cloudinary').v2;

module.exports = async (interaction) => {
  try {
    const [action, memeKey] = interaction.customId.split('_');

    // On ne traite que l'action "close"
    if (action !== 'close') return;

    const staffRoleId = process.env.STAFF_ROLE_ID;

    // Vérification de la permission : réponse immédiate si non autorisé
    if (!interaction.member.roles.cache.has(staffRoleId)) {
      return interaction.reply({
        content: 'Vous n’avez pas la permission de fermer cette demande.',
        ephemeral: true,
      });
    }

    // Dès que l’on sait que le traitement va être plus long,
    // on différera la réponse pour éviter l’erreur "Unknown interaction"
    await interaction.deferReply({ ephemeral: true });

    const memeRef = ref(db, `memes/${memeKey}`);
    const memeSnapshot = await get(memeRef);

    if (!memeSnapshot || !memeSnapshot.exists()) {
      return interaction.followUp({
        content: 'Ce meme n’existe plus.',
        ephemeral: true,
      });
    }

    const memeData = memeSnapshot.val();

    if (!memeData.name || !memeData.description) {
      return interaction.followUp({
        content: 'Les données du meme sont incomplètes ou corrompues.',
        ephemeral: true,
      });
    }

    // Utilisation des clés correctes pour la comparaison des votes
    const votesUp = memeData.votes?.upvotes || 0;
    const votesDown = memeData.votes?.downvotes || 0;

    const channel = interaction.channel;

    // Suppression des messages associés (embed et vidéo)
    if (memeData.messageId) {
      const embedMessage = await channel.messages.fetch(memeData.messageId).catch(() => null);
      if (embedMessage) await embedMessage.delete();
    }
    if (memeData.videoMessageId) {
      const videoMessage = await channel.messages.fetch(memeData.videoMessageId).catch(() => null);
      if (videoMessage) await videoMessage.delete();
    }

    if (votesUp >= votesDown) {
      // Logique d'acceptation : création du salon
      const categoryChannel = interaction.guild.channels.cache.get(process.env.TARGET_CATEGORY_ID);
      if (!categoryChannel) {
        return interaction.followUp({
          content: 'La catégorie cible est introuvable.',
          ephemeral: true,
        });
      }

      const newChannel = await interaction.guild.channels.create({
        name: `📁┃${memeData.name}`.slice(0, 100), // Limite à 100 caractères
        type: 0, // Salon textuel
        parent: categoryChannel.id,
      });

      await newChannel.send(
        `** Le Nouveau Memes tourᴮᵉᵗᵃ a été validé par les membres !**\nTitre : ${memeData.name}\nDescription : ${memeData.description}`
      );
      await remove(memeRef);

      return interaction.followUp({
        content: 'Le meme a été accepté, un salon a été créé, et les messages associés ont été supprimés.',
        ephemeral: true,
      });
    } else {
      // Logique de refus : suppression du meme et du fichier Cloudinary s'il existe
      if (memeData.cloudinaryPublicId) {
        await cloudinary.uploader.destroy(memeData.cloudinaryPublicId);
      }

      await remove(memeRef);

      return interaction.followUp({
        content: 'Le meme a été refusé et supprimé.',
        ephemeral: true,
      });
    }
  } catch (error) {
    console.error('Erreur lors de la fermeture manuelle :', error);

    // Vérifier si une réponse a déjà été envoyée
    if (interaction.deferred || interaction.replied) {
      try {
        await interaction.followUp({
          content: 'Une erreur est survenue lors de la fermeture manuelle.',
          ephemeral: true,
        });
      } catch (replyError) {
        console.error('Impossible de répondre à l’interaction après une erreur :', replyError);
      }
    } else {
      try {
        await interaction.reply({
          content: 'Une erreur est survenue lors de la fermeture manuelle.',
          ephemeral: true,
        });
      } catch (replyError) {
        console.error('Impossible de répondre à l’interaction après une erreur :', replyError);
      }
    }
  }
};
