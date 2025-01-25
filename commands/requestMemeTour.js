const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const cloudinary = require('cloudinary').v2;
const { db, ref, push, set, get } = require('../utils/firebase');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

module.exports = {
    data: new SlashCommandBuilder()
        .setName('memes_tour_request')
        .setDescription('Soumettre un nouveau meme')
        .addAttachmentOption(option =>
            option.setName('attachment')
                .setDescription('Image ou Vidéo du meme 10Mo max')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('nom')
                .setDescription('Nom ou titre du meme')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('description')
                .setDescription('Description et détails du meme')
                .setRequired(true)
        ),
    async execute(interaction) {
        const attachment = interaction.options.getAttachment('attachment');
        const name = interaction.options.getString('nom');
        const description = interaction.options.getString('description');
        const userId = interaction.user.id;

        // Vérification des permissions STAFF
        const staffRoleId = process.env.STAFF_ROLE_ID;
        const isStaff = interaction.member.roles.cache.has(staffRoleId);

        // Gestion du cooldown
        const cooldownRef = ref(db, `cooldowns/${userId}`);
        const cooldownPeriod = 7 * 24 * 60 * 60 * 1000; // 7 jours en millisecondes

        if (!isStaff) {
            try {
                const cooldownSnapshot = await get(cooldownRef);
                if (cooldownSnapshot.exists()) {
                    const lastRequestTime = cooldownSnapshot.val();
                    const now = Date.now();

                    if (now - lastRequestTime < cooldownPeriod) {
                        const remainingTime = cooldownPeriod - (now - lastRequestTime);
                        const days = Math.floor(remainingTime / (1000 * 60 * 60 * 24));
                        const hours = Math.floor((remainingTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                        const minutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));

                        return interaction.reply({
                            content: `Vous devez attendre encore **${days} jours, ${hours} heures et ${minutes} minutes** avant de soumettre un nouveau meme.`,
                            ephemeral: true,
                        });
                    }
                }
            } catch (error) {
                console.error('Erreur lors de la vérification du cooldown :', error);
                return interaction.reply({
                    content: 'Une erreur est survenue lors de la vérification du cooldown. Veuillez réessayer plus tard.',
                    ephemeral: true,
                });
            }
        }

        await interaction.deferReply({ ephemeral: true });

        let uploadedFile;
        try {
            uploadedFile = await cloudinary.uploader.upload(attachment.url, {
                resource_type: 'auto',
                folder: 'discord_memes',
            });
        } catch (error) {
            console.error('Erreur lors de l\'upload sur Cloudinary :', error);
            return interaction.followUp({
                content: 'Erreur lors de l\'upload du fichier.',
                ephemeral: true,
            });
        }

        const fileUrl = uploadedFile.secure_url;

        // Création de la référence Firebase pour le meme
        const memesRef = ref(db, 'memes');
        const newMemeRef = push(memesRef);
        const memeKey = newMemeRef.key;

        const approvalEmbed = new EmbedBuilder()
            .setTitle('Nouvelle demande de memes tourᴮᵉᵗᵃ')
            .addFields(
                { name: 'Nom', value: name },
                { name: 'Description', value: description },
                { name: 'Demandé par', value: `<@${interaction.user.id}>` },
                { name: 'Validations', value: `0/${process.env.REQUIRED_VOTES}`, inline: true },
                { name: 'Refus', value: `0/${process.env.REQUIRED_VOTES}`, inline: true },
            )
            .setColor('#e67e22');

        if (uploadedFile.resource_type !== 'video') {
            approvalEmbed.setImage(fileUrl);
        }

        const buttons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`approve_${memeKey}`)
                    .setLabel('Valider')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`reject_${memeKey}`)
                    .setLabel('Refuser')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`close_${memeKey}`)
                    .setLabel('📁')
                    .setStyle(ButtonStyle.Secondary)
            );

        const guild = interaction.client.guilds.cache.get(process.env.TARGET_GUILD_ID);
        const channel = guild.channels.cache.get(process.env.TARGET_CHANNEL_ID);

        let videoMessage, embedMessage;
        try {
            if (uploadedFile.resource_type === 'video') {
                videoMessage = await channel.send(fileUrl);
                embedMessage = await channel.send({
                    embeds: [approvalEmbed],
                    components: [buttons],
                });
            } else {
                embedMessage = await channel.send({
                    embeds: [approvalEmbed],
                    components: [buttons],
                });
            }
        } catch (error) {
            console.error('Erreur lors de l\'envoi des messages Discord :', error);
            return interaction.followUp({
                content: 'Erreur lors de l\'envoi des messages Discord.',
                ephemeral: true,
            });
        }

         // Création du thread sous l'embed
         let thread;
         try {
             thread = await embedMessage.startThread({
                 name: `Argument : ${name}`.slice(0, 100), // Limiter le nom à 100 caractères
                 autoArchiveDuration: 1440, // 24 heures
                 reason: 'Discussion sur le meme soumis',
             });
         } catch (error) {
             console.error('Erreur lors de la création du thread :', error);
             return interaction.followUp({
                 content: 'Une erreur est survenue lors de la création du thread.',
                 ephemeral: true,
             });
         }
 

        // Enregistrement des données dans Firebase
        try {
            await set(newMemeRef, {
                name,
                description,
                url: fileUrl,
                submittedBy: interaction.user.id,
                messageId: embedMessage.id,
                videoMessageId: videoMessage?.id || null,
                publicId: uploadedFile.public_id,
                createdAt: Date.now(),
            });

            // Mettre à jour le cooldown pour les utilisateurs non STAFF
            if (!isStaff) {
                await set(cooldownRef, Date.now());
            }
        } catch (error) {
            console.error('Erreur lors de l\'enregistrement dans Firebase :', error);
            return interaction.followUp({
                content: 'Erreur lors de l\'enregistrement des données.',
                ephemeral: true,
            });
        }

        return interaction.editReply({
            content: 'Votre demande de meme tourᴮᵉᵗᵃ a été soumis avec succès, je vous invite à vous rendre dans votre thread "agrument" pour envoyer plus de contenus pour renforcer votre demande.',
            ephemeral: true,
        });
    },
};
