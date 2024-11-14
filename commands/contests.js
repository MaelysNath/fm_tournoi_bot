const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getDatabase, ref, get } = require("firebase/database");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('contests')
        .setDescription('[STAFF+] Affiche la liste complète des concours'),

    async execute(interaction) {
        // Vérifier si l'utilisateur a les rôles nécessaires
        const roles = interaction.member.roles.cache;
        const authorizedRoles = [process.env.STAFF_ROLE_ID, process.env.ADMIN_ROLE_ID];
        if (!roles.some(role => authorizedRoles.includes(role.id))) {
            return interaction.reply({ content: "Vous n'avez pas la permission pour utiliser cette commande.", ephemeral: true });
        }

        // Déférer la réponse pour éviter les erreurs de timeout
        await interaction.deferReply();

        // Obtenir les concours depuis la base de données
        const db = getDatabase();
        const contestsRef = ref(db, 'meme_contests');

        // Fonction pour obtenir l'emoji en fonction du statut
        const getStatusEmoji = (status) => {
            switch (status) {
                case "en cours":
                    return "🟢"; // Emoji pour en cours
                case "prêt":
                    return "⏳"; // Emoji pour prêt
                case "terminé":
                    return "✅"; // Emoji pour terminé
                default:
                    return "❔"; // Emoji pour inconnu
            }
        };

        try {
            const snapshot = await get(contestsRef);
            if (!snapshot.exists()) {
                return interaction.followUp({ content: "Aucun concours de mèmes n'a été trouvé.", ephemeral: true });
            }

            const contests = snapshot.val();

            // Créer un embed esthétique pour lister tous les concours
            const contestsEmbed = new EmbedBuilder()
                .setTitle("📜 Liste des Concours de Mèmes")
                .setDescription("Voici la liste complète des concours de mèmes avec leurs informations détaillées.")
                .setColor(0x1D82B6)
                .setThumbnail(interaction.guild.iconURL())  // Ajoute une icône de la guilde
                .setFooter({ text: "Concours de Mèmes - Gestion du Staff", iconURL: interaction.client.user.displayAvatarURL() })
                .setTimestamp();

            // Ajouter chaque concours à l'embed avec une présentation esthétique
            for (const [id, contest] of Object.entries(contests)) {
                const participantCount = contest.participants ? Object.keys(contest.participants).length : 0;
                const organizer = contest.organizer?.pseudo || "Inconnu";
                const statusEmoji = getStatusEmoji(contest.status); // Obtenir l'emoji basé sur le statut

                contestsEmbed.addFields({
                    name: `🏆 ${contest.title} ${statusEmoji}`,
                    value: `**ID du Concours :** \`${id}\`\n**Date Limite :** ${contest.deadline}\n**Statut :** ${statusEmoji} ${contest.status}\n**Organisé par :** ${organizer}\n**Participant⸱e⸱s :** ${participantCount}`,
                    inline: false
                });
            }

            // Envoyer l'embed dans le canal
            await interaction.followUp({ embeds: [contestsEmbed] });
        } catch (error) {
            console.error("Erreur lors de la récupération des concours:", error);
            await interaction.followUp({ content: "Une erreur est survenue lors de la récupération de la liste des concours.", ephemeral: true });
        }
    }
};
