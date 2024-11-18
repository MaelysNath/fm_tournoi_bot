const { SlashCommandBuilder, ChannelType, PermissionsBitField, EmbedBuilder } = require("discord.js");
const { getDatabase, ref, get, update } = require("firebase/database");
const cloudinary = require('cloudinary').v2;
const fetch = require('node-fetch');
require("dotenv").config();

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

module.exports = {
    data: new SlashCommandBuilder()
        .setName('start')
        .setDescription('[STAFF/ADMIN] Démarrer un concours de mème')
        .addStringOption(option =>
            option.setName('contest_id')
                .setDescription("ID unique du concours de mèmes")
                .setRequired(true)),

    async execute(interaction) {
        // Déferer la réponse pour éviter les erreurs de timeout
        await interaction.deferReply({ ephemeral: true });

        const roles = interaction.member.roles.cache;
        const authorizedRoles = [process.env.STAFF_ROLE_ID, process.env.ADMIN_ROLE_ID];
        if (!roles.some(role => authorizedRoles.includes(role.id))) {
            return interaction.followUp({ content: "Vous n'avez pas la permission d'utiliser cette commande.", ephemeral: true });
        }

        const contestId = interaction.options.getString('contest_id');
        const db = getDatabase();
        const contestRef = ref(db, `meme_contests/${contestId}`);
        const contestsRef = ref(db, 'meme_contests');

        try {
            // Vérifier si un concours est déjà en cours
            const snapshot = await get(contestsRef);
            if (snapshot.exists()) {
                const contests = snapshot.val();
                const ongoingContest = Object.values(contests).find(contest => contest.status === 'en cours');
                
                if (ongoingContest) {
                    return interaction.followUp({ content: "Un concours est déjà en cours. Veuillez terminer le concours actuel avant d'en démarrer un nouveau.", ephemeral: true });
                }
            }

            // Vérifier si le concours avec l'ID fourni existe
            const contestSnapshot = await get(contestRef);
            if (!contestSnapshot.exists()) {
                return interaction.followUp({ content: "Aucun concours de mèmes trouvé avec cet ID.", ephemeral: true });
            }

            const contest = contestSnapshot.val();
            const categoryId = process.env.CONTEST_CATEGORY_ID;
            const guild = interaction.guild;
            const categoryChannel = guild.channels.cache.get(categoryId);

            if (!categoryChannel || categoryChannel.type !== ChannelType.GuildCategory) {
                return interaction.followUp({ content: "La catégorie spécifiée pour le concours est introuvable ou n'est pas une catégorie valide.", ephemeral: true });
            }

            // Créer le salon pour le concours sous la catégorie spécifiée
            const channelName = `concours-${contest.title.toLowerCase().replace(/\s+/g, '-')}`;
            const contestChannel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: categoryId,
                permissionOverwrites: categoryChannel.permissionOverwrites.cache.map(overwrite => ({
                    id: overwrite.id,
                    allow: overwrite.allow,
                    deny: overwrite.deny,
                    type: overwrite.type
                }))
            });

            // Télécharger l'image sur Cloudinary pour obtenir un lien permanent
            let uploadedImageUrl;
            try {
                const response = await fetch(contest.images.image1);
                if (!response.ok) {
                    throw new Error(`Erreur lors de la récupération de l'image : ${response.statusText}`);
                }
                const arrayBuffer = await response.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);

                // Utiliser un stream pour télécharger l'image sur Cloudinary
                const uploadResult = await new Promise((resolve, reject) => {
                    const uploadStream = cloudinary.uploader.upload_stream(
                        { folder: "meme_contests" },
                        (error, result) => {
                            if (error) {
                                console.error("Erreur lors du téléchargement sur Cloudinary:", error);
                                return reject(new Error("Erreur lors du téléchargement de l'image sur Cloudinary"));
                            }
                            resolve(result);
                        }
                    );
                    uploadStream.end(buffer);
                });

                uploadedImageUrl = uploadResult.secure_url;
            } catch (error) {
                console.error("Erreur lors du téléchargement de l'image sur Cloudinary:", error);
                return interaction.followUp({ content: "Une erreur est survenue lors du téléchargement de l'image. Veuillez réessayer.", ephemeral: true });
            }

            // Créer l'embed principal avec les informations du concours
            const contestEmbed = new EmbedBuilder()
                .setTitle(contest.title)
                .setDescription(contest.description)
                .addFields(
                    { name: "Date Limite", value: contest.deadline },
                    { name: "Récompenses", value: contest.rewards || "Aucune" },
                    { name: "Organisé par", value: contest.organizer.pseudo }
                )
                .setFooter({ text: `ID du concours: ${contestId}` })
                .setColor(0x00FF00);

            // Créer l'embed de l'image du concours
            const imageEmbed = new EmbedBuilder()
                .setTitle("Image à télécharger et à modifier")
                .setImage(uploadedImageUrl)
                .setColor(0x00FF00)
                .setFooter({ text: "Pour participer: tapez /submit" });

            // Envoyer les embeds dans le nouveau salon
            await contestChannel.send({ embeds: [contestEmbed] });
            await contestChannel.send({ embeds: [imageEmbed] });

            const rulesEmbed = new EmbedBuilder()
                .setTitle("Règlement du Concours")
                .setDescription("Veuillez suivre les règles ci-dessous pour participer au concours.")
                .addFields(
                    { name: "1. Respect", value: "Soyez respectueux·euses envers tous les participant·e·s et organisateur·rice·s du concours." },
                    { name: "2. Contenu Original", value: "Les mèmes soumis doivent être de votre propre création. Aucun plagiat ne sera toléré." },
                    { name: "3. Image de Base", value: "Utilisez l'image fournie pour créer votre mème." },
                    { name: "4. Limite de Soumissions", value: "Chaque participant·e ne peut soumettre qu'un mème." },
                    { name: "5. Date Limite", value: "Les soumissions doivent être faites avant la date limite spécifiée." },
                    { name: "6. Critères de Jugement", value: "Les mèmes seront évalués en fonction de l'originalité, de l'humour et de la créativité." }
                )
                .setFooter({ text: "Assurez-vous de bien lire et respecter toutes les règles de FRANCE MEMES." })
                .setColor(0xFF5733);

            // Envoyer l'embed du règlement dans le salon du concours
            await contestChannel.send({ embeds: [rulesEmbed] });

            // Créer un salon pour soumettre les mèmes sous la même catégorie
            const submissionChannelName = `🎉┃${contest.title.toLowerCase().replace(/\s+/g, '-')}`;
            const submissionChannel = await guild.channels.create({
                name: submissionChannelName,
                type: ChannelType.GuildText,
                parent: categoryId,
                permissionOverwrites: categoryChannel.permissionOverwrites.cache.map(overwrite => ({
                    id: overwrite.id,
                    allow: overwrite.allow,
                    deny: overwrite.deny,
                    type: overwrite.type
                }))
            });

            // Ajouter l'ID du salon de soumission dans la base de données et changer le statut à "en cours"
            await update(contestRef, {
                submissionChannelId: submissionChannel.id,
                status: 'en cours'
            });

            // Envoyer une confirmation
            await interaction.followUp({ content: `Le concours de mèmes "${contest.title}" a été démarré avec succès dans le salon ${contestChannel}. Un salon de soumissions a été créé : ${submissionChannel}.`, ephemeral: true });
        } catch (error) {
            console.error("Erreur lors du démarrage du concours de mèmes:", error);
            await interaction.followUp({ content: "Il y a eu une erreur lors du démarrage du concours de mèmes. Veuillez réessayer.", ephemeral: true });
        }
    }
};
