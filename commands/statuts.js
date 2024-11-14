const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getDatabase, ref, get } = require("firebase/database");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('Afficher le statut d\'un concours de mèmes')
        .addStringOption(option =>
            option.setName('contest_id')
                .setDescription("ID unique du concours de mèmes")
                .setRequired(true)),
    async execute(interaction) {
        const contestId = interaction.options.getString('contest_id');
        const db = getDatabase();
        const dbRef = ref(db, `meme_contests/${contestId}`);

        try {
            const snapshot = await get(dbRef);
            if (!snapshot.exists()) {
                return interaction.reply({ content: "Aucun concours de mèmes trouvé avec cet ID", ephemeral: true });
            }

            const contest = snapshot.val();
            const embed = new EmbedBuilder()
                .setTitle(`Statut du Concours de Mèmes: ${contest.title}`)
                .addFields(
                    { name: "Description", value: contest.description },
                    { name: "Date Limite", value: contest.deadline },
                    { name: "Récompenses", value: contest.rewards || "Aucune" },
                    { name: "Organisé par", value: contest.organizer.pseudo },
                    { name: "Statut", value: contest.status }
                )
                .setColor(0x00FF00);
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error("Erreur lors de la récupération du statut du concours de mèmes:", error);
            await interaction.reply({ content: "Il y a eu une erreur lors de la récupération du statut du concours de mèmes.", ephemeral: true });
        }
    }
};