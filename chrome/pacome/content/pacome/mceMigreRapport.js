/*
	Rapport de migration Pablo vers MATISSE

	Structure possible pour le rapport :

	Le profil Pablo <NOM Prenom> a été migré avec succès dans le nouveau profil MATISSE.
									(nom du compte principal)
	Les opérations suivantes ont été réalisées :

	Paramétrage de la boite MATISSE <NOM Prenom>
		Ajout de l'identité supplémentaire <uid>
		Ajout de la signature
		Filtres de messages Pablo récupérés

	etc...

	Paramétrage de l'agenda MATISSE <NOM Prenom>
	etc...

	Paramétrage du compte de flux <infos>
	etc...

	Reprise des carnets d'adresses locaux Pablo suivants :
	- AAA
	- BBB

	Reprise des étiquettes de messages Pablo :
	- aaa
	- bbb

	Reprise des d'événements Pablo :
	- aaa
	- bbb

	Reprise des paramètres d'impression Pablo

	Les dossiers et courriels des comptes Pablo suivants ont été récupérés :
	- Compte <NOM Prenom> dans le compte MATISSE <Archives Icasso de NOM Prenom>
	- Compte <Dossiers locaux> dans le compte MATISSE <Dossiers locaux>
	etc...


*/

ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource:///modules/mailServices.js");
ChromeUtils.import("resource://gre/modules/mceMigrationPablo.jsm");
ChromeUtils.import("resource:///modules/iteratorUtils.jsm");
ChromeUtils.import("resource://calendar/modules/calUtils.jsm");

const FICHIER_RAPPORT="migrationMATISSE.txt";


function InitMigreRapport(){

	try{

		let res=mceMigrationMCE.LoadInfosPablo();
		if (!res){
			PacomeAfficheMsgId("ErreurRapportMigre");
			close();
			return;
		}

		// générer le rapport
		res=gRapport.GenereRapport();
		if (!res){
			PacomeAfficheMsgId("ErreurRapportMigre");
			close();
			return;
		}

		// l'enregistrer dans le profil
		res=gRapport.SaveDocument();
		if (!res){
			PacomeAfficheMsgId("ErreurRapportMigre");
			close();
			return;
		}

		// l'afficher
		let browser=document.getElementById("rapport-browser");
		let fichier=Services.dirsvc.get("ProfD", Components.interfaces.nsIFile);
		fichier.append(FICHIER_RAPPORT);
		gRapport.logDebug("*** InitMigreRapport fichier:"+fichier.path);
		let fileURI=Services.io.newFileURI(fichier);

		browser.loadURI(fileURI.spec);
		//gRapport.logDebug("*** InitMigreRapport charset:"+browser.docShell.charset);

	} catch(ex){
		PacomeAfficheMsgId("ErreurRapportMigre");
		close();
	}
}

function btOK(){
	Services.startup.quit(Services.startup.eRestart|Services.startup.eForceQuit);
}


