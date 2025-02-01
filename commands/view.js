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
            await interaction.editReply({ embeds: [participantEmbed]});
            
        } catch (error) {
            console.error("Erreur lors de l'affichage des informations du participant:", error);
            await interaction.editReply({ content: "Erreur lors de l'affichage des informations du participant. Réessayez." });
        }
    }
};
