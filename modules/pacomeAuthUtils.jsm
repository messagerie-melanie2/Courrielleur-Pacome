/*
  Module pacome - fonctions utilitaires pour l'authentification
*/


ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource:///modules/mailServices.js");
ChromeUtils.import("resource://calendar/modules/calUtils.jsm");
ChromeUtils.import("resource://gre/modules/AppConstants.jsm");

const Cc=Components.classes;
const Ci=Components.interfaces;


const EXPORTED_SYMBOLS = [ "PacomeAuthUtils", "NON_MELANIE2", "MSG_MELANIE2", "APP_MELANIE2"];

// VERSION_PACOME
//courrielleur 5.2T2+ => v6.0
//courrielleur 6.1 => v 6.4
//courrielleur 6.2T1 => v 6.5
//courrielleur 7.0T1 => 7.0
//courrielleur 7.1T1 => 7.1
//courrielleur 7.2T1 => 7.2
//courrielleur 7.2.1T1 => 7.2
//courrielleur 8.0 => 7.4
//courrielleur 8.5 => 8.5



//serveurs de messagerie melanie2
const regServeursMel2=/^.*.[smtp|pop|imap].mce.interieur.rie.gouv.fr$/;

//serveurs melanie2 dont l'authentification est basée sur le compte principal
const regServeursAppM2=/^.*.mce.interieur.rie.gouv.fr$/;

const ExpProxyAmande=/(.e2.rie.gouv.fr|.i2)$/;


//pas un hote melanie2
const NON_MELANIE2=0;
//serveur de messagerie melanie2
const MSG_MELANIE2=1;
//serveur d'application melanie2
const APP_MELANIE2=2;


//préférence serveur pacomemdp2 de vérification de mot de passe
const PREF_URLMDP="pacome.urlmdp";


