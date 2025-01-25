const { ref, db, get, remove } = require('../utils/firebase');
const cloudinary = require('cloudinary').v2;

module.exports = async (interaction) => {
    try {
        const [action, memeKey] = interaction.customId.split('_');

        if (action !== 'close') return;

        const staffRoleId = process.env.STAFF_ROLE_ID;

        // Vérification des permissions
        if (!interaction.member.roles.cache.has(staffRoleId)) {
            return interaction.reply({
                content: 'Vous n’avez pas la permission de fermer cette demande.',
                ephemeral: true,
            });
        }

        const memeRef = ref(db, `memes/${memeKey}`);
        const memeSnapshot = await get(memeRef);

        if (!memeSnapshot || !memeSnapshot.exists()) {
            return interaction.reply({
                content: 'Ce meme n’existe plus.',
                ephemeral: true,
            });
        }

        const memeData = memeSnapshot.val();

        if (!memeData.name || !memeData.description) {
            return interaction.reply({
                content: 'Les données du meme sont incomplètes ou corrompues.',
                ephemeral: true,
            });
        }

        const votesUp = memeData.votes?.up || 0;
        const votesDown = memeData.votes?.down || 0;

        // Défère la réponse pour éviter l'erreur "Unknown interaction"
        await interaction.deferReply({ ephemeral: true });

        const channel = interaction.channel;

        // Suppression des messages associés (embed + vidéo)
        if (memeData.messageId) {
            const embedMessage = await channel.messages.fetch(memeData.messageId).catch(() => null);
            if (embedMessage) await embedMessage.delete();
        }
        if (memeData.videoMessageId) {
            const videoMessage = await channel.messages.fetch(memeData.videoMessageId).catch(() => null);
            if (videoMessage) await videoMessage.delete();
        }

        if (votesUp >= votesDown) {
            // Logique d'acceptation (création du salon)
            const categoryChannel = interaction.guild.channels.cache.get(process.env.TARGET_CATEGORY_ID);
            if (!categoryChannel) {
                return interaction.followUp({
                    content: 'La catégorie cible est introuvable.',
                    ephemeral: true,
                });
            }

            const newChannel = await interaction.guild.channels.create({
                name: `📁┃${memeData.name}`.slice(0, 100), // Limite le nom à 100 caractères
                type: 0, // Salon textuel
                parent: categoryChannel.id,
            });

            await newChannel.send(`** Le Nouveau Memes tourᴮᵉᵗᵃ à été validé par les membres !**\nTitre : ${memeData.name}\nDescription : ${memeData.description}`);
            await remove(memeRef);

            return interaction.followUp({
                content: 'Le meme a été accepté, un salon a été créé, et les messages associés ont été supprimés.',
                ephemeral: true,
            });
        } else {
            // Logique de refus
            if (memeData.cloudinaryPublicId) {
                // Suppression du fichier sur Cloudinary
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

        if (!interaction.replied && !interaction.deferred) {
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
