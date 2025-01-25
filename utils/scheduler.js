const { db, ref, get, remove } = require('../utils/firebase');
const cloudinary = require('cloudinary').v2;

module.exports = async () => {
    setInterval(async () => {
        try {
            const memesRef = ref(db, 'memes');
            const snapshot = await get(memesRef);

            if (snapshot.exists()) {
                const memes = snapshot.val();
                const now = Date.now();

                for (const memeKey in memes) {
                    const meme = memes[memeKey];
                    const createdAt = meme.createdAt || 0;

                    // Vérification de l'expiration (7 jours)
                    if (now - createdAt > 7 * 24 * 60 * 60 * 1000) {
                        // Supprimer le meme de Firebase et Cloudinary
                        await cloudinary.uploader.destroy(meme.publicId);
                        await remove(ref(db, `memes/${memeKey}`));
                        console.log(`Meme expiré supprimé : ${memeKey}`);
                    }
                }
            }
        } catch (error) {
            console.error('Erreur lors de la vérification des memes expirés :', error);
        }
    }, 60 * 60 * 1000); // Exécute toutes les heures
};
