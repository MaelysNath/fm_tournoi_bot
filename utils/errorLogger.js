// utils/errorLogger.js
const { WebhookClient, EmbedBuilder } = require("discord.js");
require("dotenv").config();

const errorWebhookClient = new WebhookClient({
    id: process.env.ERROR_WEBHOOK_ID,
    token: process.env.ERROR_WEBHOOK_TOKEN
});

async function logErrorToDiscord(error, location = "Non spécifié") {
    const errorEmbed = new EmbedBuilder()
        .setTitle("Erreur détectée")
        .setColor(0xFF0000)
        .addFields(
            { name: "Emplacement", value: location, inline: true },
            { name: "Message d'erreur", value: error.message || "Aucun message", inline: false },
            { name: "Détails", value: `\`\`\`${error.stack || "Pas de stack disponible"}\`\`\``, inline: false }
        )
        .setTimestamp();

    await errorWebhookClient.send({
        content: "🚨 Une erreur s'est produite dans l'application",
        embeds: [errorEmbed]
    });
}

module.exports = { logErrorToDiscord };
