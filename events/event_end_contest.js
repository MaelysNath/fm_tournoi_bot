const { EmbedBuilder, WebhookClient, ButtonBuilder, ActionRowBuilder } = require('discord.js');
const { getDatabase, ref, get, update } = require('firebase/database');
const { DateTime } = require('luxon');
require('dotenv').config();

// Fonction pour convertir une date "DD/MM/YYYY" en timestamp, en tenant compte des fuseaux horaires
function parseDateToTimestamp(dateStr) {
    const [day, month, year] = dateStr.split('/').map(Number);
    return DateTime.fromObject(
        { day, month, year },
        { zone: 'Europe/Paris' }
    ).toMillis();
}

// Fonction pour désactiver les boutons dans le salon de soumission
async function disableSubmissionButtons(channel) {
    try {
        const messages = await channel.messages.fetch({ limit: 100 });
        for (const message of messages.values()) {
            if (message.components.length > 0) {
                const newComponents = message.components.map(row => {
                    const actionRow = ActionRowBuilder.from(row);
                    actionRow.components = actionRow.components.map(button => 
                        ButtonBuilder.from(button).setDisabled(true)
                    );
                    return actionRow;
                });
                await message.edit({ components: newComponents });
            }
        }
        console.log('Tous les boutons dans le salon de soumission ont été désactivés.');
    } catch (error) {
        console.error("Erreur lors de la désactivation des boutons:", error);
    }
}

// Fonction principale pour vérifier et terminer un concours si nécessaire
async function endContestIfDue(client) {
    const db = getDatabase();
    const contestRef = ref(db, 'meme_contests');

    try {
        if (!client) {
            throw new Error("Le client Discord n'est pas défini.");
        }

        console.log("Début de la vérification pour terminer le concours de mèmes...");

        const snapshot = await get(contestRef);
        if (!snapshot.exists()) {
            console.log('Aucun concours de mèmes trouvé.');
            return;
        }

        const contests = snapshot.val();
        let ongoingContest = null;

        // Vérification du concours en cours
        const now = DateTime.now().setZone('Europe/Paris').toMillis();
        for (const key in contests) {
            if (contests[key].status === 'en cours' && !contests[key].resultsPublished) {
                const contestEndDate = parseDateToTimestamp(contests[key].deadline);
                if (contestEndDate <= now) {
                    ongoingContest = { id: key, ...contests[key] };
                    break;
                }
            }
        }

        if (!ongoingContest) {
            console.log('Aucun concours en cours trouvé ou les résultats sont déjà publiés, ou la date limite n’est pas encore atteinte.');
            return;
        }

        const guildId = ongoingContest.guildId;
        if (!guildId) {
            throw new Error("L'ID du serveur (guildId) est manquant.");
        }

        const submissionChannelId = ongoingContest.submissionChannelId;
        const submissionChannel = await client.channels.fetch(submissionChannelId);

        // Désactiver les boutons dans le salon de soumission
        await disableSubmissionButtons(submissionChannel);

        const webhookClient = new WebhookClient({ id: process.env.WEBHOOK_ID, token: process.env.WEBHOOK_TOKEN });

        console.log(`Concours "${ongoingContest.title}" trouvé. Récupération des participants...`);

        // Récupération des participants
        const participantsSnapshot = await get(ref(db, `meme_contests/${ongoingContest.id}/participants`));
        if (!participantsSnapshot.exists()) {
            console.log('Aucun participant éligible pour le concours.');
            return;
        }

        const participants = participantsSnapshot.val();
        const leaderboard = Object.values(participants)
            .filter(participant => participant.status !== 'excluded')
            .sort((a, b) => b.votes - a.votes || a.timestamp - b.timestamp)
            .slice(0, 10); // Top 10 participants

        if (leaderboard.length === 0) {
            console.log('Aucun participant éligible pour le concours.');
            return;
        }

        console.log("Création de l'embed du classement...");

        // Créer l'embed du classement complet (top 10)
        const fullLeaderboardEmbed = new EmbedBuilder()
            .setTitle(`🏆 Classement du Concours de Mèmes - ${ongoingContest.title}`)
            .setColor(0x00FF00)
            .setFooter({ text: `ID du concours: ${ongoingContest.id}` });

        const medalEmojis = [':trophy:', ':second_place:', ':third_place:'];
        leaderboard.forEach((participant, index) => {
            const medal = index < 3
                ? medalEmojis[index] 
                : `**#${index + 1}-**`;
            fullLeaderboardEmbed.addFields({
                name: `${medal} ${participant.pseudo}`,
                value: `**Votes :** ${participant.votes} \n [Voir la création](https://discord.com/channels/${guildId}/${submissionChannelId}/${participant.messageId})`,
                inline: false
            });
        });

        console.log("Détermination du gagnant...");

        const winner = leaderboard[0];

        // Réduire l'annonce principale au top 5
        const top5 = leaderboard.slice(0, 5);
        const reducedLeaderboardEmbed = new EmbedBuilder()
            .setTitle(`🏆 Classement Final - ${ongoingContest.title}`)
            .setColor(0xFFD700)
            .setFooter({ text: `ID du concours: ${ongoingContest.id}` });

        top5.forEach((participant, index) => {
            const medal = index < 3
                ? medalEmojis[index]
                : `**#${index + 1}-**`;
            reducedLeaderboardEmbed.addFields({
                name: `${medal} ${participant.pseudo}`,
                value: `**Votes :** ${participant.votes} \n [Voir la création](https://discord.com/channels/${guildId}/${submissionChannelId}/${participant.messageId})`,
                inline: false
            });
        });

        // Embed pour le gagnant avec lien vers la soumission
        const winnerEmbed = new EmbedBuilder()
            .setTitle(`🎉 Félicitations ${winner.pseudo} !`)
            .setDescription(`🎁 Tu viens de remporter : ${ongoingContest.rewards}\n\n📎 [Voir la soumission gagnante](https://discord.com/channels/${guildId}/${submissionChannelId}/${winner.messageId})`)
            .setColor(0xFFD700)
            .setFooter({ text: `ID du concours: ${ongoingContest.id}` });

        console.log("Envoi des résultats dans les canaux...");

        // Publier le classement complet dans le salon de soumission
        await submissionChannel.send({
            content: `Voici le classement complet du concours "${ongoingContest.title}" :`,
            embeds: [fullLeaderboardEmbed]
        });

        // Annoncer le top 5 via le webhook
        await webhookClient.send({
            content: `# <@&${process.env.PUTAPING_ID}> Le concours de mèmes "${ongoingContest.title}" est maintenant terminé ! Voici le classement final (Top 5) :`,
            embeds: [reducedLeaderboardEmbed, winnerEmbed]
        });

        await update(ref(db, `meme_contests/${ongoingContest.id}`), {
            status: 'terminé',
            resultsPublished: true
        });

        console.log('Le concours a été terminé avec succès et les résultats ont été publiés.');
    } catch (error) {
        console.error("Erreur lors de la fin du concours de mèmes:", error);

        const errorChannel = await client.channels.fetch(process.env.ERROR_CHANNEL_ID);
        if (errorChannel) {
            errorChannel.send(`Erreur lors de la fin du concours de mèmes : ${error.message}`);
        }
    }
}

module.exports = endContestIfDue;
