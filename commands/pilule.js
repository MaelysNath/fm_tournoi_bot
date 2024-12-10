const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { getDatabase, ref, set } = require("firebase/database");
const path = require('path');
const fs = require('fs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pilule')
        .setDescription('Choix Pilule Rouge ou Pilule Bleue'),
    async execute(interaction) {
        const adminId = process.env.BOT_OWNER_ID;

        if (interaction.user.id !== adminId) {
            return interaction.reply({
                content: "❌ Seul l'administrateur peut utiliser cette commande.",
                ephemeral: true,
            });
        }

        try {
            const db = getDatabase();
            const piluleRef = ref(db, 'pilule');

            // Initialise Firebase
            await set(piluleRef, {
                description: "Dossier pour gérer les choix Pilule Rouge / Pilule Bleue",
                createdAt: new Date().toISOString(),
                rouge: { votes: 0 },
                bleue: { votes: 0 },
            });

            console.log("Dossier 'pilule' créé ou mis à jour dans Firebase.");

            // Chemin vers l'image
            const imagePath = path.resolve(__dirname, '../storage/pilule.png');

            // Vérifie si le fichier existe
            if (!fs.existsSync(imagePath)) {
                throw new Error(`Fichier introuvable : ${imagePath}`);
            }

            const attachment = new AttachmentBuilder(imagePath);

            // Boutons
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('pilule_rouge')
                    .setLabel('Pilule Rouge')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('pilule_bleue')
                    .setLabel('Pilule Bleue')
                    .setStyle(ButtonStyle.Primary)
            );

            // Envoi de l'image et des boutons
            await interaction.channel.send({
                content: "||attachment://pilule.png||",
                files: [attachment],
                components: [row],
            });
        } catch (error) {
            console.error("Erreur dans la commande /pilule :", error);
            return interaction.reply({
                content: "❌ Une erreur est survenue. Vérifie Firebase ou l'image.",
                ephemeral: true,
            });
        }
    },
};
