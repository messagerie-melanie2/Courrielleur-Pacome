/* Module pour le paramétrage courrielleur avec pacome
	Version pour thunderbird 115
*/


var EXPORTED_SYMBOLS = ["PacomeParam"];

var { Services } = ChromeUtils.import("resource:///modules/Services.jsm");
var { MailServices } = ChromeUtils.import("resource:///modules/MailServices.jsm");
var { PacomeUtils } = ChromeUtils.import("resource:///modules/pacome/pacomeUtils.jsm");
var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { Feed } = ChromeUtils.import("resource:///modules/Feed.jsm");
var { FeedUtils } = ChromeUtils.import("resource:///modules/FeedUtils.jsm");

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


//constantes etat de parametrage des boites et flux
const PACOME_ETAT_ABSENT=0;//non configuré
const PACOME_ETAT_PARAM=1;//configuré
const PACOME_ETAT_IGNORE=2;//inutilisé


const PACOME_CAL_PROVIDER="caldav";

const couleurs=["#9999CC","#666699","#660000","#663300","#996633","#003300","#003333","#003399",
"#000066","#330066","#660066","#990000","#993300","#CC9900","#006600","#336666",
"#0033FF","#000099","#660099","#990066","#CC0000","#CC3300","#FFCC00","#009900",
"#006666","#0066FF","#0000CC","#663399","#CC0099","#FF0000","#FF3300","#FFFF00",
"#00CC00","#009999","#0099FF","#0000FF","#9900CC","#FF0099","#CC3333","#FF6600",
"#FFFF33","#00FF00","#00CCCC","#00CCFF","#3366FF","#9933FF","#FF00FF","#FF6666",
"#FF6633","#FFFF66","#66FF66","#66CCCC","#00FFFF","#3399FF","#9966FF","#FF66FF",
"#FF9999","#FF9966","#FFFF99","#99FF99","#66FFCC","#99FFFF","#66CCFF","#9999FF",
"#FF99FF","#FFCCCC","#FFCC99","#FFFFCC","#CCFFCC","#99FFCC","#CCFFFF","#99CCFF","#CCCCFF","#FFCCFF"];


const kLDAPDirectory=0; // defined in nsDirPrefs.h


/* pour configuration proxy */
const nsIWindowsRegKey=Components.interfaces.nsIWindowsRegKey;

const PREFS_PROXY_BOOL=["network.proxy.share_proxy_settings"];

const PREFS_PROXY_CHAR=["network.proxy.http",
                        "network.proxy.ftp",
                        "network.proxy.gopher",
                        "network.proxy.ssl",
                        "network.proxy.socks",
                        "network.proxy.socks_version",
                        "network.proxy.no_proxies_on",
                        "network.proxy.autoconfig_url"
                        ];

const PREFS_PROXY_INT=[ "network.proxy.type",
                        "network.proxy.http_port",
                        "network.proxy.ftp_port",
                        "network.proxy.gopher_port",
                        "network.proxy.ssl_port",
                        "network.proxy.socks_port",
                        "network.proxy.socks_version"
                        ];



