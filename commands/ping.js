const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription("Affiche des informations avancées sur la latence et les performances de l'app"),
    async execute(interaction) {
        // Récupération de la latence de l'API
        const apiLatency = Math.round(interaction.client.ws.ping);

        // Mesure du délai de réponse en créant un message temporaire
        const message = await interaction.reply({ content: 'Calcul de la latence...', fetchReply: true });
        const botLatency = message.createdTimestamp - interaction.createdTimestamp;

        // Création de l'embed avec les informations de latence
        const pingEmbed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('Pong ! 🏓')
            .setDescription("Voici les informations avancées sur la latence et les performances.")
            .addFields(
                { name: 'Latence du Bot', value: `${botLatency}ms`, inline: true },
                { name: 'Latence de l\'API Discord', value: `${apiLatency}ms`, inline: true },
                { name: 'Uptime du Bot', value: `<t:${Math.floor(interaction.client.readyTimestamp / 1000)}:R>`, inline: false },
                { name: 'Mémoire utilisée', value: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`, inline: true },
                { name: 'Nombre de serveurs', value: `${interaction.client.guilds.cache.size}`, inline: true }
            )
            .setFooter({ text: 'Merci de vérifier la latence !' })
            .setTimestamp();

        // Modification de la réponse pour y inclure l'embed
        await interaction.editReply({ content: null, embeds: [pingEmbed] });
    },
};
