/* code pacome pour la configuration des comptes
	certaines parties sont reprises/adaptées depuis chrome\messenger\content\messenger\accountcreation\accountSetup.js */


const { PacomeUtils } = ChromeUtils.import("resource:///modules/pacome/pacomeUtils.jsm");
const { PacomeParam } = ChromeUtils.import("resource:///modules/pacome/pacomeParam.jsm");

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

var pdoc = {};
XPCOMUtils.defineLazyModuleGetters(pdoc, {
  PacomeDoc: "resource:///modules/pacome/pacomeDoc.jsm"
});


/* constantes des actions de parametrage */
const PACOME_ACTION_PARAM     ="param";
const PACOME_ACTION_IGNORE    ="ignore";
const PACOME_ACTION_SUPPRIME  ="supprime";
const PACOME_ACTION_PRESERVE  ="preserve";
const PACOME_ACTION_MAJ       ="maj";


//preference de la liste des uids de boites non utilisées
//uid séparés par PACOME_IGNORE_UID_SEP
const PACOME_IGNORE_UID="pacome.ignoreuids";
const PACOME_IGNORE_UID_SEP=";";

//preference de la liste des comptes de flux ignorés
//libellés séparés par PACOME_IGNORE_UID_SEP
const PACOME_IGNORE_FLUX="pacome.ignoreflux";

//preference de la liste des agendas non utilisés
//url séparés par PACOME_IGNORE_UID_SEP
const PACOME_IGNORE_CAL="pacome.cal.ignorecals";


const PACOME_LOGS_ASSISTANT="ASSISTANT";


// The main 3 Pane Window that we need to define on load in order to properly
// update the UI when a new account is created.
var gMainWindow;


// Define window event listeners.
window.addEventListener("load", () => {
  PacomeAssistant.onLoad();
});
window.addEventListener("unload", () => {
  PacomeAssistant.onUnload();
});

function onSetupComplete() {
  // Post a message to the main window at the end of a successful account setup.
  gMainWindow.postMessage("account-created", "*");
}


