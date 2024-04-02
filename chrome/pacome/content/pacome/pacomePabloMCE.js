/**
*	Fichier pour pacomePabloMCE.xul - outil de migration Pablo vers MCE
*/

ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource://gre/modules/mceMigrationPablo.jsm");

/* pages en mode parametrage manuel avec migration Pablo (par ordre d'execution) */
const PACOME_PAGES_MIGRE_IDS=["PageIdents","PageComptes","PageCals","PageAutres","PageFin","PageMigre","PageArchive"];
//fonctions initialisation (vide si aucune)
const PACOME_PAGES_MIGRE_INIT=["InitPageIdentsPablo()", "InitPageComptes()", "InitPageCals()", "InitPageAutres()", "InitPageFin()","PageMigration()","PageArchive()"];
//fonctions boutons suivant de page (vide si aucune)
const PACOME_PAGES_MIGRE_QUITTE=["SortiePageIdents()", "PageQuitte()", "PageQuitte()", "SortiePageAutres()", "SortiePageFinMigre()","SortiePageMigration()","SortiePageArchive()"];
//etat bouton retour des pages
const PACOME_PAGES_MIGRE_BTPREC=[false,true,true,true,true,false];
//etat bouton suivant des pages
const PACOME_PAGES_MIGRE_BTSUIV=[true,true,true,true,true,true];


const PREF_MIGRATION_PABLO="courrielleur.migrationPablo";


// Initialisation de l'assistant de migration
function InitPabloMCE(){

	// déterminer s'il y a migration Pablo
	if (mceMigrationMCE.FichierMigrationPresent() &&
			!Services.prefs.prefHasUserValue(PREF_MIGRATION_PABLO)){

		mceMigrationMCE.logMsg("Affichage de l'assistant de migration Pacome");

		// charger les infos Pablo
		let res=mceMigrationMCE.LoadInfosPablo();
		Services.console.logStringMessage("*** PageMigration LoadInfosPablo:"+(res?"true":"false"));
		if (!res){
			let ok=PacomeMsgConfirm("Erreur" , "La configuration Pablo ne peut pas être lue. Continuer quand même ?");
			if (0==ok) window.close();
			else{
				// démarrage pacome en mode standard
				InitAssistant();
				return;
			}
		}

		// titre de la fenêtre
		document.title=PacomeMessageFromId("MigrePabloTitre");

    gPacomeAssitVars.fncrappel=null;
    if (window.arguments && window.arguments[0].okCallback)
      gPacomeAssitVars.fncrappel=window.arguments[0].okCallback;

    gPacomeAssitVars.ctrlSaisieUid=document.getElementById("pacomeuid");

		PacomeEcritLog(PACOME_LOGS_ASSISTANT, "initialiation en mode migration Pablo", "");
		
		gPacomeAssitVars.nouveauProfil=true;

		gPacomeAssitVars.pagesids=PACOME_PAGES_MIGRE_IDS;
		gPacomeAssitVars.pagesinit=PACOME_PAGES_MIGRE_INIT;
		gPacomeAssitVars.pagesquitte=PACOME_PAGES_MIGRE_QUITTE;
		gPacomeAssitVars.etatsbtprec=PACOME_PAGES_MIGRE_BTPREC;
		gPacomeAssitVars.etatsbtsuiv=PACOME_PAGES_MIGRE_BTSUIV;

		//elements d'interface
    const nb=gPacomeAssitVars.pagesids.length;
		//mceMigrationMCE.logMsg("*** InitPabloMCE nombre de page créées:"+nb);
    gPacomeAssitVars.pages=new Array(nb);
    for (var p=0;p<nb;p++)
      gPacomeAssitVars.pages[p]=document.getElementById(gPacomeAssitVars.pagesids[p]);
    //boutons
    gPacomeAssitVars.btretour=document.getElementById("pacome.btRetour");
    gPacomeAssitVars.btsuivant=document.getElementById("pacome.btSuivant");
    gPacomeAssitVars.btquitte=document.getElementById("pacome.btQuitter");
    //elements du bandeau
    gPacomeAssitVars.titre=document.getElementById("bandeau-titre");
    gPacomeAssitVars.texte1=document.getElementById("pacome.texte1").firstChild;
    gPacomeAssitVars.texte2=document.getElementById("pacome.texte2").firstChild;

		// surcharger le bouton Quitter de pacomecompte.xul
		gPacomeAssitVars.btquitte.setAttribute("oncommand", "btQuitteMigration();");

		// ne pas afficher de message si identifiant n'existe pas
		gPacomeAssitVars.showErrUid=false;

    //afficher 1ere page
    if (null!=gPacomeAssitVars.pagesinit[0]){

			// chargement des domaines obsolètes pour nettoyage des carnets repris
			if (0!=mceMigrationMCE._infosPablo.carnets.length){
				window.setCursor("wait");
				mceMigrationMCE.ChargeFichierDomaines(fncRappelFichierDomaines);
			}
			else {
				let fnc=gPacomeAssitVars.pagesinit[0];
				eval(fnc);
			}
    }
	}
	else{
		// démarrage pacome en mode standard

		// supprimer le fichier de données Pablo si existant
		mceMigrationMCE.DelInfosMigration();
		mceMigrationMCE._infosPablo=null;

		mceMigrationMCE.logMsg("Affichage de l'assistant Pacome en mode standard");
		InitAssistant();
	}
}

