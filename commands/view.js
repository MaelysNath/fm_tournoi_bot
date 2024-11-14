// view.js 
const { SlashCommandBuilder,ButtonBuilder, ButtonStyle, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType } = require('discord.js');
const { getDatabase, ref, get, update, remove } = require('firebase/database');
require('dotenv').config();
const cloudinary = require('cloudinary').v2;

// Configurer Cloudinary ici
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

module.exports = {
    data: new SlashCommandBuilder()
        .setName('view')
        .setDescription('Afficher les informations de la participation à un concours de mèmes.')
        .addUserOption(option =>
            option.setName('participant')
                .setDescription("L'utilisateur à vérifier")
                .setRequired(false))
        .addStringOption(option =>
            option.setName('id')
                .setDescription("L'ID du participant")
                .setRequired(false)),

    async execute(interaction) {
        const db = getDatabase();
        await interaction.deferReply({ ephemeral: true });

        const participant = interaction.options.getUser('participant');
        const participantId = interaction.options.getString('id') || (participant ? participant.id : interaction.user.id);

        const contestRef = ref(db, 'meme_contests');

        try {
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
                            .setTitle("Aucun concours actif")
                            .setDescription("Il n'y a actuellement aucun concours de mèmes en cours.")
                            .setColor(0xFF0000)
                    ]
                });
            }

            const participantRef = ref(db, `meme_contests/${ongoingContest.id}/participants/${participantId}`);
            const participantSnapshot = await get(participantRef);

            if (!participantSnapshot.exists()) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("Participant(e) introuvable")
                            .setDescription("Cette personne mentionnée ne participe pas au concours.")
                            .setColor(0xFF0000)
                    ]
                });
            }

            const participantData = participantSnapshot.val();
            const excluded = participantData.status === 'excluded';

            const participantEmbed = new EmbedBuilder()
                .setTitle(`Informations du Participant: ${participantData.pseudo}`)
                .addFields(
                    { name: "ID Discord", value: participantId },
                    { name: "Pseudo", value: participantData.pseudo },
                    { name: "Votes", value: participantData.votes.toString() },
                    { name: "Statut", value: excluded ? "Exclu(e)" : "Actif/ve" }
                )
                .setColor(excluded ? 0xFF0000 : 0x00FF00)
                .setFooter({ text: `ID du concours: ${ongoingContest.id}` });

            if (participantData.messageId) {
                const submissionChannelId = ongoingContest.submissionChannelId;
                const messageUrl = `https://discord.com/channels/${interaction.guild.id}/${submissionChannelId}/${participantData.messageId}`;
                participantEmbed.addFields({ name: "Lien vers l'Embed de Soumission", value: `[Cliquez ici pour voir le mème](${messageUrl})` });
            }

            const actionRow = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`select_action_${participantId}`)
                    .setPlaceholder('[MOD] - Actions de modération')
                    .addOptions([
                        {
                            label: '🗑️ Supprimer sa Participation',
                            description: 'Supprimer la participation de ce participant',
                            value: 'delete_participation'
                        },
                        {
                            label: '❌ Supprimer ses Points',
                            description: 'Réinitialiser les points de ce participant',
                            value: 'reset_points'
                        },
                        {
                            label: '⚠️ L\'exclure',
                            description: 'Exclure cette personne avec une raison',
                            value: 'exclude_participant'
                        }
                    ])
            );

            const replyMessage = await interaction.editReply({ embeds: [participantEmbed], components: [actionRow] });

            const filter = (selectInteraction) =>
                selectInteraction.customId === `select_action_${participantId}`;

            const collector = interaction.channel.createMessageComponentCollector({ filter, componentType: ComponentType.SelectMenu, time: 60000 });

            collector.on('collect', async (selectInteraction) => {
                // Vérifier que l'interaction n'a pas déjà été traitée
                if (selectInteraction.deferred || selectInteraction.replied) return;
            
                try {
                    await selectInteraction.deferUpdate(); // Différer immédiatement pour éviter l'expiration
                } catch (error) {
                    console.error("Erreur lors de deferUpdate:", error);
                    return; // Si defer échoue, interrompez pour éviter d'autres erreurs
                }
            
                if (!selectInteraction.member.roles.cache.has(process.env.STAFF_ROLE_ID) &&
                    !selectInteraction.member.roles.cache.has(process.env.MOD_ROLE_ID)) {
                    return selectInteraction.followUp({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle("Vous n'êtes pas membre du STAFF.")
                                .setDescription("Vous n'avez pas la permission d'utiliser ces actions.")
                                .setColor(0xFF0000)
                        ],
                        ephemeral: true
                    });
                }
            
                const selectedAction = selectInteraction.values[0];
            
                if (selectedAction === 'delete_participation' || selectedAction === 'reset_points') {
                    const confirmationRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`confirm_${selectedAction}_${participantId}`)
                            .setLabel("Confirmer")
                            .setStyle(ButtonStyle.Danger),
                        new ButtonBuilder()
                            .setCustomId(`cancel_${selectedAction}_${participantId}`)
                            .setLabel("Annuler")
                            .setStyle(ButtonStyle.Secondary)
                    );
            
                    const confirmationMessage = selectedAction === 'delete_participation'
                        ? "Voulez-vous vraiment supprimer cette participation ? Cette action est irréversible."
                        : "Voulez-vous vraiment réinitialiser les points de ce participant ?";
            
                    await selectInteraction.followUp({
                        content: confirmationMessage,
                        components: [confirmationRow],
                        ephemeral: true
                    });
            
                    const buttonFilter = (buttonInteraction) =>
                        buttonInteraction.customId.startsWith(`confirm_${selectedAction}_${participantId}`) ||
                        buttonInteraction.customId.startsWith(`cancel_${selectedAction}_${participantId}`);
            
                    const buttonCollector = interaction.channel.createMessageComponentCollector({
                        filter: buttonFilter,
                        componentType: ComponentType.Button,
                        time: 15000
                    });
            
                    buttonCollector.on('collect', async (buttonInteraction) => {
                        if (buttonInteraction.deferred || buttonInteraction.replied) return;
            
                        try {
                            await buttonInteraction.deferUpdate(); // Différer immédiatement pour éviter l'expiration
                        } catch (error) {
                            console.error("Erreur lors de deferUpdate du bouton:", error);
                            return;
                        }
            
                        if (buttonInteraction.customId === `confirm_${selectedAction}_${participantId}`) {
                            if (selectedAction === 'delete_participation') {
                                await remove(participantRef);
            
                                if (participantData.messageId) {
                                    const submissionChannel = await interaction.guild.channels.fetch(ongoingContest.submissionChannelId);
                                    if (submissionChannel) {
                                        try {
                                            const message = await submissionChannel.messages.fetch(participantData.messageId);
                                            await message.delete();
                                        } catch (error) {
                                            console.error("Erreur lors de la suppression de l'embed:", error);
                                        }
                                    }
                                }
            
                                await buttonInteraction.followUp({ content: "Participation supprimée avec succès.", ephemeral: true });
                            } else if (selectedAction === 'reset_points') {
                                await update(participantRef, { votes: 0 });
                                await buttonInteraction.followUp({ content: "Points réinitialisés avec succès.", ephemeral: true });
                            }
                        } else if (buttonInteraction.customId === `cancel_${selectedAction}_${participantId}`) {
                            await buttonInteraction.followUp({ content: "Action annulée.", ephemeral: true });
                        }
            
                        buttonCollector.stop();
                    });
            
                    buttonCollector.on('end', async () => {
                        try {
                            await selectInteraction.deleteReply();
                        } catch (e) {
                            console.error("Erreur lors de la suppression du message de confirmation:", e);
                        }
                    });
            
                } else if (selectedAction === 'exclude_participant') {
                    if (interaction.user.id === participantId) {
                        return selectInteraction.followUp({
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle("Action non autorisée")
                                    .setDescription("Vous ne pouvez pas vous exclure vous-même du concours.")
                                    .setColor(0xFF0000)
                            ],
                            ephemeral: true
                        });
                    }
            
                    const modal = new ModalBuilder()
                        .setCustomId(`excludeReasonModal_${participantId}`)
                        .setTitle("Raison de l'exclusion");
            
                    const reasonInput = new TextInputBuilder()
                        .setCustomId('reasonInput')
                        .setLabel("Indiquez la raison de l'exclusion")
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true);
            
                    modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
                    await selectInteraction.showModal(modal);
                }
            
                try {
                    if (replyMessage) {
                        await replyMessage.delete();
                    }
                } catch (e) {
                    if (e.code !== 10008) { 
                        console.error("Erreur lors de la suppression de l'embed de vue:", e);
                    }
                }
            });
            
            
            
            
            // Ecoute des réponses modales et gestion des erreurs potentiels d'interaction inconnue
            interaction.client.on('interactionCreate', async (modalInteraction) => {
                if (!modalInteraction.isModalSubmit() || modalInteraction.customId !== `excludeReasonModal_${participantId}`) return;
            
                try {
                    // Vérification que l'interaction est valide avant d'utiliser deferReply
                    if (!modalInteraction.replied && !modalInteraction.deferred) {
                        await modalInteraction.deferReply({ ephemeral: true });
                    }
            
                    const reason = modalInteraction.fields.getTextInputValue('reasonInput');
            
                    if (participantSnapshot.exists() && participantSnapshot.val().imagePublicId) {
                        await cloudinary.uploader.destroy(participantSnapshot.val().imagePublicId);
                    }
            
                    await update(participantRef, { status: 'excluded' });
                    await update(ref(db, `meme_contests/${ongoingContest.id}/excluded/${participantId}`), {
                        pseudo: participantData.pseudo,
                        discordId: participantId,
                        reason: reason
                    });
            
                    if (participantData.messageId) {
                        const submissionChannel = await interaction.guild.channels.fetch(ongoingContest.submissionChannelId);
                        if (submissionChannel) {
                            try {
                                const message = await submissionChannel.messages.fetch(participantData.messageId);
                                await message.delete();
                            } catch (error) {
                                console.error("Erreur lors de la suppression de l'embed de soumission:", error);
                            }
                        }
                    }
            
                    const excludeEmbed = new EmbedBuilder()
                        .setTitle("⚠️ Vous avez été exclu(e) du concours")
                        .setDescription(`Raison : ${reason}`)
                        .setColor(0xFF0000);
            
                    try {
                        await participant.send({ embeds: [excludeEmbed] });
                    } catch (e) {
                        console.error("Erreur lors de l'envoi du message privé:", e);
                    }
            
                    await modalInteraction.editReply({ content: `L'utilisateur ${participantData.pseudo} a été exclu du concours.`, ephemeral: true });
                } catch (error) {
                    console.error("Erreur lors du traitement de l'interaction du modal:", error);
                }
            });
            
            
        } catch (error) {
            console.error("Erreur lors de l'affichage des informations du participant:", error);
            await interaction.editReply({ content: "Erreur lors de l'affichage des informations du participant. Réessayez." });
        }
    }
};
