// submit.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const { getDatabase, ref, get, update, increment } = require("firebase/database");
const fetch = require('node-fetch');
const cloudinary = require('cloudinary').v2;
require("dotenv").config();

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

module.exports = {
    data: new SlashCommandBuilder()
        .setName('submit')
        .setDescription('Soumettre un mème pour le concours')
        .addAttachmentOption(option =>
            option.setName('image')
                .setDescription("Image du mème à soumettre")
                .setRequired(true)),
    async execute(interaction) {
        const db = getDatabase();
        await interaction.deferReply({ ephemeral: true });

        const contestRef = ref(db, 'meme_contests');

        try {
            const snapshot = await get(contestRef);
            if (!snapshot.exists()) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder().setTitle("Aucun concours de mèmes trouvé").setColor(0xFF0000)]
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
                    embeds: [new EmbedBuilder().setTitle("Pas de concours actuellement en cours").setColor(0xFF0000)]
                });
            }

            const participantId = interaction.user.id;
            const participantName = interaction.user.username;

            const excludedSnapshot = await get(ref(db, `meme_contests/${ongoingContest.id}/excluded/${participantId}`));
            if (excludedSnapshot.exists()) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder().setTitle("Vous êtes exclu(e) pour participer au concours. Une erreur ? Contactez la modération.").setColor(0xFF0000)]
                });
            }

            const participantsSnapshot = await get(ref(db, `meme_contests/${ongoingContest.id}/participants/${participantId}`));
            if (participantsSnapshot.exists()) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder().setTitle("Mème déjà soumis").setColor(0xFF0000)]
                });
            }

            const media = interaction.options.getAttachment('image');
            if (!media) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder().setTitle("Image requise").setColor(0xFF0000)]
                });
            }

            const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp'];
            const mediaName = media.name.toLowerCase();
            if (!imageExtensions.some(ext => mediaName.endsWith(ext))) {
                return interaction.editReply({
                    content: "Seules les images sont acceptées. Veuillez soumettre une image svp.",
                    ephemeral: true
                });
            }

            const response = await fetch(media.url);
            if (!response.ok) {
                throw new Error(`Erreur lors de la récupération de l'image : ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            const uploadResult = await new Promise((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream(
                    { folder: "meme_contests" },
                    (error, result) => {
                        if (error) {
                            console.error("Erreur lors du téléchargement sur Cloudinary:", error);
                            return reject(error);
                        }
                        resolve(result);
                    }
                );
                uploadStream.end(buffer);
            });

            const participantsRef = ref(db, `meme_contests/${ongoingContest.id}/participants/${participantId}`);
            await update(participantsRef, {
                status: 'active',
                pseudo: participantName,
                discordId: participantId,
                imageUrl: uploadResult.secure_url,
                imagePublicId: uploadResult.public_id,
                votes: 0,
                voters: {}
            });

            const recapEmbed = new EmbedBuilder()
                .setTitle(`Mème de : **${participantName}**`)
                .setImage(uploadResult.secure_url)
                .setColor(0x00FF00)
                .setFooter({ text: `ID du concours : ${ongoingContest.id}` });

            // Tenter d'envoyer un message privé à l'utilisateur
            try {
                await interaction.user.send({ embeds: [recapEmbed] });
            } catch (error) {
                if (error.code === 50007) { // Cannot send messages to this user
                    console.warn("Impossible d'envoyer un message à cet utilisateur. Les DM sont désactivés.");
                } else {
                    console.error("Erreur inattendue lors de l'envoi du message privé:", error);
                }
            }

            const submissionChannel = interaction.guild.channels.cache.get(ongoingContest.submissionChannelId);
            if (submissionChannel) {
                const message = await submissionChannel.send({ embeds: [recapEmbed] });
                await update(participantsRef, { messageId: message.id });

                const actionRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`upvote_${participantId}`)
                        .setLabel('UPVOTE')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('👍'),
                    new ButtonBuilder()
                        .setCustomId(`downvote_${participantId}`)
                        .setLabel('DOWNVOTE')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('👎')
                );

                await message.edit({ components: [actionRow] });
            }

            await interaction.editReply({ content: "Votre mème a été soumis avec succès!" });
        } catch (error) {
            console.error("Erreur lors de la soumission du mème:", error);
            await interaction.editReply({ content: "Erreur lors de la soumission de votre mème. Réessayez." });
        }
    }
};
