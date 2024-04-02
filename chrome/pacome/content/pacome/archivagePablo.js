/*
	Fichier pour la migration Pablo
	Archivage des boites et dossiers locaux
	// on entend par dossiers locaux, dossier local un compte thunderbird
*/

ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource:///modules/mailServices.js");
ChromeUtils.import("resource://gre/modules/mceMigrationPablo.jsm");
ChromeUtils.import("resource://gre/modules/FileUtils.jsm");
ChromeUtils.import("resource://gre/modules/NetUtil.jsm");


const mce_marge_disque=1000*1000*1000;//espace disque à préserver

const timeout_oper=5000;// valeur pour setTimeout pour les opérations d'archivage
const timer_interval=5000;// interval pour le timer de fin de copie de fichiers

// true si opérations terminées
var gTermine=false;
var gfncRappel=null;

function ArchivagePablo(fncrappel=null){

	window.arguments[0].res=0;// cas clic sur X

	gfncRappel=fncrappel;

	g_message=document.getElementById("message");

	mceMigrationMCE.logMsg("Archivage des boites et dossiers Pablo");

	archiveBoitesDossiers.Init();

	mceMigrationMCE.logMsg("Vérification de l'espace disque");
	MessageUI("Vérification de l'espace disque");

	archiveBoitesDossiers.VerifieEspaceDisque();
}


// affichage message dans l'interface
var g_message;
function MessageUI(msg){

	g_message.textContent=msg;
}


// affiche le message d'erreur
// sur le bouton Quitter appel FinArchivagePablo avec false
function MessageUIErreur(msg){

	g_message.textContent=msg;

	document.getElementById("pacome.btQuitter").setAttribute("oncommand", "FinArchivagePablo(false);");
	document.getElementById("cadreVu").setAttribute("hidden", true);

	PacomeMsgNotif(PacomeMessageFromId("ErreurArchivagePablo"), msg);
	FinArchivagePablo(false);
}


function FinArchivagePablo(result){

	Services.console.logStringMessage("*** FinArchivagePablo result:"+(result?"SUCCES":"ERREUR"));

	if (result){
		MessageUI("Archivage des boites et dossiers Pablo terminé avec succès");
	}

	document.getElementById("cadreVu").setAttribute("hidden", true);

	if (window.arguments && window.arguments[0])
		window.arguments[0].res=result?1:0;

	gTermine=true;

	if (gfncRappel)
		gfncRappel();
}



