/* code pacome pour la configuration des comptes
	certaines parties sont reprises/adaptées depuis chrome\messenger\content\messenger\accountcreation\accountSetup.js */


var { PacomeUtils } = ChromeUtils.import("resource:///modules/pacome/pacomeUtils.jsm");
var { PacomeParam } = ChromeUtils.import("resource:///modules/pacome/pacomeParam.jsm");


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

	// document xml de paramétrage (retour de RequeteParametrage)
	_documentParam:null,

	// choix des boites
	// tableau d'uid avec confid
	_choixboite:null,
	// choix des agendas : tableau d'identifiants à paramétrer
	_choixagendas:null,
	// choix des flux : tableau d'identifiants à paramétrer
	_choixflux: null,


	onLoad(){

		this.logMsgDebug(" onLoad");
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

		this.InitPageUid();

		this.initOk=true;
	},

	onUnload(){

		this.EcritLog("sortie de l'assistant", "");
	},

	// fonction générique pour initialiser les pages selon configuration
	// page : ConfigAssistant.XXX
	InitPageFromConfig(page){

		this.logMsgDebug(" InitPageFromConfig page:"+page);

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

		this.logMsgDebug(" SortiePageUid");

		this.EcritLog("Identifiants", this.ctrlIdentifiant.value);

		this.btContinuer.disabled=true;
		this.btQuitter.disabled=true;

		// configuration client
		let config=PacomeParam.GetConfigClient(this.ctrlIdentifiant.value);
		this.logMsg("PacomeAssistant configuration client:"+config);
		this.EcritLog("Configuration client", config);

		// requête paramétrage
		PacomeUtils.ClearErreurEx();
		this._documentParam=null;

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
		PacomeAssistant.logMsgDebug(" RetourRequete");

		PacomeAssistant.EcritLog("Réponse de la requête", "statut:"+statut);

		PacomeAssistant.passablier();

		PacomeAssistant.btQuitter.disabled=false;

		if (statut==200){
			PacomeAssistant.logMsg("Assistant pacome succès de la requete");

			let res=PacomeAssistant.AnalyseErreurDoc(responseXML);

			if (res){

				PacomeAssistant._documentParam=responseXML;

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
		this.logMsgDebug(" InitPageBoites");

		this.InitPageFromConfig(ConfigAssistant.boites);

		// vider la liste
		let res=this.VideListeElements("liste-boites");
		if (!res){
			PacomeUtils.SetErreurEx(-1, "Erreur lors de l'effacement de la liste des boites");
			this.AfficheMsgExit("Erreur", PacomeUtils._msgErreur);
			return;
		}

		// contruire liste des boites à paramétrer
		res=this.ConstruitListeBoites();
		if (!res){
			PacomeUtils.SetErreurEx(-1, "Erreur lors de la construction de la liste des boites");
			this.AfficheMsgExit("Erreur", PacomeUtils._msgErreur);
			return;
		}
	},

	// Ajoute les boites d'apres le document de parametrage
	ConstruitListeBoites(){

		PacomeAssistant.logMsgDebug(" ConstruitListeBoites");
		try{

			//construire la liste des boites
			let liste=document.getElementById("liste-boites");

			let comptes=this._documentParam.querySelectorAll("pacome_ui > compte");
			if (null==comptes || 0==comptes.length){
				PacomeUtils.SetErreurEx(-1, PacomeUtils.MessageFromId("PacomeErreurPacomeUIBoite"));
				return false;
			}
			const nb=comptes.length;
			for (let i=0;i<nb;i++){
				let boite=comptes[i];
				if ("true"==boite.getAttribute("visible"))
					this.InsertBoiteUI(liste, boite);
			}

			return true;

		} catch(ex){
			PacomeUtils.SetErreurEx(-1, PacomeUtils.MessageFromId("PacomeErreurInitListeComptes"), ex);
		}
		return false;
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
			img.src+=fichierimg;
		else
			img.src+="bali.gif";
		PacomeAssistant.logMsgDebug("InsertBoiteUI img src:"+img.src);

		this.InsertChoixUI(clone.querySelector("select"), boite.querySelectorAll("choix"));

		liste.appendChild(clone);
	},

	// sortie page boites
	SortiePageBoites(){
		this.logMsgDebug(" SortiePageBoites");

		// mémoriser choix des boites
		this.MemoChoixUI("liste-boites", "compte", "uid");

		// afficher page agendas
		this.InitPageAgendas();
	},

	// page agendas
	InitPageAgendas(){
		this.logMsgDebug(" InitPageAgendas");

		this.InitPageFromConfig(ConfigAssistant.agendas);

		// vider la liste
		let res=this.VideListeElements("liste-agendas");
		if (!res){
			PacomeUtils.SetErreurEx(-1, "Erreur lors de l'effacement de la liste des agendas");
			this.AfficheMsgExit("Erreur", PacomeUtils._msgErreur);
			return;
		}

		// contruire liste des agendas à paramétrer
		res=this.ConstruitListeAgendas();
		if (!res){
			PacomeUtils.SetErreurEx(-1, "Erreur lors de la construction de la liste des agendas");
			this.AfficheMsgExit("Erreur", PacomeUtils._msgErreur);
			return;
		}
	},


	// Ajoute les agendas d'apres le document de parametrage
	ConstruitListeAgendas(){

		PacomeAssistant.logMsgDebug(" ConstruitListeAgendas");
		try{

			//construire la liste des agendas
			let liste=document.getElementById("liste-agendas");

			let agendas=this._documentParam.querySelectorAll("agenda");
			if (null==agendas || 0==agendas.length){
				PacomeUtils.SetErreurEx(-1, PacomeUtils.MessageFromId("PacomeErreurListeCals"));
				return false;
			}
			const nb=agendas.length;
			for (let i=0;i<nb;i++){
				let agenda=agendas[i];
				if ("true"==agenda.getAttribute("visible"))
					this.InsertAgendaUI(liste, agenda);
			}

			return true;

		} catch(ex){
			PacomeUtils.SetErreurEx(-1, PacomeUtils.MessageFromId("PacomeErreurInitListeCals"), ex);
		}
		return false;
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
		this.logMsgDebug(" SortiePageAgendas");

		// mémoriser choix des agendas
		this.MemoChoixUI("liste-agendas", "agenda", "url");

		// afficher page autres
		this.InitPageAutres();
	},

	// page autres
	InitPageAutres(){
		this.logMsgDebug(" InitPageAutres");

		this.InitPageFromConfig(ConfigAssistant.autres);

		//vider la liste
		let res=this.VideListeElements("liste-autres");
		if (!res){
			PacomeUtils.SetErreurEx(-1, "Erreur lors de l'effacement de la liste des éléments");
			this.AfficheMsgExit("Erreur", PacomeUtils._msgErreur);
			return;
		}

		// construire liste des flux
		this.ConstruitListeFlux();

		// application et proxy
		let liste=document.getElementById("liste-autres");

		let app=this._documentParam.querySelector("pacome_ui > application");
		if (app && "true"==app.getAttribute("visible")){
			this.InsertElemUI(liste, app, "#autreUI");
		}

		let proxy=this._documentParam.querySelector("pacome_ui > proxy");
		if (proxy && "true"==proxy.getAttribute("visible")){
			this.InsertElemUI(liste, proxy, "#autreUI");
		}
	},

	// Ajoute les flux d'apres le document de parametrage
	ConstruitListeFlux(){
		PacomeAssistant.logMsgDebug(" ConstruitListeFlux");
		try{

			//construire la liste des flux
			let liste=document.getElementById("liste-autres");

			let fluxAll=this._documentParam.querySelectorAll("pacome_ui > compteflux");
			if (null==fluxAll || 0==fluxAll.length){
				// pas une erreur
				return true;
			}
			const nb=fluxAll.length;
			for (let i=0;i<nb;i++){
				let flux=fluxAll[i];
				if ("true"==flux.getAttribute("visible"))
					this.InsertElemUI(liste, flux, "#fluxUI");
			}

			return true;

		} catch(ex){
			PacomeUtils.SetErreurEx(-1, PacomeUtils.MessageFromId("PacomeErreurInitListe"), ex);
		}
		return false;
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
		this.logMsgDebug(" SortiePageAutres");

		// mémoriser choix des flux
		this.MemoChoixUI("autres", "compteflux", "libelle");

		// mémoriser choix application
		this.MemoChoixUI("autres", "application", "libelle");

		// mémoriser choix proxy
		this.MemoChoixUI("autres", "proxy", "libelle");

		// afficher page de paramétrage
		this.InitPageParam();
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
		// boites
		let comptes=this._documentParam.querySelectorAll("pacome_ui > compte");
		for (let i=0;i<comptes.length;i++){
			let boite=comptes[i];
			if ("true"==boite.getAttribute("visible")){
				this.logMsgDebug("InitPageParam boite:"+boite.getAttribute("libelle"));
				let choix=this.GetChoixDefaut(boite);
				nbparam+=this.InsertParamUI(boite.getAttribute("libelle"), "chrome://pacome/content/img/"+boite.getAttribute("image"), choix.getAttribute("libelle"));
			}
		}

		// agendas
		let agendas=this._documentParam.querySelectorAll("pacome_ui > agenda");
		for (let i=0;i<agendas.length;i++){
			let agenda=agendas[i];
			if ("true"==agenda.getAttribute("visible")){
				this.logMsgDebug("InitPageParam agenda:"+agenda.getAttribute("libelle"));
				let choix=this.GetChoixDefaut(agenda);
				nbparam+=this.InsertParamUI(agenda.getAttribute("libelle"), "chrome://pacome/content/img/calendar.gif", choix.getAttribute("libelle"));
			}
		}

		// flux
		let compteflux=this._documentParam.querySelectorAll("pacome_ui > compteflux");
		for (let i=0;i<compteflux.length;i++){
			let flux=compteflux[i];
			this.logMsgDebug("InitPageParam flux 1:"+flux.getAttribute("libelle"));
			if ("true"==flux.getAttribute("visible")) {
				this.logMsgDebug("InitPageParam flux:"+flux.getAttribute("libelle"));
				let choix=this.GetChoixDefaut(flux);
				nbparam+=this.InsertParamUI(flux.getAttribute("libelle"), "chrome://messenger/skin/icons/new/compact/rss.svg", choix.getAttribute("libelle"));
			}
		}

		// autres
		let appli=this._documentParam.querySelector("pacome_ui > application");
		if (appli){
			if (appli.getAttribute("visible")=="true"){
				let choix=this.GetChoixDefaut(appli);
				nbparam+=this.InsertParamUI(appli.getAttribute("libelle"), "", choix.getAttribute("libelle"));
			}
		}

		//proxy
		let proxy=this._documentParam.querySelector("pacome_ui > proxy");
		if (proxy){
			if (proxy.getAttribute("visible")=="true"){
				let choix=this.GetChoixDefaut(proxy);
				nbparam+=this.InsertParamUI(proxy.getAttribute("libelle"), "", choix.getAttribute("libelle"));
			}
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
		this.EcritLog("Parametrage des boites", "");
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
		this.EcritLog("Parametrage des agendas", "");
		res=this.ParamAgendas();
		if (-1==res){
			// erreur de paramétrage => message + stop
			this.AfficheMsgExit("Erreur", PacomeUtils._msgErreur);
			this.EcritLog("Erreur des agendas", PacomeUtils._msgErreur);
			return;
		}

		// comptes de flux
		this.EcritLog("Parametrage des comptes de flux", "");
		res=this.ParamFlux();
		if (-1==res){
			// erreur de paramétrage => message + stop
			this.AfficheMsgExit("Erreur", PacomeUtils._msgErreur);
			this.EcritLog("Erreur des comptes de flux", PacomeUtils._msgErreur);
			return;
		}

		// application
		this.EcritLog("Parametrage du courrielleur", "");
		res=this.ParamAppli();
		if (-1==res){
			// erreur de paramétrage => message + stop
			this.AfficheMsgExit("Erreur", PacomeUtils._msgErreur);
			this.EcritLog("Erreur de paramétrage du courrielleur", PacomeUtils._msgErreur);
			return;
		}

		// proxy
		this.EcritLog("Parametrage du proxy", "");
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

		let boites=this._documentParam.querySelectorAll("pacome_ui > compte");
		for (let i=0;i<boites.length;i++){
			let boite=boites[i];

			if ("true"==boite.getAttribute("visible")){
				this.logMsgDebug("ParamBoites boite:"+boite.getAttribute("libelle"));

				let action=this.GetActionElement(boite);
				let choix=this.GetChoixDefaut(boite);
				let res=-1;

				try{

					switch (action){
						case PACOME_ACTION_PARAM :
						case PACOME_ACTION_MAJ :

							// paramétres de boites
							let params=this.GetParamBoite(boite.getAttribute("uid"), choix.getAttribute("confid"));
							if (null==params){
								// devrait pas !!!
								PacomeUtils.SetErreurEx(-1, "Erreur de paramétrage de boite");
								return -1;
							}

							this.EcritLog("Parametrage de la boite", boite.getAttribute("libelle"));
							res=PacomeParam.ParamBoite(params, choix.getAttribute("action"));
							if (1!=res){
								return -1;
							}

							nbparam++;
							break;

						case PACOME_ACTION_SUPPRIME :

							this.EcritLog("Suppression de la boite", boite.getAttribute("libelle"));
							res=PacomeParam.SupprimeBoite(boite.getAttribute("uid"), choix.getAttribute("confid"));
							if (1!=res){
								return -1;
							}
							PacomeParam.UsageUid(boite.getAttribute("uid"), PACOME_IGNORE_UID);
							nbparam++;
							break;

						case PACOME_ACTION_IGNORE :
							// suppression si existe
							PacomeParam.SupprimeBoite(boite.getAttribute("uid"), choix.getAttribute("confid"));

							PacomeParam.IgnoreUid(boite.getAttribute("uid"), PACOME_IGNORE_UID);
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
		}

		this.logMsgDebug("ParamBoites nbparam:"+nbparam);
		return nbparam;
	},

	// retourne l'action par défaut
	// elem_ui :  element qui contient choix_ui
	GetActionElement(elem_ui){

		return this.GetChoixDefaut(elem_ui).getAttribute("action");
	},

	// retourne le choix par défaut d'une liste de choix (choix_ui)
	// elem_ui :  element qui contient choix_ui
	GetChoixDefaut(elem_ui){

		return elem_ui.querySelector("choix_ui > choix[defaut=\"true\"]");
	},

	// retrouve l'élément compte dans le document
	GetParamBoite(uid, confid){

		this.logMsgDebug("GetParamBoite uid:"+uid+" - confid:"+confid);

		let boites=this._documentParam.querySelectorAll("comptes > compte");
		for (let i=0;i<boites.length;i++){
			let boite=boites[i];
			if (boite.getAttribute("uid")==uid && boite.getAttribute("confid")==confid)
				return boite;
		}
		return null;
	},

	// paramétrage des agendas
	// retourne le nombre d'agendas paramétrées
	// -1 si erreur
	ParamAgendas(){

		let nbparam=0;
		let agendas=this._documentParam.querySelectorAll("pacome_ui > agenda");
		for (let i=0;i<agendas.length;i++){
			let agenda=agendas[i];

			if ("true"==agenda.getAttribute("visible")){
				this.logMsgDebug("ParamAgendas agenda:"+agenda.getAttribute("libelle"));

				let action=this.GetActionElement(agenda);
				let url=agenda.getAttribute("url");
				let res=-1;

				try{

					switch (action){
						case PACOME_ACTION_PARAM :
						case PACOME_ACTION_MAJ :

							// paramétres d'agendas
							let params=this.GetParamAgenda(url);
							if (null==params){
								// devrait pas !!!
								PacomeUtils.SetErreurEx(-1, "Erreur de paramétrage d'agenda");
								return -1;
							}

							this.EcritLog("Parametrage de l'agenda", agenda.getAttribute("libelle"));
							if (action==PACOME_ACTION_PARAM)
								res=PacomeParam.AjoutAgenda(params);
							else
								res=PacomeParam.ModifieAgenda(params);

							if (1!=res){
								return -1;
							}

							nbparam++;
							break;

						case PACOME_ACTION_SUPPRIME :

							this.EcritLog("Suppression de l'agenda", agenda.getAttribute("libelle"));
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
		}

		this.logMsgDebug("ParamAgendas nbparam:"+nbparam);
		return nbparam;
	},

	// retrouve l'élément agenda dans le document
	GetParamAgenda(url){

		this.logMsgDebug("GetParamAgenda url:"+url);

		let agendas=this._documentParam.querySelectorAll("agendas > agenda");
		for (let i=0;i<agendas.length;i++){
			let agenda=agendas[i];
			if (agenda.getAttribute("url")==url)
				return agenda;
		}
		return null;
	},

	// paramétrage des flux
	// retourne le nombre de comptes de flux paramétrés
	// -1 si erreur
	ParamFlux(){

		let nbparam=0;
		let comptes=this._documentParam.querySelectorAll("pacome_ui > compteflux");
		for (let i=0;i<comptes.length;i++){
			let flux=comptes[i];

			if ("true"==flux.getAttribute("visible")){

				let action=this.GetActionElement(flux);
				let libelle=flux.getAttribute("libelle");
				this.logMsgDebug("ParamFlux flux:"+libelle);

				try{

					switch (action){
						case PACOME_ACTION_PARAM :
						case PACOME_ACTION_MAJ :

							// paramétres du compte de flux
							let params=this.GetParamFlux(libelle);
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
		}

		this.logMsgDebug("ParamFlux nbparam:"+nbparam);
		return nbparam;
	},

	// retrouve l'élément flux dans le document
	GetParamFlux(libelle){

		this.logMsgDebug("GetParamFlux libelle:"+libelle);

		let flux=this._documentParam.querySelectorAll("comptes_flux > compteflux");
		for (let i=0;i<flux.length;i++){
			let compteflux=flux[i];
			if (compteflux.getAttribute("libelle")==libelle)
				return compteflux;
		}
		return null;
	},

	ParamAppli(){

		try{

			let appli=this._documentParam.querySelector("pacome_ui > application ");

			if ("true"==appli.getAttribute("visible")){

				let action=this.GetActionElement(appli);

				if (action==PACOME_ACTION_PRESERVE){
					// on ne fait rien
					return 1;
				}

				let choix=this.GetChoixDefaut(appli);

				let res=PacomeParam.ParamAppli(this._documentParam, choix.getAttribute("action"));
				this.logMsgDebug("ParamAppli PacomeParam.ParamAppli:"+res);
				return res;
			}

			return 0;

		} catch(ex){
			PacomeUtils.SetErreurEx(-1, "Erreur de paramétrage d'application", ex);
		}

		return -1;
	},

	ParamProxy(){

		this.logMsgDebug("ParamProxy");

		try{

			let proxy=this._documentParam.querySelector("pacome_ui > proxy");

			if ("true"==proxy.getAttribute("visible")){

				let action=this.GetActionElement(proxy);

				if (action==PACOME_ACTION_PRESERVE){
					// on ne fait rien
					return 1;
				}

				let params=this._documentParam.querySelector("pacome > proxy");

				let res=PacomeParam.ParamProxy(params);

				return res;
			}

			return 0;

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
	MemoChoixUI(listeId, typeElem, ident){

		let liste=document.getElementById(listeId);
		let elems=this._documentParam.querySelectorAll("pacome_ui > "+typeElem);
		const nb=elems.length;
		for (let i=0;i<nb;i++){
			let elem=elems[i];
			let idElem=elem.getAttribute(ident);
			this.logMsgDebug(" MemoChoixUI idElem:"+idElem);
			let choix_ui=elem.querySelectorAll("choix");
			let sel=this.GetSelectUI(liste, idElem);
			for (let n=0;n<choix_ui.length;n++){
				let choix=choix_ui[n];
				choix.setAttribute("defaut", (sel.value==choix.getAttribute("libelle")) ? "true" : "false");
				this.logMsgDebug(" MemoChoixUI libelle:"+choix.getAttribute("libelle")+" - confid:"+ choix.getAttribute("confid")+" - defaut:"+ choix.getAttribute("defaut"));
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
		PacomeAssistant.logMsgDebug(" VideListeElements");
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


	// cas profil existant
	initExistant(){

	},

	// saisie identifiant
	onInputUid(){

		let uid=this.ctrlIdentifiant.value;
		//this.logMsgDebug(" onInputUid:"+uid);

		// vérification caractères autorisés
		uid=uid.match(PACOME_FILTRE_UID);
		if (null==uid) {
			//this.logMsgDebug(" onInputUid null==uid");
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

		//this.logMsgDebug(" onInputUid 2:"+uid);
		this.btContinuer.disabled = uid.length<PACOME_UID_MIN_LENGTH;
	},

	/* boutons onclick configuré lors de l'initialisation des pages */
	Retour(){
		this.logMsgDebug(" btRetour");
	},

	Continuer(){
		this.logMsgDebug(" btContinuer");
	},

	Quitter(){
		this.logMsgDebug(" btQuitter");
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

	/*
	*  analyse le document xml anaismoz - extrait le code erreur et le message
	*  @param  docXML instance de document xml
	*  @return true si code erreur = 0
	* sinon retourne false (erreur globale dans gPacomeMsgErreur)
	*/
	AnalyseErreurDoc(docXML){

		let racine=docXML.documentElement;

		if (null==racine || "pacome"!=racine.nodeName){
			PacomeUtils.SetErreurEx(-1, PacomeMessageFromId("PacomeErreurFormatDoc"));
			return false;
		}

		let resultat=racine.querySelectorAll("pacome > resultat");
		if (null==resultat || 0==resultat.length){
			PacomeUtils.SetErreurEx(-1, PacomeMessageFromId("PacomeErreurFormatDoc"));
			return false;
		}

		PacomeUtils.SetErreurEx(resultat[0].getAttribute("code"), resultat[0].getAttribute("erreur"));

		if (PacomeUtils._codeErreur!=0){
			return false;
		}

		//verification pacome_ui
		let pacomeui=docXML.querySelector("pacome_ui");
		if (null==pacomeui){
			PacomeUtils.SetErreurEx(-1, PacomeUtils.MessageFromId("PacomeErreurPacomeUI"));
			return false;
		}

		return true;
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