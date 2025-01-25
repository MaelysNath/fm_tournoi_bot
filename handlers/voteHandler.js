const { ref, db, get, update } = require('../utils/firebase');
const finalizeMeme = require('./closeHandler'); 

module.exports = async (interaction) => {
    try {
        const customId = interaction.customId;
        const userId = interaction.user.id;

        // Extraire l'action et la clé
        const [action, memeKey] = customId.split('_');
        if (!memeKey) {
            return interaction.reply({
                content: "Erreur : Clé du meme introuvable.",
                ephemeral: true,
            });
        }

        // Vérification si l'action est pour la fermeture manuelle
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

            // Vérifier si l'utilisateur est autorisé (vérification du rôle)
            const member = await interaction.guild.members.fetch(userId);
            if (!member.roles.cache.has(process.env.STAFF_ROLE_ID)) {
                return interaction.reply({
                    content: "Vous n'avez pas la permission pour clore le sondage",
                    ephemeral: true,
                });
            }

            // Décider de la finalisation en fonction des votes
            const { upvotes, downvotes } = memeData.votes || { upvotes: 0, downvotes: 0 };
            if (upvotes >= downvotes) {
                await finalizeMeme(interaction, memeKey, true); // Valider
            } else {
                await finalizeMeme(interaction, memeKey, false); // Refuser
            }

            return; // Finir l'exécution ici
        }

        // Gestion des actions approve/reject
        if (action !== 'approve' && action !== 'reject') {
            return interaction.reply({
                content: "Action non reconnue.",
                ephemeral: true,
            });
        }

        // Logique des votes (reste inchangé)
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

        // Logique des votes reste inchangée (comme précédemment corrigé)
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

        // Mettre à jour l'embed (comme corrigé précédemment)
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
        interaction.reply({
            content: "Une erreur est survenue lors du traitement de votre vote.",
            ephemeral: true,
        });
    }
};
