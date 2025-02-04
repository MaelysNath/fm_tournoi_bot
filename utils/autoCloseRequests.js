
const { db, ref, get, update } = require('./firebase');
const { WebhookClient } = require('discord.js');
const axios = require('axios');

/**
 * Fonction d'auto‑clôture des demandes après 2 semaines de votes.
 * Pour les demandes d'emoji : si acceptées, l'emoji est créé et la demande clôturée.
 * Pour les demandes de meme : 
 *   - si la majorité des votes est positive, le message d'alerte est envoyé via webhook et, 
 *     si possible, les boutons (sauf "Archive") sont désactivés.
 *   - si la majorité des votes est négative, la demande est clôturée comme pour les emojis.
 * 
 * @param {Client} client - L'instance du client Discord.
 */
async function autoCloseRequests(client) {
  const now = Date.now();
  const twoWeeks = 1209600000; // 2 semaines en millisecondes

  // --- Traitement des demandes d'emoji ---
  const emojiRequestsRef = ref(db, 'emoji_requests');
  const emojiSnapshot = await get(emojiRequestsRef);
  if (emojiSnapshot.exists()) {
    const emojiRequests = emojiSnapshot.val();
    for (const key in emojiRequests) {
      const request = emojiRequests[key];
      if (request.status === 'en cours' && now - request.createdAt >= twoWeeks) {
        console.log(`Auto-clôture de la demande d'emoji "${request.name}" (ID: ${key})`);
        const upvotes = request.votes?.upvotes || 0;
        const downvotes = request.votes?.downvotes || 0;
        const isAccepted = upvotes > downvotes;
        const itemRef = ref(db, `emoji_requests/${key}`);
        await update(itemRef, { status: 'terminé' });

        if (isAccepted) {
          try {
            const guild = client.guilds.cache.get(process.env.TARGET_GUILD_ID);
            if (!guild) {
              console.error('AutoClose: guilde non trouvée.');
              continue;
            }
            // Récupérer le fichier depuis l'URL pour créer l'emoji
            const response = await axios.get(request.url, { responseType: 'arraybuffer' });
            const buffer = Buffer.from(response.data, 'binary');
            const newEmoji = await guild.emojis.create({ attachment: buffer, name: `fm_${itemData.name}` });
            console.log(`Emoji "${newEmoji.name}" ajouté avec succès.`);
            const webhookClient = new WebhookClient({ url: process.env.WEBHOOK_NOTIFICATION_URL });
            await webhookClient.send({
              content: `# <:fmLogo:1113551418847133777> Un nouvel emoji a été automatiquement approuvé et ajouté : **${newEmoji.name}**`,
              username: 'Auto Closure Bot'
            });
          } catch (err) {
            console.error(`Erreur lors de l'ajout de l'emoji "${request.name}" :`, err);
          }
        } else {
          console.log(`La demande d'emoji "${request.name}" n'a pas été acceptée (upvotes: ${upvotes}, downvotes: ${downvotes}).`);
          // Optionnel : notification de refus par webhook, si souhaité.
        }
      }
    }
  }

  // --- Traitement des demandes de meme ---
  const memeRequestsRef = ref(db, 'memes');
  const memeSnapshot = await get(memeRequestsRef);
  if (memeSnapshot.exists()) {
    const memeRequests = memeSnapshot.val();
    for (const key in memeRequests) {
      const request = memeRequests[key];
      if (request.status === 'en cours' && now - request.createdAt >= twoWeeks) {
        const upvotes = request.votes?.upvotes || 0;
        const downvotes = request.votes?.downvotes || 0;

        if (upvotes > downvotes) {
          // Demande approuvée : aucun changement de statut,
          // mais on envoie un avertissement et on désactive les boutons sauf "Archive".
          console.log(`Alerte pour la demande de meme "${request.name}" approuvée (upvotes: ${upvotes}, downvotes: ${downvotes}).`);

          // Si l'ID du message a été stocké, tenter de désactiver les boutons.
          if (request.messageId) {
            try {
              const targetChannel = client.channels.cache.get(process.env.TARGET_CHANNEL_ID);
              if (targetChannel) {
                const requestMessage = await targetChannel.messages.fetch(request.messageId);
                if (requestMessage) {
                  const updatedComponents = requestMessage.components.map(row => {
                    // Pour chaque bouton du row, on désactive ceux qui n'ont pas un customId commençant par "close_"
                    row.components = row.components.map(button => {
                      if (!button.customId.startsWith('close_')) {
                        button.setDisabled(true);
                      }
                      return button;
                    });
                    return row;
                  });
                  await requestMessage.edit({ components: updatedComponents });
                  console.log(`Boutons mis à jour pour la demande de meme "${request.name}".`);
                }
              }
            } catch (err) {
              console.error(`Erreur lors de la mise à jour des boutons pour la demande de meme "${request.name}" :`, err);
            }
          }

          // Envoi d'un message d'alerte via webhook dans un autre salon,
          // mentionnant un rôle et listant les procédures à suivre.
          const proceduresText = "Procédures à suivre :\n- Vérifiez la cohérence du contenu\n- Publiez le meme dans le canal dédié\n- Archivez la demande dans le système";
          const roleMention = `<@&${process.env.MEME_TOUR_ROLE_ID}>`;
          const webhookClient = new WebhookClient({ url: process.env.WEBHOOK_MEMES_ACCEPT_URL });
          await webhookClient.send({
            content: `${roleMention}\nLa demande de memes tour **${request.name}** a été approuvée après 2 semaines de votes.\n${proceduresText}`,
            username: 'Auto Closure Bot'
          });
        } else {
          // Demande refusée : on clôture la demande et on envoie le message de refus.
          console.log(`Auto-clôture pour la demande de meme "${request.name}" refusée (upvotes: ${upvotes}, downvotes: ${downvotes}).`);
          const itemRef = ref(db, `memes/${key}`);
          await update(itemRef, { status: 'terminé' });
          const refusalText = "La demande a reçu majoritairement des votes négatifs et est donc refusée.";
          const webhookClient = new WebhookClient({ url: process.env.WEBHOOK_MEMES_REJECT_URL });
          await webhookClient.send({
            content: `La demande de memes tour **${request.name}** a été refusée après 2 semaines de votes.\n${refusalText}`,
            username: 'Auto Closure Bot'
          });
        }
      }
    }
  }
}

module.exports = { autoCloseRequests };
