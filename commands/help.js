const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
require('dotenv').config();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Affiche la liste des commandes disponibles en fonction de vos rôles'),

    async execute(interaction) {
       
        const botOwnerId = process.env.BOT_OWNER_ID; 

        // Liste des commandes avec leur niveau d'accès requis
        const commands = [
            { name: '/about', description: "Afficher les informations sur l'application.", roles: [] },
            { name: '/ping', description: "Afficher des informations avancées sur la latence et les performances de l'app.", roles: [] },
            { name: '/contests', description: 'Afficher la liste complète des concours.', roles: ['MOD','STAFF','ADMIN', 'OWNER'] },
            { name: '/create_meme_contest', description: 'Créer un concours de mèmes.', roles: ['STAFF', 'ADMIN', 'OWNER'] },
            { name: '/edit_contest', description: 'Modifier un concours de mèmes existant.', roles: ['STAFF', 'ADMIN', 'OWNER'] },
            { name: '/end_contest', description: 'Forcer la fin d\'un concours de mèmes en cours.', roles: ['STAFF', 'ADMIN', 'OWNER'] },
            { name: '/forgive', description: 'Retirer votre participation au concours de mèmes.', roles: [] },
            { name: '/history', description: 'Options de navigation et suppression.', roles: ['STAFF','ADMIN', 'OWNER'] },
            { name: '/leaderboard_contest', description: 'Afficher le classement des participant⸱e⸱s du concours de mèmes (top 10).', roles: [] },
            { name: '/mod_contest', description: 'Prendre des actions de modération.', roles: ['MOD','STAFF','ADMIN', 'OWNER'] },
            { name: '/start', description: 'Démarrer un concours de mèmes.', roles: ['STAFF', 'ADMIN', 'OWNER'] },
            { name: '/statuts', description: 'Afficher le statut d\'un concours de mèmes.', roles: [] },
            { name: '/submit', description: 'Soumettre un mème pour le concours.', roles: ['STAFF', 'ADMIN', 'OWNER'] },
            { name: '/view', description: 'Afficher les informations de la participation à un concours de mèmes.', roles: [] },
            
        ];

        // Identifiants des rôles de votre serveur
        const roleIds = {
            STAFF: process.env.STAFF_ROLE_ID, 
            MOD: process.env.MOD_ROLE_ID,     
            ADMIN: process.env.ADMIN_ROLE_ID, 
            OWNER: interaction.guild.ownerId 
        };

        // Vérifier les rôles de l'utilisateur exécutant la commande
        const memberRoles = interaction.member.roles.cache;
        const isOwner = interaction.user.id === roleIds.OWNER || interaction.user.id === botOwnerId;
        const isAdmin = memberRoles.has(roleIds.ADMIN) || isOwner;
        const isMod = memberRoles.has(roleIds.MOD) || isAdmin;
        const isStaff = memberRoles.has(roleIds.STAFF) || isMod || isAdmin;

        // Filtrer les commandes en fonction des rôles
        const accessibleCommands = commands.filter(command => {
            if (command.roles.length === 0) return true; // Commande accessible à tous
            if (command.roles.includes('OWNER') && isOwner) return true;
            if (command.roles.includes('ADMIN') && isAdmin) return true;
            if (command.roles.includes('MOD') && isMod) return true;
            if (command.roles.includes('STAFF') && isStaff) return true;
            return false;
        });

        // Créer un embed pour afficher les commandes
        const helpEmbed = new EmbedBuilder()
            .setTitle('📜 Liste des Commandes')
            .setDescription("Voici les commandes disponibles en fonction de vos rôles.")
            .setColor(0x00FF00)
            .setTimestamp();

        // Ajouter les commandes filtrées dans l'embed
        accessibleCommands.forEach(command => {
            helpEmbed.addFields({
                name: command.name,
                value: command.description,
                inline: false
            });
        });

        // Envoyer l'embed
        await interaction.reply({ embeds: [helpEmbed], ephemeral: true });
    }
};
