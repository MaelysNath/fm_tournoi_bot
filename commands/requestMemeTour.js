const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const cloudinary = require('cloudinary').v2;
const { db, ref, set, get } = require('../utils/firebase');
const { v4: uuidv4 } = require('uuid'); // Pour générer un identifiant unique

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

module.exports = {
    data: new SlashCommandBuilder()
        .setName('request')
        .setDescription('Soumettre une demande de meme ou emoji')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Choisir entre un meme ou un emoji')
                .setRequired(true)
                .addChoices(
                    { name: 'Meme', value: 'meme' },
                    { name: 'Emoji', value: 'emoji' }
                )
        )
        .addAttachmentOption(option =>
            option.setName('attachment')
                .setDescription('Image ou vidéo du meme (10Mo max) ou Emoji (256Ko max)')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('nom')
                .setDescription('Nom ou titre du meme ou emoji')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('description')
                .setDescription('Description et détails du meme')
                .setRequired(true)
        ),
    async execute(interaction) {
        // Récupération des options et de l'utilisateur
        const type = interaction.options.getString('type'); // "meme" ou "emoji"
        const attachment = interaction.options.getAttachment('attachment');
        const userId = interaction.user.id;
        let name = interaction.options.getString('nom'); // "let" pour pouvoir modifier le nom si besoin
        const description = interaction.options.getString('description') || "Aucune description";

        console.log(`📡 Nouvelle requête de ${type} par ${userId} : ${name}`);

        // Vérification pour les emojis
        if (type === 'emoji') {
            if (attachment.size > 256000) {
                return interaction.reply({
                    content: "❌ L'emoji dépasse la taille limite de **256 Ko** imposée par Discord.",
                    ephemeral: true,
                });
            }
            // Vérification si l'emoji est un GIF et si l'utilisateur a Nitro
            if (attachment.contentType.includes("gif")) {
                const premiumRolesForGif = process.env.PREMIUM_ROLES.split(",");
                const member = await interaction.guild.members.fetch(userId);
                const isPremiumForGif = premiumRolesForGif.some(role => member.roles.cache.has(role));
                if (!isPremiumForGif) {
                    return interaction.reply({
                        content: "❌ Seuls les utilisateurs Nitro peuvent soumettre des GIFs en tant qu'emoji.",
                        ephemeral: true,
                    });
                }
            }
        }

        // Vérification des variables d'environnement pour la guilde et le salon de requêtes
        if (!process.env.TARGET_GUILD_ID || !process.env.TARGET_CHANNEL_ID) {
            console.error("❌ Erreur : Les variables d'environnement TARGET_GUILD_ID ou TARGET_CHANNEL_ID ne sont pas définies.");
            return interaction.reply({
                content: "❌ Configuration du bot incorrecte. Contactez un administrateur.",
                ephemeral: true,
            });
        }

        // Récupération de la guilde cible (celle où seront envoyées les demandes)
        const guild = interaction.client.guilds.cache.get(process.env.TARGET_GUILD_ID);
        if (!guild) {
            console.error(`❌ Erreur : Impossible de récupérer la guilde (ID: ${process.env.TARGET_GUILD_ID})`);
            return interaction.reply({
                content: "❌ Erreur : Serveur introuvable. Vérifiez la configuration.",
                ephemeral: true,
            });
        }

        const channel = guild.channels.cache.get(process.env.TARGET_CHANNEL_ID);
        if (!channel) {
            console.error(`❌ Erreur : Salon introuvable (ID: ${process.env.TARGET_CHANNEL_ID})`);
            return interaction.reply({
                content: "❌ Erreur : Le salon de requêtes est introuvable. Vérifiez la configuration et les permissions.",
                ephemeral: true,
            });
        }

        // --- Mise en place du cooldown (1 semaine) pour les utilisateurs non‑staff et non‑premium ---
        const requester = await interaction.guild.members.fetch(userId);
        const staffRoles = process.env.STAFF_ROLE_IDS ? process.env.STAFF_ROLE_IDS.split(',') : [];
        const isStaff = staffRoles.some(role => requester.roles.cache.has(role));
        const premiumRoles = process.env.PREMIUM_ROLES ? process.env.PREMIUM_ROLES.split(',') : [];
        const isPremium = premiumRoles.some(role => requester.roles.cache.has(role));

        const now = Date.now();
        const cooldownTime = 604800000; // 1 semaine en millisecondes

        if (!isStaff && !isPremium) {
            const cooldownRef = ref(db, `cooldowns_requests/${userId}`);
            const cooldownSnapshot = await get(cooldownRef);
            if (cooldownSnapshot.exists()) {
                const lastRequest = cooldownSnapshot.val().lastRequest;
                if (now - lastRequest < cooldownTime) {
                    const remaining = cooldownTime - (now - lastRequest);
                    return interaction.reply({
                        content: `❌ Vous devez attendre ${msToTime(remaining)} avant de soumettre une nouvelle demande. Pour être exempté de ce délai, pensez à vous abonner en boostant le serveur ou de vous abonner au Patreon `,
                        ephemeral: true,
                    });
                }
            }
        }

        // --- Vérification de l'unicité du nom ---
        if (type === 'emoji') {
            const existingEmoji = guild.emojis.cache.find(e => e.name.toLowerCase() === name.toLowerCase());
            if (existingEmoji) {
                return interaction.reply({
                    content: "❌ Un emoji avec ce nom existe déjà. Veuillez choisir un autre nom.",
                    ephemeral: true,
                });
            }
        } else if (type === 'meme') {
            // Normalisation du nom pour la comparaison
            const normalizedName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
            const existingChannel = guild.channels.cache.find(ch => {
                const chNormalized = ch.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                return normalizedName === chNormalized;
            });
            if (existingChannel) {
                return interaction.reply({
                    content: "❌ Un salon avec ce nom existe déjà. Veuillez choisir un autre nom.",
                    ephemeral: true,
                });
            }
        }

        await interaction.deferReply({ ephemeral: true });

        // --- Upload du fichier sur Cloudinary ---
        let uploadedFile;
        try {
            uploadedFile = await cloudinary.uploader.upload(attachment.url, {
                resource_type: 'auto',
                folder: type === 'meme' ? 'discord_memes' : 'discord_emojis',
            });
        } catch (error) {
            console.error('❌ Erreur lors de l\'upload sur Cloudinary :', error);
            return interaction.followUp({
                content: '❌ Erreur lors de l\'upload du fichier.',
                ephemeral: true,
            });
        }

        const fileUrl = uploadedFile.secure_url;
        const refPath = type === 'meme' ? 'memes' : 'emoji_requests';

        // Génération d'un identifiant unique (UUID)
        const uniqueId = uuidv4();
        const itemRef = ref(db, `${refPath}/${uniqueId}`);

        // Construction de l'embed de demande
        const approvalEmbed = new EmbedBuilder()
            .setTitle(`FM REQUESTSᴮᵉᵗᵃ - Nouvelle demande : ${type === 'meme' ? 'meme' : 'emoji'}`)
            .addFields(
                { name: 'Nom', value: name },
                { name: 'Description', value: description },
                { name: 'Demandé par', value: `<@${userId}>` },
                { name: 'Validations', value: `0/${process.env.REQUIRED_VOTES}`, inline: true },
                { name: 'Refus', value: `0/${process.env.REQUIRED_VOTES}`, inline: true }
            )
            .setColor(type === 'meme' ? '#e67e22' : '#3498db');

        if (uploadedFile.resource_type !== 'video') {
            approvalEmbed.setImage(fileUrl);
        }

        // Construction des boutons en incluant l'UUID dans le customId
        const buttons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`approve_${type}_${uniqueId}`)
                    .setLabel('Valider')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`reject_${type}_${uniqueId}`)
                    .setLabel('Refuser')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`close_${type}_${uniqueId}`)
                    .setLabel('📁')
                    .setStyle(ButtonStyle.Secondary)
            );

        try {
            await channel.send({ embeds: [approvalEmbed], components: [buttons] });
        } catch (error) {
            console.error('❌ Erreur lors de l\'envoi des messages Discord :', error);
            return interaction.followUp({
                content: "❌ Une erreur est survenue lors de l'envoi des messages Discord.",
                ephemeral: true,
            });
        }

        // Enregistrement dans Firebase avec ajout du champ "status" et initialisation des votes
        try {
            await set(itemRef, {
                name,
                description,
                url: fileUrl,
                submittedBy: userId,
                publicId: uploadedFile.public_id,
                createdAt: now,
                status: 'en cours',
                votes: { upvotes: 0, downvotes: 0, voters: {} }
            });
        } catch (error) {
            console.error('❌ Erreur lors de l\'enregistrement Firebase :', error);
            return interaction.followUp({
                content: "❌ Erreur lors de l'enregistrement des données.",
                ephemeral: true,
            });
        }

        // Mise à jour du cooldown pour les utilisateurs non‑staff et non‑premium
        if (!isStaff && !isPremium) {
            const cooldownRef = ref(db, `cooldowns_requests/${userId}`);
            await set(cooldownRef, { lastRequest: now });
        }

        return interaction.editReply({
            content: `✅ Votre demande de **${type === 'meme' ? 'meme' : 'emoji'}** a été soumise avec succès.`,
            ephemeral: true,
        });

        // --- Fonction utilitaire pour convertir des millisecondes en format lisible ---
        function msToTime(duration) {
            const seconds = Math.floor((duration / 1000) % 60);
            const minutes = Math.floor((duration / (1000 * 60)) % 60);
            const hours = Math.floor((duration / (1000 * 60 * 60)) % 24);
            const days = Math.floor(duration / (1000 * 60 * 60 * 24));
            return `${days}j ${hours}h ${minutes}m ${seconds}s`;
        }
    },
};
