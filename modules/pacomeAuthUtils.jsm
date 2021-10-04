/*
  Module pacome - fonctions utilitaires pour l'authentification
*/


ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource:///modules/mailServices.js");
ChromeUtils.import("resource://calendar/modules/calUtils.jsm");

const Cc=Components.classes;
const Ci=Components.interfaces;


const EXPORTED_SYMBOLS = [ "PacomeAuthUtils", "NON_MELANIE2", "MSG_MELANIE2", "APP_MELANIE2"];

//serveurs de messagerie melanie2
const regServeursMel2=/^amelie-([\d]{1,2}\.ac|ida01(\.ida)?)\.melanie2\.i2$|^(amelie|smtp)\.s2\.m2\.e2\.rie\.gouv\.fr$/;

//serveurs melanie2 dont l'authentification est basée sur le compte principal
const regServeursAppM2=/^(pacome|pacome\.ida|melanie2web|agenor|edroh|davy\.ida|davy|yvad|syncon|nocnys)(\.melanie2\.i2|defi\.application\.i2|\.s2\.m2\.e2\.rie\.gouv\.fr)$/;

const ExpProxyAmande=/(.e2.rie.gouv.fr|.i2)$/;


//pas un hote melanie2
const NON_MELANIE2=0;
//serveur de messagerie melanie2
const MSG_MELANIE2=1;
//serveur d'application melanie2
const APP_MELANIE2=2;


