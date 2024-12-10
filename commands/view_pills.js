const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { ref, get } = require('firebase/database');
const { db } = require('../utils/firebase');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('view_pills')
        .setDescription('Affiche les votes pour Pilule Rouge et Pilule Bleue'),
    async execute(interaction) {
        const adminId = process.env.BOT_OWNER_ID; // Assurez-vous que l'ID de l'admin est dans .env

        // Vérifie si l'utilisateur est l'administrateur
        if (interaction.user.id !== adminId) {
            return interaction.reply({
                content: "❌ Seul l'administrateur peut exécuter cette commande.",
                ephemeral: true,
            });
        }

        try {
            // Référence à la base de données Firebase
            const piluleRef = ref(db, 'pilule');
            const snapshot = await get(piluleRef);

            if (!snapshot.exists()) {
                return interaction.reply({
                    content: "❌ Les données ne sont pas disponibles.",
                    ephemeral: true,
                });
            }

            const data = snapshot.val();

            // Vérifie que les votes existent
            const rougeVotes = data.rouge?.votes || 0;
            const bleueVotes = data.bleue?.votes || 0;

            // Création de l'embed
            const embed = new EmbedBuilder()
                .setTitle("Statistiques des Pilules")
                .setColor(0x0099ff)
                .setDescription("Voici le nombre de votants pour chaque pilule :")
                .addFields(
                    { name: "🔴 Pilule Rouge", value: `${rougeVotes} vote(s)`, inline: true },
                    { name: "🔵 Pilule Bleue", value: `${bleueVotes} vote(s)`, inline: true },
                )
                .setTimestamp()
                .setFooter({ text: "Résumé des votes", iconURL: interaction.client.user.displayAvatarURL() });

            // Répondre avec l'embed
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error("Erreur lors de la récupération des données Firebase :", error);
            return interaction.reply({
                content: "❌ Une erreur est survenue lors de la récupération des données.",
                ephemeral: true,
            });
        }
    },
};
