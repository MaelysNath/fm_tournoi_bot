const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType } = require('discord.js');
const { getDatabase, ref, get, remove, update } = require('firebase/database');
const cloudinary = require('cloudinary').v2;
require("dotenv").config();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('contest_mod')
        .setDescription('Gérer les actions sur un·e participant·e du concours de mèmes')
        .addUserOption(option =>
            option.setName('utilisateur')
                .setDescription("L'utilisateur·rice cible")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('action')
                .setDescription("Sélectionnez une action")
                .setRequired(true)
                .addChoices(
                    { name: 'Supprimer les points', value: 'remove_points' },
                    { name: "Exclure du concours", value: 'exclude' },
                    { name: 'Supprimer la participation', value: 'remove_participation' }
                )
        ),

    async execute(interaction) {
        const db = getDatabase();
        const userId = interaction.options.getUser('utilisateur').id;
        const action = interaction.options.getString('action');
        const modUser = interaction.user;

        const contestRef = ref(db, 'meme_contests');

        try {
            // Récupérer le concours en cours
            const snapshot = await get(contestRef);
            if (!snapshot.exists()) {
                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("⛔ Aucun Concours de Mèmes Trouvé")
                            .setDescription("Aucun concours de mèmes n'a été trouvé actuellement.")
                            .setColor(0xFF0000)
                            .setFooter({ text: "Assurez-vous qu'un concours est bien en cours." })
                    ],
                    ephemeral: true
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
                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("📢 Pas de Concours Actuellement en Cours")
                            .setDescription("Il n'y a actuellement aucun concours de mèmes en cours.")
                            .setColor(0xFFA500)
                            .setFooter({ text: "Patientez pour le prochain concours !" })
                    ],
                    ephemeral: true
                });
            }

            // Vérifier la participation de l'utilisateur·rice cible
            const participantsRef = ref(db, `meme_contests/${ongoingContest.id}/participants/${userId}`);
            const participantsSnapshot = await get(participantsRef);
            if (!participantsSnapshot.exists()) {
                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("❌ Participant·e Introuvable")
                            .setDescription("Cet·te utilisateur·rice ne participe pas au concours en cours.")
                            .setColor(0xFF0000)
                            .setFooter({ text: "Vérifiez l'ID ou assurez-vous que la participation existe." })
                    ],
                    ephemeral: true
                });
            }

            const participantData = participantsSnapshot.val();

            // Création du modal pour obtenir le motif
            const modal = new ModalBuilder()
                .setCustomId(`contest_mod_${action}_${userId}`)
                .setTitle(`Motif pour ${action === 'exclude' ? "l'exclusion" : "la suppression de la participation"}`);

            const reasonInput = new TextInputBuilder()
                .setCustomId('reason')
                .setLabel("Motif de l'action")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));

            // Afficher le modal pour obtenir le motif sans déférer
            await interaction.showModal(modal);

            // Gestion de la soumission du modal
            const filter = i => i.customId === `contest_mod_${action}_${userId}`;
            interaction.awaitModalSubmit({ filter, time: 120000 })
                .then(async modalInteraction => {
                    const reason = modalInteraction.fields.getTextInputValue('reason');

                    try {
                        // Gérer les différentes actions
                        if (action === 'remove_participation') {
                            // Supprimer la participation de l'utilisateur·rice
                            await remove(participantsRef);

                            // Supprimer l'image de Cloudinary si présente
                            if (participantData.imagePublicId) {
                                await cloudinary.uploader.destroy(participantData.imagePublicId);
                            }

                            // Supprimer l'embed dans le salon de soumission
                            const submissionChannelId = ongoingContest.submissionChannelId;
                            const submissionChannel = interaction.guild.channels.cache.get(submissionChannelId);

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

                            await modalInteraction.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setTitle("🗑️ Participation Supprimée")
                                        .setDescription("La participation de l'utilisateur·rice a été supprimée avec succès.")
                                        .setColor(0x00FF00)
                                ]
                            });

                        } else if (action === 'remove_points') {
                            // Réinitialiser les points à zéro
                            await update(participantsRef, { votes: 0 });

                            await modalInteraction.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setTitle("🔄 Points Réinitialisés")
                                        .setDescription("Les points de l'utilisateur·rice ont été réinitialisés à zéro.")
                                        .setColor(0x00FF00)
                                ]
                            });

                        } else if (action === 'exclude') {
                            // Ajouter aux exclusions et supprimer les données de participation
                            await update(ref(db, `meme_contests/${ongoingContest.id}/excluded/${userId}`), {
                                pseudo: participantData.pseudo,
                                discordId: userId,
                                reason: reason
                            });
                            await remove(participantsRef);

                            // Supprimer l'image de Cloudinary si présente
                            if (participantData.imagePublicId) {
                                await cloudinary.uploader.destroy(participantData.imagePublicId);
                            }

                            // Supprimer l'embed dans le salon de soumission
                            const submissionChannelId = ongoingContest.submissionChannelId;
                            const submissionChannel = interaction.guild.channels.cache.get(submissionChannelId);

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

                            await modalInteraction.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setTitle("🚫 Exclusion Réussie")
                                        .setDescription("L'utilisateur·rice a été exclu·e du concours et ses données ont été supprimées.")
                                        .setColor(0xFF0000)
                                ]
                            });
                        }

                        // Notification à l'utilisateur·rice ciblé·e
                        const targetUser = await interaction.client.users.fetch(userId);
                        const userEmbed = new EmbedBuilder()
                        .setTitle(
                            action === 'exclude'
                                ? "⚠️ Vous avez été exclu·e du concours par la modération"
                                : action === "remove_points"
                                ? "🔄 Vos points ont été réinitialisés par la modération"
                                : "🗑️ Votre participation a été supprimée par la modération"
                        )
                        
                            .setDescription(`**Motif :** ${reason}`)
                            .setColor(0xFF0000)
                            .setFooter({ text: "Pour toute question, contactez l'équipe de modération." });

                        try {
                            await targetUser.send({ embeds: [userEmbed] });
                        } catch (error) {
                            console.log("L'utilisateur·rice a les messages privés désactivés.");
                        }

                        // Log de l'action dans le canal de logs
                        logAction(action, reason, modUser, interaction, userId);

                    } catch (error) {
                        console.error("Erreur lors de l'exécution de l'action:", error);
                        await modalInteraction.reply({
                            content: "Il y a eu une erreur lors de l'exécution de l'action. Veuillez réessayer."
                        });
                    }
                })
                .catch(error => {
                    console.error("Erreur lors de la soumission du modal:", error);
                    if (!interaction.replied && !interaction.deferred) {
                        interaction.followUp({
                            content: "Le délai de confirmation est écoulé. Veuillez réessayer.",
                            ephemeral: true
                        });
                    }
                });

        } catch (error) {
            console.error("Erreur lors de la gestion de la participation:", error);
            await interaction.reply({ content: "Il y a eu une erreur lors de la gestion de la participation. Veuillez réessayer.", ephemeral: true });
        }
    }
};

// Fonction pour envoyer un log de l'action dans un canal spécifique
function logAction(action, reason, modUser, interaction, targetUserId) {
    const logChannel = interaction.guild.channels.cache.get(process.env.LOG_CHANNEL_ID);
    if (!logChannel) return;

    const actionText = action === 'exclude' ? 'exclusion du concours' : action === 'remove_points' ? 'points réinitialisés' : 'participation supprimée';
    const logEmbed = new EmbedBuilder()
        .setTitle("🔍 Meme contest MOD")
        .setDescription(`Un·e utilisateur·rice a eu son ${actionText}`)
        .addFields(
            { name: "Motif", value: reason },
            { name: "Modérateur·rice", value: modUser.tag },
            { name: "Utilisateur·rice Cible", value: `<@${targetUserId}>` }
        )
        .setColor(0xFF6347)
        .setFooter({ text: "Ne pas supprimer ce log." })
        .setTimestamp();

    logChannel.send({ embeds: [logEmbed] });
}
