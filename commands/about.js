const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('about')
        .setDescription("Affiche les informations sur l'application"),
    async execute(interaction) {
        const botUser = interaction.client.user; // Récupère l'utilisateur du bot
        
        // Créer un embed avec les informations du bot
        const aboutEmbed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle(`À propos de ${botUser.username}`)
            .setDescription("Voici quelques informations sur moi et mon développement !")
            .setThumbnail(botUser.displayAvatarURL()) // Affiche la photo de profil du bot
            .addFields(
                { name: 'Nom du Bot', value: botUser.username, inline: true },
                { name: 'Développeuse', value: 'MaelysNath', inline: true },
                { name: 'Description', value: "Je suis une appllication Discord créée spécialement pour le concours de mèmes avec différentes commandes utiles pour France Memes. Mon développement a été grandement facilité par MaelysNath, avec l'aide précieuse de ChatGPT pour le code !", inline: false },
                { name: 'Code Source', value: '[Lien vers le code source](https://github.com/MaelysNath/fm_tournoi_bot)', inline: false }
            )
            .setFooter({ text: 'Inspirée du plugin du WTPBot (memes contests) Dev par Lotharie.' });

        // Répondre avec l'embed en message privé à l'utilisateur
        await interaction.reply({ embeds: [aboutEmbed], ephemeral: true });
    },
};
