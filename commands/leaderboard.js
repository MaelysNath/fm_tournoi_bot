// leaderboard_concours_meme.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getDatabase, ref, get } = require('firebase/database');
require('dotenv').config();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard_contest')
        .setDescription('Afficher le classement des participant⸱e⸱s du concours de mèmes (top 10)'),

    async execute(interaction) {
        const db = getDatabase();
        const userId = interaction.user.id;
        await interaction.deferReply({ ephemeral: true }); // Réponse visible uniquement par l'utilisateur

        const contestRef = ref(db, 'meme_contests');

        try {
            // Récupérer le concours en cours
            const snapshot = await get(contestRef);
            if (!snapshot.exists()) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("📛 Aucun Concours de Mèmes Trouvé")
                            .setDescription("Aucun concours de mèmes n'a été trouvé actuellement.")
                            .setColor(0xFF0000)
                    ]
                });
            }

            let ongoingContest = null;
            const contests = snapshot.val();
            for (const key in contests) {
                if (contests[key].status === "en cours" || contests[key].status === "voting") {
                    ongoingContest = { id: key, ...contests[key] };
                    break;
                }
            }

            if (!ongoingContest) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("📛 Pas de Concours actuellement en Cours")
                            .setDescription("Il n'y a actuellement aucun concours de mèmes en cours.")
                            .setColor(0xFF0000)
                    ]
                });
            }

            // Récupérer les participant⸱e⸱s
            const participantsRef = ref(db, `meme_contests/${ongoingContest.id}/participants`);
            const participantsSnapshot = await get(participantsRef);
            if (!participantsSnapshot.exists()) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("📛 Aucun⸱e Participant⸱e Trouvé⸱e")
                            .setDescription("Il n'y a actuellement aucun⸱e participant⸱e pour ce concours.")
                            .setColor(0xFF0000)
                    ]
                });
            }

            const participants = participantsSnapshot.val();
            const leaderboard = Object.keys(participants)
                .filter(participantId => participants[participantId].status !== 'excluded') // Exclure les participant⸱e⸱s exclu⸱e⸱s
                .map(participantId => ({ id: participantId, ...participants[participantId] })) // Convertir en un tableau avec ID utilisateur
                .sort((a, b) => (b.votes || 0) - (a.votes || 0)); // Trier par nombre de votes (décroissant)

            // Récupérer le top 10
            const top10 = leaderboard.slice(0, 10);

            if (top10.length === 0) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("📛 Aucun⸱e Participant⸱e Éligible")
                            .setDescription("Il n'y a aucun⸱e participant⸱e non exclu⸱e, même avec 0 votes.")
                            .setColor(0xFF0000)
                    ]
                });
            }

            // Calculer le nombre total de votes des participant⸱e⸱s éligibles
            const totalVotes = leaderboard.reduce((sum, participant) => sum + (participant.votes || 0), 0);

            // Trouver la position de l'utilisateur exécutant la commande dans le classement
            const userRank = leaderboard.findIndex(participant => participant.id === userId);
            const userScore = userRank !== -1 ? leaderboard[userRank].votes || 0 : 0; // Score de l'utilisateur, même avec 0 votes

            // Créer l'embed du classement
            const leaderboardEmbed = new EmbedBuilder()
            .setTitle(`🏆 Classement du Concours de Mèmes - ${ongoingContest.title}`)
            .setColor(0x00FF00)
            .setDescription("Voici le classement des 10 meilleur⸱e⸱s participant⸱e⸱s !")
            .setFooter({ text: `Nombre total de votes : ${totalVotes}` })
            .setTimestamp();

            const medalEmojis = [':trophy:', ':second_place:', ':third_place:'];
            top10.forEach((participant, index) => {
            const medal = index < 3
                ? medalEmojis[index] 
                : `**#${index + 1}-**`; 
            leaderboardEmbed.addFields(
                {
                    name: `${medal} <@${participant.pseudo}>`,
                    value: `**Votes :** ${participant.votes || 0} \n [Voir sa création:](https://discord.com/channels/${interaction.guild.id}/${ongoingContest.submissionChannelId}/${participant.messageId})`,
                    inline: false
                }
            );
            });

            // Ajouter le score et la position de l'utilisateur exécutant la commande, s'il n'est pas dans le top 10
            if (userRank >= 10) {
                leaderboardEmbed.addFields(
                    {
                        name: `📍 Votre Position : **#${userRank + 1}**`,
                        value: `**Votes :** ${userScore}`,
                        inline: false
                    }
                );
            } else if (userRank !== -1) {
                // L'utilisateur est dans le top 10, ajouter un rappel de sa position
                leaderboardEmbed.addFields(
                    {
                        name: `📍 Votre Position`,
                        value: `Vous êtes dans le **top 10** et vous êtes en **#${userRank + 1}** avec **${userScore} votes** !`,
                        inline: false
                    }
                );
            }

            // Envoyer l'embed du classement de manière éphémère
            await interaction.editReply({ embeds: [leaderboardEmbed], ephemeral: true });
        } catch (error) {
            console.error("Erreur lors de l'affichage du classement du concours de mèmes:", error);
            await interaction.editReply({ content: "Il y a eu une erreur lors de l'affichage du classement. Veuillez réessayer." });
        }
    }
};
