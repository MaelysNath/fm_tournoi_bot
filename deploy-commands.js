const { REST, Routes } = require('discord.js');
const fs = require('fs');
require('dotenv').config();

const commands = [];
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));



// Charger les commandes
for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    if (command.data) {
        commands.push(command.data.toJSON());
        console.log(`Commande ajoutée: ${command.data.name}`);
    } else {
        console.error(`La commande dans le fichier ${file} n'a pas d'objet "data". Elle ne sera pas chargée.`);
    }
}

// Déployer les commandes Slash
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
    try {
        console.log('Déploiement des commandes slash en cours...');

        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands },
        );

        console.log('Commandes slash déployées avec succès!');
    } catch (error) {
        console.error('Erreur lors du déploiement des commandes slash:', error);
    }
})();
