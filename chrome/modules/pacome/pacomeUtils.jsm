/* fonctions utilitaires pacome pour thunderbird 115 */

var { FileUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/FileUtils.sys.mjs"
);


var EXPORTED_SYMBOLS = ["PacomeUtils"];


// si true active les traces debug dans la console (mode developpement)
const PACOME_DEBUG=true;


const VERSION_PACOME="10.0";


// séparateur pour les identifiant de boites partagées
const PACOME_SEP_UID=".-.";

// préfixe pour les traces dans la console
const PACOME_CONSOLE_PREFIX="[PACOME] ";

const PACOME_CONSOLE_PREFIX_DEBUG="*** [PACOME] ";


//préférence serveur pacomesrv
const PREF_URLPARAM="pacome.urlparam";

//url du serveur pacomesrv (parametrage)
const PACOME_URLPARAM="http://pacome.s2.m2.e2.rie.gouv.fr/pacomesrv.php";


/* parametres de requete */
const PACOMESRV_OP_PARAM="parcfg";
const PACOMESRV_OP_MAJ="parmaj";
const PACOMESRV_PARAM_CONFIG="cfg";
const PACOMESRV_PARAM_VER="extver";


/* fonctions d'enregistrement des evenements (fichier log) */
//nom du fichier log
const PACOME_FICHIER_LOG="pacome.log";
const PACOME_FICHIER_LOG_SEP="\t";
//source d'evenement
const PACOME_LOGS_MODULE="PACOME";
const PACOME_LOGS_ASSISTANT="ASSISTANT";
const PACOME_LOGS_MAJ="MISE_A_JOUR";
const PACOME_LOGS_MAJAUTO="MAJ_AUTO";
const PACOME_LOGS_MDP="VERIF_MDP";
const PACOME_LOGS_CHGMDP="CHANGE_MDP";
const PACOME_LOGS_AG="AGENDAS";
const PACOME_LOGS_REQ="Requete serveur";
//v2.6 - taille maxi du fichier de logs avant rotation
const PACOME_LOGS_MAX=1000000;
const PACOME_FICHIER_LOG1="pacome-1.log";



// pacome.properties
var gPacomeBundle=null;

