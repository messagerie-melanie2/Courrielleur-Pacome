/**
* Module pour la migration des profils PABLO vers MCE
*
*
*/

ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm", this);
ChromeUtils.import("resource://gre/modules/FileUtils.jsm", this);
ChromeUtils.import("resource:///modules/mailServices.js");
ChromeUtils.import("resource:///modules/iteratorUtils.jsm");
ChromeUtils.import("resource://gre/modules/cm2MigreAmelie.jsm");


var EXPORTED_SYMBOLS = ["mceMigrationMCE"];


// nom du fichier des informations de migration
const FICHIER_INFOS_PABLO="infosPablo.json";

const FICHIER_MIGRATION="migrationPablo.log";
const LOG_SEP="\t";

var mceMigrationMCE={

	// liste les profiles pablo depuis le fichier profiles.ini
	// se base du user_pref("mailnews.start_page_override.mstone", "31.8.0");
	// pour détecter les profils pablo
	// retourne le nombre de profils détectés
	pablo_noms:[],				// nom du profil dans le gestionnaire de profils
	pablo_rep:[],					// répertoire du profil
	pablo_comptes:[],			// nom du compte principal
	pablo_datesprefs:[], 	// date de modification du prefs.js (pour déterminer le dernier ouvert)

	// texte d'erreur (vide si ok)
	_erreur:"",
	get Erreur(){
		return this._erreur;
	},
	set Erreur(msg){
		this._erreur=msg;
	},

	Close: function(){

		try{

			if (null!=this._fichierLogs){
				this._fichierLogs.close();
				this._fichierLogs=null;
			}
			if (null!=this._infosPablo){
				this._infosPablo.close();
				this._infosPablo=null;
			}

		}catch(ex){}
	},

	// comptes : si true initialise pablo_comptes à partir des prefs.js
	ListeProfilsPABLO(comptes=false) {
		// noms des profils pablo
		this.pablo_noms=[];
		// chemin des profils pablo
		this.pablo_rep=[];
		this.pablo_comptes=[];

		//Services.console.logStringMessage("*** ListeProfilsPABLO comptes:"+(comptes ? "true":"false"));

		let profileService = Cc["@mozilla.org/toolkit/profile-service;1"].getService(Ci.nsIToolkitProfileService);
		let profileEnumerator = profileService.profiles;
		while (profileEnumerator.hasMoreElements()) {
			let profile = profileEnumerator.getNext().QueryInterface(Ci.nsIToolkitProfile);

			//Services.console.logStringMessage("*** ListeProfilsPABLO profile TB name:"+profile.name+" - rep:"+profile.rootDir.path);
			if (this.mceTestProfilPablo(profile.rootDir)){
				Services.console.logStringMessage("*** ListeProfilsPABLO profil PABLO:"+profile.name);
				this.pablo_noms.push(profile.name);
				this.pablo_rep.push(profile.rootDir.path);

				if (comptes){
					let compte=this._getCompteProfil(profile.rootDir.path);
					//Services.console.logStringMessage("*** ListeProfilsPABLO profile compte:"+compte);
					this.pablo_comptes.push(compte);
					// date prefs.js
					let prefPablo=new FileUtils.File(profile.rootDir.path);
					prefPablo.append("prefs.js");
					this.pablo_datesprefs.push(prefPablo.lastModifiedTime);
					//Services.console.logStringMessage("*** ListeProfilsPABLO profile lastModifiedTime:"+prefPablo.lastModifiedTime);
				}
			}
		}

		return this.pablo_noms.length;
	},

	// efface fichier des informations de migration si existe
	DelInfosMigration: function(){

		let fichier=Services.dirsvc.get("ProfD", Components.interfaces.nsIFile);
		fichier.append(FICHIER_INFOS_PABLO);
		//Services.console.logStringMessage("*** DelInfosMigration fichier:"+fichier.path);
		if (fichier.exists()){
			this.logMsg("DelInfosMigration supression du fichier", fichier.path);
			fichier.remove(false);
		}
	},


	// retourne true si le fichier des données Pablo est présent dans le profil
	// indique qu'il y a migration
	FichierMigrationPresent: function(){

		let fichier=Services.dirsvc.get("ProfD", Components.interfaces.nsIFile);
		fichier.append(FICHIER_INFOS_PABLO);
		return fichier.exists();
	},

	// charge le contenu du fichier des données Pablo dans _infosPablo
	// si force = true recharge si _infosPablo est défini
	// retour true si ok, false si erreur
	LoadInfosPablo: function(force=false){

		Services.console.logStringMessage("*** LoadInfosPablo this._infosPablo:"+this._infosPablo);

		if (this._infosPablo.boites.length!=0 && !force) return true;
		try{
			let contenu=this.ContenuFichierPablo();
			//Services.console.logStringMessage("*** LoadInfosPablo contenu:"+contenu);
			this._infosPablo=JSON.parse(contenu);
		}catch(ex){
			Services.console.logStringMessage("*** LoadInfosPablo exception:"+ex);
			this.Erreur="Erreur de lecture du fichier Pablo (1)";
			return false;
		}
		Services.console.logStringMessage("*** LoadInfosPablo ok");
		return true;
	},

	// retourne le contenu du fichier des données Pablo (vide si aucun)
	ContenuFichierPablo: function(){

		let fichier=Services.dirsvc.get("ProfD", Components.interfaces.nsIFile);
		fichier.append(FICHIER_INFOS_PABLO);
		if (fichier.exists()){
			let fis=Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
			fis.init(fichier, FileUtils.MODE_RDONLY, FileUtils.PERMS_FILE, 0);
			let sis = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(Ci.nsIScriptableInputStream);
			sis.init(fis);
			let contenu = sis.read(sis.available());
			sis.close();
			return contenu;
		}
		else{
			this.logMsg("ContenuFichierPablo - fichier Pablo inexistant ou erreur de lecture", fichier.path);
		}
		return "";
	},



	// a partir du chemin du profile
	// teste si profil pablo
	// recherche user_pref("mailnews.start_page_override.mstone", "31.8.0");
	// dans prefs.js
	// chemin : nsIFile
	// retour true si pablo
	mceTestProfilPablo: function(chemin){

		let prefsFile = chemin.clone();
		prefsFile.append("prefs.js");
		if (!prefsFile.exists()){
			this.logMsg("mceTestProfilPablo pas de fichier prefsFile", prefsFile.path);
			//this.Erreur="Fichier prefs.js inexistant (2)";// non considéré comme une erreur
			return false;
		}
		//Services.console.logStringMessage("*** mceTestProfilPablo prefsFile:"+prefsFile.path);
		let fis=Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
		fis.init(prefsFile, FileUtils.MODE_RDONLY, FileUtils.PERMS_FILE, 0);
		let sis = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(Ci.nsIScriptableInputStream);
		sis.init(fis);
		let contenu=sis.read(sis.available());
		sis.close();

		return contenu.includes("pablo2maja.autoconfstatus");
	},

	/* Lecture des préférences Pablo */

	// informations Pablo extraite pour écriture sur disque
	_infosPablo: {
		"profil":"", 				// nom du profil Pablo
		"cheminPablo":"", 	// chemin du profil Pablo
		"courriel":"",			// courriel principal
		"courriels":[],			// tous les courriels
		"boites":[],				// infos de boites
		"carnets":[], 			// infos des carnets
		"dossiers":[],			// infos des dossiers
		"flux":[], 					// infos des flux
		"etiqs":[],					// étiquettes messages
		"categories":"",		// catégories agenda
		"impression":[],		// preférences d'impression (branche print.)
		"print_printer":"", // pref print_printer
	},
	// infos de boite
	_boite: {"directory":"", "mailServer":"", "userName":"", "name":"",
					 "archive":false,// true si les messages sont à archiver (choix utilisateur)
					 "identities":[],
					 "filtresok":false, // true si les filtres Pablo ont été migrés dans la boite MCE correspondante
	},
	// identite de boite
	_identBoite:{
		"smtpServer":"",
		"useremail":"",
		"fullName":"",
		"attach_signature": false, "sig_file":"", "htmlSigText":"", "htmlSigFormat":false,
		"sig_bottom":false, "attach_vcard":false, "escapedVCard":"",
	},
	// carnet d'adresse
	_carnet:{
		"carnetId":"",
		"description":"",
		"filename":"",
		"position":-1, // si 0 non affiché (-1 si non défini)
	},
	// dossier local
	_dossier:{
		"directory":"",
		"hostname":"",
		"name":"",
		"archive":false,// true si les messages sont archivés
	},
	// compte de flux
	// contient nom  de préférence:valeur
	_flux:{
		"directory":"",
		"hostname":"", // Feeds Feeds-1 etc...
		"name":"",
		"prefs":[], // {prefId:valeur}
	},
	// preférence d'impression
	_print:{
		"prefId":"",
		"valeur":"",
	},

	// extrait les informations pablo utiles pour la reprise des données
	// profil nom du profil dans pablo_noms
	CreeInfosPablo: function(profil){

		this.DelInfosMigration();

		// créer le fichier
		let fichier=Services.dirsvc.get("ProfD", Components.interfaces.nsIFile);
		fichier.append(FICHIER_INFOS_PABLO);
		this.logMsg("CreeInfosPablo création du fichier", fichier.path);
		fichier.create(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, FileUtils.PERMS_FILE);

		// mémoriser nom du profil pablo
		let donneesPablo=Components.classes["@mozilla.org/network/file-output-stream;1"].createInstance(Components.interfaces.nsIFileOutputStream);
		donneesPablo.init(fichier, FileUtils.MODE_WRONLY|FileUtils.MODE_CREATE, FileUtils.PERMS_FILE,0);
		this.logMsg("CreeInfosPablo écriture de:'"+profil+"'");
		this._infosPablo.profil=profil;
		this._infosPablo.cheminPablo=this._getCheminProfil(profil);

		try{

			// fichier prefs.js Pablo
			Services.console.logStringMessage("*** CreeInfosPablo cheminPablo:"+this._infosPablo.cheminPablo);
			let prefPablo=new FileUtils.File(this._infosPablo.cheminPablo);
			prefPablo.append("prefs.js");
			this.logMsg("CreeInfosPablo prefs Pablo", prefPablo.path);

			Services.prefs.readUserPrefsFromFile(prefPablo);

			// boites PABLO
			this._extraitBoitesPablo();
			// carnets PABLO
			this._extraitCarnetsPablo();
			// dossiers PABLO
			this._extraitDossiersPablo();
			// flux PABLO
			this._extraitFluxPablo();
			// etiquettes PABLO
			this._extraitEtiqsPablo();
			// categories PABLO
			this._extraitCatsPablo();
			// préférences d'impression
			this._extraitPrefsImpression();

			// ecriture du fichier
			let str=JSON.stringify(this._infosPablo);
			//Services.console.logStringMessage("*** CreeInfosPablo donnees json:'"+str+"'");
			donneesPablo.write(str, str.length);
			donneesPablo.flush();

		}catch(ex){
			this.logMsg("CreeInfosPablo exception", ex);
			this.Erreur="Echec de crétion du fichier Pablo (3)";
			return false;
		}

		// remet les prefs user à 0
		Services.prefs.resetPrefs();
		return true;
	},

	// informations des boites PABLO
	_extraitBoitesPablo: function(){

		this.logMsg("Extraction des informations de boites à lettres");

		// boite principale
		let cpr;
		if (Services.prefs.prefHasUserValue("mail.accountmanager.defaultaccount")){
			let cpr=Services.prefs.getCharPref("mail.accountmanager.defaultaccount");
			this.logMsg("CreeInfosPablo compte par defaut", cpr);
			if (Services.prefs.prefHasUserValue("mail.account."+cpr+".identities")){// compte courrier
				let idents=Services.prefs.getCharPref("mail.account."+cpr+".identities").split(",");
				if (idents.length>0){
					// id principale
					if (Services.prefs.prefHasUserValue("mail.identity."+idents[0]+".useremail")){
						this._infosPablo.courriel=Services.prefs.getCharPref("mail.identity."+idents[0]+".useremail");
						this.logMsg("CreeInfosPablo courriel principal", this._infosPablo.courriel);
						this._infosPablo.courriels.push(this._infosPablo.courriel);
					}
				}
			}
		}

		// boites
		if (Services.prefs.prefHasUserValue("mail.accountmanager.accounts")){
			let accounts=Services.prefs.getCharPref("mail.accountmanager.accounts");
			Services.console.logStringMessage("*** CreeInfosPablo accounts:"+accounts);
			let comptes=accounts.split(",");
			// inclut boites, dossiers et flux
			// si c'est un compte de boite il y a une identité
			for (let i=0;i<comptes.length;i++){
				let c=comptes[i];
				if (Services.prefs.prefHasUserValue("mail.account."+c+".identities")){// compte courrier
					this.logMsg("CreeInfosPablo compte de boite", c);

					let bal=this._getInfosBoite(c);

					this._infosPablo.boites.push(bal);
				}
			}
		}
	},

	_getInfosBoite:function(compte){

		Services.console.logStringMessage("*** _getInfosBoite compte:"+compte);

		let bal=Object.create(this._boite);

		let server=Services.prefs.getCharPref("mail.account."+compte+".server", "");
		if (server!=""){
			bal.userName=Services.prefs.getCharPref("mail.server."+server+".userName", "");
			bal.directory=Services.prefs.getCharPref("mail.server."+server+".directory", "");
			bal.mailServer=Services.prefs.getCharPref("mail.server."+server+".hostname", "");
			bal.name=this.getCharPref("mail.server."+server+".name", "");
			bal.identities=[];
		}

		let idents=Services.prefs.getCharPref("mail.account."+compte+".identities").split(",");

		for (let i=0;i<idents.length;i++){

			let ident=idents[i];

			this.logMsg("CreeInfosPablo identité", ident);

			let idBal=Object.create(this._identBoite);

			let smtp=Services.prefs.getCharPref("mail.identity."+ident+".smtpServer", "");
			if (smtp!="") idBal.smtpServer=Services.prefs.getCharPref("mail.smtpserver."+smtp+".hostname", "");

			idBal.useremail=Services.prefs.getCharPref("mail.identity."+ident+".useremail");
			if (i==0 && idBal.useremail!=this._infosPablo.courriel) {
				this.logMsg("CreeInfosPablo courriel ajoute a la liste", idBal.useremail);
				this._infosPablo.courriels.push(idBal.useremail);
			}
			idBal.fullName=this.getCharPref("mail.identity."+ident+".fullName", "");
			idBal.attach_signature=Services.prefs.getBoolPref("mail.identity."+ident+".attach_signature", false);
			idBal.sig_file=Services.prefs.getCharPref("mail.identity."+ident+".sig_file", "");
			idBal.htmlSigText=this.getCharPref("mail.identity."+ident+".htmlSigText", "");
			idBal.htmlSigFormat=Services.prefs.getBoolPref("mail.identity."+ident+".htmlSigFormat", false);
			idBal.sig_bottom=Services.prefs.getBoolPref("mail.identity."+ident+".sig_bottom", false);
			idBal.attach_vcard=Services.prefs.getBoolPref("mail.identity."+ident+".attach_vcard", false);
			idBal.escapedVCard=Services.prefs.getCharPref("mail.identity."+ident+".escapedVCard", "");

			bal.identities.push(idBal);
		}

		return bal;
	},

	// informations des carnets PABLO
	_extraitCarnetsPablo: function(){

		this.logMsg("Extraction des informations des carnets");

		// identifiants des carnets OBM
		let carnetsOBM=Services.prefs.getCharPref("extensions.obm.addressbooks", "").split(",");

		// tous les carnets locaux
		let prefBranch=Services.prefs.getBranch("ldap_2.servers.");
		let nb={};
		let prefs=prefBranch.getChildList("", nb);
		for (var i=0; i<prefs.length; i++){
			let pref=prefs[i];
			if (pref.endsWith(".dirType") &&
					2==prefBranch.getIntPref(pref)){
				let val=pref.split(".");
				let prefid=val[0];

				// ignorer les carnet OBM (migrés côté serveur)
				if (carnetsOBM.includes(prefid)){
					Services.console.logStringMessage("***_extraitCarnetsPablo carnet OBM non migré prefid:"+prefid+
													" - libellé:"+this.getCharPref("ldap_2.servers."+prefid+".description", ""));
					continue;
				}
				Services.console.logStringMessage("***_extraitCarnetsPablo carnet prefid:"+prefid);
				let carnet=Object.create(this._carnet);
				carnet.carnetId=prefid;
				carnet.description=this.getCharPref("ldap_2.servers."+prefid+".description", "");
				Services.console.logStringMessage("***_extraitCarnetsPablo carnet carnet.description:"+carnet.description);
				carnet.filename=prefBranch.getCharPref(prefid+".filename", "");
				carnet.position=prefBranch.getIntPref(prefid+".position", -1);
				this._infosPablo.carnets.push(carnet);
			}
		}
	},

	// informations des dossiers PABLO
	_extraitDossiersPablo: function(){

		this.logMsg("Extraction des informations des dossiers locaux");

		if (Services.prefs.prefHasUserValue("mail.accountmanager.accounts")){
			let accounts=Services.prefs.getCharPref("mail.accountmanager.accounts");
			let comptes=accounts.split(",");
			// inclut boites, dossiers et flux
			for (let i=0;i<comptes.length;i++){
				let c=comptes[i];
				if (Services.prefs.prefHasUserValue("mail.account."+c+".server")){// pas un compte courrier
					let server=Services.prefs.getCharPref("mail.account."+c+".server");
					if (Services.prefs.prefHasUserValue("mail.server."+server+".type") &&
							Services.prefs.prefHasUserValue("mail.server."+server+".userName") &&
							Services.prefs.getCharPref("mail.server."+server+".type")=="none" &&
							Services.prefs.getCharPref("mail.server."+server+".userName")=="nobody"){

						this.logMsg("_extraitDossiersPablo compte dossier local", c);
						let dossier=Object.create(this._dossier);
						dossier.directory=Services.prefs.getCharPref("mail.server."+server+".directory");
						dossier.hostname=Services.prefs.getCharPref("mail.server."+server+".hostname");
						dossier.name=this.getCharPref("mail.server."+server+".name");

						this._infosPablo.dossiers.push(dossier);
					}
				}
			}
		}
	},

	// informations des comptes de flux
	_extraitFluxPablo:function(){

		this.logMsg("Extraction des informations des flux");

		if (Services.prefs.prefHasUserValue("mail.accountmanager.accounts")){
			let accounts=Services.prefs.getCharPref("mail.accountmanager.accounts");
			let comptes=accounts.split(",");
			// inclut boites, dossiers et flux
			for (let i=0;i<comptes.length;i++){
				let compte=comptes[i];
				if (Services.prefs.prefHasUserValue("mail.account."+compte+".server")){// pas un compte courrier
					let server=Services.prefs.getCharPref("mail.account."+compte+".server");
					if (Services.prefs.prefHasUserValue("mail.server."+server+".type") &&
							Services.prefs.prefHasUserValue("mail.server."+server+".userName") &&
							Services.prefs.getCharPref("mail.server."+server+".type")=="rss" &&
							Services.prefs.getCharPref("mail.server."+server+".userName")=="nobody"){

						this.logMsg("_extraitFluxPablo compte de flux", compte);

						let flux=Object.create(this._flux);

						flux.directory=Services.prefs.getCharPref("mail.server."+server+".directory");
						flux.name=this.getCharPref("mail.server."+server+".name");
						flux.hostname=Services.prefs.getCharPref("mail.server."+server+".hostname");

						let branche=Services.prefs.getBranch("mail.server."+server);
						let nb={value:0};
						let liste=branche.getChildList("",nb);
						flux.prefs=[];

						for (var n=0;n<nb.value;n++){

							let pref=liste[n];
							//Services.console.logStringMessage("*** _extraitFluxPablo pref:"+pref);
							if (pref==".directory" || pref==".directory-rel" || pref==".hostname" ||
									pref==".type" || pref==".userName") continue;
							let p=Object.create(this._print);
							p.prefId=pref;
							let t=branche.getPrefType(pref);
							if (t==32)//String
								p.valeur=branche.getCharPref(pref);
							else if (t==64)//int
								p.valeur=branche.getIntPref(pref);
							else if (t==128)//boolean
								p.valeur=branche.getBoolPref(pref);
							else {// invalid
								this.logMsg("_extraitPrefsImpression erreur sur pref", pref);
								continue;
							}

							flux.prefs.push(p);
						}

						this._infosPablo.flux.push(flux);
					}
				}
			}
		}
	},

	// informations des etiquettes PABLO
	_extraitEtiqsPablo: function(){

		this.logMsg("Extraction des informations des étiquettes");
		let tags=MailServices.tags.getAllTags({});
		this._infosPablo.etiqs=tags;
	},

	// informations des categories PABLO
	_extraitCatsPablo: function(){

		this.logMsg("Extraction des informations des catégories");
		if (Services.prefs.prefHasUserValue("calendar.categories.names")){
			this._infosPablo.categories=this.getCharPref("calendar.categories.names");
		}
	},

	// préférences d'impression
	_extraitPrefsImpression: function(){

		this.logMsg("Extraction des informations d'impression");
		if (Services.prefs.prefHasUserValue("print_printer"))
			this._infosPablo.print_printer=Services.prefs.getCharPref("print_printer");

		let prefBranch=Services.prefs.getBranch("print.");
		let nb={};
		let prefs=prefBranch.getChildList("", nb);
		for (var i=0; i<prefs.length; i++){

			let pref=prefs[i];
			let p=Object.create(this._print);
			p.prefId=pref;
			let t=prefBranch.getPrefType(pref);
			if (t==32)//String
				p.valeur=prefBranch.getCharPref(pref);
			else if (t==64)//int
				p.valeur=prefBranch.getIntPref(pref);
			else if (t==128)//boolean
				p.valeur=prefBranch.getBoolPref(pref);
			else {// invalid
				this.logMsg("_extraitPrefsImpression erreur sur pref", pref);
				continue;
			}

			this._infosPablo.impression.push(p);
		}
	},

	/* Fin lecture des préférences Pablo */



	/* fonctions de migration Pablo vers MATISSE */

	// fonction principale de migration PABLO
	MigrePablo: function(){

		this.Erreur="";// effacer erreur

		this.logMsg("Reprise des données des comptes Pablo");
		// paramétrage des boites
		let res=this.ParamBoites();
		// catégories des agendas
		res=res && this.AjoutCategories();
		// étiquettes des messages
		res=res && this.AjoutEtiquettes();
		// ajout des carnets Pablo
		// fait dans choix-profil.js (ParametrageCarnets)
		//res=res && this.AjoutCarnetsPablo();
		// nettoyage des carnets
		res=res && this.NettoieCarnets();
		// paramètres d'impression
		res=res && this.ParamImpression();
		// paramétrage des flux
		res=res && this.ParamFlux();

		// sauvegarde des préférences
		if (res) Services.prefs.savePrefFile(null);

		this.logMsg("Fin de la reprise des données des comptes Pablo", res?"SUCCES":"ERREUR");

		return res;
	},

	// compléter le paramétrage des boites avec les données Pablo
	ParamBoites: function(){

		this.logMsg("Opérations de paramétrage des boites avec les données Pablo");

		let res=this.FixeComptePrincipal();

		res=res && this.AjoutIdentites();

		res=res && this.AjoutSignatures();

		res=res && this.MigreFiltresBoites();

		if (res) Services.prefs.savePrefFile(null);

		this.logMsg("Fin de paramétrage des boites avec les données Pablo", res?"SUCCES":"ERREUR");

		return res;
	},

	// verifie et/ou positionne le compte principal
	FixeComptePrincipal: function(){

		try{

			// si le paramétrage Pacome n'a pas positionné le même compte principal que Pablo => modifier
			// à priori peu probable
			let accountId=Services.prefs.getCharPref("mail.accountmanager.defaultaccount", "");
			// retrouver compte pour courriel
			let compte=this._getAccountForEmail(this._infosPablo.courriel);
			if (compte==null){
				this.logMsg("FixeComptePrincipal pas de compte pour :"+this._infosPablo.courriel);
			}
			else if (accountId!=compte.key){
				this.logMsg("Positionnement du compte principal", accountId);
				Services.prefs.setCharPref("mail.accountmanager.defaultaccount", accountId);
			}

			return true;

		} catch(ex){
			this.logMsg("FixeComptePrincipal exception", ex);
		}
		this.Erreur="Echec de compte principal (4)";
		return false;
	},

	// ajouter les identités (cas plusieurs identités pour un compte Pablo)
	AjoutIdentites: function(){

		try{

			this.logMsg("Ajout des identités");
			let nbIdent=0;//nombre d'identités supplémentaires

			for (let b=0;b<this._infosPablo.boites.length;b++){
				let boite=this._infosPablo.boites[b];
				if (boite.identities.length>1){
					this.logMsg("Le compte '"+boite.name+"' a "+boite.identities.length+" identités");
					// ajouter les identités supplémentaires sur le compte correspondant
					// retrouver le compte correspondant (il n'y en a pas forcément si les courriels n'ont pas été utilisés)
					let compte=this._getAccountForEmail(boite.identities[0].useremail);

					if (compte!=null) {

						let idents=compte.identities;

						for (let i=0;i<boite.identities.length;i++){
							let identPablo=boite.identities[i];
							let bPresent=false;
							// parcourir les identités
							for (let i=0;i<idents.length;i++){
								let ident=idents.queryElementAt(i,Components.interfaces.nsIMsgIdentity);
								if (ident.email==identPablo.useremail) {
									bPresent=true;
									break;
								}
							}
							if (!bPresent){
								// ajouter l'identité
								this.logMsg("Ajout d'une identité au compte '"+compte.key+"' - pour courriel:"+identPablo.useremail);
								let identite=MailServices.accounts.createIdentity();
								identite.email=identPablo.useremail;
								identite.fullName=identPablo.fullName;
								identite.valid=true;
								identite.smtpServerKey=compte.defaultIdentity.smtpServerKey;
								compte.addIdentity(identite);
								nbIdent++;

							}
						}
					}
					else{
						this.logMsg("Pas de compte Pacome pour le compte Pablo:'"+boite.name+"'", "Erreur de traitement des identités");
					}
				}
			}

			if (0!=nbIdent){
				MailServices.accounts.saveAccountInfo();
				this.logMsg("Fin d'ajout des identités", "SUCCES ("+nbIdent+" identité(s) ajoutée(s)");
			}
			else{
				this.logMsg("Fin d'ajout des identités", "SUCCES");
			}

			return true;

		} catch(ex){
			this.logMsg("AjoutIdentites exception", ex);
		}
		this.logMsg("Fin d'ajout des identités", "ERREUR");
		this.Erreur="Echec d'ajout des identités (5)";
		return false;
	},

	// ajout les signatures sur les identitées
	// pour les comptes pablo avec plusieurs identités
	// AjoutIdentites doit avoir été appelée avant
	AjoutSignatures: function(){

		try{

			this.logMsg("Ajout des signatures");

			for (let b=0;b<this._infosPablo.boites.length;b++){
				let boite=this._infosPablo.boites[b];

				let compte=this._getAccountForEmail(boite.identities[0].useremail);

				if (compte!=null) {

					let idents=compte.identities;

					for (let i=0;i<boite.identities.length;i++){
						let identPablo=boite.identities[i];

						for (let identity of fixIterator(compte.identities, Components.interfaces.nsIMsgIdentity)){

							if (identity.email==identPablo.useremail){

								let pref="mail.identity."+identity.key;
								Services.prefs.setBoolPref(pref+".attach_signature", identPablo.attach_signature);
								if (identPablo.sig_file!=""){
									let sig_file=identPablo.sig_file;
									Services.console.logStringMessage("*** AjoutSignatures identPablo.sig_file:'"+identPablo.sig_file+"'");
									if (this.TestCheminProfilPablo(sig_file)){
										// le copier dans le profil courant (si inexistant)
										let pabloSig=new FileUtils.File(sig_file);

										let profilCourant=Services.dirsvc.get("ProfD", Components.interfaces.nsIFile);
										let fichierDest=profilCourant.clone();
										fichierDest.append(pabloSig.leafName);

										sig_file=fichierDest.path;
										if (!fichierDest.exists()){
											this.logMsg("Copie du fichier signature dans le nouveau profil", identPablo.sig_file);
											pabloSig.copyTo(profilCourant, pabloSig.leafName);
										}
									}
									this.logMsg("Ajout du fichier signature", sig_file);
									Services.prefs.setCharPref(pref+".sig_file", sig_file);
								}
								if (identPablo.htmlSigText!="") this.logMsg("Ajout de la signature texte");
								Services.prefs.setStringPref(pref+".htmlSigText", identPablo.htmlSigText);
								Services.prefs.setBoolPref(pref+".htmlSigFormat", identPablo.htmlSigFormat);
								Services.prefs.setBoolPref(pref+".sig_bottom", identPablo.sig_bottom);
								Services.prefs.setBoolPref(pref+".attach_vcard", identPablo.attach_vcard);
								Services.prefs.setBoolPref(pref+".escapedVCard", identPablo.escapedVCard);
								break;
							}
						}
					}
				}
			}
			this.logMsg("Ajout des signatures", "SUCCES");
			return true;

		} catch(ex){
			this.logMsg("AjoutSignatures exception", ex);
		}
		this.logMsg("Ajout des signatures", "ERREUR");
		this.Erreur="Echec d'ajout des signatures (6)";
		return false;
	},

	// ajoute les catégories Pablo
	AjoutCategories: function(){

		if (this._infosPablo.categories==""){
			this.logMsg("Aucune catégorie a ajouter");
			return true;// pas une erreur
		}

		this.logMsg("Ajout des catégories");

		try{

			let cats=this.getCharPref("calendar.categories.names", "").split(",");
			let catsPablo=this._infosPablo.categories.split(",");
			for (let i=0;i<catsPablo.length;i++){
				let cat=catsPablo[i];
				if (!cats.includes(cat)){
					this.logMsg("Ajout de la catégorie", cat);
					cats.push(cat);
				}
			}

			let allCats=cats.join(",");
			this.logMsg("Ajout des catégories", allCats);
			Services.prefs.setStringPref("calendar.categories.names", allCats);

			this.logMsg("Ajout des catégories", "SUCCES");
			return true;

		} catch(ex){
			this.logMsg("AjoutCategories exception", ex);
		}
		this.logMsg("Ajout des catégories", "ERREUR");
		this.Erreur="Echec d'ajout des catégories (7)";
		return false;
	},

	// ajoute les étiquettes Pablo
	AjoutEtiquettes: function(){

		try{

			this.logMsg("Ajout des étiquettes");

			let tags=MailServices.tags.getAllTags({});

			for (let i=0;i<this._infosPablo.etiqs.length;i++){

				let etiq=this._infosPablo.etiqs[i];
				let bIn=false;
				for (let c=0;c<tags.length;c++){
					if (tags[c].key==etiq.key){
						bIn=true;
						break;
					}
				}
				if (!bIn){
					this.logMsg("Ajout de l'étiquette", etiq.tag);
					MailServices.tags.addTagForKey(etiq.key, etiq.tag, etiq.color, etiq.ordinal);
				}
			}

			this.logMsg("Ajout des étiquettes", "SUCCES");
			return true;

		} catch(ex){
			this.logMsg("AjoutEtiquettes exception", ex);
		}
		this.logMsg("Ajout des étiquettes", "ERREUR");
		this.Erreur="Echec d'ajout des étiquettes (8)";
		return false;
	},

	// migration des filtres de messages
	MigreFiltresBoites: function(){

		try{

			this.logMsg("Migration des filtres de messages");

			for (let b=0;b<this._infosPablo.boites.length;b++){

				let boite=this._infosPablo.boites[b];

				let compte=this._getAccountForEmail(boite.identities[0].useremail);

				if (compte!=null) {

					// _boite: {"directory":"", "mailServer":"", "userName":"", "name":"",
					let filtreSrc=new FileUtils.File(boite.directory);
					filtreSrc.append("msgFilterRules.dat");

					if (!filtreSrc.exists()){
						this.logMsg("Fichier inexistant (pas une erreur)", filtreSrc.path);
						continue;
					}

					// fichier MCE
					let filtreDest=compte.incomingServer.localPath.clone();
					filtreDest.append("msgFilterRules.dat");

					this.logMsg("Migration des filtres de boite", boite.name);
					let res=cm2AmMigreFichier(filtreSrc, filtreDest, boite.mailServer, compte.incomingServer.hostName);
					if (!res){
						this.logMsg("Echec de migration des filtres", boite.name);
						this.Erreur="Echec de migration des filtres de message (9)";
						return false;
					}
					else {
						this.logMsg("Succes de migration des filtres de la boite", boite.name);
						this._infosPablo.boites[b].filtresok=true;
					}
				}
			}

			this.logMsg("Fin de migration des filtres de messages", "SUCCES");
			return true;

		} catch(ex){
			this.logMsg("MigreFiltresBoites exception", ex);
		}
		this.logMsg("Fin de migration des filtres de messages", "ERREUR");
		this.Erreur="Echec de migration des filtres de message (9)";
		return false;
	},



	// ajouter les carnets Pablo
	AjoutCarnetsPablo: function(){

		try{

			this.logMsg("Ajout des carnets Pablo");

			let adrProps=Services.strings.createBundle("chrome://messenger/locale/addressbook/addressBook.properties");
			let nom;
			let prefId;
			let fichierMab;
			let book;

			for (let c=0;c<this._infosPablo.carnets.length;c++){
				let carnet=this._infosPablo.carnets[c];
				Services.console.logStringMessage("*** AjoutCarnetsPablo carnet.carnetId:"+carnet.carnetId);

				if (carnet.carnetId=="pab"){
					// créé automatiquement par tb
					if (carnet.position==0){
						// carnet non affiché dans Pablo
						Services.prefs.setIntPref("ldap_2.servers.pab.position", 0);
						this.logMsg("Le carnet 'pab' n'est pas affiche dans Pablo", "masqué dans le nouveau profil");
					}
					nom=adrProps.GetStringFromName("ldap_2.servers.pab.description");
					prefId="ldap_2.servers.pab";
					fichierMab="abook.mab";
					book=MailServices.ab.getDirectoryFromId(prefId);
				}
				else if ("history"==carnet.carnetId){
					// créé automatiquement par tb
					nom=adrProps.GetStringFromName("ldap_2.servers.history.description");
					prefId="ldap_2.servers.history";
					fichierMab="history.mab";
					book=MailServices.ab.getDirectoryFromId(prefId);
					continue;
				}
				else {
					// autre carnet utilisateur
					nom=carnet.description;
					fichierMab="";
					this.logMsg("Ajout du carnet", nom);
					this.logMsg("Ajout du carnet.carnetId", carnet.carnetId);
					prefId=MailServices.ab.newAddressBook(carnet.description, null, 2, "ldap_2.servers."+carnet.carnetId);
					Services.console.logStringMessage("*** newAddressBook prefId:"+prefId);

					book=MailServices.ab.getDirectoryFromId(prefId);
					fichierMab=book.fileName;
				}

				if (carnet.carnetId=="pab" && carnet.position==0) continue;

				let profilCourant=Services.dirsvc.get("ProfD", Components.interfaces.nsIFile);
				let cheminMAB=profilCourant.clone();
				cheminMAB.append(fichierMab);
				Services.console.logStringMessage("*** cheminMAB:"+cheminMAB.path);
				let adMBDir=book.QueryInterface(Components.interfaces.nsIAbMDBDirectory);
				adMBDir.database.forceClosed();

				// copier le fichier du profil Pablo dans le profil courant
				let pabloMab=new FileUtils.File(this._infosPablo.cheminPablo);
				pabloMab.append(carnet.filename);
				this.logMsg("Copie du fichier du carnet dans le nouveau profil", pabloMab.path);
				this.logMsg("Nouveau nom de fichier du carnet", fichierMab);
				pabloMab.copyTo(profilCourant, fichierMab);

				adMBDir.database.openMDB(cheminMAB, false);
			}

			this.logMsg("Fin d'ajout des carnets Pablo", "SUCCES");
			return true;

		} catch(ex){
			this.logMsg("AjoutCarnetsPablo exception", ex);
		}

		this.logMsg("Fin d'ajout des carnets Pablo", "ERREUR");
		this.Erreur="Echec d'ajout des carnets Pablo (10)";
		return false;
	},

	// Paramétrage des carnets
	// Positionne les préférences et copier les fichiers mab pablo.
	// pour appel depuis choix-profil-pablo.js
	ParametrageCarnets: function(){

		try{

			this.logMsg("Paramétrage des carnets Pablo");

			let adrProps=Services.strings.createBundle("chrome://messenger/locale/addressbook/addressBook.properties");
			let prefId;
			let nom;
			let fichierMab;

			for (let c=0;c<this._infosPablo.carnets.length;c++){

				let carnet=this._infosPablo.carnets[c];
				prefId="ldap_2.servers."+carnet.carnetId;
				Services.console.logStringMessage("*** ParametrageCarnets prefId:"+prefId);

				if (carnet.carnetId=="pab"){
					// créé automatiquement par tb
					if (carnet.position==0){
						// carnet non affiché dans Pablo
						Services.prefs.setIntPref("ldap_2.servers.pab.position", 0);
						this.logMsg("Le carnet 'pab' n'est pas affiche dans Pablo", "masqué dans le nouveau profil");
					}
					fichierMab=Services.prefs.getCharPref(prefId+".filename", "abook.mab");
				}
				else if ("history"==carnet.carnetId){
					// créé automatiquement par tb
					nom=adrProps.GetStringFromName(prefId+".description");
					fichierMab=Services.prefs.getCharPref(prefId+".filename", "history.mab");
				}
				else {
					// autre carnet utilisateur
					Services.prefs.setCharPref(prefId+".filename", carnet.filename);
					Services.prefs.setIntPref(prefId+".dirType", 2);
					nom=carnet.description;
					Services.prefs.setStringPref(prefId+".description", nom);
					fichierMab=carnet.filename;
				}

				this.logMsg("Paramétrage du carnet", nom);

				// copier le fichier du profil Pablo dans le profil courant
				let pabloMab=new FileUtils.File(this._infosPablo.cheminPablo);
				pabloMab.append(carnet.filename);
				this.logMsg("Copie du fichier du carnet dans le nouveau profil", pabloMab.path);
				let profilCourant=Services.dirsvc.get("ProfD", Components.interfaces.nsIFile);
				pabloMab.copyTo(profilCourant, fichierMab);

			}

			this.logMsg("Fin de paramétrage des carnets Pablo", "SUCCES");

			Services.prefs.savePrefFile(null);

			return true;

		} catch(ex){
			this.logMsg("ParametrageCarnets exception", ex);
		}

		this.logMsg("Fin de paramétrage des carnets Pablo", "ERREUR");
		this.Erreur="Echec de paramétrage des carnets Pablo (10)";
		return false;
	},

	// paramétrer l'impression
	ParamImpression: function(){

		try{

			this.logMsg("Paramétrage de l'impression");

			for (let i=0;i<this._infosPablo.impression.length;i++){
				let print=this._infosPablo.impression[i];
				if (typeof print.valeur === "string")
					Services.prefs.setCharPref("print."+print.prefId, print.valeur);
				else if (typeof print.valeur === "number")
					Services.prefs.setIntPref("print."+print.prefId, print.valeur);
				else if (typeof print.valeur === "boolean")
					Services.prefs.setBoolPref("print."+print.prefId, print.valeur);
				else{
					this.logMsg("ParamImpression erreur de type", "print."+print.prefId);
				}
			}

			this.logMsg("Fin de paramétrage de l'impression", "SUCCES");

			return true;

		} catch(ex){
			this.logMsg("ParamImpression exception", ex);
		}

		this.logMsg("Fin de paramétrage de l'impression", "ERREUR");
		this.Erreur="Echec du paramétrage de l'impression (11)";
		return false;
	},

	// paramétrer les flux
	ParamFlux: function(){

		let res=true;

		try{
			this.logMsg("Paramétrage des flux");

			for (let i=0;i<this._infosPablo.flux.length;i++){
				let flux=this._infosPablo.flux[i];

				this.logMsg("Paramétrage du compte de flux", flux.name);
				Services.console.logStringMessage("*** ParamFlux flux.directory:"+flux.directory);

				let serveur=MailServices.accounts.createIncomingServer("nobody", flux.hostname, "rss");
				serveur.prettyName=flux.name;
				serveur.valid=true;

				// dossier
				if (!this.TestCheminProfilPablo(flux.directory)){
					this.logMsg("Conservation du chemin du flux", flux.directory);
					let rep=new FileUtils.File(flux.directory);
					serveur.localPath=rep;
				}
				else{
					// recopier le dossier source dans celui de destination
					let repSrc=new FileUtils.File(flux.directory);

					if (!repSrc.exists()){
						this.logMsg("répertoire inexistant", repSrc.path);
						this.Erreur="Echec de reprise des flux Pablo (12)";
						return false;
					}

					res=this._copieRepertoire(repSrc, serveur.localPath);
					if (!res){
						this.logMsg("Erreur de copie du répertoire de flux");
						return res;
					}
				}

				//preferences
				let prefix="mail.server."+serveur.key;
				for (let p=0;p<flux.prefs.length;p++){
					let pref=flux.prefs[p];
					if (typeof pref.valeur === "string")
						Services.prefs.setCharPref(prefix+pref.prefId, pref.valeur);
					else if (typeof pref.valeur === "number")
						Services.prefs.setIntPref(prefix+pref.prefId, pref.valeur);
					else if (typeof pref.valeur === "boolean")
						Services.prefs.setBoolPref(prefix+pref.prefId, pref.valeur);
					else{
						this.logMsg("ParamFlux erreur de type", prefix+pref.prefId);
					}
				}

				let account=MailServices.accounts.createAccount();
				account.incomingServer=serveur;
			}

			this.logMsg("Succès du paramétrage du compte de flux");

		} catch(ex){
			this.logMsg("ParamFlux exception", ex);
			res=false;
		}
		return res;
	},

	// copie un répertoire de flux
	// repSrc : instance nsIFile source (repertoire)
	// repDest : instance nsIFile destination (repertoire)
	_copieRepertoire: function(repSrc, repDest){

		try{
			//Services.console.logStringMessage("*** _copieRepertoire repSrc:"+repSrc.path);
			//Services.console.logStringMessage("*** _copieRepertoire repDest:"+repDest.path);

			let iter=repSrc.directoryEntries;

			while (iter.hasMoreElements()){

				let item=iter.getNext();
				item=item.QueryInterface(Ci.nsIFile);
				//Services.console.logStringMessage("*** _copieRepertoire item:"+item.leafName);

				let itemNom=item.leafName;

				// ignorer si Corbeille, msf
				if (itemNom.endsWith(".msf") ||
						itemNom.startsWith("Trash") ||
						itemNom=="msgFilterRules.dat"){
					//Services.console.logStringMessage("*** _copieRepertoire ignore :"+itemNom);
					continue;
				}

				if (item.isFile()){

					// copie le fichier
					//Services.console.logStringMessage("*** _copieRepertoire copie du fichier source:"+item.path);
					item.copyTo(repDest, itemNom);
				}
				else if (item.isDirectory()){

					// creer le répertoire destination si inexistant
					let itemDest=repDest.clone();
					itemDest.append(itemNom);

					if (!itemDest.exists()){
						//Services.console.logStringMessage("*** _copieRepertoire creation du répertoire :"+itemDest.path);
						itemDest.create(Ci.nsIFile.DIRECTORY_TYPE, FileUtils.PERMS_DIRECTORY);
					}

					let res=this._copieRepertoire(item, itemDest);
					if (!res)
						return res;
				}
			}

			return true;

		} catch(ex){
			mceMigrationMCE.logMsg("_copieRepertoire exception", ex);
		}
		return false;
	},


	// retrouve le compte pour le courriel
	_getAccountForEmail: function(courriel){

		const nb=MailServices.accounts.accounts.length;
		for (var  i=0;i<nb;i++){
			let compte=MailServices.accounts.accounts.queryElementAt(i,Components.interfaces.nsIMsgAccount);
			if (compte.defaultIdentity && compte.defaultIdentity.email==courriel)
				return compte;
		}

		return null;
	},

	/* nettoyage des carnets locaux (suppression des adresses obsolètes) */
	// la liste doit etre chargée au préalable (fait dans choix-profil-pablo.js)
	NettoieCarnets: function(){

		if (0==this._infosPablo.carnets.length){
			this.logMsg("Aucun carnet à nettoyer (suppression des adresses obsolètes)");
			return false;
		}

		try{

			let addressBooks=MailServices.ab.directories;
			while (addressBooks.hasMoreElements()) {
				var adrBook=addressBooks.getNext();
				if (adrBook instanceof Components.interfaces.nsIAbDirectory && adrBook.dirType==2) {
					Services.console.logStringMessage("*** NettoieCarnets adrBook.dirPrefId:"+adrBook.dirPrefId);

					let res=this.NettoieCarnet(adrBook);
					if (!res) break;
				}
			}

			return true;

		} catch(ex){
			this.logMsg("NettoieCarnetsTous exception", ex);
		}

		return false;
	},

	NettoieCarnet: function(adressBook){

		this.logMsg("Nettoyage du carnet", adressBook.dirPrefId);

		let allCards=adressBook.childCards;
    while (allCards.hasMoreElements()) {
      let card=allCards.getNext().QueryInterface(Components.interfaces.nsIAbCard);
      let bModif=false;
			if (this.CourrielObsolete(card.primaryEmail)){
				Services.console.logStringMessage("*** NettoieCarnet suppression:"+card.primaryEmail);
				card.primaryEmail="";
				bModif=true;
			}
			if (this.CourrielObsolete(card.getProperty("SecondEmail", ""))){
				Services.console.logStringMessage("*** NettoieCarnet suppression:"+card.getProperty("SecondEmail", ""));
				card.setProperty("SecondEmail", "");
				bModif=true;
			}
			if (bModif){
				Services.console.logStringMessage("*** NettoieCarnet mise à jour de:"+card.displayName);
				adressBook.modifyCard(card);
			}
		}

		return true;
	},

	// retourne true si adresse courriel obsolète
  // tests réalisés sur le nom de domaine du courriel
  // Si un domaine de la liste commence par un point, on test si le domaine se termine par la valeur de la liste
  // sinon on teste l'égalité des domaines.
	CourrielObsolete: function(courriel){
		if (courriel==undefined || courriel=="") return false;
		if (-1==courriel.indexOf("@")) return false;
    const domaine=courriel.split("@")[1];
    const nb=this._ListeDomainesOld.length;
    for (let i=0;i<nb;i++){
      let dom=this._ListeDomainesOld[i];
      if (dom=="") continue;
      if (dom.startsWith(".") && domaine.endsWith(dom)) return true;
      if (domaine==dom) return true;
    }
    return false;
	},

	// Nettoyage des contacts : chargement du fichier des domaines obsolètes
	// chargement asynchrone
	_ListeDomainesOld:[], // tableau des domaines obsolètes
	// fncRappel : fonction de rappel argument status
	ChargeFichierDomaines: function(fncRappel=null){

		try{

			const req=new XMLHttpRequest();

			let _this=this;

			req.onload=(e)=>{

				if (req.status!=200){
					// erreur de Lecture
					mceMigrationMCE.logMsg("Erreur de lecture du fichier des domaines obsolètes", "Code erreur:"+req.status);
				}
				else {
					let re=/\r\n|\n/;
					mceMigrationMCE._ListeDomainesOld=req.responseText.split(re);
					mceMigrationMCE.logMsg("Succes de lecture du fichier des domaines obsolètes", "Nombre de lignes:"+mceMigrationMCE._ListeDomainesOld.length);
				}

				if (fncRappel) fncRappel(req.status);
			};

			let url=Services.prefs.getCharPref("pacome.urlparam");
			let pos=url.lastIndexOf("/");
			url=url.substr(0, pos);
			url+="/params/domaine-old.txt";
			mceMigrationMCE.logMsg("Lecture du fichier des domaines obsolètes", "url:"+url);

			req.open("GET", url);
			req.send();

		} catch(ex){
			mceMigrationMCE.logMsg("ChargeFichierDomaines exception", ex);
		}
	},


	/* fin fonctions de migration Pablo vers MATISSE */



	/* fonctions utilitaires */
	_getCheminProfil: function(profil){
		let pos=this.pablo_noms.indexOf(profil);
		if (-1!=pos) return this.pablo_rep[pos];
		return "";
	},

	// retourne le nom du compte principal du profil
	// rootDir : répertoire du profil
	// ne pas utiliser avec un prefs.js déjà paramétré (reset à la fin)
	_getCompteProfil: function(rootDir){

		let compte="";

		// fichier prefs.js Pablo
		let prefPablo=new FileUtils.File(rootDir);
		prefPablo.append("prefs.js");
		//Services.console.logStringMessage("***CreeInfosPablo prefPablo:"+prefPablo.path);

		Services.prefs.readUserPrefsFromFile(prefPablo);

		if (Services.prefs.prefHasUserValue("mail.accountmanager.defaultaccount")){
			let account=Services.prefs.getCharPref("mail.accountmanager.defaultaccount", "");

			if (Services.prefs.prefHasUserValue("mail.account.account1.server")){
				let server=Services.prefs.getCharPref("mail.account.account1.server", "");
				compte=this.getCharPref("mail.server."+server+".name", "");
				//Services.console.logStringMessage("*** _getCompteProfil compte:"+compte);
			}
		}

		// remet les prefs user à 0
		Services.prefs.resetPrefs();

		return compte;
	},

	// teste si un chemin de dossier local Pablo est dans le profil pablo
	// retour true si dans pablo, false si externe
	TestCheminProfilPablo: function(chemin){

		return chemin.startsWith(this._infosPablo.cheminPablo);
	},

	// génération de traces (console et fichier)
	_fichierLogs:null,
	logMsg: function(msg, details=""){

		//if (Services.prefs.getBoolPref("pacome.trace"))
		Services.console.logStringMessage(msg+" - "+ details);

		if (this._fichierLogs==null){
			let fichier=Services.dirsvc.get("ProfD", Components.interfaces.nsIFile);
			fichier.append(FICHIER_MIGRATION);
			this._fichierLogs=Components.classes["@mozilla.org/network/file-output-stream;1"].createInstance(Components.interfaces.nsIFileOutputStream);
			this._fichierLogs.init(fichier, FileUtils.MODE_WRONLY|FileUtils.MODE_CREATE|FileUtils.MODE_APPEND, FileUtils.PERMS_FILE,0);
		}

		let dh=new Date();
		let strdh="["+dh.getDate()+"/"+(dh.getMonth()+1)+"/"+dh.getFullYear()+" "+dh.getHours()+":"+dh.getMinutes()+":"+dh.getSeconds()+"]";

		let str=strdh+LOG_SEP+"[MIGRATION]"+LOG_SEP+"\""+msg+"\""+LOG_SEP+"\""+details+"\"\x0D\x0A";

		this._fichierLogs.write(str, str.length);
		this._fichierLogs.flush();
	},

	// retour true si au moins un compte à archiver (boite ou dossier)
	hasArchivage: function(){

		for (let i=0;i<mceMigrationMCE._infosPablo.dossiers.length;i++){
			let dossier=mceMigrationMCE._infosPablo.dossiers[i];
			if (dossier.archive) return true;
		}

		for (let i=0;i<mceMigrationMCE._infosPablo.boites.length;i++){
			let boite=mceMigrationMCE._infosPablo.boites[i];
			if (boite.archive) return true;
		}

		return false;
	},

	// lit une pref de type chaine et la convertit
	// pref : nom de la préférence
	// defaut : valeur par défaut
	_decoder:null,
	getCharPref: function(pref, defaut){

		if (null==this._decoder){
			this._decoder=Cc["@mozilla.org/intl/scriptableunicodeconverter"].createInstance(Ci.nsIScriptableUnicodeConverter);
			this._decoder.charset = "UTF-8";
		}

		return this._decoder.ConvertToUnicode(Services.prefs.getCharPref(pref, ""));
	},
};

