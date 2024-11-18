// utils/firebase.js
const { initializeApp } = require("firebase/app");
const { getDatabase, ref, get, update, increment } = require("firebase/database");
require("dotenv").config(); // Charger les variables d'environnement

// Configuration Firebase
const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID
};

// Initialisation de Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Vérification d'accès sécurisé
const BOT_SECRET = process.env.FIREBASE_BOT_SECRET; // Le même que dans Firebase

async function verifyAccess() {
    try {
        const secretRef = ref(db, '/bot_secret');
        const snapshot = await get(secretRef);
        if (snapshot.exists() && snapshot.val() === BOT_SECRET) {
            return true; // Accès autorisé
        } else {
            return false; // Accès refusé
        }
    } catch (error) {
        console.error("Erreur lors de la vérification d'accès :", error);
        throw error;
    }
}

// Fonction utilitaire pour les opérations sécurisées
async function performSecureOperation() {
    const isVerified = await verifyAccess();
    if (!isVerified) {
        console.log("Accès refusé !");
        throw new Error("Accès non autorisé");
    }

    // Opérations sécurisées ici
    console.log("Opération autorisée, accès sécurisé.");
}

// Exportation des éléments nécessaires
module.exports = { db, ref, get, update, increment, verifyAccess, performSecureOperation };