// fonction de rappel pour ChargeFichierDomaines
function fncRappelFichierDomaines(code){
	window.setCursor("auto");

	if (code!=200){
		let ok=PacomeMsgConfirm("Erreur", "La liste des domaines ne peut pas être obtenue. Continuer quand même ?");
		if (0==ok){
			Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
		}
	}

	let fnc=gPacomeAssitVars.pagesinit[0];
	eval(fnc);
}


// Ferme l'assistant de migration
function FermePabloMCE(){
	FermeAssistant();
}

// bouton quitter de l'assistant de migration
function btQuitterMCE(){

	mceMigrationMCE.logMsg("Bouton quitter de l'assistant de migration");
	// demander confirmation si non terminé
	// conséquences ?

	window.close();
}


// page migration Pablo
function PageMigration(){

	mceMigrationMCE.logMsg("Page migration");

	//appel PageInit par defaut
  PageInit();

  //zone de la page
	let liste=document.getElementById("comptes");
	// liste des boites
	let nb=mceMigrationMCE._infosPablo.boites.length;
	for (let i=0;i<nb;i++){
		let item=document.createElement("checkbox");
		if (mceMigrationMCE._infosPablo.boites[i].identities.length)
			item.setAttribute("label", "Archiver la boîte " + mceMigrationMCE._infosPablo.boites[i].identities[0].fullName);
		else
			item.setAttribute("label", "Archiver la boîte " + mceMigrationMCE._infosPablo.boites[i].name);
		item.setAttribute("value", "boite:" + i);
		item.setAttribute("checked", true);
		liste.appendChild(item);
	}

	// liste des dossiers locaux (au sens thunderbird)
	nb=mceMigrationMCE._infosPablo.dossiers.length;
	for (i=0;i<nb;i++){
		let item=document.createElement("checkbox");
		item.setAttribute("label", "Archiver les dossiers locaux " + mceMigrationMCE._infosPablo.dossiers[i].name);
		item.setAttribute("value", "dossier:" + i);
		item.setAttribute("checked", true);
		liste.appendChild(item);
	}

  gPacomeAssitVars.pages[gPacomeAssitVars.pagecourante].hidden=false;
}

/* initialisation page identifiants */
function InitPageIdentsPablo(){

  //appel PageInit par defaut
  PageInit();

  //vider la liste des identifiants
  let liste=document.getElementById("pacomeuids");
  let items=liste.getElementsByTagName("listitem");
  while (null!=items && items.length){
    liste.removeChild(items[0]);
  }

	liste.setAttribute("onselect", "SelectIdentsMigre();");

  // liste des adresses courriels à partir des données Pablo
	let uids=mceMigrationMCE._infosPablo.courriels;
  const nb=uids.length;
  for (var i=0;i<nb;i++){
    let elem=document.createElement("listitem");
    elem.setAttribute("label", uids[i]);
    liste.appendChild(elem);
  }
}

function SortiePageMigration(){

	mceMigrationMCE.logMsg("Démarrage de la migration du profil Pablo:'"+mceMigrationMCE._infosPablo.profil+"'");

	// mémoriser les comptes à archiver
	let liste=document.getElementById("comptes");
	let comptes=liste.getElementsByAttribute("checked", true);
	let index;
	for (let i=0;i<comptes.length;i++){
		let val=comptes[i].getAttribute("value");
		//Services.console.logStringMessage("*** SortiePageMigration compte coché:"+val);
		if (0==val.indexOf("boite:")){
			index=val.substr(6);
			//Services.console.logStringMessage("*** SortiePageMigration index:"+index);
			mceMigrationMCE._infosPablo.boites[index].archive=true;
		}
		else{
			index=val.substr(8);
			//Services.console.logStringMessage("*** SortiePageMigration index:"+index);
			mceMigrationMCE._infosPablo.dossiers[index].archive=true;
		}
	}

	// compléments de paramétrage Pablo et archivages
	let strPablo="";
	let resPablo=mceMigrePablo();
	if (resPablo) strPablo="SUCCES";
	else {
		strPablo="ECHEC";
		PacomeAfficheMsgIdMsgId("MigrationPabloEchecTitre", "MigrationPabloEchecText");
		Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
		return;
	}

	return true;
}