//liste des caractères valides pour l'identifiant
// mantis 4866 pour validation en cours de saisie
const PACOME_FILTRE_UID=/[a-z0-9\-\.\'_]+(\@[a-z0-9\-\.]*)?/i;

const PACOME_UID_MIN_LENGTH=3;
const PACOME_UID_MAX_LENGTH=64;

var ConfigAssistant={

	// 1ere page affichée
	"debut": "PacomeAssistant.InitPageUid();",

	"saisieuid" : {
		"setupView": { "class": "assistant-contenu"},
		"boites": { "class": "assistant-contenu assistant-masque"},
		"agendas": { "class": "assistant-contenu assistant-masque"},
		"autres": { "class": "assistant-contenu assistant-masque"},
		"params": { "class": "assistant-contenu assistant-masque"},
		"ctrlIdentifiant" : { "disabled" :false},
		"btRetour" : { "disabled" : true, "onclick":""},
		"btContinuer" : { "disabled" : true, "onclick":"PacomeAssistant.SortiePageUid();"},
		"pacomeTexte1" : "PageUidTexte1",
		"pacomeTexte2" : "PageUidTexte2",
		"pacomeTexte3" : "PageUidTexte3",
		"suivante": "PacomeAssistant.InitPageBoites();",
	},

	"boites" : {
		"setupView": { "class": "assistant-contenu assistant-masque"},
		"boites": { "class": "assistant-contenu"},
		"agendas": { "class": "assistant-contenu assistant-masque"},
		"autres": { "class": "assistant-contenu assistant-masque"},
		"params": { "class": "assistant-contenu assistant-masque"},
		"ctrlIdentifiant" : { "disabled" :true},
		"btRetour" : { "disabled" : false, "onclick":"PacomeAssistant.InitPageUid();"},
		"btContinuer" : { "disabled" : false, "onclick":"PacomeAssistant.SortiePageBoites();"},
		"pacomeTexte1" : "PageBoitesTexte1",
		"pacomeTexte2" : "PageBoitesTexte2",
		"pacomeTexte3" : "PageBoitesTexte3",
		"suivante": "PacomeAssistant.InitPageAgendas();",
	},

	"agendas" : {
		"setupView": { "class": "assistant-contenu assistant-masque"},
		"boites": { "class": "assistant-contenu assistant-masque"},
		"agendas": { "class": "assistant-contenu"},
		"autres": { "class": "assistant-contenu assistant-masque"},
		"params": { "class": "assistant-contenu assistant-masque"},
		"ctrlIdentifiant" : { "disabled" :true},
		"btRetour" : { "disabled" : false, "onclick":"PacomeAssistant.InitPageBoites();"},
		"btContinuer" : { "disabled" : false, "onclick":"PacomeAssistant.SortiePageAgendas();"},
		"pacomeTexte1" : "PageAgendasTexte1",
		"pacomeTexte2" : "PageAgendasTexte2",
		"pacomeTexte3" : "PageAgendasTexte3",
		"suivante": "PacomeAssistant.InitPageAutres();",
	},

	"autres" : {
		"setupView": { "class": "assistant-contenu assistant-masque"},
		"boites": { "class": "assistant-contenu assistant-masque"},
		"agendas": { "class": "assistant-contenu assistant-masque"},
		"autres": { "class": "assistant-contenu"},
		"params": { "class": "assistant-contenu assistant-masque"},
		"ctrlIdentifiant" : { "disabled" :true},
		"btRetour" : { "disabled" : false, "onclick":"PacomeAssistant.InitPageAgendas();"},
		"btContinuer" : { "disabled" : false, "onclick":"PacomeAssistant.SortiePageAutres();"},
		"pacomeTexte1" : "PageAutresTexte1",
		"pacomeTexte2" : "PageAutresTexte2",
		"pacomeTexte3" : "PageAutresTexte3",
		"suivante": "PacomeAssistant.InitPageParam();",
	},

	"params" : {
		"setupView": { "class": "assistant-contenu assistant-masque"},
		"boites": { "class": "assistant-contenu assistant-masque"},
		"agendas": { "class": "assistant-contenu assistant-masque"},
		"autres": { "class": "assistant-contenu assistant-masque"},
		"params": { "class": "assistant-contenu"},
		"ctrlIdentifiant" : { "disabled" :true},
		"btRetour" : { "disabled" : false, "onclick":"PacomeAssistant.InitPageAutres();"},
		"btContinuer" : { "disabled" : false, "onclick":"PacomeAssistant.SortiePageParam();"},
		"pacomeTexte1" : "PageParamTexte1",
		"pacomeTexte2" : "PageParamTexte2",
		"pacomeTexte3" : "PageParamTexte3",
		"suivante": "window.close();",
	}
};


/**
 * This is our controller for the entire account setup workflow.
 */
var PacomeAssistant = {

	initOk: false,

	pacomeTexte1:null,
	pacomeTexte2:null,
	pacomeTexte3:null,

	setupView:null,
	ctrlIdentifiant:null,

	// liste des boites
	boites:null,
	// liste des agendas
	agendas:null,
	// liste des flux/application/etc... (page autres)
	autres:null,
	// récapitulatif des paramétrages
	params:null,

	btRetour:null,
	btContinuer:null,
	btQuitter:null,


	// instance PacomeDoc (document de paramétrage)
	_docPacome: null,

	// choix des boites
	// tableau d'uid avec confid
	_choixboite:null,
	// choix des agendas : tableau d'identifiants à paramétrer
	_choixagendas:null,
	// choix des flux : tableau d'identifiants à paramétrer
	_choixflux: null,

	// mode mise à jour
	_modeMaj: false,
	// nombre de boites affichées
	_nbBoites: 0,
	// nombre d'agenda affichés
	_nbAgendas: 0,
	// nombre autres affichés
	_nbAutres: 0,


	onLoad(){

		this.logMsgDebug("onLoad");
		if (this.initOk) return;

		this.EcritLog("initialiation", "");

		// Store the main window.
    gMainWindow = Services.wm.getMostRecentWindow("mail:3pane");

		this.pacomeTexte1=document.getElementById("pacomeTexte1");
		this.pacomeTexte2=document.getElementById("pacomeTexte2");
		this.pacomeTexte3=document.getElementById("pacomeTexte3");

		this.setupView=document.getElementById("setupView");
		this.ctrlIdentifiant=document.getElementById("identifiant");

		this.boites=document.getElementById("boites");
		this.agendas=document.getElementById("agendas");
		this.autres=document.getElementById("autres");
		this.params=document.getElementById("params");

		this.btRetour=document.getElementById("btRetour");
		this.btContinuer=document.getElementById("btContinuer");
		this.btQuitter=document.getElementById("btQuitter");

		this.initOk=true;


		// mode mise à jour ?
		if (window.arguments &&  window.arguments.length){

			let args=window.arguments[0];

			if (args.mode && "maj"==args.mode) {

				this._modeMaj=true;

				this._docPacome=args.docPacome;

				this.logMsgDebug("onLoad mode mise a jour");

				// initialisation des pages en mode mise a jour
				this.InitModeMaj();
			}
		}

		// afficher 1ere page
		(this.AffichePage(ConfigAssistant.debut))();

		this.logMsgDebug("onLoad fin");
	},

	onUnload(){

		this.EcritLog("sortie de l'assistant", "");
	},

	AffichePage(page){

		return Function(page);
	},

	// Modification de ConfigAssistant en mode mise a jour
	// permet de gérer les pages affichées et les boutons retour
	InitModeMaj(){

		this.logMsgDebug("InitModeMaj");

		this._nbBoites=this._docPacome.GetNbMajByType("compte");
		this._nbAgendas=this._docPacome.GetNbMajByType("agenda");
		this._nbAutres=this._docPacome.GetNbMajByType("compteflux");
		this._nbAutres+=this._docPacome.GetNbMajByType("application");
		this._nbAutres+=this._docPacome.GetNbMajByType("proxy");

		// configuration des pages
		ConfigAssistant.debut="";

		if (0!=this._nbBoites) {
			ConfigAssistant.debut="PacomeAssistant.InitPageBoites();";
			ConfigAssistant.boites.btRetour.disabled=true;
			if (0==this._nbAgendas){
				if (0==this._nbAutres)
					ConfigAssistant.boites.suivante="PacomeAssistant.InitPageParam();";
				else
					ConfigAssistant.boites.suivante="PacomeAssistant.InitPageAutres();";
			}
			ConfigAssistant.boites.pacomeTexte1="PageMajComptesTitre";
			ConfigAssistant.boites.pacomeTexte2="PageMajComptesTexte1";
			ConfigAssistant.boites.pacomeTexte3="PageMajComptesTexte2";
		}
		if (0!=this._nbAgendas){
			if (ConfigAssistant.debut==""){
				ConfigAssistant.debut="PacomeAssistant.InitPageAgendas();";
				ConfigAssistant.agendas.btRetour.disabled=true;
			}
			if (0==this._nbAutres){
				ConfigAssistant.agendas.suivante="PacomeAssistant.InitPageParam();"
			}
			ConfigAssistant.agendas.pacomeTexte1="PageMajAgendasTitre";
			ConfigAssistant.agendas.pacomeTexte2="PageMajAgendasTexte1";
			ConfigAssistant.agendas.pacomeTexte3="PageMajAgendasTexte2";
		}
		if (0!=this._nbAutres){
			if (ConfigAssistant.debut==""){
				ConfigAssistant.debut="PacomeAssistant.InitPageAutres();";
			}
			if (0==this._nbBoites && 0==this._nbAgendas){
				ConfigAssistant.autres.btRetour.disabled=true;
			}
			ConfigAssistant.autres.pacomeTexte1="PageMajAutresTitre";
			ConfigAssistant.autres.pacomeTexte2="PageMajAutresTexte1";
			ConfigAssistant.autres.pacomeTexte3="PageMajAutresTexte2";
		}
		else {
			if (0!=this._nbAgendas)
				ConfigAssistant.params.btRetour.onclick="PacomeAssistant.InitPageAgendas();";
			else
				ConfigAssistant.params.btRetour.onclick="PacomeAssistant.InitPageBoites();";
		}
	},


	// fonction générique pour initialiser les pages selon configuration
	// page : ConfigAssistant.XXX
	InitPageFromConfig(page){

		this.logMsgDebug("InitPageFromConfig page:"+page);

		this.setupView.setAttribute("class", page.setupView.class);
		this.boites.setAttribute("class", page.boites.class);
		this.agendas.setAttribute("class", page.agendas.class);
		this.autres.setAttribute("class", page.autres.class);
		this.params.setAttribute("class", page.params.class);

		this.pacomeTexte1.textContent=PacomeUtils.MessageFromId(page.pacomeTexte1);
		this.pacomeTexte2.textContent=PacomeUtils.MessageFromId(page.pacomeTexte2);
		this.pacomeTexte3.textContent=PacomeUtils.MessageFromId(page.pacomeTexte3);

		this.btRetour.disabled=page.btRetour.disabled;
		this.btRetour.setAttribute("onclick", page.btRetour.onclick);
		this.btContinuer.disabled=page.btContinuer.disabled;
		this.btContinuer.setAttribute("onclick", page.btContinuer.onclick);
	},


	// cas nouveau profil
	InitPageUid(){

		this.logMsgDebug("InitPageUid");

		this.EcritLog("Affichage de la page des identifiants", "");

		this.InitPageFromConfig(ConfigAssistant.saisieuid);

		let uids=PacomeParam.ListeIdentifiants();
		this.logMsgDebug("InitPageUid ListeIdentifiants:"+uids);
		if (uids.length>0){
			this.ctrlIdentifiant.value=uids.join(";");
		}
		else{
			// pre-remplissage avec infos système
			let userInfo = Components.classes["@mozilla.org/userinfo;1"].getService(Components.interfaces.nsIUserInfo);
			this.logMsgDebug("InitPageUid userInfo.username:"+userInfo.username);
			if (userInfo && userInfo.username!="") this.ctrlIdentifiant.value=userInfo.username;
		}

		this.btContinuer.disabled=!this.ctrlIdentifiant.value!="";
	},

	// bouton suivant sur page identifiants
	SortiePageUid(){

		this.logMsgDebug("SortiePageUid");

		this.EcritLog("Identifiants", this.ctrlIdentifiant.value);

		this.btContinuer.disabled=true;
		this.btQuitter.disabled=true;

		// configuration client
		let config=PacomeParam.GetConfigClient(this.ctrlIdentifiant.value);

		this.EcritLog("Configuration client", config);

		// requête paramétrage
		PacomeUtils.ClearErreurEx();
		this._docPacome=null;

		this.sablier();

		this.EcritLog("Page de saisie d'identifiant - envoie de la requete", "");
		let res=PacomeUtils.RequeteParametrage(config, this.RetourRequete);

		// si erreur : afficher message et fermer assistant
		if (!res){
			this.AfficheMsgExit("Erreur", "Code erreur :"+PacomeUtils._codeErreur, PacomeUtils._msgErreur);
		}
	},

	// fonction de rappel pour la requete de paramétrage
	// si succès afficher liste des boites
	RetourRequete(statut, responseXML){

		PacomeAssistant.logMsgDebug("RetourRequete");

		PacomeAssistant.EcritLog("Réponse de la requête", "statut:"+statut);

		PacomeAssistant.passablier();

		PacomeAssistant.btQuitter.disabled=false;

		if (statut==200){

			PacomeAssistant.logMsg("Assistant pacome succès de la requete");

			let res=PacomeUtils.AnalyseErreurDoc(responseXML);

			if (res){

				PacomeAssistant._docPacome=new pdoc.PacomeDoc(responseXML);

				// en mode manuel => page des boites
				PacomeAssistant.InitPageBoites();

				return;
			}
		}

		//erreur
		PacomeAssistant.EcritLog("Erreur", "Code erreur :"+PacomeUtils._codeErreur+" - message:"+PacomeUtils._msgErreur);
		PacomeAssistant.AfficheMsgExit("Erreur", "Code erreur :"+PacomeUtils._codeErreur, PacomeUtils._msgErreur);
	},

	// page des boites à lettres
	InitPageBoites(){
		this.logMsgDebug("InitPageBoites");

		this.InitPageFromConfig(ConfigAssistant.boites);

		if (this._modeMaj){
			this.btRetour.disabled=true;
		}

		// vider la liste
		let res=this.VideListeElements("liste-boites");
		if (!res){
			PacomeUtils.SetErreurEx(-1, "Erreur lors de l'effacement de la liste des boites");
			this.AfficheMsgExit("Erreur", PacomeUtils._msgErreur);
			return;
		}

		// contruire liste des boites à paramétrer
		let nb=this.ConstruitListeBoites();
		if (-1==nb){
			PacomeUtils.SetErreurEx(-1, "Erreur lors de la construction de la liste des boites");
			this.AfficheMsgExit("Erreur", PacomeUtils._msgErreur);
			return;
		}
	},

	// Ajoute les boites d'apres le document de parametrage
	// retourne le nombre de boites, -1 si erreur
	ConstruitListeBoites(){

		PacomeAssistant.logMsgDebug("ConstruitListeBoites");
		try{

			//construire la liste des boites visibles
			let liste=document.getElementById("liste-boites");

			let comptes=this._docPacome.GetBoitesUI();
			if (null==comptes || 0==comptes.length){
				PacomeUtils.SetErreurEx(-1, PacomeUtils.MessageFromId("PacomeErreurPacomeUIBoite"));
				return 0;
			}
			const nb=comptes.length;
			for (let i=0;i<nb;i++){
				this.InsertBoiteUI(liste, comptes[i]);
			}

			return nb;

		} catch(ex){
			PacomeUtils.SetErreurEx(-1, PacomeUtils.MessageFromId("PacomeErreurInitListeComptes"), ex);
		}
		return -1;
	},

	// cree et insere l'élément UI d'une boite
	InsertBoiteUI(liste, boite){

		let template=document.querySelector("#boiteUI");
		let clone=document.importNode(template.content, true);

		let libelle=boite.getAttribute("libelle");
		let uid=boite.getAttribute("uid");
		let label=clone.querySelector("label");
		label.textContent=libelle;
		label.value=uid;

		let fichierimg=boite.getAttribute("image");
		let img=clone.querySelector("img");
		if (fichierimg && fichierimg!="")
			img.src+=fichierimg.replace("gif","png");
		else
			img.src+="bali.png";
		PacomeAssistant.logMsgDebug("InsertBoiteUI img src:"+img.src);

		this.InsertChoixUI(clone.querySelector("select"), boite.querySelectorAll("choix"));

		liste.appendChild(clone);
	},

	// sortie page boites
	SortiePageBoites(){
		this.logMsgDebug("SortiePageBoites");

		// mémoriser choix des boites
		this.MemoChoixUI("liste-boites", "compte", "uid");

		// afficher page suivante
		(this.AffichePage(ConfigAssistant.boites.suivante))();
	},

	// page agendas
	InitPageAgendas(){
		this.logMsgDebug("InitPageAgendas");

		this.InitPageFromConfig(ConfigAssistant.agendas);

		// vider la liste
		let res=this.VideListeElements("liste-agendas");
		if (!res){
			PacomeUtils.SetErreurEx(-1, "Erreur lors de l'effacement de la liste des agendas");
			this.AfficheMsgExit("Erreur", PacomeUtils._msgErreur);
			return;
		}

		// contruire liste des agendas à paramétrer
		let nb=this.ConstruitListeAgendas();
		if (-1==nb){
			PacomeUtils.SetErreurEx(-1, "Erreur lors de la construction de la liste des agendas");
			this.AfficheMsgExit("Erreur", PacomeUtils._msgErreur);
			return;
		}
	},


	// Ajoute les agendas d'apres le document de parametrage
	// retourne le nombre d'agendas, -1 si erreur
	ConstruitListeAgendas(){

		PacomeAssistant.logMsgDebug("ConstruitListeAgendas");
		try{

			//construire la liste des agendas visibles
			let liste=document.getElementById("liste-agendas");

			let agendas=this._docPacome.GetAgendasUI();
			if (null==agendas || 0==agendas.length){
				PacomeUtils.SetErreurEx(-1, PacomeUtils.MessageFromId("PacomeErreurListeCals"));
				return -1;
			}
			const nb=agendas.length;
			for (let i=0;i<nb;i++){
				this.InsertAgendaUI(liste, agendas[i]);
			}

			return nb;

		} catch(ex){
			PacomeUtils.SetErreurEx(-1, PacomeUtils.MessageFromId("PacomeErreurInitListeCals"), ex);
		}
		return -1;
	},

	// construit et insert une ligne agenda dans l'interface
	InsertAgendaUI(liste, agenda){

		let template=document.querySelector("#agendaUI");
		let clone=document.importNode(template.content, true);

		let libelle=agenda.getAttribute("libelle");
		let url=agenda.getAttribute("url");
		let label=clone.querySelector("label");
		label.textContent=libelle;
		label.value=url;

		this.InsertChoixUI(clone.querySelector("select"), agenda.querySelectorAll("choix"));

		liste.appendChild(clone);
	},

	// sortie page agendas
	SortiePageAgendas(){
		this.logMsgDebug("SortiePageAgendas");

		// mémoriser choix des agendas
		this.MemoChoixUI("liste-agendas", "agenda", "url");

		// afficher page suivante
		(this.AffichePage(ConfigAssistant.agendas.suivante))();
	},

	// page autres
	InitPageAutres(){
		this.logMsgDebug("InitPageAutres");

		this.InitPageFromConfig(ConfigAssistant.autres);

		//vider la liste
		let res=this.VideListeElements("liste-autres");
		if (!res){
			PacomeUtils.SetErreurEx(-1, "Erreur lors de l'effacement de la liste des éléments");
			this.AfficheMsgExit("Erreur", PacomeUtils._msgErreur);
			return;
		}

		// construire liste des flux
		let nb=this.ConstruitListeFlux();
		if (-1==nb){
			PacomeUtils.SetErreurEx(-1, "Erreur lors de la construction de la liste des flux");
			this.AfficheMsgExit("Erreur", PacomeUtils._msgErreur);
			return;
		}

		// application et proxy
		let liste=document.getElementById("liste-autres");

		let app=this._docPacome.GetAppliUI();
		if (app){
			this.InsertElemUI(liste, app, "#autreUI");
			nb++;
		}

		let proxy=this._docPacome.GetProxyUI();
		if (proxy){
			this.InsertElemUI(liste, proxy, "#autreUI");
			nb++;
		}
	},

	// Ajoute les flux d'apres le document de parametrage
	// retourne le nombre de comptes, -1 si erreur
	ConstruitListeFlux(){

		PacomeAssistant.logMsgDebug("ConstruitListeFlux");

		try{

			//construire la liste des flux visibles
			let liste=document.getElementById("liste-autres");

			let fluxAll=this._docPacome.GetFluxUI();
			if (0==fluxAll.length){
				// pas une erreur
				this.logMsgDebug("ConstruitListeFlux aucun flux");
				return 0;
			}
			const nb=fluxAll.length;
			for (let i=0;i<nb;i++){
				this.InsertElemUI(liste, fluxAll[i], "#fluxUI");
			}

			return nb;

		} catch(ex){
			PacomeUtils.SetErreurEx(-1, PacomeUtils.MessageFromId("PacomeErreurInitListe"), ex);
		}
		return -1;
	},

	// construit et insert une ligne avec libellé et choix dans l'interface
	InsertElemUI(liste, elem, templateId){

		let template=document.querySelector(templateId);
		let clone=document.importNode(template.content, true);

		let libelle=elem.getAttribute("libelle");
		let label=clone.querySelector("label");
		label.textContent=libelle;
		label.value=libelle;

		this.InsertChoixUI(clone.querySelector("select"), elem.querySelectorAll("choix"));

		liste.appendChild(clone);
	},

	// sortie page autres
	SortiePageAutres(){
		this.logMsgDebug("SortiePageAutres");

		// mémoriser choix des flux
		this.MemoChoixUI("autres", "compteflux", "libelle");

		// mémoriser choix application
		this.MemoChoixUI("autres", "application", "libelle");

		// mémoriser choix proxy
		this.MemoChoixUI("autres", "proxy", "libelle");

		// afficher page suivante
		(this.AffichePage(ConfigAssistant.autres.suivante))();
	},


	// page paramétrage - récupitulatif des actins
	InitPageParam(){

		this.logMsgDebug("InitPageParam");

		this.InitPageFromConfig(ConfigAssistant.params);

		// vérifier qu'au moins une operation de paramétrage a été sélectionnée
		let nbparam=0;

		//vider la liste
		let res=this.VideListeElements("liste-params");
		if (!res){
			PacomeUtils.SetErreurEx(-1, "Erreur lors de l'effacement de la liste des éléments");
			this.AfficheMsgExit("Erreur", PacomeUtils._msgErreur);
			return;
		}

		// éléments avec defaut à "true" et action "params" ou "maj"
		// boites visibles
		let comptes=this._docPacome.GetBoitesUI();
		for (let i=0;i<comptes.length;i++){
			let boite=comptes[i];
			this.logMsgDebug("InitPageParam boite:"+boite.getAttribute("libelle"));
			let choix=this._docPacome.GetChoixDefaut(boite);
			nbparam+=this.InsertParamUI(boite.getAttribute("libelle"), "chrome://pacome/content/img/"+boite.getAttribute("image"), choix.getAttribute("libelle"));
		}

		// agendas visibles
		let agendas=this._docPacome.GetAgendasUI();
		for (let i=0;i<agendas.length;i++){
			let agenda=agendas[i];
			this.logMsgDebug("InitPageParam agenda:"+agenda.getAttribute("libelle"));
			let choix=this._docPacome.GetChoixDefaut(agenda);
			nbparam+=this.InsertParamUI(agenda.getAttribute("libelle"), "chrome://pacome/content/img/calendar.gif", choix.getAttribute("libelle"));
		}

		// flux visibles
		let compteflux=this._docPacome.GetFluxUI();
		for (let i=0;i<compteflux.length;i++){
			let flux=compteflux[i];
			this.logMsgDebug("InitPageParam flux:"+flux.getAttribute("libelle"));
			let choix=this._docPacome.GetChoixDefaut(flux);
			nbparam+=this.InsertParamUI(flux.getAttribute("libelle"), "chrome://messenger/skin/icons/new/compact/rss.svg", choix.getAttribute("libelle"));
		}

		// application
		let appli=this._docPacome.GetAppliUI();
		if (appli){
			let choix=this._docPacome.GetChoixDefaut(appli);
			nbparam+=this.InsertParamUI(appli.getAttribute("libelle"), "", choix.getAttribute("libelle"));
		}

		//proxy
		let proxy=this._docPacome.GetProxyUI();
		if (proxy){
			let choix=this._docPacome.GetChoixDefaut(proxy);
			nbparam+=this.InsertParamUI(proxy.getAttribute("libelle"), "", choix.getAttribute("libelle"));
		}

		// si la liste est vide => message et bouton continuer désactivé
		if (nbparam==0){
			this.btContinuer.disabled=true;
			this.AfficheMsg("", PacomeUtils.MessageFromId("PacomeAucuneAction"));
			this.pacomeTexte1.textContent=PacomeUtils.MessageFromId("PacomeAucuneActionTitre1");
			this.pacomeTexte2.textContent=PacomeUtils.MessageFromId("PacomeAucuneActionTitre2");
			this.pacomeTexte3.textContent="";
		}
	},

	// construit et insert une ligne avec libellé et libelle choisi (page récapitulatif des paramétrages)
	InsertParamUI(libelle, imgsrc, choix){

		this.logMsgDebug("InsertParamUI libelle:"+libelle);

		let liste=document.getElementById("liste-params");
		let template=document.querySelector("#paramUI");
		let clone=document.importNode(template.content, true);

		let label=clone.getElementById("libElem");
		label.textContent=libelle;
		if (imgsrc && ""!=imgsrc){
			let img=clone.querySelector("img");
			img.src=img.src+imgsrc;
		}
		let action=clone.getElementById("libAction");
		action.textContent=choix;

		liste.appendChild(clone);
	},


	// sortie page paramétrage
	SortiePageParam(){

		// désactiver les boutons
		this.btRetour.disabled=true;
		this.btContinuer.disabled=true;
		this.btQuitter.disabled=true;

		// réaliser les paramétrages
		this.EcritLog("Réalisation des opérations de paramétrage", "");

		// boites
		let res=this.ParamBoites();
		if (-1==res){
			// erreur de paramétrage => message + stop
			this.AfficheMsgExit("Erreur", PacomeUtils._msgErreur);
			this.EcritLog("Erreur des boites", PacomeUtils._msgErreur);
			return;
		}

		// pour les nouveaux profils, créer le compte dossiers locaux
		res=PacomeParam.ParamDossiersLocaux();
		if (-1==res){
			// erreur de paramétrage => message + stop
			this.AfficheMsgExit("Erreur", PacomeUtils._msgErreur);
			return;
		}

		// agendas
		res=this.ParamAgendas();
		if (-1==res){
			// erreur de paramétrage => message + stop
			this.AfficheMsgExit("Erreur", PacomeUtils._msgErreur);
			this.EcritLog("Erreur des agendas", PacomeUtils._msgErreur);
			return;
		}

		// comptes de flux
		res=this.ParamFlux();
		if (-1==res){
			// erreur de paramétrage => message + stop
			this.AfficheMsgExit("Erreur", PacomeUtils._msgErreur);
			this.EcritLog("Erreur des comptes de flux", PacomeUtils._msgErreur);
			return;
		}

		// application
		res=this.ParamAppli();
		if (-1==res){
			// erreur de paramétrage => message + stop
			this.AfficheMsgExit("Erreur", PacomeUtils._msgErreur);
			this.EcritLog("Erreur de paramétrage du courrielleur", PacomeUtils._msgErreur);
			return;
		}

		// proxy
		res=this.ParamProxy();
		if (-1==res){
			// erreur de paramétrage => message + stop
			this.AfficheMsgExit("Erreur", PacomeUtils._msgErreur);
			this.EcritLog("Erreur de paramétrage du proxy", PacomeUtils._msgErreur);
			return;
		}

		// afficher le résultat (popup)
		this.EcritLog("Succès des opérations de paramétrage", "");
		this.AfficheMsgExit("Succès", PacomeUtils.MessageFromId("PacomeFinParamTexte2"));

		this.btQuitter.setAttribute("onclick", "window.close();");
		this.btQuitter.disabled=false;
	},

	// paramétrage des boites
	// retourne le nombre de boites paramétrées
	// -1 si erreur
	ParamBoites(){

		let nbparam=0;

		// boites visibles
		let boites=this._docPacome.GetBoitesUI();
		if (boites.length) this.EcritLog("Parametrage des boites", "");

		for (let i=0;i<boites.length;i++){

			let boite=boites[i];

			let choix=this._docPacome.GetChoixDefaut(boite);
			let action=choix.getAttribute("action");
			let uid=boite.getAttribute("uid");
			let libelle=boite.getAttribute("libelle");
			let confid=choix.getAttribute("confid");
			let res=-1;

			this.logMsgDebug("ParamBoites boite:"+libelle);

			try{

				switch (action){

					case PACOME_ACTION_PARAM :
					case PACOME_ACTION_MAJ :

						// paramétres de boites
						let params=this._docPacome.GetParamsBoite(uid, confid);
						if (null==params){
							// devrait pas !!!
							PacomeUtils.SetErreurEx(-1, "Erreur de paramétrage de boite");
							return -1;
						}

						this.EcritLog("Parametrage de la boite", libelle);
						res=PacomeParam.ParamBoite(params, action);
						if (1!=res){
							return -1;
						}

						PacomeParam.UsageUid(uid, PACOME_IGNORE_UID);

						nbparam++;
						break;

					case PACOME_ACTION_SUPPRIME :

						this.EcritLog("Suppression de la boite", libelle);
						res=PacomeParam.SupprimeBoite(uid, confid);

						if (1==res) PacomeParam.UsageUid(uid, PACOME_IGNORE_UID);

						nbparam++;
						break;

					case PACOME_ACTION_IGNORE
					:
						// suppression si existe
						PacomeParam.SupprimeBoite(uid, confid);

						PacomeParam.IgnoreUid(uid, PACOME_IGNORE_UID);
						nbparam++;
						break;

					case PACOME_ACTION_PRESERVE :
						// on ne fait rien
						break;

					default : // devrait pas
					PacomeUtils.SetErreurEx(-1, "Erreur de paramétrage de boite action="+action);
					return -1;
				}

			} catch(ex){
				PacomeUtils.SetErreurEx(-1, "Erreur de paramétrage de boite", ex);
				return -1;
			}
		}

		this.logMsgDebug("ParamBoites nbparam:"+nbparam);
		return nbparam;
	},


	// paramétrage des agendas visibles
	// retourne le nombre d'agendas paramétrées
	// -1 si erreur
	ParamAgendas(){

		let nbparam=0;
		let agendas=this._docPacome.GetAgendasUI();
		if (agendas.length) this.EcritLog("Parametrage des agendas", "");

		for (let i=0;i<agendas.length;i++){

			let agenda=agendas[i];

			let libelle=agenda.getAttribute("libelle");
			this.logMsgDebug("ParamAgendas agenda:"+libelle);

			let choix=this._docPacome.GetChoixDefaut(agenda);
			let action=choix.getAttribute("action");
			let url=agenda.getAttribute("url");
			let res=-1;

			try{

				switch (action){
					case PACOME_ACTION_PARAM :
					case PACOME_ACTION_MAJ :

						// paramétres d'agendas
						let params=this._docPacome.GetParamsAgenda(url);
						if (null==params){
							// devrait pas !!!
							PacomeUtils.SetErreurEx(-1, "Erreur de paramétrage d'agenda (paramétrage absent!)");
							return -1;
						}

						this.EcritLog("Parametrage de l'agenda", libelle);

						if (action==PACOME_ACTION_PARAM)
							res=PacomeParam.AjoutAgenda(params);
						else
							res=PacomeParam.ModifieAgenda(params);

						if (1!=res){
							return -1;
						}

						PacomeParam.UsageUid(url, PACOME_IGNORE_CAL);

						nbparam++;
						break;

					case PACOME_ACTION_SUPPRIME :

						this.EcritLog("Suppression de l'agenda", libelle);

						res=PacomeParam.SupAgenda(url);
						if (1!=res){
							return -1;
						}
						PacomeParam.UsageUid(url, PACOME_IGNORE_CAL);
						nbparam++;
						break;

					case PACOME_ACTION_IGNORE :
						// suppression si existe (pas une erreur)
						PacomeParam.SupAgenda(url);

						PacomeParam.IgnoreUid(url, PACOME_IGNORE_CAL);

						nbparam++;
						break;

					case PACOME_ACTION_PRESERVE :
						// on ne fait rien
						break;

					default : // devrait pas
					PacomeUtils.SetErreurEx(-1, "Erreur de paramétrage d'agenda action="+action);
					return -1;
				}

			} catch(ex){
				PacomeUtils.SetErreurEx(-1, "Erreur de paramétrage d'agenda", ex);
				return -1;
			}
		}

		this.logMsgDebug("ParamAgendas nbparam:"+nbparam);
		return nbparam;
	},


	// paramétrage des flux
	// retourne le nombre de comptes de flux paramétrés
	// -1 si erreur
	ParamFlux(){

		let nbparam=0;
		let comptes=this._docPacome.GetFluxUI();
		if (comptes.length) this.EcritLog("Parametrage des comptes de flux", "");

		for (let i=0;i<comptes.length;i++){

			let flux=comptes[i];

			let choix=this._docPacome.GetChoixDefaut(flux);
			let action=choix.getAttribute("action");
			let libelle=flux.getAttribute("libelle");
			this.logMsgDebug("ParamFlux flux:"+libelle);

			try{

				switch (action){
					case PACOME_ACTION_PARAM :
					case PACOME_ACTION_MAJ :

						// paramétres du compte de flux
						let params=this._docPacome.GetParamsFlux(libelle);
						if (null==params){
							// devrait pas !!!
							PacomeUtils.SetErreurEx(-1, "Erreur de paramétrage de flux");
							return -1;
						}

						if (action==PACOME_ACTION_PARAM){
							res=PacomeParam.AjoutCompteFlux(params);
						}
						else{
							res=PacomeParam.ModifieCompteFlux(params);
						}

						if (1!=res){
							PacomeUtils.SetErreurEx(-1, "Erreur de paramétrage de flux");
							return -1;
						}

						PacomeParam.UsageUid(libelle, PACOME_IGNORE_FLUX);

						nbparam++;
						break;

					case PACOME_ACTION_SUPPRIME :

						res=PacomeParam.SupCompteFlux(libelle);
						if (1!=res){
							PacomeUtils.SetErreurEx(-1, "Erreur de suppression de flux");
							return -1;
						}

						PacomeParam.UsageUid(libelle, PACOME_IGNORE_FLUX);

						nbparam++;
						break;

					case PACOME_ACTION_IGNORE :
						// suppression si existe (pas une erreur)
						PacomeParam.SupCompteFlux(libelle);

						PacomeParam.IgnoreUid(libelle, PACOME_IGNORE_FLUX);

						nbparam++;
						break;

					case PACOME_ACTION_PRESERVE :
						// on ne fait rien
						break;

					default : // devrait pas
					PacomeUtils.SetErreurEx(-1, "Erreur de paramétrage de compte de flux action="+action);
					return -1;
				}

				nbparam++;

			} catch(ex){
				PacomeUtils.SetErreurEx(-1, "Erreur de paramétrage de compte de flux", ex);
				return -1;
			}
		}

		this.logMsgDebug("ParamFlux nbparam:"+nbparam);
		return nbparam;
	},

	ParamAppli(){

		try{

			let appli=this._docPacome.GetAppliUI();
			if (null==appli){
				return 0;
			}

			this.EcritLog("Parametrage du courrielleur", "");

			let choix=this._docPacome.GetChoixDefaut(appli);
			let action=choix.getAttribute("action");

			if (action==PACOME_ACTION_PRESERVE){
				// on ne fait rien
				return 1;
			}

			let res=PacomeParam.ParamAppli(this._docPacome, action);
			this.logMsgDebug("ParamAppli PacomeParam.ParamAppli:"+res);
			return res;

		} catch(ex){
			PacomeUtils.SetErreurEx(-1, "Erreur de paramétrage d'application", ex);
		}

		return -1;
	},

	ParamProxy(){

		this.logMsgDebug("ParamProxy");

		try{

			let proxy=this._docPacome.GetProxyUI();
			if (null==proxy){
				return 0;
			}

			let choix=this._docPacome.GetChoixDefaut(proxy);
			let action=choix.getAttribute("action");

			if (action==PACOME_ACTION_PRESERVE){
				// on ne fait rien
				return 1;
			}

			let params=this._docPacome.GetParamsProxy();

			this.EcritLog("Parametrage du proxy", "");

			let res=PacomeParam.ParamProxy(params);

			return res;

		} catch(ex){
			PacomeUtils.SetErreurEx(-1, "Erreur de paramétrage proxy", ex);
		}

		return -1;
	},


	// ajoute les options de choix de paramétrage (choix_ui)
	InsertChoixUI(selectUI, choix){

		for (let i=0;i<choix.length;i++){
			let ch=choix[i];
			let elem=document.createElement("option");

			let libelle=ch.getAttribute("libelle");
			elem.setAttribute("label", libelle);
			elem.setAttribute("value", libelle);
			elem.setAttribute("action", ch.getAttribute("action"));
			elem.setAttribute("confid", ch.getAttribute("confid"));

			selectUI.appendChild(elem);

			if ("true"==ch.getAttribute("defaut")) elem.setAttribute("selected", true);
		}
	},

	// mémorise les choix utilisateur de paramétrage
	// modifie choix_ui du document de paramétrage
	// listeId : id liste des éléments (boites, ...)
	// typeElem : "compte", "agenda", etc...
	// ident : "uid", "url"
	// ignore les éléments non visible
	MemoChoixUI(listeId, typeElem, ident){

		this.logMsgDebug("MemoChoixUI typeElem:"+typeElem);

		let liste=document.getElementById(listeId);
		// elements visibles
		let elems=this._docPacome.GetElemsUI(typeElem);
		const nb=elems.length;
		for (let i=0;i<nb;i++){
			let elem=elems[i];
			let idElem=elem.getAttribute(ident);
			this.logMsgDebug("MemoChoixUI idElem:"+idElem);
			let choix_ui=elem.querySelectorAll("choix");
			let sel=this.GetSelectUI(liste, idElem);
			for (let n=0;n<choix_ui.length;n++){
				let choix=choix_ui[n];
				choix.setAttribute("defaut", (sel.value==choix.getAttribute("libelle")) ? "true" : "false");
				this.logMsgDebug("MemoChoixUI libelle:"+choix.getAttribute("libelle")+" - confid:"+ choix.getAttribute("confid")+" - defaut:"+ choix.getAttribute("defaut"));
			}
		}
	},

	// listeUI : liste des éléments (boites, ...)
	// id : label.value
	GetSelectUI(listeUI, id){

		let elems=listeUI.querySelectorAll(".elemUI");
		for (let i=0;i<elems.length;i++){
			let lib=elems[i].querySelector("label");
			if (lib.value==id)
				return elems[i].querySelector("select");
		}
	},

	// vide la liste de éléments (boites/agendas/etc...)
	VideListeElements(listeId){

		PacomeAssistant.logMsgDebug("VideListeElements");

		try{

			let liste=document.getElementById(listeId);

			if (null==liste) {
				PacomeUtils.SetErreurEx(-1, "Erreur lors de l'effacement de la liste des éléments de:"+listeId);
				return false;
			}

			while (null!=liste.childNodes && liste.childNodes.length)
				liste.removeChild(liste.childNodes[0]);

			return true;

		} catch(ex){
			PacomeUtils.SetErreurEx(-1, PacomeUtils.MessageFromId("PacomeErreurInitListe"), ex);
		}
		return false;
	},

	// saisie identifiant
	onInputUid(){

		let uid=this.ctrlIdentifiant.value;
		//this.logMsgDebug("onInputUid:"+uid);

		// vérification caractères autorisés
		uid=uid.match(PACOME_FILTRE_UID);
		if (null==uid) {
			//this.logMsgDebug("onInputUid null==uid");
			this.msgSaisieUid();
			this.ctrlIdentifiant.value="";
			this.btContinuer.disabled=true;
			return false;
		}
		uid=uid[0];

		//v0.91 suppression .-.
		if (-1!=uid.indexOf(".-.")){
			//message utilisateur
			this.msgSaisieUid();

			uid=uid.replace(/\.\-\./g, "");
			this.ctrlIdentifiant.value=uid;
		}

		//this.logMsgDebug("onInputUid 2:"+uid);
		this.btContinuer.disabled = uid.length<PACOME_UID_MIN_LENGTH;
	},

	/* boutons onclick configuré lors de l'initialisation des pages */
	Retour(){
		this.logMsgDebug("btRetour");
	},

	Continuer(){
		this.logMsgDebug("btContinuer");
	},

	Quitter(){
		this.logMsgDebug("btQuitter");
		this.confirmExitDialog();
	},

  /** accountSetup.js
   * Ask for confirmation when the account setup is dismissed and the user
   * doesn't have any configured account.
   */
  confirmExitDialog() {

    let dialog = document.getElementById("confirmExitDialog");

    document.getElementById("exitDialogConfirmButton").onclick = () => {
      // Update the pref only if the checkbox was checked since it's FALSE by
      // default. We won't expose this checkbox in the UI anymore afterward.
      if (document.getElementById("useWithoutAccount").checked) {
        Services.prefs.setBoolPref("app.use_without_mail_account", true);
      }

      dialog.close();
      window.close();
    };

    document.getElementById("exitDialogCancelButton").onclick = () => {
      dialog.close();
    };

    dialog.showModal();
  },

	// boite de saisie identifiant non conforme
	msgSaisieUid(){

		this.AfficheMsg(PacomeUtils.MessageFromId("msgSaisieUid-titre"),
										PacomeUtils.MessageFromId("msgSaisieUid-msg"),
										PacomeUtils.MessageFromId("msgSaisieUid-msg2"));
	},

	// message utilisateur
	AfficheMsg(titre, msg, msg2=""){

		let dialog = document.getElementById("msgPacome");

		document.getElementById("msgTitre").textContent=titre;
		document.getElementById("msgTitre-msg").textContent=msg;
		document.getElementById("msgTitre-msg2").textContent=msg2;

		document.getElementById("boutonOk").onclick = () => {
      dialog.close();
    };

    dialog.showModal();
	},

	// message utilisateur et ferme l'assistant
	AfficheMsgExit(titre, msg, msg2=""){

		let dialog = document.getElementById("msgPacome");

		document.getElementById("msgTitre").textContent=titre;
		document.getElementById("msgTitre-msg").textContent=msg;
		document.getElementById("msgTitre-msg2").textContent=msg2;

		document.getElementById("boutonOk").onclick = () => {
      dialog.close();
      window.close();
    };

    dialog.showModal();
	},

	logMsg(msg){

		PacomeUtils.PacomeTrace(msg);
	},


	logMsgDebug(msg){

		PacomeUtils.logMsgDebug("pacomeCompte "+msg);
	},

	EcritLog(message, donnees) {

		PacomeUtils.EcritLog(PACOME_LOGS_ASSISTANT, message, donnees);
	},

	sablier(){
		document.body.classList.remove("passablier");
		document.body.classList.add("sablier");
	},
	passablier(){
		document.body.classList.remove("sablier");
		document.body.classList.add("passablier");
	}
};