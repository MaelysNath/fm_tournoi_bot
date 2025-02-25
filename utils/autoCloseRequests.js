// services/autoCloseRequest.js
const { db, ref, get, update } = require('./firebase');
const { WebhookClient } = require('discord.js');
const axios = require('axios');
const { closeRequest } = require('../utils/closureManager');

/**
 * Fonction d'auto‑clôture des demandes.
 * Elle ferme les demandes si :
 *  - Le seuil de votes (REQUIRED_VOTES) est atteint
 *  - OU 7 jours se sont écoulés
 *
 * @param {Client} client - L'instance du client Discord.
 */
async function autoCloseRequests(client) {
  const now = Date.now();
  const ONE_WEEK = 604800000; // 7 jours en millisecondes
  const requiredVotes = parseInt(process.env.REQUIRED_VOTES, 10);

  // --- Traitement des demandes d'emoji ---
  const emojiRequestsRef = ref(db, 'emoji_requests');
  const emojiSnapshot = await get(emojiRequestsRef);
  if (emojiSnapshot.exists()) {
    const emojiRequests = emojiSnapshot.val();
    for (const key in emojiRequests) {
      const request = emojiRequests[key];
      if (request.status !== 'en cours') continue;
      const upvotes = request.votes?.upvotes || 0;
      const downvotes = request.votes?.downvotes || 0;

      if ((upvotes >= requiredVotes || downvotes >= requiredVotes) || (now - request.createdAt >= ONE_WEEK)) {
        console.log(`Auto‑clôture de la demande d'emoji "${request.name}" (ID: ${key})`);
        await closeRequest({
          guild: client.guilds.cache.get(process.env.TARGET_GUILD_ID),
          channel: client.channels.cache.get(process.env.TARGET_CHANNEL_ID),
          message: null,
          type: 'emoji',
          uniqueId: key,
          itemData: request,
          currentVotes: { upvotes, downvotes, voters: request.votes?.voters || {} }
        });
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
      if (request.status !== 'en cours') continue;
      const upvotes = request.votes?.upvotes || 0;
      const downvotes = request.votes?.downvotes || 0;

      if ((upvotes >= requiredVotes || downvotes >= requiredVotes) || (now - request.createdAt >= ONE_WEEK)) {
        console.log(`Auto‑clôture de la demande de meme "${request.name}" (ID: ${key})`);
        await closeRequest({
          guild: client.guilds.cache.get(process.env.TARGET_GUILD_ID),
          channel: client.channels.cache.get(process.env.TARGET_CHANNEL_ID),
          message: null,
          type: 'meme',
          uniqueId: key,
          itemData: request,
          currentVotes: { upvotes, downvotes, voters: request.votes?.voters || {} }
        });
      }
    }
  }
}

module.exports = { autoCloseRequests };