var PacomeAuthUtils = {

  get VERSION_PACOME(){

    return "8.5";
  },

  // test si hostname est du type melanie2
  // retourne le type NON_MELANIE2, MSG_MELANIE2 ou APP_MELANIE2
  TestServeurMelanie2: function(hostname) {

    if (null==hostname || ""==hostname)
      return NON_MELANIE2;

    //start width imap://, pop3:// smtp:// https://
    //extraire hostname
    let srv=this.extraitServeur(hostname);
    if (null==srv)
      return NON_MELANIE2;

    //tester serveur de messagerie
    if (srv.match(regServeursMel2))
      return MSG_MELANIE2;

    //tester serveur application M2
    if (srv.match(regServeursAppM2))
      return APP_MELANIE2;

    return NON_MELANIE2;
  },

  // retourne l'url utilisée pour la propriété hostname pour l'enregistrement des logins
  // retourne en pratique l'url pacome sans le nom du scripts
  // vide si erreur
  get UrlDomainePacome() {

    let url=Services.prefs.getCharPref("pacome.urlparam", "");
    let tab=url.split("/");
    if (tab.length!=4) return "";
    tab.pop();
    return tab.join("/");
  },

  // httpRealm pour le gestionnaire de logins
  get httpRealMPacome() {

    return "pacome";
  },

  // retourne instance nsIMsgAccount
  //Test du compte de messagerie par défaut. Si compte pacome, on prend l'uid réduit.
  //Sinon parcours de comptes de messagerie et prise en compte du premier compte pacome trouvé.
  GetComptePrincipal: function() {

    let accmanager=MailServices.accounts;
    let cp=null;

    try {
      cp=accmanager.defaultAccount;
    } catch(ex) {}

    if (null!=cp && null!=cp.incomingServer && null!=cp.incomingServer.getCharValue("pacome.confid")) {
      return cp;
    }

    let nb=accmanager.accounts.length;
    for (let c=0;c<nb;c++) {
      cp=accmanager.accounts.queryElementAt(c, Ci.nsIMsgAccount);
      if (null!=cp && null!=cp.incomingServer &&
          ("imap"==cp.incomingServer.type || "pop3"==cp.incomingServer.type) &&
            null!=cp.incomingServer.getCharValue("pacome.confid")) {
        return cp;
      }
    }
    return null;
  },

  // retourne uid du compte principal (bali) si existe
  // sinon null
  GetUidComptePrincipal: function() {

    let cp=this.GetComptePrincipal();

    if (null==cp || null==cp.incomingServer)
      return null;

    let uid=cp.incomingServer.username;

    return this.GetUidReduit(uid);
  },

  // retourne uid réduit de uid (partie à gauche de .-.)
  GetUidReduit: function(uid) {

    if (null==uid || ""==uid)
      return uid;

    let pos=uid.indexOf(".-.");
    if (-1!=pos) {
      return uid.substr(0,pos);
    }
    return uid;
  },

  // retourne le login nsILogin du compte principal si existe
  // null sinon
  // contruit le login sur la base des infos du compte principal
  // recherche le mot de passe dans le gestionnaire tb
  GetLoginPrincipal: function() {

    try {

      let compte=this.GetComptePrincipal();
      if (null==compte) {
        this.log("GetLoginPrincipal pas compte principal (bali)");
        return null;
      }
      this.log("GetLoginPrincipal compte existe");

      let serveur=compte.incomingServer;

      let matchData=Cc["@mozilla.org/hash-property-bag;1"]
                    .createInstance(Ci.nsIWritablePropertyBag);
      matchData.setProperty("username", serveur.username);
      matchData.setProperty("hostname", this.UrlDomainePacome);
      matchData.setProperty("httpRealm", this.httpRealMPacome);

      let login;

      // rechercher mot de passe existant
      let count={};
      let logins=Services.logins.searchLogins(count, matchData);

      if (count.value > 0) {

        this.log("GetLoginPrincipal mot de passe existe");
        login=this.CreeLoginMatisse(serveur.username, logins[0].password);

      } else {

        this.log("GetLoginPrincipal pas de mot de passe");
        login=this.CreeLoginMatisse(serveur.username, "");
      }

      return login;

    } catch(ex) {
      this.log("Exception dans GetLoginPrincipal:"+ex);
    }

    return null;
  },

  // test si hostname est dans melanie2 (courrier, agenda, etc)
  isMelanie2Host: function(hostname) {

    if (null==hostname || ""==hostname)
      return false;

    let srvm2=this.TestServeurMelanie2(hostname);

    if (NON_MELANIE2!=srvm2)
      return true;

    return false;
  },

  // extrait le nom du serveur de hostname
  // hostname : imap:// https:// etc...
  extraitServeur: function(hostname) {

    if (null==hostname || ""==hostname)
    return null;

    const r=/((imap|mailbox|smtp|https|moz-proxy):\/\/)?([^\/:]+)/;
    let m=hostname.match(r);

    if (m && 1<m.length)
      return m[m.length-1];

    return null;
  },

  // v3.4 - recherche uid pour agenda
  // recherche agenda correspondant, si l'identité mail associée est valide retourne identifiant
  // sinon retour null
  GetUidAgenda: function(urlagenda) {

    if (null==urlagenda || ""==urlagenda)
      return null;

    let calendarManager=cal.getCalendarManager();
    let agendas=calendarManager.getCalendars({});
    const nb=agendas.length;

    for (let i=0; i<nb; i++) {

      let agenda=agendas[i];
      let caluri=agenda.getProperty("uri");

      if (0==urlagenda.indexOf(caluri)||
          0==caluri.indexOf(urlagenda)) {

        //imip.identity.key
        let key=agenda.getProperty("imip.identity.key");

        if (null==key || ""==key) {
          // prendre identite par defaut
          let ident=MailServices.accounts.defaultAccount.defaultIdentity;
          if (ident) key=ident.key;
        }

        if (null==key || ""==key)
          break;

        let uid;
        try {

          let pref="mail.identity."+key+".identityName";
          uid=Services.prefs.getCharPref(pref);

          return uid;

        } catch(ex) {
          continue;
        }
      }
    }

    return null;
  },

  // teste si hostname est un proxy amande
  // dans TB, Proxies don't have a scheme, but we'll use "moz-proxy://"
  // return true si ok
  isHostProxyAmande: function(hostname) {

    if (null==hostname || ""==hostname)
      return false;

    let nom=this.extraitServeur(hostname);

    return nom.match(this.regProxyAmande);
  },

  // teste si les parametres correspondent a une authenfication sur un proxy amande
  // aChannel instance nsIProxiedChannel
  // authInfo instance nsIAuthInformation
  // return true si ok
  isAuthProxyAmande: function(aChannel, authInfo) {

    if (aChannel instanceof Components.interfaces.nsIProxiedChannel &&
        authInfo instanceof Components.interfaces.nsIAuthInformation) {

      let flags=authInfo.flags;

      if (!(Components.interfaces.nsIAuthInformation.AUTH_PROXY & flags)) {
        return false;
      }
      if (null==aChannel.proxyInfo)
        return false;

      let host=aChannel.proxyInfo.host;
      let scheme=authInfo.authenticationScheme;
      let realm=authInfo.realm;

      if (this.isHostProxyAmande(host) &&
          "digest"==scheme.toLowerCase() &&
          "AMANDE"==realm) {
        return true;
      }
    }
    return false;
  },

  //retourne l'expression de test du proxy AMANDE (usage interne)
  get regProxyAmande() {

    try {
      let val=Services.prefs.getCharPref("courrielleur.proxy.amande");
      if (null==val || ""==val) {
        return ExpProxyAmande;
      }
      let exp=new RegExp(val+"$");
      return exp;
    } catch(ex) {}

    return ExpProxyAmande;
  },

  // appel boite authentification pacome
  // aParent : window parente
  // username : identifiant
  // outmdp : objet pour retour mdp
	// outmemomdp : objet pour retour mémorisation mdp (true/false)
	// outresmdp : si non null retourne les arguments de retour de pacomemdp (res/offline/mdpforce)
  // retourn true si OK, sinon false
  PromptMdp: function(aParent, username, outmdp, outmemomdp, outresmdp=null) {

    if (Services.io.offline)
      return false;

    if (null==aParent || null==aParent.openDialog)
      aParent=Services.wm.getMostRecentWindow("mail:3pane");

    let args=new Object();
    args.uid=this.GetUidReduit(username);

    aParent.openDialog("chrome://pacome/content/pacomemdp.xul", "_blank", "chrome,modal,centerscreen,titlebar", args);

		this.log("PromptMdp retour:"+args.res );

    // 0005099: Action en cas de non-saisie de mot de passe au démarrage
    if (0==args.res && ""==args.mdp) {
      Services.io.offline=true;
      return false;
    }

    if (outmdp && null!=args.mdp)
      outmdp.value=args.mdp;
		if (outmemomdp && null!=args.memomdp)
      outmemomdp.value=args.memomdp;

		if (outresmdp) {
			outresmdp.offline=args.offline;
			outresmdp.mdpforce=args.mdpforce;
			outresmdp.res=args.res;
		}

    if (1==args.res)
      return true;

    return false;
  },

  // cree une instance login Matisse pour un userAgent
  // les identifiants des logins Matisse sont réduit et sans domaine (@xxx)
  CreeLoginMatisse: function(uid, mdp, memo="nonmemo") {

    this.log("CreeLoginMatisse uid:'"+uid+"' - memo:'"+memo+"'");

    let uidReduit=this.GetUidReduit(uid).split("@")[0];

    let login=Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Components.interfaces.nsILoginInfo);
    login.init(this.UrlDomainePacome, null, this.httpRealMPacome, uidReduit, mdp, "", memo);

    return login;
  },

  // ajoute ou modifie un login dans le gestionnaire des logins (LoginMatisse)
  // login: nsILogin
  AddModifyLogin: function(login) {

    try {

      // rechercher login Matisse existant
      // si existe on le modifie sinon on l'ajoute
      let matchData=Cc["@mozilla.org/hash-property-bag;1"]
                    .createInstance(Ci.nsIWritablePropertyBag);
      if (login.username) matchData.setProperty("username", login.username);
      if (login.hostname) matchData.setProperty("hostname", login.hostname);

      let count={};

      let logins=Services.logins.searchLogins(count, matchData);
      if (count.value>0) {
        // login existe
        matchData.setProperty("password", login.password);
        matchData.setProperty("passwordField", login.passwordField);

        return Services.logins.modifyLogin(logins[0], matchData);

      } else {
        // ajouter login
        return Services.logins.addLogin(login);
      }

    } catch(ex) {
      this.log("AddModifyLogin exception:"+ex);
    }
  },

  // verifie le mot de passe pour l'uid auprès du serveur pacome
  // uid : identifiant (ou courriel)
  // mdp : mot de passe à valider pour uid
  // fncRappel(code, message) : fonction de rappel
  //    code : la valeur du attribut code dans la réponse du serveur
  //           0 si succès
  //           0xFFFF : vérification ok mais le mot de passe doit changer
  //           -1 : erreur ou vérification impossible
  //           autre : mot de passe non valide (code ldap)
  //    message : le message de la réponse
  VerifieMdp: function(uid, mdp, fncRappel, logInfos=false){

    try{

      let urlmdp=Services.prefs.getCharPref(PREF_URLMDP, "");
      if (""==urlmdp){
        this.log("!!! url vérification pacome non définie");
        fncRappel(-1, "url de vérification pacome non définie");
        return;
      }

      // vérifier que l'url est bien gérée par pacome
      if (!PacomeAuthUtils.TestServeurMelanie2(urlmdp)){
        this.log("url de vérification pacome non gérée par pacome");
        fncRappel(null);
        return;
      }


      let httpRequest=new XMLHttpRequest();

      let param="op=verifmdp&uid="+encodeURIComponent(uid);
      param+="&mdp="+encodeURIComponent(mdp);
      param+="&extver="+encodeURIComponent(PacomeAuthUtils.VERSION_PACOME);

      if (logInfos) {
        //Bug mantis 0004135: Traces incontournables avec uid et version du courrielleur
        let cm2ver=Services.prefs.getCharPref("courrielleur.version", "inconnue");
        param+="&cm2ver="+cm2ver;
        //org
        let org=this.GetOrgForUid(uid);
        param+="&org="+org;

        // 4582 : Logguer le temps de chargement du Courrielleur
        try{
          let startlog=Services.prefs.getIntPref("courrielleur.startlog", 0);
          if (0==startlog){
            let totalTime=Services.prefs.getIntPref("courrielleur.totalTime", 0);
            param+="&totaltime="+totalTime;
            Services.prefs.setIntPref("courrielleur.startlog", 1);
          }
        }catch(ex){}
      }

      let _this=this;

      httpRequest.onreadystatechange=function (){

        switch(httpRequest.readyState){

        case 4:

          let statut=0;

          try{
            statut=httpRequest.status;
          }
          catch(ex1){
            //statut=0;
            //v1.1.1
            let req=httpRequest.channel.QueryInterface(Components.interfaces.nsIRequest);
            statut=req.status;
          }

          _this.log("VerifieMdp statut:"+statut);

          if(statut==200) {

            let reponse=httpRequest.responseText;
            _this.log("VerifieMdp reponse='"+reponse+"'");

            //reponse='code=0;message=;versionsconfigs=std1:2-2+std2:2-2+par1:2-2;openhours=7:30-20:30-Mon/Tue/Wed;comptesflux=Informations Mélanie2:4-4;'
            // code 0 si succès
            //      1 mot de passe non valide
            //      0xFFFF : vérification ok mais le mot de passe doit changer (texte dans g_msgReq)
            //      autre : mot de passe non valide (code ldap)
            if (!reponse.includes(";")){
              fncRappel(-1, "Erreur de vérification (réponse non conforme)");
              return;
            }

            let tab=reponse.split(";");
            if (tab.lenght<2){
              fncRappel(-1, "Erreur de vérification (réponse non conforme)");
              return;
            }

            let code=tab[0].split("=")[1];
            let message=tab[1].split("=")[1];
            _this.log("VerifieMdp code='"+code+"' - message:'"+message+"'");

            fncRappel(code, message);
            return;

          } else {

            fncRappel(-1, "Erreur de vérification code du serveur:"+statut);
            return;
          }

          break;
        }
      };

      httpRequest.open("POST", urlmdp, true, null, null);

      httpRequest.setRequestHeader("Content-Type","application/x-www-form-urlencoded;charset=ISO-8859-1");

      httpRequest.send(param);

    } catch(ex) {
      this.log("VerifieMdp exception:"+ex);
      fncRappel(-1, "Erreur de vérification du mot de passe");
    }
  },

  GetOrgForUid: function(uid){

    const nb=MailServices.accounts.accounts.length;
    for (var  i=0;i<nb;i++){
      let compte=MailServices.accounts.accounts.queryElementAt(i,Components.interfaces.nsIMsgAccount);
      if (null==compte.defaultIdentity) continue;
      let idname=Services.prefs.getCharPref("mail.identity."+compte.defaultIdentity.key+".identityName", "");
      if (idname==uid) return compte.defaultIdentity.organization;
    }

    return "";
  },

  // demande et enregistre identifiant et mot de passe principal pour la requête pacome
  // uid : identifiant utilisateur
  // mdpout : objet pour retour mdp valide
  // retour true si ok, false si erreur
  PromptMdpRec: function(uid, mdpout){

    this.log("PromptMdpRec uid:"+uid);

    let outmemomdp={};

    let ok=this.PromptMdp(null, uid, mdpout, outmemomdp);

    if (!ok){
      this.log("PromptMdpRec echec mot de passe");
      return false;
    }

    // enregistrer login
    let memo=outmemomdp.value ? "memo" : "nonmemo";

    this.log("PromptMdpRec PromptMdp ok memo:"+memo);

    let login=this.CreeLoginMatisse(uid, mdpout.value, memo);

    this.AddModifyLogin(login);

    return true;
  },

  log(msg) {
    Services.console.logStringMessage("[PacomeAuthUtils] "+msg);
  },
}

