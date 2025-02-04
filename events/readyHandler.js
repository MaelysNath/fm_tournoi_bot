// events/readyHandler.js
const cron = require('node-cron');
const endContestIfDue = require('./event_end_contest'); 
const { autoCloseRequests } = require('../utils/autoCloseRequests'); 

module.exports = (client) => {
    client.once("ready", async () => {
        console.log("Bot connecté, préparation du déploiement des commandes slash...");
        

        console.log("Vérification immédiate des concours à la connexion...");
        await endContestIfDue(client);

        console.log("Vérification immédiate de l'auto clôture des demandes...");
        await autoCloseRequests(client);

        // Planification quotidienne de la vérification des concours (à minuit, heure de Paris)
        cron.schedule('0 0 * * *', () => {
            console.log("Vérification quotidienne pour voir si le concours de mèmes doit être terminé...");
            endContestIfDue(client);
        }, {
            scheduled: true,
            timezone: "Europe/Paris"
        });

        // Planification horaire de l'auto clôture des demandes (à chaque heure, heure de Paris)
        cron.schedule('0 * * * *', () => {
            console.log("Exécution horaire de l'auto clôture des demandes...");
            autoCloseRequests(client)
                .then(() => console.log("Auto clôture des demandes exécutée."))
                .catch(err => console.error("Erreur lors de l'auto clôture :", err));
        }, {
            scheduled: true,
            timezone: "Europe/Paris"
        });

        console.log("Bot est prêt et toutes les vérifications sont planifiées !");
    });
};
