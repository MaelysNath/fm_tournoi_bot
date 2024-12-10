const { ref, get, update } = require('firebase/database');
const { db } = require('../utils/firebase'); // Import de la configuration Firebase existante

module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        if (!interaction.isButton()) return;

        const userId = interaction.user.id;
        const choice = interaction.customId;

        // Vérifie si l'interaction est liée à la commande "pilule"
        if (choice !== 'pilule_rouge' && choice !== 'pilule_bleue') return;

        try {
            // Répond immédiatement pour éviter les délais d'interaction
            await interaction.deferReply({ ephemeral: true });

            // Référence à la base de données Firebase
            const piluleRef = ref(db, 'pilule');
            const snapshot = await get(piluleRef);

            if (!snapshot.exists()) {
                return interaction.editReply({
                    content: "❌ Les données ne sont pas disponibles. Réessayez plus tard.",
                });
            }

            const data = snapshot.val();

            // Vérifie si l'utilisateur a déjà voté
            if (data.voters && data.voters[userId]) {
                return interaction.editReply({
                    content: "❌ Bien essayé(e)... Mais du as déjà fait ton choix ! Reviens demain pour découvrir ton sort.",
                });
            }

            // Met à jour les votes dans Firebase
            const updatedVotes = { ...data };

            if (choice === 'pilule_rouge') {
                updatedVotes.rouge.votes += 1;
            } else if (choice === 'pilule_bleue') {
                updatedVotes.bleue.votes += 1;
            }

            // Fiche l'utilisateur comme ayant voté
            if (!updatedVotes.voters) updatedVotes.voters = {};
            updatedVotes.voters[userId] = choice;

            await update(piluleRef, updatedVotes);

            return interaction.editReply({
                content: `✅ Tu as choisi la ${choice === 'pilule_rouge' ? '**Pilule Rouge**' : '**Pilule Bleue**'} ! Reviens demain pour découvrir ton sort 👽`,
            });

        } catch (error) {
            console.error("Erreur lors de l'enregistrement du vote :", error);
            return interaction.editReply({
                content: "❌ Une erreur est survenue. Veuillez réessayer plus tard.",
            });
        }
    },
};
