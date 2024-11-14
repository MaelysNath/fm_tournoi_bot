const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } = require("discord.js");
const { getDatabase, ref, update, get, child } = require("firebase/database");
require("dotenv").config();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('modifier_concours')
        .setDescription('[STAFF/ADMIN] Modifier un concours de mèmes existant')
        .addStringOption(option => 
            option.setName('contest_id')
                .setDescription("ID du concours à modifier")
                .setRequired(true)),

    async execute(interaction) {
        const contestId = interaction.options.getString('contest_id');
        const roles = interaction.member.roles.cache;
        const authorizedRoles = [process.env.STAFF_ROLE_ID, process.env.ADMIN_ROLE_ID];
        
        if (!roles.some(role => authorizedRoles.includes(role.id))) {
            return await interaction.reply({ content: "Vous n'avez pas la permission pour utiliser cette commande.", ephemeral: true });
        }

        const db = getDatabase();
        const dbRef = ref(db, `meme_contests/${contestId}`);
        
        try {
            const snapshot = await get(dbRef);
            if (!snapshot.exists()) {
                return await interaction.reply({ content: "Concours introuvable. Veuillez vérifier l'ID.", ephemeral: true });
            }

            const contest = snapshot.val();
            if (contest.status !== "prêt") {
                return await interaction.reply({ content: "Ce concours ne peut pas être modifié car il n'est pas en état 'prêt'.", ephemeral: true });
            }

            const modal = new ModalBuilder()
                .setCustomId('modifyContestForm')
                .setTitle('Modifier le Concours');

            const titleInput = new TextInputBuilder()
                .setCustomId('contestTitle')
                .setLabel("✏️ Nouveau titre (facultatif)")
                .setStyle(TextInputStyle.Short)
                .setRequired(false);

            const descriptionInput = new TextInputBuilder()
                .setCustomId('contestDescription')
                .setLabel("✏️ Nouvelle description (facultatif)")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false);

            const deadlineInput = new TextInputBuilder()
                .setCustomId('contestDeadline')
                .setLabel("📅 Date limite (JJ/MM/AAAA)")
                .setStyle(TextInputStyle.Short)
                .setRequired(false); // Champ rendu facultatif pour éviter la contrainte de longueur

            const rewardsInput = new TextInputBuilder()
                .setCustomId('contestRewards')
                .setLabel("🏅 Récompenses (facultatif)")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false);

            modal.addComponents(
                new ActionRowBuilder().addComponents(titleInput),
                new ActionRowBuilder().addComponents(descriptionInput),
                new ActionRowBuilder().addComponents(deadlineInput),
                new ActionRowBuilder().addComponents(rewardsInput)
            );

            await interaction.showModal(modal);

            const modalInteraction = await interaction.awaitModalSubmit({
                filter: (i) => i.customId === 'modifyContestForm' && i.user.id === interaction.user.id,
                time: 90000
            });

            const updatedData = {};
            const newTitle = modalInteraction.fields.getTextInputValue('contestTitle');
            const newDescription = modalInteraction.fields.getTextInputValue('contestDescription');
            const newDeadline = modalInteraction.fields.getTextInputValue('contestDeadline');
            const newRewards = modalInteraction.fields.getTextInputValue('contestRewards');

            if (newTitle) updatedData.title = newTitle;
            if (newDescription) updatedData.description = newDescription;
            if (newDeadline) updatedData.deadline = newDeadline;
            if (newRewards) updatedData.rewards = newRewards;

            if (Object.keys(updatedData).length === 0) {
                return await modalInteraction.reply({ content: "Aucune modification n'a été apportée, tous les champs sont vides.", ephemeral: true });
            }

            await update(dbRef, updatedData);

            const updateEmbed = new EmbedBuilder()
                .setTitle("✅ Concours modifié avec succès")
                .setDescription("Les modifications ont été appliquées au concours.")
                .addFields(
                    { name: "Titre", value: updatedData.title || contest.title, inline: true },
                    { name: "Description", value: updatedData.description || contest.description, inline: true },
                    { name: "Date Limite", value: updatedData.deadline || contest.deadline, inline: true },
                    { name: "Récompenses", value: updatedData.rewards || contest.rewards || "Aucune spécifiée", inline: true }
                )
                .setColor(0x1D82B6);

            await modalInteraction.reply({ embeds: [updateEmbed], ephemeral: true });

        } catch (error) {
            console.error("Erreur lors de la modification du concours de mèmes:", error);
            if (!interaction.replied) {
                await interaction.followUp({ content: "Une erreur est survenue lors de la modification du concours. Veuillez réessayer.", ephemeral: true });
            }
        }
    },
};