var archiveBoitesDossiers={

	// index de boite ou dossier (_infosPablo.boites/_infosPablo.dossiers)
	_index:0,

	// convertisseur utf7 pour les dossiers et fichiers de boites (imap)
	_utf7converter: null,

	// nombre de fichiers (de messsages) à copier
	// déterminé lors du calcule de l'espace disque
	// décrémenté lors de la copie de chaque Fichier
	// copies terminées lorsque atteint 0
	_nbFichiers:0,
	get NbFichiers(){
		return this._nbFichiers;
	},
	// nombre de fichiers copiés (si _nbFichiers==_nbCopies => copies terminées)
	_nbCopies:0,
	get NbCopies(){
		return this._nbCopies;
	},

	get FinCopies(){
		return this._nbFichiers==this.NbCopies;
	},

	_erreurCopie:false,//true si erreur de copie asynchrone de fichier

	get ErreurCopie(){
		return this._erreurCopie;
	},

	// taille disque disponible avant copie
	_tailleDisque:0,
	// taille nécessaire pour la copie des fichiers (hors répertoires)
	_tailleFichiers:0,

	Init: function(){

		this._index=0;
		this._tailleFichiers=0;
		this._nbFichiers=0;
		this._nbCopies=0;

		this._utf7converter=Cc['@mozilla.org/charset-converter-manager;1'].getService(Ci.nsICharsetConverterManager);
	},


	// Archivage des dossiers locaux Pablo
	ArchiveDossiersLocaux: function(){

		// démarrage archivage des dossiers
		this.logMsg("Archivage des dossiers locaux Pablo");

		try{
			while (this._index<mceMigrationMCE._infosPablo.dossiers.length){

				let dossier=mceMigrationMCE._infosPablo.dossiers[this._index];
				if (!dossier.archive) {this._index++;continue;}

				this._index++;
				this.logMsg("Archivage du dossier local Pablo", dossier.name);
				MessageUI("Archivage du dossier local Pablo :"+ dossier.name);
				setTimeout(()=>{this.ArchiveDossierLocal(dossier);}, timeout_oper);
				return;
			}

			if (this._index>=mceMigrationMCE._infosPablo.dossiers.length){
				// si aucun EndArchivageDossiers
				this.EndArchivageDossiers(true);
			}

		} catch(ex){
			this.logMsg("ArchiveDossiersLocaux exception", ex);
			MessageUIErreur("Erreur d'archivage des dossiers locaux (20)");
		}
	},

	ArchiveDossierSuivant: function(){

		// si erreur de copie asynchrone => stop
		if (this._erreurCopie){
			this.logDebug("*** ArchiveDossierSuivant this._erreurCopie");
			return;
		}

		try{
			while (this._index<mceMigrationMCE._infosPablo.dossiers.length){

				let dossier=mceMigrationMCE._infosPablo.dossiers[this._index];
				if (!dossier.archive) {this._index++;continue;}

				this._index++;
				this.logMsg("Archivage du dossier local Pablo", dossier.name);
				MessageUI("Archivage du dossier local Pablo :"+ dossier.name);

				setTimeout(()=>{this.ArchiveDossierLocal(dossier);}, timeout_oper);
				return;
			}

			if (this._index>=mceMigrationMCE._infosPablo.dossiers.length){
				this.EndArchivageDossiers(true);
			}


		} catch(ex){
			this.logMsg("ArchiveDossierSuivant exception", ex);
			MessageUIErreur("Erreur d'archivage des dossiers locaux (20)");
		}
	},

	// Archivage d'un dossier local
	// version qui copie les arborescence de fichiers
	ArchiveDossierLocal: function(dossier){

		let res=true;

		try{
			// créer compte dossier local
			// vérifier que le compte n'existe pas déjà
			// s'il exsite on réutilise (cas Dossiers Locaux)
			let compte=this.InitDossierLocal(dossier);
			if (null==compte){
				this.logMsg("Echec de création du dossier local :", dossier.name);
				MessageUIErreur("Erreur de création du dossier local (21)");
				return;
			}

			// copie l'arborescence source si != de la destination
			if (mceMigrationMCE.TestCheminProfilPablo(dossier.directory)){
				this.logMsg("Copie de l'arborescence du dossier Pablo", dossier.name);
				this.logMsg("Copie de ", dossier.directory);
				this.logMsg("Copie vers ", compte.incomingServer.localPath.path);

				let repSrc=new FileUtils.File(dossier.directory);
				res=this.CopieRepertoire(repSrc, compte.incomingServer.localPath);
			}

			this.EndArchiveDossier(res);

		} catch(ex){
			this.logMsg("ArchiveDossierLocal exception", ex);
			MessageUIErreur("Erreur d'archivage du dossier local (22)");
		}
	},

	// Archivage des boites Pablo
	ArchiveBoitesPablo: function(){

		// si erreur de copie asynchrone => stop
		if (this._erreurCopie){
			this.logDebug("*** ArchiveBoitesPablo this._erreurCopie");
			return;
		}

		// démarrage archivage des boites
		let res=true;
		this.logMsg("Archivage des boites Pablo");
		MessageUI("Archivage des boites Pablo");

		try{

			this._index=0;

			while (this._index<mceMigrationMCE._infosPablo.boites.length){

				let boite=mceMigrationMCE._infosPablo.boites[this._index];
				if (!boite.archive) {this._index++;continue;}

				this._index++;
				this.logMsg("Archivage de la boite Pablo", boite.name);
				MessageUI("Archivage de la boite Pablo :"+ boite.name);

				setTimeout(()=>{this.ArchiveBoite(boite);}, timeout_oper);
				return;
			}

			if (this._index>=mceMigrationMCE._infosPablo.boites.length){
				// si aucun EndArchivageBoites
				this.EndArchivageBoites(true);
			}

		} catch(ex){
			this.logMsg("ArchiveBoitesPablo exception", ex);
			MessageUIErreur("Erreur d'archivage des boites (23)");
		}
	},

	// Archivage d'une boites Pablo
	ArchiveBoiteSuivante: function(){

		// si erreur de copie asynchrone => stop
		if (this._erreurCopie){
			this.logDebug("*** ArchiveBoiteSuivante this._erreurCopie");
			return;
		}

		try{
			while (this._index<mceMigrationMCE._infosPablo.boites.length){

				let boite=mceMigrationMCE._infosPablo.boites[this._index];
				if (!boite.archive) {this._index++;continue;}

				this._index++;

				this.logMsg("Archivage de la boite Pablo", boite.name);
				MessageUI("Archivage de la boite Pablo :"+ boite.name);
				setTimeout(()=>{this.ArchiveBoite(boite);}, timeout_oper);
				return;
			}

			if (this._index>=mceMigrationMCE._infosPablo.boites.length){
				this.EndArchivageBoites(true);
			}

		} catch(ex){
			this.logMsg("ArchiveBoiteSuivante exception", ex);
			MessageUIErreur("Erreur d'archivage de la boite (24) :"+boite.name);
		}
	},

	// Archivage d'une boites Pablo
	ArchiveBoite: function(boite){

		let res=true;

		try{

			// créer compte dossier local
			// avec libellé "Archives de "<nom du compte>
			let compte=this.InitDossierBoite(boite);
			this.logMsg("Archivage de la boite Pablo", boite.name);
			MessageUI("Archivage de la boite Pablo :"+boite.name);

			if (null==compte){
				this.logMsg("Echec de création du dossier local", boite.name);
				MessageUIErreur("Echec de création du dossier local pour la boite  (25) :"+boite.name);
				return;
			}

			// copie l'arborescence source
			this.logMsg("Copie de l'arborescence de la boite Pablo", boite.name);
			this.logMsg("Copie de ", boite.directory);
			this.logMsg("Copie vers ", compte.incomingServer.localPath.path);

			let repSrc=new FileUtils.File(boite.directory);
			res=this.CopieRepertoire(repSrc, compte.incomingServer.localPath, true);

			if (!res) {
				this.logMsg("Erreur d'archivage de la boite", boite.name);
				MessageUIErreur("Erreur d'archivage de la boite  (26) :"+boite.name);
			}

			this.EndArchiveBoite(res);

		} catch(ex){
			this.logMsg("ArchiveBoite exception", ex);
			MessageUIErreur("Erreur d'archivage de la boite (26) :"+boite.name);
		}
	},

	// teste si espace disque suffisant
	// retour true si ok, false si insuffisant
	VerifieEspaceDisque: function(){

		try{

			let profd=Services.dirsvc.get("ProfD", Components.interfaces.nsIFile);
			this._tailleDisque=profd.diskSpaceAvailable;
			this.logMsg("Espace disque disponible", this._tailleDisque);

			// parcours des dossiers locaux Pablo
			for (let i=0;i<mceMigrationMCE._infosPablo.dossiers.length;i++){

				let dossier=mceMigrationMCE._infosPablo.dossiers[i];
				if (!dossier.archive ||
						!mceMigrationMCE.TestCheminProfilPablo(dossier.directory)) continue;

				let rep=new FileUtils.File(dossier.directory);

				this.CalculTailleNombre(rep);
			}

			// parcours des boites Pablo
			for (let i=0;i<mceMigrationMCE._infosPablo.boites.length;i++){

				let boite=mceMigrationMCE._infosPablo.boites[i];
				if (!boite.archive) continue;

				let rep=new FileUtils.File(boite.directory);

				this.CalculTailleNombre(rep);
			}

			this.logMsg("Taille totale des fichiers a copier", this._tailleFichiers);
			this.logMsg("Nombre de fichiers à copier", this._nbFichiers);

			this.EndVerifieEspaceDisque(this._tailleFichiers<(this._tailleDisque-mce_marge_disque)?1:0);

		} catch(ex){
			this.logMsg("VerifieEspaceDisque exception", ex);
			this.EndVerifieEspaceDisque(-1);
		}
	},

	// calcul nombre et taille totale des fichiers
	// fonction récursive
	// rep: instance nsIFile (repertoire)
	CalculTailleNombre: function(rep){

		let iter=rep.directoryEntries;

		while (iter.hasMoreElements()){

			item=iter.getNext();
			item=item.QueryInterface(Ci.nsIFile);

			if (this.IgnoreItem(item.leafName)) continue;

			if (item.isFile()){
				this._tailleFichiers+=item.fileSize;
				this._nbFichiers++;
				this.logDebug("*** CalculTailleNombre item:"+item.path);
			}
			else if (item.isDirectory()){
				this.CalculTailleNombre(item);
			}
		}
	},


	// copie du contenu d'un répertoire dans un autre
	// utilisé pour copier les répertoires et messages des dossiers locaux
	// repSrc : instance nsIFile source (repertoire)
	// repDest : instance nsIFile destination (repertoire)
	// retour true si ok
	CopieRepertoire: function(repSrc, repDest, isBoite=false){

		try{
			this.logDebug("*** CopieRepertoire repSrc:"+repSrc.path);
			this.logDebug("*** CopieRepertoire repDest:"+repDest.path);
			let iter=repSrc.directoryEntries;

			while (iter.hasMoreElements() && !this._erreurCopie){

				let itemSrc=iter.getNext();
				itemSrc=itemSrc.QueryInterface(Ci.nsIFile);
				this.logDebug("*** CopieRepertoire itemSrc:"+itemSrc.leafName);

				let itemNom=itemSrc.leafName;

				// ignorer si Corbeille ou Indésirables
				if (this.IgnoreItem(itemNom)){
					this.logDebug("*** CopieRepertoire ignore :"+itemNom);
					continue;
				}

				if (isBoite){
					// conversion d'encodage
					this.logDebug("*** conversion de:"+itemNom);
					itemNom=this.utf7ToUnicode(itemNom);
					this.logDebug("*** résultat conversion:"+itemNom);
				}

				// si c'est un fichier message xxx-<n>
				// on le copie en xxx
				// uniquement INBOX-  Sent- Templates- Drafts-
				if (itemSrc.isFile() && !itemNom.includes(".") &&
						(itemNom.startsWith("Sent-") ||
						itemNom.startsWith("Templates-") ||
						itemNom.startsWith("Drafts-") ||
						itemNom.startsWith("INBOX-")) ){
					this.logDebug("*** modification du nom de fichier:"+itemNom);
					itemNom=itemNom.split("-")[0];
				}

				let itemDest=repDest.clone();
				itemDest.append(itemNom);

				if (itemSrc.isFile()){

					// copie le fichier
					this.logDebug("*** CopieRepertoire copie du fichier source:"+itemSrc.path);
					this.CopieFichier(itemSrc, itemDest);
				}
				else if (itemSrc.isDirectory()){

					// creer le répertoire destination si inexistant
					if (!itemDest.exists()){
						this.logDebug("*** CopieRepertoire creation du répertoire :"+itemDest.path);
						itemDest.create(Ci.nsIFile.DIRECTORY_TYPE, FileUtils.PERMS_DIRECTORY);
					}

					// vérifier que le fichier de messages (sans extensino) source existe
					// sinon créer un fichier destination vide
					if (isBoite)
						this.VerifieFichierMsg(itemSrc, repDest);

					let res=this.CopieRepertoire(itemSrc, itemDest, isBoite);
					if (!res)
						return res;
				}
			}

			return !this._erreurCopie;

		} catch(ex){
			this.logMsg("CopieRepertoire exception", ex);
		}
		return false;
	},

	// retourne true si le nom de répertoire ou de fichier doit être ignoré (non traité/copié)
	// itemNom : nsIFile.leafName
	IgnoreItem: function(itemNom){
		return (itemNom.startsWith("Trash") ||
						itemNom.startsWith("Junk") ||
						itemNom.startsWith("Unsent") ||
						itemNom=="msgFilterRules.dat");
	},

	// si c'est un .msf vérifier que le fichier de messages (sans .msf) source existe
	// sinon créer un fichier destination vide
	// itemSrc : fichier nsIFile
	// repDest: répertoire destination (nsIFile)
	VerifieFichierMsg: function(itemSrc, repDest){

		//if (!itemSrc.leafName.endsWith(".msf")) return;
		if (!itemSrc.leafName.endsWith(".sbd")) return;
		let nom=itemSrc.leafName.split(".")[0];

		let ficSrc=itemSrc.parent.clone();
		ficSrc.append(nom);
		if (!ficSrc.exists()){
			this.logDebug("*** VerifieFichierMsg fichier source absent:"+ficSrc.path);
			let ficDest=repDest.clone();
			nom=this.utf7ToUnicode(nom);
			ficDest.append(nom);
			this.logDebug("*** VerifieFichierMsg creation du fichier vide:"+ficDest.path);
			ficDest.create(Ci.nsIFile.NORMAL_FILE_TYPE, FileUtils.PERMS_FILE);
		}
	},

	// copie de fichier asynchrone
	// ficSrc: fichier source (nsIFile)
	// ficDest: fichier destination (nsIFile)
	CopieFichier: function(ficSrc, ficDest){

		let inputStream=Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
		inputStream.init(ficSrc, FileUtils.MODE_RDONLY, FileUtils.PERMS_FILE, 0);

		let outputStream=Components.classes["@mozilla.org/network/file-output-stream;1"].createInstance(Components.interfaces.nsIFileOutputStream);
		outputStream.init(ficDest, FileUtils.MODE_WRONLY|FileUtils.MODE_CREATE|FileUtils.MODE_TRUNCATE, FileUtils.PERMS_FILE, 0);

		let _this=this;

		NetUtil.asyncCopy(inputStream, outputStream, function(aResult) {
												_this._nbCopies++;
												_this.logDebug("*** CopieFichier _nbCopies:"+_this._nbCopies);
												_this.logDebug("*** NetUtil.asyncCopy aResult:"+aResult);
												if (!Components.isSuccessCode(aResult)) {
													// erreur de copie de fichier
													_this.logMsg("Erreur de copie de fichier", ficSrc.path);
													MessageUIErreur("Erreur de copie de fichier (27)");
													_this._erreurCopie=true;
													return;
												}
												FileUtils.closeSafeFileOutputStream(outputStream);
												outputStream = null;
												inputStream = null;

												// test fin de copie des fichiers
												if (Components.isSuccessCode(aResult) && _this.FinCopies){
													_this.logMsg("Fin de copie des fichiers");
													FinArchivagePablo(true);
												}
											});
	},

	// cree dossier local si nécessaire
	// dossier : informations dossier Pablo
	// création dans le profil si le chemin pablo est dans le profil pablo
	// sinon on reprend le chemin du dossier pablo
	// retourne instance nsIAccount
	InitDossierLocal: function(dossier){

		try{
			this.logMsg("Initialisation compte dossier local", dossier.name);
			// rechercher compte existant (cas 'Dossiers Locaux')
			let srvLocal=null, compte=null;
			let bSave=false;

			try {
				srvLocal=MailServices.accounts.FindServer("nobody", dossier.hostname, "none");
				compte=MailServices.accounts.FindAccountForServer(srvLocal);
				this.logMsg("Dossier Local existant", dossier.name);
			} catch(ex1){}

			if (null==srvLocal){
				this.logMsg("Creation du compte dossier local", dossier.name);
				srvLocal=MailServices.accounts.createIncomingServer("nobody", dossier.hostname, "none");
				srvLocal.prettyName=dossier.name;
				compte=MailServices.accounts.createAccount();
				compte.incomingServer=srvLocal;
				srvLocal.valid=true;
				bSave=true;
			}

			if (!mceMigrationMCE.TestCheminProfilPablo(dossier.directory)){
				this.logMsg("Conservation du chemin du dossier", dossier.directory);
				let rep=new FileUtils.File(dossier.directory);
				srvLocal.localPath=rep;
				bSave=true;
			}

			if (bSave) MailServices.accounts.saveAccountInfo();

			return compte;

		} catch(ex){
			this.logMsg("InitDossierLocal exception", ex);
		}
		return null;
	},

	// crée le dossier local pour l'archivage de la boite Pablo
	// avec libellé "Archives de "<nom du compte>
	// retourne instance nsIAccount
	InitDossierBoite: function(boite){

		try{
			this.logMsg("Initialisation compte dossier local", boite.name);

			// libellé du compte
			let libelle="Archives de "+boite.name.split("@")[0];

			this.logMsg("Creation du compte dossier local", libelle);
			let repPablo=new FileUtils.File(boite.directory);
			srvLocal=MailServices.accounts.createIncomingServer("nobody", repPablo.leafName, "none");
			srvLocal.prettyName=libelle;
			compte=MailServices.accounts.createAccount();
			compte.incomingServer=srvLocal;
			srvLocal.valid=true;

			MailServices.accounts.saveAccountInfo();

			return compte;

		} catch(ex){
			this.logMsg("InitDossierBoite exception", ex);
		}
		return null;
	},

	// conversion utf7 vers unicode (boites uniquement
	utf7ToUnicode: function(libelle){

		return this._utf7converter.mutf7ToUnicode(libelle);
	},

	// génération de traces (console et fichier)
	logMsg: function(msg, details=""){
		mceMigrationMCE.logMsg(msg, details);
	},

	// logs dans la console (pour dev)
	logDebug: function(msg){
		Services.console.logStringMessage(msg);
	},

	/* notification des étapes */
	// fin VerifieEspaceDisque
	// result : 1 ok, 0 insuffisant, -1 erreur
	EndVerifieEspaceDisque: function(result){

		if (1==result){
			this.logMsg("Espace disque suffisant");
			MessageUI("Vérification de l'espace disque ok");

			// archiver les Dossiers
			this.ArchiveDossiersLocaux();

		} else if (0==result){
			// erreur => stop
			this.logMsg("Erreur : Espace disque insuffisant", "messages non archivés");
			MessageUIErreur("Espace disque insuffisant pour archiver (28)");
		} else {
			// erreur => stop
			this.logMsg("Erreur : Erreur de vérification de l'espace disque", "messages non archivés");
			MessageUIErreur("Erreur de vérification de l'espace disque (29)");
		}
	},
	// fin archivage d'un dossier
	EndArchiveDossier: function(result){

		if (result){
			// dossier suivant
			this.ArchiveDossierSuivant();

		} else{
			// erreur => stop
			MessageUIErreur("Erreur d'archivage du dossier (30)");
		}
	},
	// fin archivage des dossiers
	EndArchivageDossiers: function(result){

		this.logMsg("EndArchivageDossiers", result?"SUCCES":"ERREUR");

		if (result){
			// archiver les boites
			this.ArchiveBoitesPablo();

		} else{
			// erreur => stop
			MessageUIErreur("Erreur d'archivage des dossiers locaux (20)");
		}
	},
	// fin d'archivage d'une boite
	EndArchiveBoite: function(result){

		this.logMsg("EndArchiveBoite", result?"SUCCES":"ERREUR");

		if (result){
			// archiver la boite suivante
			this.ArchiveBoiteSuivante();

		} else{
			MessageUIErreur("Erreur d'archivage de la boite (24)");
		}
	},
	// fin d'archivage des boites
	EndArchivageBoites: function(result){

		// archivage des boites termine => attendre fin copie des fichiers
		if (result){
			MessageUI("Archivage des boites terminé (succès)");

			if (!this.FinCopies){
				this.AttenteFinCopies();
			}
			else{
				FinArchivagePablo(result);
			}
		} else{
			MessageUIErreur("Erreur d'archivage des boites (23)");
		}
	},

	/* attend la fin de copie des fichiers */
	AttenteFinCopies: function(){

		this.logMsg("Attente fin de copie des fichiers");

		MessageUI("Copie des fichiers en cours...");
	},

}
