// history.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require("discord.js");
const { getDatabase, ref, get, remove } = require("firebase/database");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('history')
        .setDescription('[ADMIN/OWNER] options de navigation et suppression'),

    async execute(interaction) {
        const adminRoleId = process.env.ADMIN_ROLE_ID;
        const botOwnerId = process.env.BOT_OWNER_ID;

        if (
            interaction.user.id !== botOwnerId &&
            !interaction.member.roles.cache.has(adminRoleId) &&
            !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)
        ) {
            return interaction.reply({ content: "Seuls les ADMINS peuvent utiliser cette commande.", ephemeral: true });
        }

        await interaction.deferReply();

        const db = getDatabase();
        const contestsRef = ref(db, 'meme_contests');
        const snapshot = await get(contestsRef);

        if (!snapshot.exists()) {
            return interaction.followUp({ content: "Erreur: Aucun concours de mèmes trouvé dans l'historique.", ephemeral: true });
        }

        const contests = Object.entries(snapshot.val()).reverse();
        let index = 0;

        const showContestEmbed = async () => {
            const [contestId, contestData] = contests[index];
            const participants = contestData.participants || {};
            const totalVotes = Object.values(participants).reduce((sum, p) => sum + (p.votes || 0), 0);
            const excludedCount = Object.values(participants).filter(p => p.status === "excluded").length;
            const winner = Object.values(participants).reduce((top, p) => p.votes > (top.votes || 0) ? p : top, {});

            const embed = new EmbedBuilder()
                .setTitle(`📜 Historique du Concours - ${contestData.title}`)
                .setDescription(`Informations sur le concours **${contestData.title}**`)
                .addFields(
                    { name: "📅 Date de Fin", value: contestData.deadline || "Non spécifiée", inline: false },
                    { name: "📝 Statut", value: contestData.status || "Inconnu", inline: false },
                    { name: "👥 Participants", value: `${Object.keys(participants).length}`, inline: false },
                    { name: "🚫 Exclus", value: `${excludedCount}`, inline: false },
                    { name: "👍 Total des Votes", value: `${totalVotes}`, inline: false },
                    { name: "🏆 Gagnant", value: winner.pseudo ? `${winner.pseudo} avec ${winner.votes} votes` : "Aucun", inline: false },
                    { name: "🆔 ID du Concours", value: `\`${contestId}\``, inline: false }
                )
                .setFooter({ text: `Concours ${index + 1}/${contests.length}` })
                .setColor(0x00FF00)
                .setTimestamp();

            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('prev_contest')
                        .setLabel('⬅️ Précédent')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(index === 0),
                    new ButtonBuilder()
                        .setCustomId('next_contest')
                        .setLabel('Suivant ➡️')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(index === contests.length - 1)
                );

            if (contestData.status !== "en cours") {
                actionRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId('show_top10')
                        .setLabel('🏆 Voir le Top 10')
                        .setStyle(ButtonStyle.Secondary)
                );
            }

            if (contestData.status === "terminé") {
                actionRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId('delete_contest')
                        .setLabel('🗑️ Supprimer les données')
                        .setStyle(ButtonStyle.Danger)
                );
            }

            await interaction.editReply({ embeds: [embed], components: [actionRow] });
        };

        await showContestEmbed();

        const collector = interaction.channel.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: "Vous ne pouvez pas interagir avec ce message.", ephemeral: true });
            }

            if (i.customId === 'prev_contest') {
                index--;
                await showContestEmbed();
                await i.deferUpdate();
            } else if (i.customId === 'next_contest') {
                index++;
                await showContestEmbed();
                await i.deferUpdate();
            } else if (i.customId === 'delete_contest') {
                await i.reply({
                    content: "Êtes-vous sûr de vouloir supprimer ce concours ? Cette action est irréversible.",
                    components: [
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId('confirm_delete')
                                .setLabel('Confirmer')
                                .setStyle(ButtonStyle.Danger),
                            new ButtonBuilder()
                                .setCustomId('cancel_delete')
                                .setLabel('Annuler')
                                .setStyle(ButtonStyle.Secondary)
                        )
                    ],
                    ephemeral: true
                });
            } else if (i.customId === 'show_top10') {
                const [contestId, contestData] = contests[index];
                const participants = Object.values(contestData.participants || {})
                    .filter(participant => participant.status !== "excluded")
                    .sort((a, b) => b.votes - a.votes)
                    .slice(0, 10);

                const top10Embed = new EmbedBuilder()
                    .setTitle(`🏅 Top 10 des Participants - ${contestData.title}`)
                    .setDescription(participants.map((p, idx) => `${idx + 1}. **${p.pseudo}** - ${p.votes} votes`).join("\n"))
                    .setColor(0xFFD700);

                await i.reply({ embeds: [top10Embed], ephemeral: true });
            } else if (i.customId === 'confirm_delete') {
                const [contestId] = contests[index];
                await remove(ref(db, `meme_contests/${contestId}`));
                await i.update({ content: "Le concours a été supprimé avec succès.", embeds: [], components: [] });
                collector.stop();
            } else if (i.customId === 'cancel_delete') {
                await i.update({ content: "Suppression annulée.", components: [] });
            }
        });

        collector.on('end', async () => {
            try {
                await interaction.editReply({ components: [] });
                console.log('Collector de message terminé');
            } catch (error) {
                console.error('Erreur lors de la mise à jour du message après expiration du collector:', error);
            }
        });
    }
};
