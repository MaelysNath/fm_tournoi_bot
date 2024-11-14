// forgive.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { getDatabase, ref, get, remove } = require('firebase/database');
const cloudinary = require('cloudinary').v2;
require("dotenv").config();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('forgive')
        .setDescription('Retirer votre participation au concours de mèmes'),

    async execute(interaction) {
        const db = getDatabase();
        const participantId = interaction.user.id;

        // Déférer la réponse pour éviter l'expiration de l'interaction
        await interaction.deferReply({ ephemeral: true });

        const contestRef = ref(db, 'meme_contests');

        try {
            // Récupérer le concours en cours
            const snapshot = await get(contestRef);
            if (!snapshot.exists()) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("Aucun Concours de Mèmes Trouvé")
                            .setDescription("Aucun concours de mèmes n'a été trouvé actuellement.")
                            .setColor(0xFF0000)
                    ]
                });
            }

            let ongoingContest = null;
            const contests = snapshot.val();
            for (const key in contests) {
                if (contests[key].status === "en cours") {
                    ongoingContest = { id: key, ...contests[key] };
                    break;
                }
            }

            if (!ongoingContest) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("Pas de Concours Actuellement en Cours")
                            .setDescription("Il n'y a actuellement aucun concours de mèmes en cours.")
                            .setColor(0xFF0000)
                    ]
                });
            }

            // Vérifier si l'utilisateur a déjà soumis un mème
            const participantsRef = ref(db, `meme_contests/${ongoingContest.id}/participants/${participantId}`);
            const participantsSnapshot = await get(participantsRef);
            if (!participantsSnapshot.exists()) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("Aucune Participation Trouvée")
                            .setDescription("Vous n'avez actuellement aucune participation à retirer de ce concours.")
                            .setColor(0xFF0000)
                    ]
                });
            }

            // Confirmation avant la suppression
            const confirmEmbed = new EmbedBuilder()
                .setTitle("Confirmation Requise")
                .setDescription("Êtes-vous sûr(e) de vouloir retirer votre participation au concours de mèmes ? Cette action est irréversible.")
                .setColor(0xFFFF00);

            const confirmActionRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('confirm_forgive')
                    .setLabel('Confirmer')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('cancel_forgive')
                    .setLabel('Annuler')
                    .setStyle(ButtonStyle.Secondary)
            );

            const confirmationMessage = await interaction.editReply({ embeds: [confirmEmbed], components: [confirmActionRow] });

            const filter = (i) => i.user.id === participantId;
            const collector = confirmationMessage.createMessageComponentCollector({ filter, componentType: ComponentType.Button, time: 60000 });

            collector.on('collect', async (i) => {
                if (i.customId === 'confirm_forgive') {
                    // Supprimer la participation et l'embed associé
                    try {
                        const participantData = participantsSnapshot.val();

                        // Supprimer l'image de Cloudinary si possible
                        if (participantData.imagePublicId) {
                            await cloudinary.uploader.destroy(participantData.imagePublicId);
                        }

                        // Supprimer le message d'embed dans le salon de soumission
                        const guild = interaction.guild;
                        const submissionChannelId = ongoingContest.submissionChannelId;
                        const submissionChannel = guild.channels.cache.get(submissionChannelId);

                        if (submissionChannel && participantData.messageId) {
                            try {
                                const messageToDelete = await submissionChannel.messages.fetch(participantData.messageId);
                                if (messageToDelete) {
                                    await messageToDelete.delete();
                                }
                            } catch (error) {
                                if (error.code === 10008) {
                                    console.warn("Message déjà supprimé ou introuvable.");
                                } else {
                                    console.error("Erreur lors de la suppression du message d'embed:", error);
                                }
                            }
                        }

                        // Supprimer les données de participation de la base de données
                        await remove(participantsRef);

                        // Confirmation de la suppression de la participation
                        await i.update({
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle("Participation Retirée")
                                    .setDescription("Votre participation au concours de mèmes a été retirée avec succès.")
                                    .setColor(0x00FF00)
                            ],
                            components: []
                        });
                    } catch (error) {
                        console.error("Erreur lors de la suppression de la participation:", error);
                        await i.update({
                            content: "Il y a eu une erreur lors de la suppression de votre participation. Veuillez réessayer.",
                            components: []
                        });
                    }
                } else if (i.customId === 'cancel_forgive') {
                    await i.update({
                        content: "Action annulée.",
                        components: []
                    });
                }
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    await interaction.editReply({
                        content: "Le délai de confirmation est écoulé. Veuillez réessayer.",
                        components: []
                    });
                }
            });

        } catch (error) {
            console.error("Erreur lors du retrait de la participation:", error);
            await interaction.editReply({ content: "Il y a eu une erreur lors du retrait de votre participation. Veuillez réessayer." });
        }
    }
};
