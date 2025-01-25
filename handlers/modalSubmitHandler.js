const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { ref, db, get, remove, push, set } = require('../utils/firebase');
const cloudinary = require('cloudinary').v2;

// Configuration de Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

module.exports = async (interaction) => {
    if (interaction.customId.startsWith('meme_request_modal_')) {
        const requestId = interaction.customId.split('_').pop();

        // Récupérer les données temporaires de Firebase
        const tempRef = ref(db, `temp_requests/${requestId}`);
        const tempSnapshot = await get(tempRef);

        if (!tempSnapshot.exists()) {
            return interaction.reply({
                content: 'Erreur : Impossible de récupérer les données de la requête.',
                ephemeral: true,
            });
        }

        const { attachmentUrl, userId } = tempSnapshot.val();

        // Récupérer les données du modal
        const title = interaction.fields.getTextInputValue('meme_title');
        const description = interaction.fields.getTextInputValue('meme_description');
        const emoji = interaction.fields.getTextInputValue('meme_emoji');

        // Vérifier si l'emoji est valide
        const emojiRegex = /^[\u0000-\uFFFF]{1}$/u;
        if (!emojiRegex.test(emoji)) {
            return interaction.reply({
                content: 'Erreur : L\'emoji doit être un emoji standard.',
                ephemeral: true,
            });
        }

        try {
            // Uploader le fichier sur Cloudinary
            const uploadResult = await cloudinary.uploader.upload(attachmentUrl, {
                resource_type: 'auto',
                folder: 'discord_memes',
            });

            // Sauvegarder dans Firebase
            const memesRef = ref(db, 'memes');
            const newMemeRef = push(memesRef);
            await set(newMemeRef, {
                title,
                description,
                emoji,
                url: uploadResult.secure_url,
                votes: { up: 0, down: 0 },
                status: 'pending',
                submittedBy: userId,
                timestamp: Date.now(),
            });

            // Supprimer les données temporaires
            await remove(tempRef);

            // Envoyer un embed dans le salon cible
            const guild = interaction.client.guilds.cache.get(process.env.TARGET_GUILD_ID);
            const channel = guild.channels.cache.get(process.env.TARGET_CHANNEL_ID);

            if (!channel || !channel.isTextBased()) {
                return interaction.reply({
                    content: 'Erreur : Impossible de trouver le salon cible.',
                    ephemeral: true,
                });
            }

            const embed = new EmbedBuilder()
                .setTitle('Nouvelle demande de meme tour')
                .addFields(
                    { name: 'Titre', value: title },
                    { name: 'Description', value: description },
                    { name: 'Emoji', value: emoji },
                    { name: 'Créé par', value: `<@${userId}>` },
                    { name: 'Validations', value: '0/30', inline: true },
                    { name: 'Refus', value: '0/30', inline: true }
                )
                .setTimestamp()
                .setColor('#00ff00');

            if (uploadResult.resource_type === 'video') {
                await channel.send(uploadResult.secure_url);
            } else {
                embed.setImage(uploadResult.secure_url);
            }

            const buttons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`approve_${newMemeRef.key}`)
                        .setLabel('Valider')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`reject_${newMemeRef.key}`)
                        .setLabel('Refuser')
                        .setStyle(ButtonStyle.Danger)
                );

            await channel.send({
                embeds: [embed],
                components: [buttons],
            });

            return interaction.reply({
                content: 'Votre demande a été envoyée avec succès et est en attente de validation.',
                ephemeral: true,
            });
        } catch (error) {
            console.error('Erreur lors du traitement du modal :', error);
            return interaction.reply({
                content: 'Une erreur est survenue lors du traitement. Veuillez réessayer.',
                ephemeral: true,
            });
        }
    }
};
