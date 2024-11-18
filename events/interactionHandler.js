// events/interactionHandler.js
const { db, ref, get, update, increment } = require("../utils/firebase");
const { logErrorToDiscord } = require("../utils/errorLogger");

module.exports = async (client) => {
    client.on("interactionCreate", async (interaction) => {
        if (interaction.isCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error("Erreur lors de l'exécution de la commande :", error);
                logErrorToDiscord(error, "Commande");

                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: "Erreur lors de l'exécution de cette commande !",
                        ephemeral: true
                    });
                }
            }
        } else if (interaction.isButton()) {
            const customId = interaction.customId;
            const userId = interaction.user.id;

            if (customId.startsWith("upvote_") || customId.startsWith("downvote_")) {
                const participantId = customId.split("_")[1];
                let ongoingContestId;

                const contestRef = ref(db, "meme_contests");
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
                    if (!interaction.replied && !interaction.deferred) {
                        return interaction.reply({ content: "Aucun concours en cours trouvé.", ephemeral: true });
                    }
                    return;
                }

                const participantRef = ref(db, `meme_contests/${ongoingContestId}/participants/${participantId}`);
                try {
                    const participantSnapshot = await get(participantRef);
                    if (!participantSnapshot.exists()) {
                        if (!interaction.replied && !interaction.deferred) {
                            return interaction.reply({ content: "Participant(e) introuvable.", ephemeral: true });
                        }
                        return;
                    }

                    const participant = participantSnapshot.val();
                    if (userId === participantId) {
                        if (!interaction.replied && !interaction.deferred) {
                            return interaction.reply({ content: "Pov : l'auto upvote/downvote 🤮🤮", ephemeral: true });
                        }
                        return;
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
                        if (!interaction.replied && !interaction.deferred) {
                            return interaction.reply({ content: "Vous avez déjà voté dans cette direction.", ephemeral: true });
                        }
                        return;
                    }

                    await update(participantRef, votesUpdate);

                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: `Votre ${voteType === "upvote" ? "vote positif" : "vote négatif"} a été enregistré !`,
                            ephemeral: true
                        });
                    }
                } catch (error) {
                    console.error("Erreur lors de la mise à jour du vote :", error);
                    logErrorToDiscord(error, "Vote");

                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: "Erreur lors du vote. Veuillez réessayer.", ephemeral: true });
                    }
                }
            }
        }
    });
};
