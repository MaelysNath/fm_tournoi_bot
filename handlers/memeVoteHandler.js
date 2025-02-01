const { db, ref, get, update, increment } = require("../utils/firebase");
const { logErrorToDiscord } = require("../utils/errorLogger");

module.exports = async (interaction) => {
    console.log(`📡 Gestion du vote : ${interaction.customId}`);

    const customId = interaction.customId;
    const userId = interaction.user.id;

    if (!customId.startsWith("upvote_") && !customId.startsWith("downvote_")) return;

    const participantId = customId.split("_")[1];
    let ongoingContestId;

    const contestRef = ref(db, "meme_contests");
    try {
        const snapshot = await get(contestRef);
        if (snapshot.exists()) {
            const contests = snapshot.val();
            for (const key in contests) {
                if (contests[key].status === "en cours") {
                    ongoingContestId = key;
                    break;
                }
            }
        }

        if (!ongoingContestId) {
            return interaction.reply({ content: "❌ Aucun concours en cours trouvé.", ephemeral: true });
        }

        const participantRef = ref(db, `meme_contests/${ongoingContestId}/participants/${participantId}`);
        const participantSnapshot = await get(participantRef);

        if (!participantSnapshot.exists()) {
            return interaction.reply({ content: "❌ Participant(e) introuvable.", ephemeral: true });
        }

        const participant = participantSnapshot.val();
        if (userId === participantId) {
            return interaction.reply({ content: "Pov : l'auto upvote/downvote 🤮🤮", ephemeral: true });
        }

        const voteType = customId.startsWith("upvote") ? "upvote" : "downvote";
        const userPreviousVote = participant.voters && participant.voters[userId];

        let votesUpdate = {};

        // Gestion des différents cas de vote
        if (userPreviousVote && userPreviousVote !== voteType) {
            const resetVote = userPreviousVote === "upvote" ? -1 : 1;
            const newVote = voteType === "upvote" ? 1 : -1;
            votesUpdate.votes = increment(resetVote + newVote);
            votesUpdate[`voters/${userId}`] = voteType;
        } else if (!userPreviousVote) {
            const newVote = voteType === "upvote" ? 1 : -1;
            votesUpdate.votes = increment(newVote);
            votesUpdate[`voters/${userId}`] = voteType;
        } else {
            return interaction.reply({ content: "⚠️ Vous avez déjà voté dans cette direction.", ephemeral: true });
        }

        await update(participantRef, votesUpdate);
        console.log(`✅ Vote enregistré : ${voteType} par ${userId}`);

        await interaction.reply({
            content: `✅ Votre ${voteType === "upvote" ? "vote positif" : "vote négatif"} a été enregistré !`,
            ephemeral: true
        });

    } catch (error) {
        console.error("❌ Erreur lors de la mise à jour du vote :", error);
        logErrorToDiscord(error, "Vote");
        await interaction.reply({ content: "❌ Une erreur est survenue lors du vote. Veuillez réessayer.", ephemeral: true });
    }
};
