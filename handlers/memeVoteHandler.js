const { db, ref, get, update, increment } = require("../utils/firebase");
const { logErrorToDiscord } = require("../utils/errorLogger");
const { WebhookClient, EmbedBuilder, PermissionsBitField } = require("discord.js");
require("dotenv").config();

const voteLoggerWebhook = new WebhookClient({ url: process.env.VOTE_LOGGER_WEBHOOK });

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

        // 🔥 Vérifier si l'utilisateur est admin
        const member = await interaction.guild.members.fetch(userId);
        const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator);

        // ✅ Seuls les administrateurs peuvent voter pour eux-mêmes
        if (userId === participantId && !isAdmin) {
            return interaction.reply({ content: "🚫 Impossible de voter pour soi-même.", ephemeral: true });
        }

        const voteType = customId.startsWith("upvote") ? "upvote" : "downvote";
        const userPreviousVote = participant.voters && participant.voters[userId];

        // 🔥 Vérification des rôles Premium pour les votes doubles
        const premiumRoles = process.env.PREMIUM_ROLES.split(",");
        const isPremium = member.roles.cache.some(role => premiumRoles.includes(role.id));
        const voteMultiplier = isPremium ? 2 : 1;

        let votesUpdate = {};

        // Gestion des différents cas de vote
        if (userPreviousVote && userPreviousVote !== voteType) {
            const resetVote = (userPreviousVote === "upvote" ? -1 : 1) * voteMultiplier;
            const newVote = (voteType === "upvote" ? 1 : -1) * voteMultiplier;
            votesUpdate.votes = increment(resetVote + newVote);
            votesUpdate[`voters/${userId}`] = voteType;
        } else if (!userPreviousVote) {
            const newVote = (voteType === "upvote" ? 1 : -1) * voteMultiplier;
            votesUpdate.votes = increment(newVote);
            votesUpdate[`voters/${userId}`] = voteType;
        } else {
            return interaction.reply({ content: "⚠️ Vous avez déjà voté dans cette direction.", ephemeral: true });
        }

        await update(participantRef, votesUpdate);
        console.log(`✅ Vote enregistré : ${voteType} par ${userId} (x${voteMultiplier})`);

        const premiumMessage = isPremium
            ? "✨ Merci, membre Premium ! Vos votes comptent double ! 🎉"
            : "";

        await interaction.reply({
            content: `✅ Votre ${voteType === "upvote" ? "vote positif" : "vote négatif"} a été enregistré ! ${premiumMessage}`,
            ephemeral: true
        });

        // 📌 **Log du vote dans le webhook**
        const voteEmbed = new EmbedBuilder()
            .setColor(voteType === "upvote" ? "#00FF00" : "#FF0000")
            .setTitle("📊 Nouveau vote enregistré")
            .addFields(
                { name: "👤 Utilisateur", value: `<@${userId}>`, inline: true },
                { name: "📌 Mème voté", value: `ID: ${participantId}`, inline: true },
                { name: "🔄 Type de vote", value: voteType === "upvote" ? "👍 Upvote" : "👎 Downvote", inline: true },
                { name: "🎖️ Multiplicateur", value: `x${voteMultiplier}`, inline: true },
                { name: "🔧 Rôle Administrateur", value: isAdmin ? "✅ Oui" : "❌ Non", inline: true }
            )
            .setFooter({ text: `Concours ID : ${ongoingContestId}` })
            .setTimestamp();

        await voteLoggerWebhook.send({ embeds: [voteEmbed] });

    } catch (error) {
        console.error("❌ Erreur lors de la mise à jour du vote :", error);
        logErrorToDiscord(error, "Vote");
        await interaction.reply({ content: "❌ Une erreur est survenue lors du vote. Veuillez réessayer.", ephemeral: true });
    }
};