// version modifiée de SelectionIdents
// on ne supprime pas les identifiants Pablo pour la migration
function SelectIdentsMigre(){

  let idents=document.getElementById("pacomeuids");
  if (null==idents.selectedItem)
    return;
  let uid=idents.selectedItem.label;

  if (null!=uid && ""!=uid){
		let uids=mceMigrationMCE._infosPablo.courriels;
		if (uids.includes(uid)) document.getElementById("btSupprimeIdent").setAttribute("disabled", "true");
    else document.getElementById("btSupprimeIdent").removeAttribute("disabled");
	}
}

function btQuitteMigration(){

	// si on est sur la page choix des comptes pablo à archiver => message spécifique
	let res;

	if ("PageMigre"==gPacomeAssitVars.pagesids[gPacomeAssitVars.pagecourante]){
		res=PacomeMsgConfirm(PacomeMessageFromId("PageMigreTitre"), PacomeMessageFromId("MigrationAnnulationParam"));
		if (0==res)
			return;

		// pas la peine de fermer le courrielleur dans ce cas
		mceMigrationMCE.logMsg("Annulation de la migration par l'utilisateur avant reprise des données Pablo");
	}
	else{
		res=PacomeMsgConfirm(PacomeMessageFromId("PageMigreTitre"), PacomeMessageFromId("MigrationAnnulation"));
		if (0==res)
			return;
		if (window.arguments)
			window.arguments[0].res=0;
		mceMigrationMCE.logMsg("Annulation de la migration par l'utilisateur");
		Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
	}
}

// version SortiePageFin pour l'outil de migration
function SortiePageFinMigre(){

	mceMigrationMCE.logMsg("Le paramétrage va démarrer.");

	gPacomeAssitVars.btretour.setAttribute("disabled",true);
  gPacomeAssitVars.btsuivant.setAttribute("disabled",true);

	let bredemarre=false;

	// Paramétrage des comptes
	window.setCursor("wait");
	ExecParametrages();
	window.setCursor("auto");

	return true;
}


// fonction principale de la migration Pablo
// exécutée après paramétrage si mceMigrationMCE._infosPablo non null
// retour true si ok
/* Opérations de migration Pablo
	- paramétrages :
		signature sur les identités
		catégories
		étiquettes
		comptes flux

	- carnets
		carnets locaux
		collectées

	- archivages
		boites
		dossiers locaux

	- filtres de message
*/
function mceMigrePablo(){

	// marquer la migration en cours
	Services.prefs.setCharPref(PREF_MIGRATION_PABLO, "En cours");

	//Services.console.logStringMessage("*** mceMigrePablo mceMigrationMCE._infosPablo:"+mceMigrationMCE._infosPablo);

	// passage en mode offline après paramétrage pacome
	mceMigrationMCE.logMsg("Passage en mode hors ligne");
	Services.io.offline=true;

	// tout sauf archivage des messages
	let res=mceMigrationMCE.MigrePablo();

	// si erreur ou pas d'archivage => terminer
	if (!res || !mceMigrationMCE.hasArchivage()){
		TermineMigration(res);
		return;
	}

	return res;
}

function TermineMigration(result){

	if (result){

		// marquer la migration terminée => pas ici à la fin de la migration
		Services.prefs.setCharPref(PREF_MIGRATION_PABLO, (new Date()).toLocaleDateString());
		mceMigrationMCE.logMsg("Succès de la migration du profil Pablo");

		//PacomeAfficheResultats(gPacomeAssitVars.tbl_results.concat(gPacomeAssitVars.tbl_results_p), true, "SUCCES");
		// Afficher le rapport de migration
		window.openDialog("chrome://pacome/content/mceMigreRapport.xul","","chrome,modal,centerscreen,titlebar,resizable");

		PacomeRedemarreTB();
	}
	else{
		Services.prefs.setCharPref(PREF_MIGRATION_PABLO, "Echec");
		mceMigrationMCE.logMsg("Echec de la migration du profil Pablo");

		PacomeAfficheMsgIdMsgId("MigrationPabloEchecTitre", "MigrationPabloEchecText");
		Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
	}

	window.close();
}

function PageArchive(){

	// appel PageInit par defaut
  PageInit();

	ArchivagePablo(SortiePageArchive);
}

function SortiePageArchive(){

	let result=window.arguments[0].res;

	TermineMigration(result);
}
