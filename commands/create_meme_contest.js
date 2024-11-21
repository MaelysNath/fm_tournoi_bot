const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } = require("discord.js");
const { getDatabase, ref, set, get, child } = require("firebase/database");
const { v4: uuidv4 } = require("uuid");
const cloudinary = require('cloudinary').v2;
require("dotenv").config();

// Configurer Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

module.exports = {
    data: new SlashCommandBuilder()
        .setName('create_meme_contest')
        .setDescription('[STAFF+] Créer un concours de mèmes')
        .addAttachmentOption(option => option.setName('image').setDescription("Image pour le concours de mèmes").setRequired(true)),

    async execute(interaction) {
        const roles = interaction.member.roles.cache;
        const authorizedRoles = [process.env.STAFF_ROLE_ID, process.env.ADMIN_ROLE_ID];
        if (!roles.some(role => authorizedRoles.includes(role.id))) {
            return await interaction.reply({ content: "Vous n'avez pas la permission pour utiliser cette commande.", ephemeral: true });
        }

        const db = getDatabase();
        const dbRef = ref(db);
        const image = interaction.options.getAttachment('image');
        if (!image) {
            return await interaction.reply({ content: "Vous devez fournir une image pour le concours.", ephemeral: true });
        }

        let uploadedImageUrl;
        try {
            const response = await fetch(image.url);
            if (!response.ok) throw new Error(`Erreur lors de la récupération de l'image : ${response.statusText}`);
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            const uploadResult = await new Promise((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream(
                    { folder: "meme_contests" },
                    (error, result) => error ? reject(new Error("Erreur lors du téléchargement de l'image sur Cloudinary")) : resolve(result)
                );
                uploadStream.end(buffer);
            });

            uploadedImageUrl = uploadResult.secure_url;
        } catch (error) {
            console.error("Erreur lors du téléchargement de l'image sur Cloudinary:", error);
            return await interaction.reply({ content: "Une erreur est survenue lors du téléchargement de l'image. Veuillez réessayer.", ephemeral: true });
        }

        try {
            const snapshot = await get(child(dbRef, 'meme_contests'));
            if (snapshot.exists()) {
                const contests = snapshot.val();
                for (const key in contests) {
                    if (contests[key].status === "en cours") {
                        const embed = new EmbedBuilder()
                            .setTitle("Erreur")
                            .setDescription(`Un concours de mèmes est déjà en cours: **${contests[key].title}**. Veuillez terminer ce concours avant d'en créer un autre.`)
                            .addFields({ name: "ID du Concours", value: key, inline: false })
                            .setColor(0xFF0000);
                        return await interaction.reply({ embeds: [embed], ephemeral: true });
                    }
                }
            }
        } catch (error) {
            console.error("Erreur lors de la vérification des concours en cours:", error);
            return await interaction.reply({ content: "Une erreur est survenue lors de la vérification des concours en cours. Veuillez réessayer.", ephemeral: true });
        }

        const modal = new ModalBuilder()
            .setCustomId('memeContestForm')
            .setTitle('FM - Créer un Concours de Mèmes');

        const titleInput = new TextInputBuilder()
            .setCustomId('contestTitle')
            .setLabel("✏️ Titre du concours")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const descriptionInput = new TextInputBuilder()
            .setCustomId('contestDescription')
            .setLabel("✏️ Description du concours")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        const deadlineInput = new TextInputBuilder()
            .setCustomId('contestDeadline')
            .setLabel("📅 Date limite (JJ/MM/AAAA)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

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

        try {
            const modalInteraction = await interaction.awaitModalSubmit({
                filter: (i) => i.customId === 'memeContestForm' && i.user.id === interaction.user.id,
                time: 90000
            });

            const title = modalInteraction.fields.getTextInputValue('contestTitle');
            const description = modalInteraction.fields.getTextInputValue('contestDescription');
            const deadline = modalInteraction.fields.getTextInputValue('contestDeadline');
            const rewards = modalInteraction.fields.getTextInputValue('contestRewards') || '';
            const discordId = modalInteraction.user.id;
            const pseudo = modalInteraction.user.username;
            const serveurid = process.env.GUILD_ID;
            const contestId = uuidv4();

            await set(ref(db, 'meme_contests/' + contestId), {
                title,
                description,
                deadline,
                rewards,
                guildId: serveurid,
                organizer: { pseudo, discordId },
                images: { image1: uploadedImageUrl },
                status: "prêt",
                participants: {}
            });

            console.log(`Concours de mèmes créé avec succès : ${title}`);

            const contestEmbed = new EmbedBuilder()
                .setTitle("🎉 Concours de Mèmes Créé !")
                .setDescription("Votre concours de mèmes a été créé avec succès. Voici les détails :")
                .addFields(
                    { name: "✏️ Titre", value: title },
                    { name: "📜 Description", value: description },
                    { name: "📅 Date Limite", value: deadline },
                    { name: "🎁 Récompenses", value: rewards || "Aucune spécifiée" },
                    { name: "🆔 ID du Concours", value: `\`\`\`${contestId}\`\`\`` }
                )
                .setColor(0x1D82B6)
                .setFooter({ text: "Utilisez la commande /contests pour retrouver l'ID et les informations" });

            await modalInteraction.reply({ content: `Concours de mèmes "${title}" créé avec succès !`, embeds: [contestEmbed], ephemeral: true });

        } catch (error) {
            console.error("Erreur lors de la création du concours de mèmes ou lors de l'interaction avec le modal:", error);
            if (!interaction.replied) {
                await interaction.followUp({ content: "Le temps imparti pour remplir le formulaire est écoulé ou une erreur est survenue. Veuillez réessayer.", ephemeral: true });
            }
        }
    },
};
