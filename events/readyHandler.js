// events/readyHandler.js
const cron = require('node-cron');
const endContestIfDue = require('./event_end_contest'); // Assurez-vous que le chemin est correct

module.exports = (client) => {
    client.once("ready", async () => {
        console.log("Bot connecté, préparation du déploiement des commandes slash...");
        
        // Ajoutez ici le code de déploiement des commandes, si nécessaire, ou gardez-le dans main.js

        console.log("Vérification immédiate des concours à la connexion...");
        await endContestIfDue(client);

        // Planification quotidienne de la vérification des concours
        cron.schedule('0 0 * * *', () => {
            console.log("Vérification quotidienne pour voir si le concours de mèmes doit être terminé...");
            endContestIfDue(client);
        }, {
            scheduled: true,
            timezone: "Europe/Paris"
        });

        console.log("Bot est prêt et toutes les vérifications sont planifiées !");
    });
};