var PacomeUtils={

	_init:false,

	// fixé par SetErreurEx
	_codeErreur:0,
	_msgErreur:"",
	_exErreur:null,

	InitUtils(){
		if (!this._init){
			this.PacomeTrace("initialisation PacomeUtils");
			gPacomeBundle=Services.strings.createBundle("chrome://pacome/locale/pacome.properties");
			this._init=true;
		}
	},

	// retourne la chaine correspondante dans pacome.properties
	MessageFromId(msgId){

		return gPacomeBundle.GetStringFromName(msgId);
	},

	// retourne la partie gauche de l'identifiant
	GetUidReduit(uid){
		return uid.split(PACOME_SEP_UID)[0];
	},


	// trace dans la console
	PacomeTrace(msg){

		Services.console.logStringMessage(PACOME_CONSOLE_PREFIX+msg);
	},

	// traces en mode développement
	logMsgDebug(msg){

		if (PACOME_DEBUG) Services.console.logStringMessage(PACOME_CONSOLE_PREFIX_DEBUG+msg);
	},

	// Mémorise une erreur (usage exceptions)
	// + trace console
	// code erreur, message, exception
	SetErreurEx(code, msg, ex=null){

		this._codeErreur=code
		this._msgErreur=msg;
		this._exErreur=ex;

		if (ex) this.PacomeTrace(msg+"\nDétail de l'exception:"+ex);
		else this.PacomeTrace(msg);
	},

	ClearErreurEx(){

		this._codeErreur=0
		this._msgErreur="";
		this._exErreur=null;
	},


	/**
	*  Requete de parametrage asynchrone
	*
	*  config : element (xml) de configuration
	*  fncrappel : fonction de rappel
	*  bmaj : si true requete de mise à jour
	*/
	RequeteParametrage(config, fncrappel, bmaj){

		try {
			// PacomeUtils.SetErreurEx("code test", this.MessageFromId("pacomesrverr-"+404));
			this.PacomeTrace("RequeteParametrage");

			let httpRequest=new XMLHttpRequest();

			//url
			let url=PACOME_URLPARAM;
			let p=Services.prefs.getCharPref(PREF_URLPARAM);
			if (p!="")
				url=p;
			this.PacomeTrace("RequeteParametrage url serveur:"+url);
			this.EcritLog(PACOME_LOGS_REQ, "url du serveur pacome", url);

			//parametres
			let param=null;
			if (bmaj)
				param="op="+PACOMESRV_OP_MAJ;
			else
				param="op="+PACOMESRV_OP_PARAM;

			param+="&"+PACOMESRV_PARAM_CONFIG+"="+encodeURIComponent(config);
			param+="&"+PACOMESRV_PARAM_VER+"="+encodeURIComponent(VERSION_PACOME);

			httpRequest.open("POST", url, true);

			httpRequest.setRequestHeader("Content-Type","application/x-www-form-urlencoded; charset=UTF-8");

			httpRequest.onreadystatechange=function(){

				switch(httpRequest.readyState) {

				case 4:
					let statut=0;
					try{
						statut=httpRequest.status;
					}
					catch(ex1){
						PacomeUtils.PacomeTrace("RequeteParametrage exception httpRequest.status");
						//statut=0;
						//v1.1.1
						let req=httpRequest.channel.QueryInterface(Components.interfaces.nsIRequest);
						statut=req.status;
					}
					// statut=404;// simul echec
					PacomeUtils.PacomeTrace("RequeteParametrage httpRequest.status:"+statut);
					if(statut !=200){

						this.EcritLog(PACOME_LOGS_REQ, "code de reponse du serveur", statut);

						if (0==statut){

							PacomeUtils.SetErreurEx(-1, PacomeUtils.MessageFromId("PacomeErreurAccesSrv"));
						}
						else{
							try{
								//v1.11
								PacomeUtils.SetErreurEx(statut, PacomeUtils.MessageFromId("pacomesrverr-"+statut));
							}
							catch(ex1){
								PacomeUtils.SetErreurEx(statut, PacomeUtils.MessageFromId("PacomeErreurSrv"), ex1);
							}
						}

						fncrappel(statut, null);
						return;
					}
					else{

						//PacomeUtils.logMsgDebug(httpRequest.responseText);

						fncrappel(statut, httpRequest.responseXML);

						return;
					}
					break;
				}
			}

			this.PacomeTrace("RequeteParametrage send param:"+param);
			this.EcritLog(PACOME_LOGS_REQ, "envoie des parametres", param);
			httpRequest.send(param);

			return true;

		} catch(ex){
			this.SetErreurEx(-1, this.MessageFromId("PacomeErreurReqEx"), ex);
			this.EcritLog(PACOME_LOGS_REQ, "exception", ex);
			return false;
		}
	},

	/* fonctions de log fichier */
	_fichierLogs:null,

	InitLogs(){

		let fichier=Services.dirsvc.get("ProfD", Components.interfaces.nsIFile);
		fichier.append(PACOME_FICHIER_LOG);

		if (fichier.exists()){
			//v2.6 - test taille fichier
			if (fichier.fileSize>PACOME_LOGS_MAX)
				this.LogsRotate();
		} else
			fichier.create(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, FileUtils.PERMS_FILE);

		this._fichierLogs=Components.classes["@mozilla.org/network/file-output-stream;1"].createInstance(Components.interfaces.nsIFileOutputStream);
		this._fichierLogs.init(fichier, FileUtils.MODE_WRONLY|FileUtils.MODE_CREATE|FileUtils.MODE_APPEND, FileUtils.PERMS_FILE,0);
	},

	EcritLog(source, message, donnees){

		if (null==this._fichierLogs){
			this.PacomeTrace("PacomeEcritLog fichier non initialise");
			this.InitLogs();
			return;
		}

		//date heure
		let dh=new Date();
		let strdh="["+dh.getDate()+"/"+(dh.getMonth()+1)+"/"+dh.getFullYear()+" "+dh.getHours()+":"+dh.getMinutes()+":"+dh.getSeconds()+"]";
		let src="";
		if (null!=source)	src=source;
		let desc="";
		if (null!=message) desc=message;
		let don="";
		if (null!=donnees) don=donnees;

		let msg=strdh+PACOME_FICHIER_LOG_SEP+"["+src+"]"+PACOME_FICHIER_LOG_SEP+
						"\""+desc+"\""+PACOME_FICHIER_LOG_SEP+"\""+don+"\"\x0D\x0A";

		this._fichierLogs.write(msg, msg.length);
		this._fichierLogs.flush();
	},

	LogsRotate(){

		this.PacomeTrace("LogsRotate.");

		let fichier=Services.dirsvc.get("ProfD", Components.interfaces.nsIFile);
		fichier.append(PACOME_FICHIER_LOG);
		fichier.moveTo(null, PACOME_FICHIER_LOG1);
	},

};

PacomeUtils.InitUtils();