var PacomeAuthUtils= {

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
    if (srv.match(regServeursMel2)){

      return MSG_MELANIE2;
    }

    //tester serveur application M2
    if (srv.match(regServeursAppM2)){

      return APP_MELANIE2;
    }

    return NON_MELANIE2;
  },

  // retourne instance nsIMsgAccount
  //Test du compte de messagerie par défaut. Si compte pacome, on prend l'uid réduit.
  //Sinon parcours de comptes de messagerie et prise en compte du premier compte pacome trouvé.
  GetComptePrincipal: function() {

    let accmanager=MailServices.accounts;

    let cp=null;

    try {

      cp=accmanager.defaultAccount;

    } catch(ex){}

    if (null!=cp && null!=cp.incomingServer && null!=cp.incomingServer.getCharValue("pacome.confid")){
      return cp;
    }

    let nb=accmanager.accounts.length;
    for (let c=0;c<nb;c++){
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

    if (null==cp || null==cp.incomingServer) {
      return null;
    }

    let uid=cp.incomingServer.username;

    return this.GetUidReduit(uid);
  },

  // retourne uid réduit de uid (partie à gauche de .-.)
  GetUidReduit: function(uid){

    if (null==uid || ""==uid)
      return uid;

    let pos=uid.indexOf(".-.");
    if (-1!=pos) {
      return uid.substr(0,pos);
    }
    return uid;
  },

  // test si hostname est dans melanie2 (courrier, agenda, etc)
  isMelanie2Host: function(hostname){

    if (null==hostname || ""==hostname)
      return false;

    let srvm2=this.TestServeurMelanie2(hostname);

    if (NON_MELANIE2!=srvm2) {

      return true;
    }

    return false;
  },

  // extrait le nom du serveur de hostname
  // hostname : imap:// https:// etc...
  extraitServeur: function(hostname) {

    if (null==hostname || ""==hostname)
    return null;

    const r=/((imap|mailbox|smtp|https|moz-proxy):\/\/)?([^\/:]+)/;
    let m=hostname.match(r);

    if (m && 1<m.length){
      return m[m.length-1];
    }

    return null;
  },

  // v3.4 - recherche uid pour agenda
  // recherche agenda correspondant, si l'identité mail associée est valide retourne identifiant
  // sinon retour null
  GetUidAgenda: function(urlagenda){

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
        let ident=agenda.getProperty("imip.identity.key");

        if (null==ident || ""==ident) {
          // prendre identite par defaut
          ident=MailServices.accounts.defaultAccount.defaultIdentity;
        }

        if (null==ident || ""==ident) {
          break;
        }

        let uid;
        try {

          let pref="mail.identity."+ident.key+".identityName";
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
  isHostProxyAmande: function(hostname){

    if (null==hostname || ""==hostname)
      return false;

    let nom=this.extraitServeur(hostname);

    return nom.match(this.regProxyAmande);
  },

  // teste si les parametres correspondent a une authenfication sur un proxy amande
  // aChannel instance nsIProxiedChannel
  // authInfo instance nsIAuthInformation
  // return true si ok
  isAuthProxyAmande: function(aChannel, authInfo){

    if (aChannel instanceof Components.interfaces.nsIProxiedChannel &&
        authInfo instanceof Components.interfaces.nsIAuthInformation) {

      let flags=authInfo.flags;

      if (!(Components.interfaces.nsIAuthInformation.AUTH_PROXY & flags)){
        return false;
      }
      if (null==aChannel.proxyInfo){
        return false;
      }

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
  get regProxyAmande(){

    try {
      let val=Services.prefs.getCharPref("courrielleur.proxy.amande");
      if (null==val || ""==val) {
        return ExpProxyAmande;
      }
      let exp=new RegExp(val+"$");
      return exp;
    } catch(ex) {
    }

    return ExpProxyAmande;
  },


  // appel boite authentification pacome
  // aParent : window parente
  // username : identifiant
  // outmdp : objet pour retour mdp
  // retourn true si OK, sinon false
  PromptMdp: function(aParent, username, outmdp){

    if (Services.io.offline)
      return false;

    if (null==aParent ||
        null==aParent.openDialog){
      aParent=Services.wm.getMostRecentWindow("mail:3pane");
    }

    let args=new Object();
    args.uid=this.GetUidReduit(username);

    aParent.openDialog("chrome://pacome/content/pacomemdp.xul", "_blank", "chrome,modal,centerscreen,titlebar", args);

    // 0005099: Action en cas de non-saisie de mot de passe au démarrage
    if (0==args.res &&
        ""==args.mdp){
      Services.io.offline=true;
      return false;
    }

    if (outmdp && null!=args.mdp)
      outmdp.value=args.mdp;

    if (1==args.res)
      return true;

    return false;
  },

  // version melanie2 de nsILoginManagerStorage.searchLogins
  searchLogins: function(count, matchData) {

    let pacome=0, username="", hostname="";

    let propEnum=matchData.enumerator;
    while (propEnum.hasMoreElements()) {
      let prop=propEnum.getNext().QueryInterface(Components.interfaces.nsIProperty);
      switch (prop.name) {
         case "pacome": pacome=prop.value;
                        break;
         case "username": username=prop.value;
                        break;
         case "hostname": hostname=prop.value;
                        break;
      }
    }

    if (0==pacome ||
        NON_MELANIE2==this.TestServeurMelanie2(hostname)) {
      count.value=0;
      return [];
    }

    //gestion pacome -> determiner login sur la base de l'identifiant (reduit)
    //v6.5 ajout :
    //mantis 4171 : La règle à implémenter serait :
    //Lors d'une demande d'authentification avec un identifiant <uid0>,
    //si <uid0> se trouve être la partie droite d'un compte de balp <uid1.-.uid0>
    //et que <uid1> existe comme compte supportant authentification M2 alors utiliser le mdp de <uid1> pour <uid0>
    let logins=[];
    let srvname=this.extraitServeur(hostname);
    let uidreduit=this.GetUidReduit(username);
    let serveurs=MailServices.accounts.allServers;
    const nbs=serveurs.length;
    for (let i=0;i<nbs;i++){
      let srv=serveurs.queryElementAt(i, Components.interfaces.nsIMsgIncomingServer);
      if (srv &&
          ("imap"==srv.type || "pop3"==srv.type) &&
          null!=srv.password && ""!=srv.password &&
          MSG_MELANIE2==this.TestServeurMelanie2(srv.hostName)){
          //test sur uid reduit
          if (uidreduit==this.GetUidReduit(srv.username)){
            let login=Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Components.interfaces.nsILoginInfo);
            login.init(srvname, null, null, username, srv.password, null, null);
            logins.push(login);
            //retourne le premier trouve
            break;

          } else {
            //mantis 4171
            let compos=srv.username.split(/\.-\./);
            if (2==compos.length){
              let user=compos[0];
              let partage=compos[1];
              //ici pas uidreduit mais username presente
              if (partage==username){
                //tester user
                for (let c=0;c<nbs;c++){
                  let srv=serveurs.queryElementAt(c, Components.interfaces.nsIMsgIncomingServer);
                  if (srv &&
                      ("imap"==srv.type || "pop3"==srv.type) &&
                      null!=srv.password && ""!=srv.password &&
                      MSG_MELANIE2==this.TestServeurMelanie2(srv.hostName) &&
                      user==srv.username){
                    let login=Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Components.interfaces.nsILoginInfo);
                    login.init(srvname, null, null, username, srv.password, null, null);
                    logins.push(login);
                    break;
                  }
                }
              }
            }
          }
      }
    }

    if (count)
      count.value=logins.length;

    return logins;
  },

  // version melanie2 de nsILoginManagerStorage.findLogins
  findLogins: function (count, hostname, formSubmitURL, httpRealm) {

    let srvm2=NON_MELANIE2;
    if (hostname)
      srvm2=this.TestServeurMelanie2(hostname);
    else
      srvm2=this.TestServeurMelanie2(formSubmitURL);

    if (NON_MELANIE2==srvm2){
      count.value=0;
      return [];
    }

    //gestion pacome
    //hostname : protocole://serveur
    let logins=[];
    count.value=0;

    if (MSG_MELANIE2==srvm2) {

      let lms=this;

      function addlogins(srv) {

        const nb=logins.length;
        let i=0;
        for (;i<nb;i++){
          if (logins[i].username==srv.username)
            break;
        }
        if (i==nb &&
            null!=srv.password && ""!=srv.password){
          let srvname;
          if (srv instanceof Ci.nsISmtpServer)
            srvname=srv.hostname;
          else
            srvname=srv.hostName;

          if (!lms.isMelanie2Host(srvname))
            return;

          let login=Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
          login.init(hostname, null, null, srv.username, srv.password, null, null);
          logins.push(login);
        }
      };

      let srvname=this.extraitServeur(hostname);

      let serveurs=MailServices.accounts.allServers;
      const nbs=serveurs.length;
      for (let i=0;i<nbs;i++){
        let s=serveurs.queryElementAt(i, Ci.nsIMsgIncomingServer);
        if (s &&
            (s.type=="imap" || s.type=="pop3") &&
            srvname==s.hostName){

            addlogins(s);
        }
      }

      count.value=logins.length;

    } else if (APP_MELANIE2==srvm2){

      //v3.4 - cas agenda : rechercher uid
      if (formSubmitURL && ""!=formSubmitURL){

        let uid=this.GetUidAgenda(formSubmitURL);

        if (uid && ""!=uid){

          //rechercher compte mail
          let srv=MailServices.accounts.allServers;
          const nbs=srv.length;
          for (let i=0;i<nbs;i++){
            let s=srv.queryElementAt(i, Ci.nsIMsgIncomingServer);
            if (s.username==uid && (s.type=="imap" || s.type=="pop3") &&
                this.isMelanie2Host(s.hostName)) {
              if (s.password && ""!=s.password){
                let login=Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
                login.init(hostname, null, null, uid, s.password, null, null);
                logins.push(login);
                count.value=1;
              } else {
                count.value=0;
              }

              return logins;
            }
          }
        }
      }

      let cp=this.GetComptePrincipal();
      if (null==cp || null==cp.incomingServer ||
          null==cp.incomingServer.password || ""==cp.incomingServer.password) {

        count.value=0;
        return logins;
      }
      let login=Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);

      login.init(hostname, null, null, this.GetUidReduit(cp.incomingServer.username),
                  cp.incomingServer.password, null, null);
      logins.push(login);
      count.value=1;
    }

    return logins;
  },

  //Modification du mot de passe pour les comptes Pacome
  //si uid null => tous les comptes Pacome
  //si mdp null => mot de passe réinitialise.
  modifyMdpPacome: function(uid, mdp) {

    if (null==uid || ""==uid)
      return;

    let uidm=null;
    if (null!=uid)
      uidm=this.GetUidReduit(uid);

    //serveurs entrants
    let serveurs=MailServices.accounts.allServers;
    const nbs=serveurs.length;
    for (let i=0;i<nbs;i++){
      let s=serveurs.queryElementAt(i, Ci.nsIMsgIncomingServer);
      if (s &&
          (s.type=="imap" || s.type=="pop3") &&
          this.isMelanie2Host(s.hostName)){
        if (null!=uidm) {
          let uid2=this.GetUidReduit(s.username);
          if (uidm!=uid2)
            continue;
        }
        s.password=mdp;
      }
    }
    //serveurs sortants
    serveurs=MailServices.smtp.servers;
    while (serveurs.hasMoreElements()){
      let s=serveurs.getNext();
      if (s instanceof Ci.nsISmtpServer &&
          this.isMelanie2Host(s.hostname)){
        if (null!=uidm) {
          let uid2=this.GetUidReduit(s.username);
          if (uidm!=uid2)
            continue;
        }
        s.password=mdp;
      }
    }
  },

  removeAllLogins: function () {

    this.modifyMdpPacome(null, null);
  }
}

