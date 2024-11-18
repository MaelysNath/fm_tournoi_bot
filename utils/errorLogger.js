const { WebhookClient, EmbedBuilder } = require("discord.js");
require("dotenv").config();

const errorWebhookClient = new WebhookClient({
    id: process.env.ERROR_WEBHOOK_ID,
    token: process.env.ERROR_WEBHOOK_TOKEN
});

async function logErrorToDiscord(error, location = "Non spécifié") {
    // Limite la longueur de la stack à 1024 caractères
    let stackMessage = error.stack || "Pas de stack disponible";
    if (stackMessage.length > 1024) {
        stackMessage = stackMessage.substring(0, 1020) + "... (tronqué)";
    }

    const errorEmbed = new EmbedBuilder()
        .setTitle("Erreur détectée")
        .setColor(0xFF0000)
        .addFields(
            { name: "Emplacement", value: location, inline: true },
            { name: "Message d'erreur", value: error.message || "Aucun message", inline: false },
            { name: "Détails", value: `\`\`\`${stackMessage}\`\`\``, inline: false }
        )
        .setTimestamp();

    try {
        await errorWebhookClient.send({
            content: "🚨 Une erreur s'est produite dans l'application",
            embeds: [errorEmbed]
        });
    } catch (webhookError) {
        console.error("Erreur lors de l'envoi du message d'erreur au webhook :", webhookError);
    }
}

module.exports = { logErrorToDiscord };