var PacomeParam={

	// contruit le document de configuration client
	// (équivalent pacome tb60 PacomeDocumentConfig)
	// liste d'identifiants séparés par des points virgules
	// si fourni, remplace les identifiants existants
	GetConfigClient(listeUids=""){

		try{

			this.PacomeTrace("PacomeDocumentConfig construction configuration");

			//configuration des identifiants
			let uids;
			if (listeUids && listeUids!="")
				uids=listeUids.split(";");
			else
				uids=this.PacomeListeUid();

			let configuids="<identifiants>";
			for (let i=0;i<uids.length;i++)
				configuids+="<identifiant>"+uids[i]+"</identifiant>";
			configuids+="</identifiants>";

			//configuration des boites
			let configbal="<comptes>";

			//configuration des flux
			let configflux="<comptes_flux>";

			//parcours des comptes
			for (let compte of MailServices.accounts.accounts) {

				//boite melanie2
				if ("imap"==compte.incomingServer.type || "pop3"==compte.incomingServer.type){

					let cle=compte.incomingServer.key;
					let pref="mail.server."+cle+".pacome.version";
					if (Services.prefs.prefHasUserValue(pref)){
						this.PacomeTrace("PacomeDocumentConfig traitement boite Melanie2:"+compte.incomingServer.username);
						let ver=Services.prefs.getCharPref(pref);
						let ts=-1;
						let confid="";
						pref="mail.server."+cle+".pacome.confid";
						if (Services.prefs.prefHasUserValue(pref))
							confid=Services.prefs.getCharPref(pref);
						pref="mail.server."+cle+".pacome.ts";
						if (Services.prefs.prefHasUserValue(pref))
							ts=Services.prefs.getCharPref(pref);

						let nom=this.RemplaceCars(compte.incomingServer.prettyName);

						let cfg="<compte uid='"+compte.incomingServer.username+"' serveur='"+compte.incomingServer.hostName+
										"' confid='"+confid+"' version='"+ver;
						if (-1!=ts)
							cfg+="' ts='"+ts;
						cfg+="' usage='true' libelle='"+nom+"'/>";

						configbal+=cfg;
					}
				}

				//flux melanie2
				else if ("rss"==compte.incomingServer.type){

					let cle=compte.incomingServer.key;
					let pref="mail.server."+cle+".pacome.version";
					if (Services.prefs.prefHasUserValue(pref)){
						this.PacomeTrace("PacomeDocumentConfig traitement flux:"+compte.incomingServer.prettyName);

						let ver=Services.prefs.getCharPref(pref);
						let confid="";
						pref="mail.server."+cle+".pacome.confid";
						if (Services.prefs.prefHasUserValue(pref))
							confid=Services.prefs.getCharPref(pref);

						let nom=this.RemplaceCars(compte.incomingServer.prettyName);

						let cfg="<compteflux libelle='"+nom+"' version='"+ver;
						cfg+="' usage='true'/>";

						configflux+=cfg;
					}
				}
			}

			//boites non utilisées
			if (Services.prefs.prefHasUserValue(PACOME_IGNORE_UID)){
				let ignoreuids=Services.prefs.getCharPref(PACOME_IGNORE_UID);
				if (""!=ignoreuids){
					this.PacomeTrace("PacomeDocumentConfig "+PACOME_IGNORE_UID+": "+ignoreuids);
					uids=ignoreuids.split(PACOME_IGNORE_UID_SEP);
					for (let i=0;i<uids.length;i++){
						if (null==uids[i] || 0==uids[i].length)
							continue;
						let cfg="<compte uid='"+uids[i]+"' serveur='' libelle='' usage='false'/>";
						configbal+=cfg;
					}
				}
			}

			//flux non utilisés
			if (Services.prefs.prefHasUserValue(PACOME_IGNORE_FLUX)){
				let ignoreflux=Services.prefs.getStringPref(PACOME_IGNORE_FLUX);
				if (""!=ignoreflux){
					this.PacomeTrace("PacomeDocumentConfig "+PACOME_IGNORE_FLUX+": "+ignoreflux);
					let flux=ignoreflux.split(PACOME_IGNORE_FLUX_SEP);
					for (let i=0;i<flux.length;i++){
						if (null==flux[i] || 0==flux[i].length)
							continue;
						let cfg="<compteflux libelle='"+flux[i]+"' serveur='' usage='false'/>";
						configflux+=cfg;
					}
				}
			}


			configbal+="</comptes>";
			configflux+="</comptes_flux>";

			//configuration d'application
			let configapp="";
			if (Services.prefs.prefHasUserValue("pacome.parametrage.version")){
				let vapp=Services.prefs.getCharPref("pacome.parametrage.version");
				configapp="<application version='"+vapp+"'/>";
			}

			//v6 - configuration du proxy (valeur initiale dans les preferences globales)
			let configprx="";
			let vprx=Services.prefs.getCharPref("pacome.proxy.version");
			configprx="<proxy version='"+vprx+"'/>";

			//configuration des agendas
			let cfgagendas=this.CalendarConfiguration();

			//configuration globale
			let config="<pacome>"+configuids+configbal+configflux+cfgagendas+configapp+configprx+"</pacome>";
			this.PacomeTrace("PacomeDocumentConfig configuration:"+config);

			return config;

		} catch(ex){
			PacomeUtils.SetErreurEx(-1, PacomeUtils.MessageFromId("PageIdentsErrConfig"), ex);
			return null;
		}
	},

	/* calcul la configuration des agendas pour les requetes client
	 retourne le contenu pour la fonction PacomeDocumentConfig
	 (équivalent pacome tb60 pacomecalp.js)
	 format:
	<agendas>
	<agenda [uid='<uid>'] libelle='<libelle>' url='<url>' [color='<color>'] usage='true'|'false' [alarme='true'|'false']/>
	...
	</agendas>
	*/
	CalendarConfiguration() {

		let config="<agendas>";

		//agendas actifs
		if (null==cal.manager) {
			this.PacomeTrace("CalendarConfiguration pas de configuration d'agenda");
			config+="</agendas>";
			return config;
		}

		for (let agenda of cal.manager.getCalendars()) {

			if (agenda.getProperty("pacome")) {

				let url=agenda.getProperty("uri");
				this.PacomeTrace("CalendarConfiguration url="+url);
				//identite - l'utilisateur peut l'avoir supprime
				let ident=null;
				let key=agenda.getProperty("imip.identity.key");
				this.PacomeTrace("CalendarConfiguration key="+key);
				if (null!=key && ""!=key)
					ident=this.IdentiteFromKey(key);
				if (null==ident || ""==ident) {
					// prendre identite par defaut
					ident=MailServices.accounts.defaultAccount.defaultIdentity;
				}
				this.PacomeTrace("CalendarConfiguration ident="+ident);
				let uid="";
				if (null!=ident) {
					try {
						let pref="mail.identity."+ident.key+".identityName";
						uid=Services.prefs.getCharPref(pref);
					} catch(ex) {}
				}
				this.PacomeTrace("CalendarConfiguration uid="+uid);

				let alarme="true";
				if (agenda.getProperty("suppressAlarms"))
					alarme="false";

				let color=agenda.getProperty("color");

				let lib=this.RemplaceCars(agenda.getProperty("name"));

				let cache=agenda.getProperty("cache.enabled");
				let readonly=agenda.getProperty("readOnly");
				let refreshInterval=agenda.getProperty("refreshInterval");
				if (null==refreshInterval) refreshInterval='';

				let cfg="<agenda uid='"+uid+"' libelle='"+lib+"' url='"+url+"' color='"+color+
									"' usage='true' alarme='"+alarme+"' cache='"+cache+
									"' readonly='"+readonly+"' refreshInterval='"+refreshInterval+"'/>";

				config+=cfg;
			}
		}

		//agendas non utilisés
		if (Services.prefs.prefHasUserValue(PACOME_IGNORE_CAL)){

			let ignorecals=Services.prefs.getCharPref(PACOME_IGNORE_CAL);

			this.PacomeTrace("CalendarConfiguration PACOME_IGNORE_CAL:"+ignorecals);

			if (0!=ignorecals.length && ""!=ignorecals.length){

				let urls=ignorecals.split(PACOME_IGNORE_CAL_SEPELEMS);

				for (let i=0;i<urls.length;i++){

					let url=urls[i];
					if (null==url || ""==url)
						continue;

					//vérifier que l'agenda n'est pas utilise (cas bug utilise/non utilise)
					if (PACOME_ETAT_PARAM==pacomeCalEtat(url))
						continue;

					let cfg="<agenda uid='' libelle='' url='"+url+"' color='' usage='false' alarme='' refreshInterval=''/>";

					config+=cfg;
				}
			}
		}

		config+="</agendas>";

		return config;
	},

	//retourne l'identite du compte de messagerie à partir de son identifiant imip.identity.key
	// (équivalent pacome tb60 pacomecalp.js)
	IdentiteFromKey(key) {

		for (let identity of MailServices.accounts.allIdentities) {
			this.PacomeTrace("IdentiteFromKey ident.identityName="+identity.identityName);
			if (identity.key==key) {
				return identity;
			}
		}

		this.PacomeTrace("IdentiteFromKey null==ident key="+key);
		return null;
	},

	// listage des identifiants existants
	// (équivalent pacome tb60 PacomeListeUid)
	// retourne un tableau d'identifiants, null si erreur
	ListeIdentifiants(){

		try{

			let uids=new Array();

			//lister l'identifiant du compte principal en premier
			let nb=MailServices.accounts.accounts.length;
			if (0!=nb && null!=MailServices.accounts.defaultAccount &&
					null!=MailServices.accounts.defaultAccount.incomingServer) {

				let cprinc=MailServices.accounts.defaultAccount;

				if ( ("imap"==cprinc.incomingServer.type ||
						"pop3"==cprinc.incomingServer.type) &&
						(null!=cprinc.incomingServer.getCharValue("pacome.confid")) ) {
					let uid=PacomeUtils.GetUidReduit(cprinc.incomingServer.username);
					this.PacomeTrace("PacomeListeUid identifiant principal:"+uid);
					uids.push(uid);
				}
			}

			//ensuite lister les identifiants des comptes configures
			//parcours des comptes
			for (let compte of MailServices.accounts.accounts) {
				//test boite pacome
				if ("imap"!=compte.incomingServer.type && "pop3"!=compte.incomingServer.type)
					continue;
				let confid=compte.incomingServer.getCharValue("pacome.confid");
				if (null==confid)
					continue;
				//uid
				let uid=PacomeUtils.GetUidReduit(compte.incomingServer.username);
				//ajout
				if (!uids.includes(uid)){
					this.PacomeTrace("PacomeListeUid uid de boite:"+uid);
					uids.push(uid);
				}
			}

			//enfin lister les identifiants inutilisés
			if (Services.prefs.prefHasUserValue(PACOME_IGNORE_UID)){
				let ignoreuids=Services.prefs.getCharPref(PACOME_IGNORE_UID);
				this.PacomeTrace("PacomeListeUid ignoreuids:"+ignoreuids);

				if (0!=ignoreuids.length && ""!=ignoreuids.length){

					ignoreuids=ignoreuids.split(PACOME_IGNORE_UID_SEP);

					for (let i=0;i<ignoreuids.length;i++){
						if (null==ignoreuids[i] || 0==ignoreuids[i].length)
							continue;

						this.PacomeTrace("PacomeListeUid  traitement ignoreuids:"+ignoreuids[i]);
						let ident=PacomeUtils.GetUidReduit(ignoreuids[i]);
						this.PacomeTrace("PacomeListeUid uid reduit:"+ident);

						//ajout?
						for (let u=0;u<uids.length;u++){
							if (ident==uids[u])
								break;
						}
						if (u==uids.length){
							this.PacomeTrace("PacomeListeUid uid de boite:"+ident);
							uids.push(ident);
						}
					}
				}
			}

			return uids;

		} catch(ex){
			this.PacomeTrace("PacomeListeUid exception:"+ex);
			PacomeUtils.SetErreurEx(-1, PacomeUtils.MessageFromId("PageIdentsErrConfig"), ex);
			return null;
		}
	},


	//remplace certains caracteres speciaux pour envoie configuration
	// (équivalent pacome tb60 RemplaceCars) => est-ce utile?
	RemplaceCars(libelle) {

		if (null==libelle || ""==libelle) return libelle;

		libelle=libelle.replace(/&/g,"&amp;");
		libelle=libelle.replace(/"/g,"&quot;");
		libelle=libelle.replace(/'/g,"&#039;");
		libelle=libelle.replace(/</g,"&lt;");
		libelle=libelle.replace(/>/g,"&gt;");

		return libelle;
	},

	// paramétrage d'une boite (ajout ou mise à jour)
	// params : 'pacome > comptes > compte' dans le document de paramétrage
	// action : PACOME_ACTION_PARAM|PACOME_ACTION_MAJ|PACOME_ACTION_SUPPRIME
	// retour 1 si ok, -1 si erreur
	ParamBoite(params, action){

		try{

			//indicateur nouveau compte
			let bnouveau=false;

			//elements identite, srventrant et srvsortant du document
			let elemidentite=params.querySelector("identite");
			let elemsrventrant=params.querySelector("srventrant");
			let elemsrvsortant =params.querySelector("srvsortant");

			//identifiants depuis document
			let uid=params.getAttribute("uid");
			this.PacomeTrace("ParamBoite uid="+uid);

			//serveur entrant
			this.PacomeTrace("ParamBoite parametrage du serveur entrant.");
			let srventrant=this.ParamServeurEntrant(elemsrventrant);
			if (null==srventrant){
				PacomeUtils.SetErreurEx(-1, PacomeMessageFromId("PacomeErreurParamSrv"));
				this.PacomeTrace("ParamBoite echec de parametrage du serveur entrant");
				return -1;
			}

			//serveur smtp
			this.PacomeTrace("ParamBoite parametrage du serveur smtp.");
			let smtpsrv=this.ParamServeurSmtp(elemsrvsortant);
			if (null==smtpsrv){
				PacomeUtils.SetErreur(-1, PacomeMessageFromId("PacomeErreurParamSmtp"));
				this.PacomeTrace("ParamBoite echec de parametrage du serveur smtp");
				return -1;
			}

			//recherche compte existant ou creation
			let compte=null;
			this.PacomeTrace("ParamBoite recherche du compte.");
			try {
				compte=MailServices.accounts.FindAccountForServer(srventrant);
			} catch (ex1){
				compte=null;
			}
			if (null==compte)	{
				this.PacomeTrace("ParamBoite compte inexistant.");
				//creation compte
				this.PacomeTrace("ParamBoite creation du compte.");
				compte=MailServices.accounts.createAccount();
				if (null==compte) {
					PacomeUtils.SetErreur(-1, PacomeMessageFromId("PacomeErreurParamCompte"));
					this.PacomeTrace("ParamBoite echec de creation du compte.");
					return -1;
				}
				bnouveau=true;
			}
			else this.PacomeTrace("ParamBoite compte existant.");

			//identite
			let identite=null;
			if (bnouveau) {
				this.PacomeTrace("ParamBoite creation de l'identite.");
				identite=MailServices.accounts.createIdentity();
				this.PacomeTrace("ParamBoite ajout identite au compte");
				compte.addIdentity(identite);
				this.PacomeTrace("ParamBoite positionnement identite par defaut du compte");
				compte.defaultIdentity=identite;
			}
			else {
				identite=compte.defaultIdentity;
				this.PacomeTrace("ParamBoite identite identityName='"+identite.identityName+"' - email='"+identite.email+"'");
			}

			let res=this.ParamIdentite(identite, elemidentite);
			if (!res){
				PacomeUtils.SetErreur(-1, PacomeMessageFromId("PacomeErreurParamIdent"));
				this.PacomeTrace("ParamBoite echec de parametrage de l'identite.");
				return -1;
			}
			identite.valid=true;
			identite.smtpServerKey=smtpsrv.key;

			if (null==compte.incomingServer ||
        compte.incomingServer.key!=srventrant.key){
        this.PacomeTrace("ParamBoite compte.incomingServer=srventrant");
        compte.incomingServer=srventrant;
			}

			//positionnement du compte par défaut si nécessaire
			try{
				if (null==MailServices.accounts.defaultAccount){
					this.PacomeTrace("ParamBoite positionnement du compte par defaut.");
					MailServices.accounts.defaultAccount=compte;
				}
			} catch(ex1){
				this.PacomeTrace("ParamBoite exception positionnement du compte par defaut:"+ex1);
			}

			//pour le compte par défaut: lecture mail au démarrage
			// +paramétrage d'impression
			if (MailServices.accounts.defaultAccount.key==compte.key){
				if (compte.incomingServer.canBeDefaultServer){
					this.PacomeTrace("ParamBoite positionnement lecture mail au demarrage");
					compte.incomingServer.loginAtStartUp=true;
					compte.incomingServer.downloadOnBiff=true;
				}
				this.PacomeTrace("ParamBoite parametrage impression");
				let prefs=params.querySelector("impression > preferences");
				if (null!=prefs && 0!=prefs.length){
					this.SetPreferences(prefs);
					this.MajPrinter(prefs);
				}
			}

			MailServices.accounts.saveAccountInfo();

			Services.prefs.savePrefFile(null);

			if (bnouveau) this.PacomeTrace("ParamBoite parametrage nouveau compte termine.");
			else this.PacomeTrace("ParamBoite mise a jour parametrage du compte existant.");

			return 1;

		} catch(ex){
			PacomeUtils.SetErreurEx(-1, "Erreur de paramétrage de boite", ex);
		}
		return -1;
	},

	// suppression d'une boite si existe
	SupprimeBoite(uid, confid){

		//suppression du parametrage
		for (let compte of MailServices.accounts.accounts) {
			if (null==compte || null==compte.incomingServer) continue;
			let nom=compte.incomingServer.username;
			if (uid==nom){
				//verifie compte pacome
				let cfg=compte.incomingServer.getCharValue("pacome.confid");
				if (cfg==confid){
					//suppression effective
					this.PacomeTrace("SupprimeBoite suppression du compte uid:"+uid+" - confid:"+confid);
					MailServices.accounts.removeAccount(compte);
				}
			}
		}

		return 1;
	},

	// mémorise uid dans pref (PACOME_IGNORE_UID, etc...)
	IgnoreUid(uid, pref){

		let ignoreuids=Services.prefs.getCharPref(pref, "");

    let uids=ignoreuids.split(PACOME_IGNORE_UID_SEP);
    let bpresent=uids.includes(uid);
		if (!bpresent){
			this.PacomeTrace("IgnoreUid:"+uid);
			uids.push(uid);
			Services.prefs.setCharPref(pref, uids.join(PACOME_IGNORE_UID_SEP));
		}
	},

	// retire uid dans pref (PACOME_IGNORE_UID, etc...)
	UsageUid(uid, pref){

		let ignoreuids=Services.prefs.getCharPref(pref, "");

    let uids=ignoreuids.split(PACOME_IGNORE_UID_SEP);
    let pos=uids.indexOf(uid);
		ignoreuids="";
		if (-1!=pos){
			this.PacomeTrace("UsageUid:"+uid);
			for (let i=0;i<uids.length;i++)
				if (i!=pos) ignoreuids+=uids[i]+PACOME_IGNORE_UID_SEP;
			Services.prefs.setCharPref(pref, ignoreuids);
		}
	},

	/*  fixe les paramètres d'une identité
	*  identite instance nsIMsgIdentity
	*  elemidentite element <identite> du document xml
	*  retour true si succès ou false si erreur	*/
	ParamIdentite(identite, elemidentite){

		this.PacomeTrace("ParamIdentite");

		//préférences
		let prefix="mail.identity."+identite.key+".";
		let prefs=elemidentite.querySelectorAll("prefs > pref");

		for (let i=0;i<prefs.length;i++){
			let p=prefs[i];
			let nom=p.getAttribute("nom");
			let val=p.getAttribute("valeur");

			//v2.1 - setUnicharAttribute au lieu de setCharAttribute
			if ("fullName"==nom ||
					"identityName"==nom ||
					"organization"==nom){
				identite.setUnicharAttribute(nom, val);
				continue;
			}

			let t=p.getAttribute("type");
			if ("bool"==t)
				identite.setBoolAttribute(nom, val=="true");
			else if ("int"==t)
				identite.setIntAttribute(nom,val);
			else if ("string"==t)
				identite.setCharAttribute(nom,val);
			else{
				PacomeUtils.SetErreur(-1, PacomeMessageFromId("ErreurTypePref")+":<"+nom+">");
				return false;
			}
		}

		return true;
	},

	/* Creation ou mise à jour d'un serveur entrant (imap, pop3)
	*  elemsrventrant element <srventrant> du document xml
	*  return instance nsIMsgIncomingServer si ok, null si erreur */
	ParamServeurEntrant(elemsrventrant){

		this.PacomeTrace("ParamServeurEntrant");

		//identifiants depuis document
		let uid=elemsrventrant.getAttribute("username");
		let srvname=elemsrventrant.getAttribute("hostname");
		let typein=elemsrventrant.getAttribute("type");

		this.PacomeTrace("ParamServeurEntrant uid='"+uid+"'");
		this.PacomeTrace("ParamServeurEntrant serveur entrant='"+srvname+"'");
		this.PacomeTrace("ParamServeurEntrant type serveur entrant='"+typein+"'");

		this.PacomeTrace("ParamServeurEntrant recherche du serveur entrant.");
		let srventrant=null;
		let bNouveau=false;
		try {
			srventrant=MailServices.accounts.findServer(uid, srvname, typein);
		} catch(ex1){
			this.PacomeTrace("ParamServeurEntrant pas de serveur entrant.");
			srventrant=null;
		}
		if (null==srventrant){
			this.PacomeTrace("ParamServeurEntrant creation du serveur entrant.");
			//creer nouveau
			srventrant=MailServices.accounts.createIncomingServer(uid, srvname, typein);
			if (null==srventrant){
				PacomeUtils.SetErreur(-1, PacomeMessageFromId("PacomeErreurParamSrv"));
				this.PacomeTrace("ParamServeurEntrant echec de creation du serveur entrant");
				return null;
			}
			bNouveau=true;

		} else this.PacomeTrace("ParamServeurEntrant serveur entrant existant.");

		//préférences
		let elemprefs=elemsrventrant.querySelector("prefs");
		let prefix="mail.server."+srventrant.key+".";
		this.SetPrefs(elemprefs, prefix);

		//cas imap, désactiver le spam lors de la creation, repositionne au demarrage
		if (bNouveau && "imap"==srventrant.type &&
				srventrant.getBoolValue("pacome.install.spam")){
			this.PacomeTrace("ParamServeurEntrant moveOnSpam force a false");
			srventrant.setBoolValue("moveOnSpam", false);
		}

		return srventrant;
	},

	/* Création ou mise à jour d'un serveur sortant (smtp)
	*  elemsrvsortant element <srvsortant> du document xml
	*  return instance nsISmtpServer si ok, null si erreur */
	ParamServeurSmtp(elemsrvsortant) {

		this.PacomeTrace("ParamServeurSmtp");

		let hostname=elemsrvsortant.getAttribute("hostname");
		let username=elemsrvsortant.getAttribute("username");
		let bnouveau=false;

		let smtpsrv=null;
		try {
			this.PacomeTrace("ParamServeurSmtp recherche du serveur smtp. username='"+username+"' - hostname='"+hostname+"'");
			smtpsrv=MailServices.smtp.findServer(username, hostname);
		} catch(ex1){
			smtpsrv=null;
			this.PacomeTrace("ParamServeurSmtp pas de serveur smtp.");
		}
		//this.PacomeTrace("ParamServeurSmtp smtpsrv:"+smtpsrv);
		if (null==smtpsrv){
			this.PacomeTrace("ParamServeurSmtp creation du serveur smtp.");
			//creer nouveau
			smtpsrv=MailServices.smtp.createServer();
			if (null==smtpsrv){
				PacomeUtils.SetErreur(-1, PacomeMessageFromId("PacomeErreurParamSmtp"));
				this.PacomeTrace("ParamServeurSmtp echec de creation du serveur smtp");
				return null;
			}
			bnouveau=true;
		}

		//propriétés
		if (bnouveau){
			smtpsrv.username=username;
			smtpsrv.hostname=hostname;
		}
		for (let i=0; i<elemsrvsortant.attributes.length; i++){
			let nom=elemsrvsortant.attributes[i].name;
			if ("username"==nom || "hostname"==nom)
				continue;
			let val=elemsrvsortant.attributes[i].value;
			this.PacomeTrace("ParamServeurSmtp propriete nom="+nom+" - valeur="+val);
			//v3.1
			if ("trySSL"==nom || "socketType"==nom) {
				if (0==val) //No SSL or STARTTLS
					smtpsrv.socketType=Components.interfaces.nsMsgSocketType.plain;
				else if (1==val) //Use TLS via STARTTLS, but only if server offers it.
					smtpsrv.socketType=Components.interfaces.nsMsgSocketType.trySTARTTLS;
				else if (2==val) //Insist on TLS via STARTTLS.
					smtpsrv.socketType=Components.interfaces.nsMsgSocketType.alwaysSTARTTLS;
				else if (3==val) //Connect via SSL.
					smtpsrv.socketType=Components.interfaces.nsMsgSocketType.SSL;
			}

			else if ("true"==val)
				smtpsrv[nom]=true;
			else if ("false"==val)
				smtpsrv[nom]=false;
			else
				smtpsrv[nom]=val;
		}

		return smtpsrv;
	},


	// paramétrage du compte dossiers locaux si inexistant
	// retour 1 si ok, -1 si erreur
	ParamDossiersLocaux(){

		try{

			let localMailServer=null;
			try{
				localMailServer=MailServices.accounts.localFoldersServer;
			}
			catch(ex1){
				localMailServer=null;
			}
			if (localMailServer==null){
				this.PacomeTrace("CreeLocalFolders creation du compte dossiers locaux");

				MailServices.accounts.createLocalMailAccount();

				try{
					localMailServer=MailServices.accounts.localFoldersServer;
				}
				catch(ex2){
					PacomeUtils.SetErreurEx(-1, "Erreur de creation du compte dossiers locaux", ex2);
					return -1;
				}
			}

			// spamLevel
			let compte=MailServices.accounts.defaultAccount;
			if (compte){
				let spamLevel=Services.prefs.getIntPref("mail.server."+compte.incomingServer.key+".spamLevel");
				localMailServer=MailServices.accounts.localFoldersServer;
				let pref="mail.server."+localMailServer.key+".spamLevel";
				Services.prefs.setIntPref(pref, spamLevel);
				this.PacomeTrace("CreeLocalFolders spamLevel Dossiers Locaux:"+spamLevel);
			}

			return 1;

		} catch(ex){
			PacomeUtils.SetErreurEx(-1, "Erreur de creation du compte dossiers locaux", ex);
		}
		return -1;
	},


	// cree un compte de flux
	// retour 1 si ok, -1 si erreur
	AjoutCompteFlux(params){

		try{

			this.PacomeTrace("pacomeCreeCompteFlux");

			let elemSrv=params.querySelector("serveur");

			let serveur=MailServices.accounts.createIncomingServer(elemSrv.getAttribute("userName"), elemSrv.getAttribute("hostname"), elemSrv.getAttribute("type"));
			serveur.prettyName=params.getAttribute("libelle");

			let account=MailServices.accounts.createAccount();
			account.incomingServer=serveur;

			// FeedUtils.jsm:
			// Ensure the Trash folder db (.msf) is created otherwise folder/message
			// deletes will throw until restart creates it.
			serveur.msgStore.discoverSubFolders(serveur.rootMsgFolder, false);
			// Save new accounts in case of a crash.
			try {
				MailServices.accounts.saveAccountInfo();
			} catch (ex) {}

			//préférences
			let prefix="mail.server."+serveur.key+".";
			let elemprefs=params.querySelector("prefs");
			this.SetPrefs(elemprefs, prefix);

			//ajouter les flux
			let listeflux=params.querySelectorAll("flux");
			let res=this.TraiteListeFlux(serveur, listeflux);

			return res;

		} catch(ex){
			PacomeUtils.SetErreurEx(-1, "Erreur de paramétrage de compte de flux", ex);
		}
		return -1;
	},

	// met à jour un compte de flux
	// retour 1 si ok, -1 si erreur
	ModifieCompteFlux(params){

		try{

			let libelle=params.getAttribute("libelle");
			let compte=this.GetCompteFlux(libelle);
			if (null==compte){
				PacomeUtils.SetErreurEx(-1, "Erreur de mise à jour de compte de flux (compte inexistant)");
				return -1;
			}

			//préférences
			let cle=compte.incomingServer.key;
			let prefix="mail.server."+cle+".";
			let elemprefs=params.querySelector("prefs");
			this.SetPrefs(elemprefs, prefix);

			//version pacome
			let pref="mail.server."+cle+".pacome.version";
			Services.prefs.setCharPref(pref, params.getAttribute("version"));

			//mise à jour des flux
			let listeflux=params.querySelectorAll("flux");
			let res=this.TraiteListeFlux(compte.incomingServer, listeflux);

			return res;

		} catch(ex){
			PacomeUtils.SetErreurEx(-1, "Erreur de mise à jour de compte de flux", ex);
		}
		return -1;
	},

	// supprime un compte de flux
	// retour 1 si ok, -1 si erreur
	SupCompteFlux(libelle){

		try{

			let compte=this.GetCompteFlux(libelle);
			if (null==compte){
				PacomeUtils.SetErreurEx(-1, "Erreur de suppression de compte de flux (compte inexistant)");
				return -1;
			}

			this.PacomeTrace("SupCompteFlux suppression du compte de flux:"+libelle);
      MailServices.accounts.removeAccount(compte);

			return 1;

		} catch(ex){
			PacomeUtils.SetErreurEx(-1, "Erreur de suppression de compte de flux", ex);
		}
		return -1;
	},

	// listeflux: éléments flux du document
	TraiteListeFlux(serveur, listeflux){

		let nbflux=listeflux.length;
		for (let i=0;i<nbflux;i++){

			let flux=listeflux[i];
			let url=flux.getAttribute("url");
			let bSup=flux.hasAttribute("supprime") ? flux.getAttribute("supprime") : false;

			//tester si existe
			let bExist=FeedUtils.feedAlreadyExists(url, serveur);
			if (bSup && bExist){
				// suppression
				this.SupFlux(serveur, flux);
			}
			if (bSup) continue //ignorer

			if (!bExist){
				//ajouter
				let res=this.AjoutFlux(serveur, flux);
				if (1!=res){
					return res;
				}
			}
			else{
				// mettre à jour
				let res=this.MajFlux(serveur, flux);
				if (1!=res){
					return res;
				}
			}
		}

		return 1;
	},

	AjoutFlux(serveur, flux){

		let url=flux.getAttribute("url");
		let quickMode=flux.getAttribute("quickMode");
		let titre=flux.getAttribute("title");
		let lien=flux.getAttribute("link");

		this.PacomeTrace("Ajout du flux:"+titre);

		let dossier=this.DossierFlux(serveur, flux);
		if (null==dossier){
			this.PacomeTrace("AjoutFlux echec DossierFlux");
			return -1;
		}

		try{

			let feed={
				url:url,
				folder:dossier,
				title:titre,
				server:serveur
			};

			FeedUtils.addFeed(feed);

			return 1;

		} catch(ex){
			this.PacomeTrace("AjoutFlux:"+ex);
		}
		return -1;
	},

	MajFlux(serveur, flux){

		let url=flux.getAttribute("url");
		let quickMode=flux.getAttribute("quickMode");
		let titre=flux.getAttribute("title");
		let lien=flux.getAttribute("link");

		this.PacomeTrace("Mise à jour du flux:"+titre);

		let feed=new Feed(url, serveur.rootMsgFolder);

		if (feed.quickMode!=quickMode)
			feed.quickMode=quickMode;
		if (feed.title!=titre)
			feed.title=titre;
		if (feed.link!=lien)
			feed.link=lien;

		return 1;
	},

	SupFlux(serveur, flux){

		let url=flux.getAttribute("url");

		this.PacomeTrace("Suppression du flux:"+flux.getAttribute("title"));

		try{

			let feed = new lazy.Feed(url, serveur.rootMsgFolder);
			FeedUtils.deleteFeed(feed);

		} catch(ex){
			this.PacomeTrace("SupFlux:"+ex);
		}

		return 1;
	},

	DossierFlux(serveur, flux){

		let nom=FeedUtils.strings.GetStringFromName("ImportFeedsNew");
		let titre=flux.getAttribute("title");
		let nomdos=FeedUtils.getSanitizedFolderName(serveur.rootMsgFolder,
																								titre,
																								nom,
																								true);
		this.PacomeTrace("DossierFlux nom du dossier:"+nomdos);
		let dossier=serveur.rootMsgFolder.QueryInterface(Ci.nsIMsgLocalMailFolder)
											 .createLocalSubfolder(nomdos);
		return dossier;
	},

	GetCompteFlux(libelle){

		//parcours des comptes
		for (let compte of MailServices.accounts.accounts) {

			if (null==compte || null==compte.incomingServer) continue;

			let prettyName=compte.incomingServer.prettyName;
			if (libelle==prettyName && "rss"==compte.incomingServer.type){
				let cfg=compte.incomingServer.getCharValue("pacome.confid");
				if (null!=cfg && "flux"==cfg){
					this.PacomeTrace("PacomeRechCompteFlux compte flux existe");
					return compte;
				}
			}
		}

		return null;
	},

	// paramétrage préférences application
	// action : PACOME_ACTION_PARAM|PACOME_ACTION_MAJ
	// retour 1 si ok, -1 si erreur
	ParamAppli(params, action){

		try{

			//parametrage annuaires
			//a faire avant application
			PacomeUtils.PacomeTrace("ParamAppli parametrage annuaires");
			let annuaires=params.querySelectorAll("pacome > annuaires > annuaire");
			if (null!=annuaires){
				for (let i=0;i<annuaires.length;i++){
					let res=this.ParamAnnuaire(annuaires[i]);
					if (!res){
						PacomeUtils.SetErreur(-1, PacomeUtils.MessageFromId("ErreurCreationAnn"));
						return -1;
					}
				}
			}

			//parametrage application
			PacomeUtils.PacomeTrace("ParamAppli parametrage application");
			let elemappli=params.querySelector("pacome > preferences");
			if (null!=elemappli){
				PacomeUtils.PacomeTrace("ParamAppli traitement preferences");
				let res=this.SetPreferences(elemappli);
				if (res==false){
					PacomeUtils.SetErreur(-1, PacomeUtils.MessageFromId("ErreurCreationPrefs"));
					return -1;
				}
			}

			Services.prefs.savePrefFile(null);

			return 1;

		} catch(ex){
			PacomeUtils.SetErreurEx(-1, "Erreur de paramétrage d'application", ex);
		}
		return -1;
	},

	// paramétrage proxy
	// action : PACOME_ACTION_PARAM|PACOME_ACTION_MAJ
	// retour 1 si ok, -1 si erreur
	ParamProxy(params){

		try{

			this.PacomeTrace("ParamProxy parametrage proxy");

			//rechercher pacome.config.proxy dans params
			let pacomeconfig="";
			let elems=params.querySelectorAll("preference");
			for (let i=0;i<elems.length;i++){
				let nom=elems[i].getAttribute("nom");
				if ("pacome.config.proxy"==nom){
					pacomeconfig=elems[i].getAttribute("valeur");
					break;
				}
			}

			let os=Services.appinfo.OS;
			//configurer le proxy sous windows
			//v6.1 : en mode mise à jour ne pas forcer, donc uniquement si pacome.config.proxy est present
			if ("systeme"==pacomeconfig && "WINNT"==os) {
				let res=this.ConfigProxy();
				if (false==res){
					PacomeUtils.SetErreurEx(-1, "ErreurCreationPrefs");
					return -1;
				}
			}

			if ("WINNT"!=os) {
				this.PacomeTrace("ParamProxy traitement preferences");
				res=this.SetPreferences(params);
				if (false==res){
					PacomeUtils.SetErreurEx(-1, "ErreurCreationPrefs");
					return -1;
				}
			}

			//dans tous les cas, mettre à jour les exceptions si pacome.config.proxy_exceptions
			for (let i=0;i<elems.length;i++){
				let nom=elems[i].getAttribute("nom");
				if ("pacome.config.proxy_exceptions"==nom){
					this.MajExceptions();
				}
			}

			//mise a jour numero de version
			this.MajVersionProxy(params)

			Services.prefs.savePrefFile(null);

			return 1;

		} catch(ex){
			PacomeUtils.SetErreurEx(-1, "Erreur de paramétrage de proxy", ex);
		}
		return -1;
	},

	ConfigProxy(){

		//tableau avec nom des preferences en indices (proxy.network.xxx)
		let config=this.LitConfProxySys();

		if (null==config){
			this.PacomeTrace("Pas de configuration proxy ie: utilisation parametrage proxy pacome");
			//pas de proxy ie configuré!
			return;
		}

		let prefBranch=Services.prefs.getBranch(null);

		//paramétrage
		for (let p in PREFS_PROXY_CHAR){
			let pref=PREFS_PROXY_CHAR[p];
			if (pref in config)
				prefBranch.setCharPref(pref, config[pref]);
		}
		for (let p in PREFS_PROXY_INT){
			let pref=PREFS_PROXY_INT[p];
			if (pref in config)
				prefBranch.setIntPref(pref, config[pref]);
		}
		for (let p in PREFS_PROXY_BOOL){
			let pref=PREFS_PROXY_BOOL[p];
			if (pref in config)
				prefBranch.setBoolPref(pref, config[pref]);
		}

		//AutoConfigURL
		if (null!=config["network.proxy.autoconfig_url"] &&
				""!=config["network.proxy.autoconfig_url"]){

			this.PacomeTrace("pacomeConfigProxy configuration 'proxy pac'");
			prefBranch.setIntPref("network.proxy.type", 2);

		} else if (null!=config["ProxyEnable"] &&
							true==config["ProxyEnable"]) {

			this.PacomeTrace("pacomeConfigProxy configuration 'proxy ie'");
			prefBranch.setIntPref("network.proxy.type", 1);

		} else {

			this.PacomeTrace("pacomeConfigProxy configuration 'pas de proxy'");
			prefBranch.setIntPref("network.proxy.type", 0);
		}

		//effacer les preferences non positionnees depuis ie
		if (null!=config["ProxyEnable"] && true==config["ProxyEnable"]) {
			if (null==config["network.proxy.http"]){
				prefBranch.clearUserPref("network.proxy.http")
				prefBranch.clearUserPref("network.proxy.http_port")
			}
			if (null==config["network.proxy.ftp"]){
				prefBranch.clearUserPref("network.proxy.ftp")
				prefBranch.clearUserPref("network.proxy.ftp_port")
			}
			if (null==config["network.proxy.ssl"]){
				prefBranch.clearUserPref("network.proxy.ssl")
				prefBranch.clearUserPref("network.proxy.ssl_port")
			}
			if (null==config["network.proxy.socks"]){
				prefBranch.clearUserPref("network.proxy.socks")
				prefBranch.clearUserPref("network.proxy.socks_port")
			}
		}
	},

	LitConfProxySys(){

		let config=new Array();

		try{

			let regkey=Components.classes["@mozilla.org/windows-registry-key;1"].createInstance(nsIWindowsRegKey);

			regkey.open(nsIWindowsRegKey.ROOT_KEY_CURRENT_USER,
									"Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
									nsIWindowsRegKey.ACCESS_READ);

			let ProxyEnable=0;

			if (regkey.hasValue("ProxyEnable")){
				ProxyEnable=regkey.readIntValue("ProxyEnable");
			}

			//AutoConfigURL
			if (regkey.hasValue("AutoConfigURL")){
				config["network.proxy.autoconfig_url"]=regkey.readStringValue("AutoConfigURL");
				this.PacomeTrace("LitConfProxySys AutoConfigURL="+config["network.proxy.autoconfig_url"]);
			}

			if (0!=ProxyEnable) {
			//proxy ie actif

				config["ProxyEnable"]=true;

				let ProxyServer="";
				if (regkey.hasValue("ProxyServer")){
					ProxyServer=regkey.readStringValue("ProxyServer");
				}
				let ProxyOverride="";
				if (regkey.hasValue("ProxyOverride")){
					ProxyOverride=regkey.readStringValue("ProxyOverride");
				}

				this.PacomeTrace("LitConfProxySys ProxyServer="+ProxyServer);
				this.PacomeTrace("LitConfProxySys ProxyOverride="+ProxyOverride);

				//serveur
				if (""!=ProxyServer) {
					if (-1!=ProxyServer.indexOf(";")){
						let protos=ProxyServer.split(";");
						for (var c in protos){
							let cfg=protos[c];
							let vals=cfg.split("=");
							let sufix1="";
							let sufix2="";
							if ("http"==vals[0]){
								sufix1="http";
								sufix2="http_port";
							} else if ("ftp"==vals[0]){
								sufix1="ftp";
								sufix2="ftp_port";
							} else if ("https"==vals[0]){
								sufix1="ssl";
								sufix2="ssl_port";
							} else if ("gopher"==vals[0]){
								sufix1="gopher";
								sufix2="gopher_port";
							} else if ("socks"==vals[0]){
								sufix1="socks";
								sufix2="socks_port";
							}
							vals=vals[1].split(":");
							config["network.proxy."+sufix1]=vals[0];
							config["network.proxy."+sufix2]=vals[1];
						}
						config["network.proxy.share_proxy_settings"]=false;

					} else {
						config["network.proxy.share_proxy_settings"]=true;
						let vals=ProxyServer.split(":");
						config["network.proxy.http"]=vals[0];
						config["network.proxy.http_port"]=vals[1];
					}
				}

				//exceptions
				let excepts=this.ConvertExceptIE(ProxyOverride);
				this.PacomeTrace("LitConfProxySys conversion exceptions IE="+excepts);
				config["network.proxy.no_proxies_on"]=excepts;

			} else {

				config["ProxyEnable"]=false;
			}

			regkey.close();

		} catch (ex){
			this.PacomeTrace("LitConfProxySys exception"+ex);
			PacomeUtils.SetErreurEx(-1, "LitConfProxySys exception:"+ex);
			return null;
		}

		return config;
	},

	ConvertExceptIE(strie){

		if (null==strie || 0==strie.length) return "";

		let excepts="";

		let elems=strie.split(";");

		for (let e in elems){
			let val=elems[e];
			val=val.replace(/\s/g,"");
			this.PacomeTrace("ConvertExceptIE exception val="+val);
			if (0!=excepts.length) excepts+=",";

			if ("<local>"==val){
				excepts+="local host";
			} else if (val.match(/^[0-9]{1,3}(\.[0-9]{1,3}|\.\*){1,3}$/)){

				let masque=0;
				let tab=val.split('.');
				for (var i=0; i<tab.length; i++){
					if ('*'==tab[i]){
						masque=8*i;
						tab[i]="0";
					}
				}

				let ip="";
				for (i=0; i<3; i++){
					if (i<tab.length){
						ip+=tab[i]+".";
					} else {
						ip+="0.";
					}
				}
				if (4==tab.length) ip+=tab[3];
				else ip+="0";

				if (0!=masque) excepts+=ip+"/"+masque;
				else excepts+=ip;

			} else {
				val=val.replace("*","");
				excepts+=val;
			}

		}

		return excepts;
	},

	MajExceptions(){

		let prefBranch=Services.prefs.getBranch(null);

		let pacomeEx=prefBranch.getCharPref("pacome.config.proxy_exceptions", "");
		let excepts=prefBranch.getCharPref("network.proxy.no_proxies_on", "");

		let re=/\s*,\s*/;
		let listePac=pacomeEx.split(re);
		let listeCmel=excepts.split(re);
		let nb1=listeCmel.length;

		for (let i=0; i<listePac.length; i++){
			if (-1==listeCmel.indexOf(listePac[i])){
				this.PacomeTrace("Mise a jour des exceptions proxy ajout:"+listePac[i]);
				listeCmel.push(listePac[i]);
			}
		}

		if (listeCmel.length > nb1){
			excepts=listeCmel.join(",");
			prefBranch.setCharPref("network.proxy.no_proxies_on", excepts);
			this.PacomeTrace("Mise a jour des exceptions proxy terminee");
		}
	},

	// mettre à jour numéro de version sans parametrer
	MajVersionProxy(params){

		//positionner les preferences
		this.PacomeTrace("MajVersionProxy");

		//parcours des préférences
		let elems=params.querySelectorAll("preference");

		for (let i=0;i<elems.length;i++){

			let p=elems[i];
			let nom=p.getAttribute("nom");

			if ("pacome.proxy.version"==nom){
				let val=p.getAttribute("valeur");
				let cur=Services.prefs.getCharPref("pacome.proxy.version");
				if (cur!=val) {
					Services.prefs.setCharPref("pacome.proxy.version", val);
					this.PacomeTrace("Mise a jour version de proxy :"+val);
				}
			}
		}
	},


	/* Mise à jour des préférences à partir du document xml
	*  preferences  element xml <preferences>
	*  si succes retourne true, false si erreur
	*/
	SetPreferences(preferences){

		//parcours des préférences
		let elems=preferences.querySelectorAll("preference");

		for (let i=0;i<elems.length;i++){
			let p=elems[i];

			let nom=p.getAttribute("nom");
			let val=p.getAttribute("valeur");
			let t=p.getAttribute("type");

			if ("bool"==t)
				Services.prefs.setBoolPref(nom, "true"==val);
			else if ("int"==t)
				Services.prefs.setIntPref(nom,val);
			else if ("string"==t)
				Services.prefs.setStringPref(nom, val);
			else {
				PacomeUtils.SetErreur(-1, PacomeUtils.PacomeMessageFromId("ErreurTypePref")+" : '"+nom+"'");
				return false;
			}
		}

		return true;
	},

	/* positionne des preferences pour une branche identifiee par prefix
	*  elemprefs noeud xml de nom <prefs>, contient les elements <pref>
	*  prefix préfixe du nom de la préférence (doit comporter le point terminal)
	*  return si succes retourne true, sinon false */
	SetPrefs(elemprefs, prefix){

		let prefs=elemprefs.querySelectorAll("pref");

		for (let i=0;i<prefs.length;i++){
			let p=prefs[i];

			let nom=prefix+p.getAttribute("nom");
			let val=p.getAttribute("valeur");

			let t=p.getAttribute("type");
			if ("bool"==t)
				Services.prefs.setBoolPref(nom, val=="true");
			else if ("int"==t)
				Services.prefs.setIntPref(nom,val);
			else if ("string"==t)
				Services.prefs.setStringPref(nom, val);
			else{
				PacomeUtils.SetErreur(-1, PacomeMessageFromId("ErreurTypePref")+":<"+nom+">");
				return false;
			}
		}

		return true;
	},

	//mise a jour entetes des imprimantes
	MajPrinter(elem) {

		//parcours des préférences
		let elems=elem.querySelectorAll("preference");

		let valeur="";
		for (let i=0;i<elems.length;i++){
			let p=elems[i];
			let nom=p.getAttribute("nom");
			if ("print.print_headercenter"==nom) {
				valeur=p.getAttribute("valeur");
				break;
			}
		}

		let branche=Services.prefs.getBranch("print.");
		let nb={value:0};
		let liste=branche.getChildList("",nb);
		for (let i=0;i<nb.value;i++){
			let nompref=liste[i];
			if (null==nompref || ""==nompref)	continue;

			if (nompref.match(/\.print_headercenter$/)){
				this.PacomeTrace("MajPrinter preference:"+nompref);
				Services.prefs.setStringPref("print."+nompref, valeur);
			}
		}
	},

	//ajoute un agenda
	//elemcal : element <agenda> de parametrage
	//retourne agenda cree, si existe le modifie
	AjoutAgenda(elemcal) {

		//tester si existe
		let agenda=this.GetAgenda(elemcal);
		if (null!=agenda) {
			this.PacomeTrace("AjoutAgenda agenda existant url="+elemcal.getAttribute("url"));
			agenda=this.ModifieAgenda(elemcal);
			return 1;
		}

		let url=elemcal.getAttribute("url");
		this.PacomeTrace("AjoutAgenda url="+url);
		let uid=elemcal.getAttribute("uid");
		let alarme=elemcal.getAttribute("alarme");
		let libelle=elemcal.getAttribute("libelle");
		let color=elemcal.getAttribute("color");
		let cache=elemcal.getAttribute("cache");
		let readonly=elemcal.getAttribute("readonly");
		let refreshInterval=elemcal.getAttribute("refreshInterval");

		this.PacomeTrace("AjoutAgenda createCalendar url:"+url);
		agenda=cal.manager.createCalendar(PACOME_CAL_PROVIDER, Services.io.newURI(url, null, null));
		agenda.name=libelle;
		if ("false"==alarme)
			agenda.setProperty('suppressAlarms', true);

		let ident=this.IdentiteFromUid(uid);

		if (null!=ident)
			agenda.setProperty("imip.identity.key", ident.key);
		else
			this.PacomeTrace("AjoutAgenda aucune identite ne correspond uid="+uid);

		color=this.GetCalendarColor(color);
		agenda.setProperty("color", color);
		agenda.setProperty("pacome", true);

		if ("true"==cache)
			agenda.setProperty("cache.enabled", true);
		else
			agenda.setProperty("cache.enabled", false);
		if ("true"==readonly)
			agenda.setProperty("readOnly", true);
		else
			agenda.setProperty("readOnly", false);
		agenda.setProperty("refreshInterval", refreshInterval);

		this.PacomeTrace("AjoutAgenda registerCalendar");
		cal.manager.registerCalendar(agenda);

		return 1;
	},

	//modifie un agenda
	//elemcal : element <agenda> de parametrage
	//retourne agenda modifie
	ModifieAgenda(elemcal) {

		let agenda=this.GetAgenda(elemcal);
		if (null==agenda) {
			this.PacomeTrace("ModifieAgenda agenda inexistant url="+elemcal.getAttribute("url"));
			return -1;
		}

		let uid=elemcal.getAttribute("uid");
		let alarme=elemcal.getAttribute("alarme");
		let libelle=elemcal.getAttribute("libelle");
		let color=elemcal.getAttribute("color");
		let ident=this.IdentiteFromUid(uid);
		let key=agenda.getProperty("imip.identity.key");
		let cache=elemcal.getAttribute("cache");
		let readonly=elemcal.getAttribute("readonly");
		let refreshInterval=elemcal.getAttribute("refreshInterval");

		if (null==ident)
			this.PacomeTrace("ModifieAgenda aucune identite ne correspond uid="+uid);
		else if (ident.key!=key) {
			this.PacomeTrace("ModifieAgenda modifie imip.identity.key ancien="+key+" - nouveau="+ident.key);
			agenda.setProperty("imip.identity.key", ident.key);
		}
		if (libelle!=agenda.getProperty("name")){
			this.PacomeTrace("ModifieAgenda modifie libelle");
			agenda.setProperty("name", libelle);
		}
		if (alarme==agenda.getProperty("suppressAlarms")) {
			this.PacomeTrace("ModifieAgenda modifie alarme");
			agenda.setProperty("suppressAlarms", !alarme);
		}

		agenda.setProperty("pacome", true);

		if ("true"==cache)
			agenda.setProperty("cache.enabled", true);
		else
			agenda.setProperty("cache.enabled", false);

		if ("true"==readonly)
			agenda.setProperty("readOnly", true);
		else
			agenda.setProperty("readOnly", false);

		agenda.setProperty("refreshInterval", refreshInterval);

		this.PacomeTrace("ModifieAgenda agenda mise à jour url="+elemcal.getAttribute("url"));

		return 1;
	},

	//retourne l'identifiant du compte de messagerie pour uid
	IdentiteFromUid(uid) {

		this.PacomeTrace("IdentiteFromUid uid="+uid);

		for (let ident of MailServices.accounts.allIdentities) {

			let pref="mail.identity."+ident.key+".identityName";
			let uid_pref=Services.prefs.getCharPref(pref);

			this.PacomeTrace("IdentiteFromUid uid_pref="+uid_pref);
			if (uid_pref==uid)
				return ident;
		}

		this.PacomeTrace("IdentiteFromUid key=null uid="+uid);
		return null;
	},

	//recherche (test) si un agenda existe déjà
	GetAgenda(elemcal) {

		let url=elemcal.getAttribute("url");

		return this.GetAgendaUrl(url);
	},

	GetAgendaUrl(url) {

		for (let agenda of cal.manager.getCalendars()) {

			this.PacomeTrace("GetAgendaUrl agenda.uri:"+agenda.getProperty("uri"));

			if (agenda.getProperty("pacome")) {

				if (url==agenda.getProperty("uri")) {

					this.PacomeTrace("GetAgendaUrl agenda existe url="+url);
					return agenda;
				}
			}
		}

		this.PacomeTrace("GetAgendaUrl agenda absent url="+url);
		return null;
	},

	//retourne une couleur inutilisee pour un agenda
	GetCalendarColor(color) {

		let nb=cal.manager.getCalendars().length;
		if (0==nb)
			return color;

		let nbc=couleurs.length;
		for (let n=0;n<nbc;n++) {
			let c=couleurs[n];
			let agendas=cal.manager.getCalendars();
			let i=0;
			for (; i<nb; i++) {
				let agenda=agendas[i];
				if (c==agenda.getProperty("color"))
					break;
			}
			if (i==nb)
				return c;
		}
		return couleurs[nbc-1];
	},

	//supprime un agenda
	//return true si ok
	SupAgenda(url) {

		let agenda=this.GetAgendaUrl(url);
		if (null==agenda) {
			this.PacomeTrace("SupAgenda agenda inexistant url="+url);
			return false;
		}

		//marquer pacome à false pour éviter ajout non utilise depuis gPacomeCalManagerObserver
		agenda.setProperty("pacome", false);

		cal.manager.unregisterCalendar(agenda);
		cal.manager.removeCalendar(agenda);

		this.PacomeTrace("SupAgenda agenda supprime url="+url);

		return true;
	},

	/*  ajoute les informations d'annuaire ldap
	*  elemannuaire element <annuaire>
	*  return si succes retourne true, sinon false	*/
	ParamAnnuaire(elemannuaire){

		let hostname=elemannuaire.getAttribute("hostname");
		let description=elemannuaire.getAttribute("description");
		let port=elemannuaire.getAttribute("port");
		let filtre=elemannuaire.getAttribute("filtre");
		//idann -> cle du serveur dans les préférences
		let idann=elemannuaire.getAttribute("identifiant");

		this.PacomeTrace("ParamAnnuaire hostname="+hostname);
		this.PacomeTrace("ParamAnnuaire description="+description);
		this.PacomeTrace("ParamAnnuaire idann="+idann);

		let maxHits=100;
		if (elemannuaire.hasAttribute("maxHits")) maxHits=elemannuaire.getAttribute("maxHits");

		//v2.6 attribut basedn
		let dn=elemannuaire.getAttribute("basedn");

		//construire ldapurl
		let ldapUrl=Services.io.newURI((636==port ? "ldaps://" : "ldap://") + "localhost/dc=???")
												.QueryInterface(Ci.nsILDAPURL);


		ldapUrl=ldapUrl.mutate()
									 .setHost(hostname)
									 .setPort(port)
									 .finalize()
									 .QueryInterface(Ci.nsILDAPURL);

		ldapUrl.dn=dn;
		ldapUrl.scope=Components.interfaces.nsILDAPURL.SCOPE_SUBTREE;
		ldapUrl.filter=filtre;

		//rechercher annuaire existant
		let prefName="ldap_2.servers."+idann;
		this.PacomeTrace("ParamAnnuaire prefName:"+prefName);

		let adrBook=this.GetAnnuaire(idann);

		if (null==adrBook) {
			this.PacomeTrace("ParamAnnuaire creation de l'annuaire.");
			//creer annuaire
			prefName=MailServices.ab.newAddressBook(idann, ldapUrl.spec, Ci.nsIAbManager.LDAP_DIRECTORY_TYPE);
			this.PacomeTrace("ParamAnnuaire creation de l'annuaire prefName:"+prefName);
			adrBook=this.GetAnnuaire(idann);

		} else {
			this.PacomeTrace("ParamAnnuaire modification annuaire existant.");
			//modifier existant
			adrBook.dirName=description;
			let ldapdir=adrBook.QueryInterface(Components.interfaces.nsIAbLDAPDirectory);
			ldapdir.lDAPURL=ldapUrl.QueryInterface(Components.interfaces.nsILDAPURL);
		}

		//finaliser maxHits
		let dir = MailServices.ab.getDirectory("moz-abldapdirectory://"+prefName)
													.QueryInterface(Components.interfaces.nsIAbLDAPDirectory);

		dir.maxHits = maxHits;

		//autres préférences de l'annuaire
		let elemprefs=elemannuaire.querySelector("prefs");
		if (null!=elemprefs){
			this.SetPrefs(elemprefs, prefName+".");
		}

		return true;
	},

	/* identifiant : Amde, Maia, etc... (identifiant dans le document de paramétrage)
		 retourne instance nsIAbDirectory ou nsIAbLDAPDirectory	*/
	GetAnnuaire(identifiant){

		const pref="ldap_2.servers."+identifiant;

		this.PacomeTrace("GetAnnuaire pref identifiant="+pref);

		for (let adrBook of MailServices.ab.directories) {

			if (adrBook instanceof Components.interfaces.nsIAbDirectory) {

				this.PacomeTrace("GetAnnuaire dirPrefId="+adrBook.dirPrefId);

				if (pref==adrBook.dirPrefId)
					return adrBook;
			}
		}

		return null;
	},

	// trace dans la console
	PacomeTrace(msg) {
		PacomeUtils.PacomeTrace(msg);
	}
};
