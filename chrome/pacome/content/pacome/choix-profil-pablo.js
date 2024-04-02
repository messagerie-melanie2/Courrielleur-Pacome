ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource://gre/modules/mceMigrationPablo.jsm");


// démarrage de la fenêtre choix-profil-pablo
// effacer fichier de données si existe
// mettre le dernier profil utilisé en premier
// sélectionner le premier
function InitChoixProfil(){

	mceMigrationMCE.DelInfosMigration();

	let liste=document.getElementById("profils");

	let nbpablo=mceMigrationMCE.ListeProfilsPABLO(true);
	if (0==nbpablo) return; // devrait pas
	let tps=0, index=0;
	for (var i=0; i<nbpablo; i++){
		if (mceMigrationMCE.pablo_datesprefs[i]>tps){
			tps=mceMigrationMCE.pablo_datesprefs[i];
			index=i;
		}
	}

	liste.selectItem(AjouteProfil(liste, index));

	for (i=0; i<nbpablo; i++){
		if (i==index) continue;
		AjouteProfil(liste, i);
	}
}

// liste : lisbox
// index :  index dans mceMigrationMCE.pablo_xxx
function AjouteProfil(liste, index){
	let tps=mceMigrationMCE.pablo_datesprefs[index];
	let dt=new Date(tps);
	let libelle=mceMigrationMCE.pablo_comptes[index]+" ("+dt.toLocaleDateString("fr-FR")+")";
	return liste.appendItem(libelle, mceMigrationMCE.pablo_noms[index]);
}


// l'utilisateur a choisi un profil à migrer
// extraire les informations pour la migration
function mceValideProfil(){

	let profils=document.getElementById("profils");
  let profil=profils.selectedItem.value;

	if (null==profil || ""==profil){
		return;
	}

	// lecture de infos Pablo et construction fichier infosPablo.json
	Services.console.logStringMessage("*** mceValideProfil profil:'"+profil+"'");
	let res=mceMigrationMCE.CreeInfosPablo(profil);

	if (!res){
		PacomeMsgNotif("Migration Pablo - Erreur", "Le courrielleur n'a pas pu lire les informations du profil Pablo. Le profil ne peut pas être migré.");
		Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
		return;
	}

	// Paramétrage des carnets
	// fait ici pour des raison de chargement des carnets
	res=mceMigrationMCE.ParametrageCarnets();

	if (!res){
		PacomeMsgNotif("Migration Pablo - Erreur", "Le courrielleur n'a pas pu paramétrer les carnets d'adresse. Le profil ne peut pas être migré.");
		// remet les prefs user à 0
		Services.prefs.resetPrefs();
		Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
		return;
	}

	close();
}



// lorsque l'utilisateur clique sur Ignorer
function mceIgnorerProfil(){

	// supprimer le fichier de données
	mceMigrationMCE.DelInfosMigration();

	mceMigrationMCE._infosPablo=null;

	close();
}