var gRapport={

	_lignes:null,

	// retourne le document complet du rappport
	GetDocument: function(){

		return this._lignes.join("\n");
	},

	// sauvegarde le document dans le profil
	SaveDocument: function(){

		try{

			let rapport=this.GetDocument();
			//this.logDebug("*** SaveDocument rapport:"+rapport);

			let fichier=Services.dirsvc.get("ProfD", Components.interfaces.nsIFile);
			fichier.append(FICHIER_RAPPORT);
			let ficRapport=Components.classes["@mozilla.org/network/file-output-stream;1"].createInstance(Components.interfaces.nsIFileOutputStream);
			ficRapport.init(fichier, FileUtils.MODE_WRONLY|FileUtils.MODE_CREATE|FileUtils.MODE_TRUNCATE, FileUtils.PERMS_FILE,0);

			ficRapport.write(rapport, rapport.length);
			ficRapport.flush();
			ficRapport.close();

			return true;

		}catch(ex){
			this.logDebug("*** SaveDocument exception:"+ex);
		}
		return false;
	},

	// construit le rapport de migration Pablo vers MATISSE
	GenereRapport: function(){

		this._lignes=[];

		let res=this.Entete();

		res = res && this.Boites();

		res = res && this.Agendas();

		res = res && this.Flux();

		res = res && this.Carnets();

		res = res && this.Etiquettes();

		res = res && this.Categories();

		res = res && this.Impression();

		res = res && this.Archivages();

		return res;
	},

	Entete: function(){

		let compte=mceMigrationMCE._infosPablo.boites[0].name;
		this._lignes.push("Le profil Pablo '"+compte+"' a été migré avec succès dans le nouveau profil MATISSE.");
		this._lignes.push("Les opérations suivantes ont été réalisées :");
		this._lignes.push("");
		return true;
	},

	Boites: function(){

		try{

			const nb=MailServices.accounts.accounts.length;
			this.logDebug("Boites nb:"+nb);

			for (let i=0;i<nb;i++){
				let compte=MailServices.accounts.accounts.queryElementAt(i,Components.interfaces.nsIMsgAccount);

				if (!compte.defaultIdentity) continue;

				this._lignes.push("Paramétrage de la boite MATISSE : '"+compte.defaultIdentity.fullName+"'");

				// ajouts Pablo si correspondance
				let pablo=this._getBoitePablo(compte);
				this.logDebug("Boites pablo: "+pablo);
				if (pablo){
					for (let n=0;n<pablo.identities.length;n++){
						let ident=pablo.identities[n];
						if (n>0){
							this._lignes.push(" - Ajout de l'identité supplémentaire :"+ident.useremail);
						}
						if (ident.attach_signature || ident.attach_vcard  || ident.htmlSigText!="")
							this._lignes.push(" - La signature Pablo a été ajoutée");
					}
					// Filtres de messages Pablo récupérés
					if (pablo.filtresok)
						this._lignes.push(" - Les filtres de messages Pablo ont été récupérés");
				}
			}
			this._lignes.push("");
			return true;
		} catch(ex){
			this.logDebug("Boites exception: "+ex);
		}
		return false;
	},

	Agendas: function(){

		try{

			let calMan=cal.getCalendarManager();
			let agendas=calMan.getCalendars({});
			const nb=agendas.length;
			this.logDebug("pacomeCalConfiguration nb="+nb);
			for (var i=0; i<nb; i++) {
				let agenda=agendas[i];
				if (agenda.getProperty("pacome")) {
					this._lignes.push("Paramétrage de l'agenda MATISSE : '"+agenda.getProperty("name")+"'");
				}
			}

			this._lignes.push("");
			return true;
		} catch(ex){
			this.logDebug("Agendas exception: "+ex);
		}
		return false;
	},

	Flux: function(){

		try{

			// comptes de flux MATISSE
			let allServers=MailServices.accounts.allServers;
      for (let server of fixIterator(allServers, Components.interfaces.nsIMsgIncomingServer)){
        if (server.type=="rss" && "flux"==server.getCharValue("pacome.confid")){
					let nom=Services.prefs.getCharPref("mail.server."+server.key+".name");
					this._lignes.push("Paramétrage du compte de flux MATISSE : '"+nom+"'");
				}
			}

			// comptes de flux Pablo
			for (let server of fixIterator(allServers, Components.interfaces.nsIMsgIncomingServer)){
        if (server.type=="rss" && null==server.getCharValue("pacome.confid")){
					let nom=Services.prefs.getCharPref("mail.server."+server.key+".name");
					this._lignes.push("Reprise du compte de flux Pablo : '"+nom+"'");
				}
			}

			this._lignes.push("");
			return true;
		} catch(ex){
			this.logDebug("Flux exception: "+ex);
		}
		return false;
	},

	Carnets: function(){

		try{

			// carnets Pablo Repris
			let b=false;
			for (let c=0;c<mceMigrationMCE._infosPablo.carnets.length;c++){
				let carnet=mceMigrationMCE._infosPablo.carnets[c];

				if (carnet.carnetId=="pab" && carnet.position==0) continue;//masqué
				if (!b){
					this._lignes.push("Reprise et nettoyage des carnets d'adresses locaux Pablo suivants :");
					b=true;
				}
				this.logDebug("Carnets ajout:"+carnet.description);
				if (carnet.carnetId=="pab") this._lignes.push(" - 'Contacts personnels'");
				else if (carnet.carnetId=="history") this._lignes.push(" - 'Adresses collectées'");
				else this._lignes.push(" - '"+carnet.description+"'");
			}

			this._lignes.push("");
			return true;
		} catch(ex){
			this.logDebug("Carnets exception: "+ex);
		}
		return false;
	},

	Etiquettes: function(){

		try{

			this._lignes.push("Reprise des étiquettes de messages Pablo :");

			for (let c=0;c<mceMigrationMCE._infosPablo.etiqs.length;c++){
				let etiq=mceMigrationMCE._infosPablo.etiqs[c];
				this._lignes.push(" - "+etiq.tag);
			}

			this._lignes.push("");
			return true;
		} catch(ex){
			this.logDebug("Etiquettes exception: "+ex);
		}
		return false;
	},

	Categories: function(){

		try{
			if (mceMigrationMCE._infosPablo.categories=="") return true;

			this._lignes.push("Reprise des catégories d'événements Pablo :");
			let cats=" - "+mceMigrationMCE._infosPablo.categories;
			cats=cats.replace(/,/g, "\n - ");
			this._lignes.push(cats);

			this._lignes.push("");
			return true;
		} catch(ex){
			this.logDebug("Categories exception: "+ex);
		}
		return false;
	},

	Impression: function(){

		try{

			if (mceMigrationMCE._infosPablo.impression.length==0) return true;

			this._lignes.push("Les paramètres d'impression Pablo ont été repris\n");

			return true;
		} catch(ex){
			this.logDebug("Impression exception: "+ex);
		}
		return false;
	},

	Archivages: function(){

		try{

			if (!mceMigrationMCE.hasArchivage()) return true;

			this._lignes.push("Les dossiers et courriels des comptes Pablo suivants ont été récupérés :");

			for (let i=0;i<mceMigrationMCE._infosPablo.boites.length;i++){
				let boite=mceMigrationMCE._infosPablo.boites[i];
				if (!boite.archive) continue;
				let libelle="Archives Icasso de "+boite.name.split("@")[0];
				let txt=" - Les messages du compte Pablo '"+boite.name+"' ont été archivés dans le dossier local MATISSE :'"+libelle+"'";
				this._lignes.push(txt);
			}

			for (let i=0;i<mceMigrationMCE._infosPablo.dossiers.length;i++){
				let dossier=mceMigrationMCE._infosPablo.dossiers[i];
				if (!dossier.archive) continue;
				let txt=" - Les messages du compte Pablo '"+dossier.name+"' ont été archivés dans le dossier local MATISSE :'"+dossier.name+"'";
				this._lignes.push(txt);
			}

			this._lignes.push("");
			return true;
		} catch(ex){
			this.logDebug("Archivages exception: "+ex);
		}
		return false;
	},

	// logs dans la console (pour dev)
	logDebug: function(msg){
		Services.console.logStringMessage("*** mceMigreRapport "+msg);
	},

	_getBoitePablo: function(compteMCE){

		let courriel=compteMCE.defaultIdentity.email;
		this.logDebug("_getBoitePablo courriel:"+courriel);
		let nb=mceMigrationMCE._infosPablo.boites.length;
		for (let i=0;i<nb;i++){
			this.logDebug("_getBoitePablo email:"+mceMigrationMCE._infosPablo.boites[i].identities[0].useremail);
			if (mceMigrationMCE._infosPablo.boites[i].identities[0].useremail==courriel)
				return mceMigrationMCE._infosPablo.boites[i];
		}
	}
};
