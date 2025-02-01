const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ChannelType } = require('discord.js');
const { getDatabase, ref, get, update } = require('firebase/database');
const { WebhookClient } = require('discord.js');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();// Configurer Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

module.exports = {
    data: new SlashCommandBuilder()
        .setName('end_contest')
        .setDescription('[STAFF/ADMIN] Forcer la fin d\'un concours de mèmes en cours'),

    async execute(interaction) {
        const staffRoleId = process.env.STAFF_ROLE_ID;

        if (!interaction.member.roles.cache.has(staffRoleId)) {
            return interaction.reply({
                content: 'Vous n\'avez pas la permission pour utiliser cette commande. Seuls les membres du staff peuvent l\'utiliser.',
                ephemeral: true
            });
        }

        const db = getDatabase();
        await interaction.deferReply({ ephemeral: true });
        const contestRef = ref(db, 'meme_contests');

        try {
            const snapshot = await get(contestRef);
            if (!snapshot.exists()) {
                return interaction.editReply({ content: 'Aucun concours de mèmes trouvé.', ephemeral: true });
            }

            const contests = snapshot.val();
            let ongoingContest = null;
            for (const key in contests) {
                if (contests[key].status === 'en cours') {
                    ongoingContest = { id: key, ...contests[key] };
                    break;
                }
            }

            if (!ongoingContest) {
                return interaction.editReply({ content: 'Aucun concours en cours trouvé.', ephemeral: true });
            }

            const guildId = ongoingContest.guildId;
            const submissionChannelId = ongoingContest.submissionChannelId;
            const submissionChannel = await interaction.guild.channels.fetch(submissionChannelId);
            const webhookClient = new WebhookClient({ id: process.env.WEBHOOK_ID, token: process.env.WEBHOOK_TOKEN });

            // Vérifiez que le canal de soumission est un salon de texte
            if (!submissionChannel || submissionChannel.type !== ChannelType.GuildText) {
                throw new Error(`Le canal de soumission avec l'ID ${submissionChannelId} est introuvable ou n'est pas un canal de texte.`);
            }

            console.log("Désactivation des boutons dans le canal de soumission...");

            // Désactiver les boutons pour chaque message du canal de soumission
            const messages = await submissionChannel.messages.fetch({ limit: 100 });
            messages.forEach(async (message) => {
                if (message.components.length > 0) {
                    const disabledComponents = message.components.map((row) => {
                        return new ActionRowBuilder().addComponents(
                            row.components.map((component) =>
                                ButtonBuilder.from(component).setDisabled(true)
                            )
                        );
                    });
                    await message.edit({ components: disabledComponents });
                }
            });

            console.log("Boutons désactivés avec succès dans le canal de soumission.");

            const participantsSnapshot = await get(ref(db, `meme_contests/${ongoingContest.id}/participants`));
            if (!participantsSnapshot.exists()) {
                return interaction.editReply({ content: 'Aucun participant⸱e⸱s éligible pour le concours, dommage.', ephemeral: true });
            }

            const participants = participantsSnapshot.val();
            const leaderboard = Object.values(participants)
                .filter(participant => participant.status !== 'excluded')
                .sort((a, b) => b.votes - a.votes)
                .slice(0, 10); // Top 10 participants

            if (leaderboard.length === 0) {
                return interaction.editReply({ content: 'Aucun participant⸱e⸱s éligible pour le concours, dommage.', ephemeral: true });
            }

            // Classement complet (top 10)
            const fullLeaderboardEmbed = new EmbedBuilder()
                .setTitle(`🏆 Classement du Concours de Mèmes - ${ongoingContest.title}`)
                .setColor(0x00FF00)
                .setFooter({ text: `ID du concours: ${ongoingContest.id}` });

            const medalEmojis = [':trophy:', ':second_place:', ':third_place:'];
            leaderboard.forEach((participant, index) => {
                const medal = index < 3
                    ? medalEmojis[index]
                    : `**#${index + 1}-**`;
                fullLeaderboardEmbed.addFields(
                    {
                        name: `${medal} ${participant.pseudo}`,
                        value: `**Votes :** ${participant.votes} \n [Voir la création](https://discord.com/channels/${guildId}/${submissionChannelId}/${participant.messageId})`,
                        inline: false
                    }
                );
            });

            // Classement réduit (top 5)
            const top5 = leaderboard.slice(0, 5);
            const reducedLeaderboardEmbed = new EmbedBuilder()
                .setTitle(`🏆 Classement Final - ${ongoingContest.title} (Top 5)`)
                .setColor(0xFFD700)
                .setFooter({ text: `ID du concours: ${ongoingContest.id}` });

            top5.forEach((participant, index) => {
                const medal = index < 3
                    ? medalEmojis[index]
                    : `**#${index + 1}-**`;
                reducedLeaderboardEmbed.addFields(
                    {
                        name: `${medal} ${participant.pseudo}`,
                        value: `**Votes :** ${participant.votes} \n [Voir la création](https://discord.com/channels/${guildId}/${submissionChannelId}/${participant.messageId})`,
                        inline: false
                    }
                );
            });

            const winner = leaderboard[0];

            // Création de l'embed pour le gagnant avec un lien vers sa soumission
            // Récupérer l'avatar du gagnant de manière sécurisée
            let winnerAvatarUrl;
            try {
                const winnerMember = await interaction.guild.members.cache.get(winner.discordId) || await interaction.guild.members.fetch(winner.discordId);
                if (winnerMember) {
                    winnerAvatarUrl = winnerMember.user.displayAvatarURL({ format: 'png', size: 512 });
                } else {
                    console.warn(`Le membre avec l'ID ${winner.discordId} n'a pas pu être trouvé dans le serveur.`);
                    winnerAvatarUrl = 'https://res.cloudinary.com/dlofnephc/image/upload/v1731402703/profile_pfp_no_data.png'; // Remplacez par une URL par défaut si nécessaire
                }
            } catch (error) {
                console.error(`Erreur lors de la récupération de l'avatar du gagnant avec l'ID ${winner.discordId}:`, error);
                winnerAvatarUrl = 'https://res.cloudinary.com/dlofnephc/image/upload/v1731402703/profile_pfp_no_data.png'; // Remplacez par une URL par défaut si nécessaire
            }

            const editedThumbnail = await cloudinary.uploader.upload(winnerAvatarUrl, {
                transformation: [
                    { overlay: "confettimaelys12", gravity: "north", width: "1.0", flags: "relative" },
                    { width: 200, crop: "scale" }
                ]
            });

            const winnerImageUrl = winner.imageUrl;
            const winnerEmbed = new EmbedBuilder()
                .setTitle(`🎉 Félicitations ${winner.pseudo} !`)
                .setDescription(`🎁 Tu viens de remporter : ${ongoingContest.rewards}\n\n📎 [Voir la soumission gagnante](https://discord.com/channels/${guildId}/${submissionChannelId}/${winner.messageId})`)
                .setDescription(`🎁 Tu viens de remporter :  ${ongoingContest.rewards}`)
                .setThumbnail(editedThumbnail.secure_url)
                .setColor(0xFFD700)
                .setFooter({ text: `ID du concours: ${ongoingContest.id}` });

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
                status: 'terminé'
            });

            await interaction.editReply({ content: 'Le concours a été terminé avec succès et les résultats ont été publiés.', ephemeral: true });
        } catch (error) {
            console.error("Erreur lors de la fin forcée du concours de mèmes:", error);
            await interaction.editReply({ content: 'Une erreur est survenue lors de la fin forcée du concours.', ephemeral: true });
        }
    }
};
