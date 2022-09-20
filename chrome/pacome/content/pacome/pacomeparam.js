
ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource:///modules/mailServices.js");
ChromeUtils.import("resource:///modules/FeedUtils.jsm");



//preference de la liste des uids de boites non utilisées
//uid séparés par PACOME_IGNORE_UID_SEP
const PACOME_IGNORE_UID="pacome.ignoreuids";
const PACOME_IGNORE_UID_SEP=";";

//preference de la liste des comptes de flux ignorés
//libellés séparés par PACOME_IGNORE_UID_SEP
const PACOME_IGNORE_FLUX="pacome.ignoreflux";
const PACOME_IGNORE_FLUX_SEP=";";


//v1.2
const kLDAPDirectory=0; // defined in nsDirPrefs.h
var datasourceContractIDPrefix="@mozilla.org/rdf/datasource;1?name=";//???


//30/04/2004 positionné à true si l'assistant est allé jusqu'au bout
//utilisé pour l'affichage du message "les paramètres..." à la fermeture
var gPacomeAssitComplete=false;


//constantes etat de parametrage des boites et flux
const PACOME_ETAT_ABSENT=0;//non configuré
const PACOME_ETAT_PARAM=1;//configuré
const PACOME_ETAT_IGNORE=2;//inutilisé


/**
* Retourne un tableau des identifiants pacome (uid individuels, .-. retirés)
* parcours les comptes et la préférence PACOME_IGNORE_UID
*/
function PacomeListeUid(){

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
        let uid=GetUidReduit(cprinc.incomingServer.username);
        PacomeTrace("PacomeListeUid identifiant principal:"+uid);
        uids.push(uid);
      }
    }

    //ensuite lister les identifiants des comptes configures
    //parcours des comptes
    for (var c=0;c<nb;c++){
      let compte=MailServices.accounts.accounts.queryElementAt(c,Components.interfaces.nsIMsgAccount);
      if ((null==compte)||(null==compte.incomingServer))
        continue;
      //test boite pacome
      if ("imap"!=compte.incomingServer.type && "pop3"!=compte.incomingServer.type)
        continue;
      let confid=compte.incomingServer.getCharValue("pacome.confid");
      if (null==confid)
        continue;
      //uid
      let uid=GetUidReduit(compte.incomingServer.username);
      //ajout
      for (var i=0;i<uids.length;i++){
        if (uid==uids[i])
          break;
      }
      if (i==uids.length){
        PacomeTrace("PacomeListeUid uid de boite:"+uid);
        uids.push(uid);
      }
    }

    //enfin lister les identifiants inutilisés
    if (Services.prefs.prefHasUserValue(PACOME_IGNORE_UID)){
      let ignoreuids=Services.prefs.getCharPref(PACOME_IGNORE_UID);
      PacomeTrace("PacomeListeUid ignoreuids:"+ignoreuids);

      if (0!=ignoreuids.length && ""!=ignoreuids.length){

        ignoreuids=ignoreuids.split(PACOME_IGNORE_UID_SEP);

        for (var i=0;i<ignoreuids.length;i++){
          if (null==ignoreuids[i] || 0==ignoreuids[i].length)
            continue;
          PacomeTrace("PacomeListeUid  traitement ignoreuids:"+ignoreuids[i]);
          let ident=GetUidReduit(ignoreuids[i]);
          PacomeTrace("PacomeListeUid uid reduit:"+ident);
          //ajout?
          for (var u=0;u<uids.length;u++){
            if (ident==uids[u])
              break;
          }
          if (u==uids.length){
            PacomeTrace("PacomeListeUid uid de boite:"+ident);
            uids.push(ident);
          }
        }
      }
    }

    return uids;

  } catch(ex){
    PacomeTrace("PacomeListeUid exception:"+ex);
    PacomeSetErreurGlobaleEx(-1, PacomeMessageFromId("PageIdentsErrConfig"), ex);
    return null;
  }
}


/**
* Retourne la configuration pacome au format transmis dans les requetes de parametrage
*
*/
function PacomeDocumentConfig(){

  try{

    PacomeTrace("PacomeDocumentConfig construction configuration");

    //configuration des identifiants
    let uids=PacomeListeUid();
    let configuids="<identifiants>";
    for (var i=0;i<uids.length;i++)
      configuids+="<identifiant>"+uids[i]+"</identifiant>";
    configuids+="</identifiants>";

    //configuration des boites
    let configbal="<comptes>";

    //configuration des flux
    let configflux="<comptes_flux>";

    //parcours des comptes
    let nb=MailServices.accounts.accounts.length;
    for (var c=0;c<nb;c++){

      let compte=MailServices.accounts.accounts.queryElementAt(c,Components.interfaces.nsIMsgAccount);

      if (null==compte || null==compte.incomingServer)
        continue;

      //boite melanie2
      if ("imap"==compte.incomingServer.type || "pop3"==compte.incomingServer.type){

        let cle=compte.incomingServer.key;
        let pref="mail.server."+cle+".pacome.version";
        if (Services.prefs.prefHasUserValue(pref)){
          PacomeTrace("PacomeDocumentConfig traitement boite Melanie2:"+compte.incomingServer.username);
          let ver=Services.prefs.getCharPref(pref);
          let ts=-1;
          let confid="";
          pref="mail.server."+cle+".pacome.confid";
          if (Services.prefs.prefHasUserValue(pref))
            confid=Services.prefs.getCharPref(pref);
          pref="mail.server."+cle+".pacome.ts";
          if (Services.prefs.prefHasUserValue(pref))
            ts=Services.prefs.getCharPref(pref);

          let nom=pacomeRemplaceCars(compte.incomingServer.prettyName);

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
          PacomeTrace("PacomeDocumentConfig traitement flux:"+compte.incomingServer.prettyName);

          let ver=Services.prefs.getCharPref(pref);
          let confid="";
          pref="mail.server."+cle+".pacome.confid";
          if (Services.prefs.prefHasUserValue(pref))
            confid=Services.prefs.getCharPref(pref);

          let nom=pacomeRemplaceCars(compte.incomingServer.prettyName);

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
        PacomeTrace("PacomeDocumentConfig "+PACOME_IGNORE_UID+": "+ignoreuids);
        uids=ignoreuids.split(PACOME_IGNORE_UID_SEP);
        for (var i=0;i<uids.length;i++){
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
        PacomeTrace("PacomeDocumentConfig "+PACOME_IGNORE_FLUX+": "+ignoreflux);
        let flux=ignoreflux.split(PACOME_IGNORE_FLUX_SEP);
        for (var i=0;i<flux.length;i++){
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
    let cfgagendas=pacomeCalConfiguration();

    //configuration globale
    let config="<pacome>"+configuids+configbal+configflux+cfgagendas+configapp+configprx+"</pacome>";
    PacomeTrace("PacomeDocumentConfig configuration:"+config);

    return config;

  } catch(ex){
    PacomeSetErreurGlobaleEx(-1, PacomeMessageFromId("PageIdentsErrConfig"), ex);
    return null;
  }
}




/* ajoute une boite inutilisé dans la liste */
function PacomeAjoutBoiteIgnore(uid){

  //on recherche si un compte n'utilise pas l'uid avant ajout
  let nb=MailServices.accounts.accounts.length;
  for (var i=0;i<nb;i++){
    let compte=MailServices.accounts.accounts.queryElementAt(i,Components.interfaces.nsIMsgAccount);
    if (null==compte || null==compte.incomingServer)
      continue;
    if (uid==compte.incomingServer.username){
      PacomeTrace("PacomeAjoutBoiteIgnore uid est utilise par au moins un compte. pas d'ajout dans "+PACOME_IGNORE_UID);
      return;
    }
  }

  if (Services.prefs.prefHasUserValue(PACOME_IGNORE_UID)){
    let ignoreuids=Services.prefs.getCharPref(PACOME_IGNORE_UID);

      PacomeTrace("PacomeAjoutBoiteIgnore "+PACOME_IGNORE_UID+": "+ignoreuids);
      let uids=ignoreuids.split(PACOME_IGNORE_UID_SEP);
      let bpresent=false;
      for (var i=0;i<uids.length;i++){
        if (null==uids[i] || 0==uids[i].length)
          continue;
        if (uids[i]==uid){
          bpresent=true;
          break;
        }
      }
      if (!bpresent){
        PacomeTrace("PacomeAjoutBoiteIgnore ajout:"+uid);
        if (0!=ignoreuids.length) ignoreuids+=PACOME_IGNORE_UID_SEP;
        ignoreuids+=uid;
        Services.prefs.setCharPref(PACOME_IGNORE_UID, ignoreuids);
      }

  }  else
    Services.prefs.setCharPref(PACOME_IGNORE_UID, uid);
}

/* retire une boite de la liste des inutilisées*/
function PacomeSupBoiteIgnore(uid){

  if (!Services.prefs.prefHasUserValue(PACOME_IGNORE_UID))
    return;
  let ignoreuids=Services.prefs.getCharPref(PACOME_IGNORE_UID);
  let uids=ignoreuids.split(PACOME_IGNORE_UID_SEP);
  ignoreuids="";
  for (var i=0;i<uids.length;i++){
    if (null==uids[i] || 0==uids[i].length)
      continue;
    if (uids[i]!=uid){
      if (0!=ignoreuids.length) ignoreuids+=PACOME_IGNORE_UID_SEP;
      ignoreuids+=uids[i];
    } else
      PacomeTrace("PacomeSupBoiteIgnore retire:"+uid);
  }
  Services.prefs.setCharPref(PACOME_IGNORE_UID, ignoreuids);
}



/**
*  positionne des preferences pour une branche identifiee par prefix
*
*  @param  elemprefs noeud xml de nom <prefs>, contient les elements <pref>
*  @param  prefix préfixe du nom de la préférence (doit comporter le point terminal)
*
*  @return si succes retourne true
* si erreur retourne false
*
*  implémentation :
*
*/
function PacomeSetPrefs(elemprefs, prefix){

  let prefs=elemprefs.getElementsByTagName("pref");

  for (var i=0;i<prefs.length;i++){
    let p=prefs[i];

    let nom=prefix+p.getAttribute("nom");
    let val=p.getAttribute("valeur");

    let t=p.getAttribute("type");
    if ("bool"==t){
      let b=false;
      if (val=="true")
        b=true;
      Services.prefs.setBoolPref(nom,b);
    }
    else if ("int"==t)
      Services.prefs.setIntPref(nom,val);
    else if ("string"==t)
      Services.prefs.setStringPref(nom, val);
    else{
      PacomeSetErreurGlobale(-1, PacomeMessageFromId("ErreurTypePref")+":<"+nom+">");
      return false;
    }
  }

  return true;
}


/**
*  fixe les paramètres d'une identité
*  version 2 de ParamIdentite
* positionne les variables membres pour les dossiers au lieu des attributs
*
*  @param  identite instance nsIMsgIdentity
*  @param  elemidentite element <identite> du document xml
*  @param  bDossiers si true parametre les dossiers
*
*  @return true si succès ou false si erreur
*/
function ParamIdentite(identite, elemidentite, bDossiers){

  PacomeTrace("ParamIdentite");
  let elemprefs=elemidentite.getElementsByTagName("prefs");

  //préférences
  let prefix="mail.identity."+identite.key+".";

  let prefs=elemprefs[0].getElementsByTagName("pref");

  for (var i=0;i<prefs.length;i++){
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
    if ("bool"==t){
      let b=false;
      if (val=="true") b=true;
      identite.setBoolAttribute(nom,b);
    } else if ("int"==t)
      identite.setIntAttribute(nom,val);
    else if ("string"==t)
      identite.setCharAttribute(nom,val);
    else{
      PacomeSetErreurGlobale(-1, PacomeMessageFromId("ErreurTypePref")+":<"+nom+">");
      return false;
    }
  }

  return true;
}


/*
*  Mise à jour d'un serveur entrant (imap, pop3)
*  Permet de changer de nom de serveur
*
*  @param  serveur instance nsIncomingServer
*  @param  elemsrventrant element <srventrant> du document xml
*
*  @return true si ok ou false si erreur
*  05/12/2005 : pas d'effacement des valeurs originales (pas d'appel à clearAllValues)
*
*/
function ParamServeurEntrant(elemsrventrant){

  PacomeTrace("ParamServeurEntrant");

  //identifiants depuis document
  let uid=elemsrventrant.getAttribute("username");
  let srvname=elemsrventrant.getAttribute("hostname");
  let typein=elemsrventrant.getAttribute("type");

  PacomeTrace("ParamServeurEntrant uid="+uid);
  PacomeTrace("ParamServeurEntrant serveur entrant="+srvname);
  PacomeTrace("ParamServeurEntrant type serveur entrant="+typein);

  PacomeTrace("ParamServeurEntrant recherche du serveur entrant.");
  let srventrant=null;
  let bNouveau=false;
  try {
    srventrant=MailServices.accounts.FindServer(uid, srvname, typein);
  } catch(ex1){
    PacomeTrace("ParamServeurEntrant pas de serveur entrant.");
    srventrant=null;
  }
  if (null==srventrant){
    PacomeTrace("ParamServeurEntrant creation du serveur entrant.");
    //creer nouveau
    srventrant=MailServices.accounts.createIncomingServer(uid, srvname, typein);
    if (null==srventrant){
      PacomeSetErreurGlobale(-1, PacomeMessageFromId("PacomeErreurParamSrv"));
      PacomeTrace("ParamServeurEntrant echec de creation du serveur entrant");
      return null;
    }
    bNouveau=true;
  } else
    PacomeTrace("ParamServeurEntrant serveur entrant existant.");

  //préférences
  let elemprefs=elemsrventrant.getElementsByTagName("prefs");
  let prefix="mail.server."+srventrant.key+".";
  PacomeSetPrefs(elemprefs[0], prefix);

  //cas imap, désactiver le spam lors de la creation, repositionne au demarrage
  if (bNouveau && "imap"==srventrant.type &&
      srventrant.getBoolValue("pacome.install.spam")){
    PacomeTrace("ParamServeurEntrant moveOnSpam force a false");
    srventrant.setBoolValue("moveOnSpam", false);
  }

  return srventrant;
}


//v3.0T2 - recherche serveur smtp
//remplace smtpService.findServer qui semble buguée si un seul serveur smtp
function GetServeurSmtp(username, hostname) {

  let serveurs=MailServices.smtp.servers;
  while (serveurs.hasMoreElements()){
    let s=serveurs.getNext();
    if (s instanceof Components.interfaces.nsISmtpServer &&
        s.hostname==hostname && s.username==username){

      return s;
    }
  }
  return null;
}

/*
*  Mise à jour d'un serveur sortant (smtp)
*  Permet de changer de nom de serveur
*
*  @param  serveur instance nsISmtpServer
*  @param  elemsrvsortant element <srvsortant> du document xml
*
*  @return true si ok ou false si erreur
*  05/12/2005 : pas d'effacement des valeurs originales (pas d'appel à clearAllValues)
*
*/
function ParamServeurSmtp(elemsrvsortant) {

  PacomeTrace("ParamServeurSmtp");

  let hostname=elemsrvsortant.getAttribute("hostname");
  let username=elemsrvsortant.getAttribute("username");

  let smtpsrv=null;
  try {
    PacomeTrace("ParamServeurSmtp recherche du serveur smtp. username="+username+" - hostname="+hostname);
    smtpsrv=GetServeurSmtp(username, hostname);
    PacomeTrace("ParamServeurSmtp recherche du serveur smtp smtpsrv="+smtpsrv);
  } catch(ex1){
    smtpsrv=null;
    PacomeTrace("ParamServeurSmtp pas de serveur smtp.");
  }
  if (null==smtpsrv){
    PacomeTrace("ParamServeurSmtp creation du serveur smtp.");
    //creer nouveau
    smtpsrv=MailServices.smtp.createServer();
    if (null==smtpsrv){
      PacomeSetErreurGlobale(-1, PacomeMessageFromId("PacomeErreurParamSmtp"));
      PacomeTrace("ParamServeurSmtp echec de creation du serveur smtp");
      return null;
    }
  }

  //propriétés
  smtpsrv.username=username;
  smtpsrv.hostname=hostname;
  for (var i=0; i<elemsrvsortant.attributes.length; i++){
    let nom=elemsrvsortant.attributes[i].name;
    if ("username"==nom || "hostname"==nom)
      continue;
    let val=elemsrvsortant.attributes[i].value;
    PacomeTrace("ParamServeurSmtp propriete nom="+nom+" - valeur="+val);
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
}


/*
*  creation du compte Local Folders
*
*
*  @return si succes retourne true
* si erreur retourne false
*
*/
function CreeLocalFolders(spamLevel) {

  PacomeTrace("CreeLocalFolders");

  try{

    let localMailServer=null;

    try{
      localMailServer=MailServices.accounts.localFoldersServer;
    }
    catch(e1){
      localMailServer=null;
    }
    if (localMailServer==null){
      PacomeTrace("CreeLocalFolders creation du compte dossiers locaux");
       MailServices.accounts.createLocalMailAccount();

      //spamLevel
      localMailServer=MailServices.accounts.localFoldersServer;
      let pref="mail.server."+localMailServer.key+".spamLevel";
      Services.prefs.setIntPref(pref, spamLevel);
      PacomeTrace("CreeLocalFolders spamLevel Dossiers Locaux:"+spamLevel);
     }

    return true;
  }
  catch(ex){
    PacomeTrace("CreeLocalFolders exception:"+ex);
    PacomeSetErreurGlobaleEx(-1, PacomeMessageFromId("ErreurCreeDosLocal"), ex);
    return false;
  }
}



/*
*  mise à jour des préférences à partir du document xml
*
*  @param  preferences  element xml <preferences>
*
*  @return si succes retourne true
* si erreur retourne false
*
*  implémentation :
*
*/
function PacomeSetPreferences(preferences){

  //parcours des préférences
  let elems=preferences.getElementsByTagName("preference");

  for (var i=0;i<elems.length;i++){
    let p=elems[i];

    let nom=p.getAttribute("nom");
    let val=p.getAttribute("valeur");
    let t=p.getAttribute("type");

    if ("bool"==t){
      let b=false;
      if ("true"==val) b=true;
      Services.prefs.setBoolPref(nom,b);
    }
    else if ("int"==t)
      Services.prefs.setIntPref(nom,val);
    else if ("string"==t)
      Services.prefs.setStringPref(nom, val);
    else{
      PacomeSetErreurGlobale(-1, PacomeMessageFromId("ErreurTypePref")+":<"+nom+">");
      return false;
    }
  }

  return true;
}


/*
*  ajoute les informations d'annuaire ldap
*
*  @param  elem element <annuaire>
*
*  @return si succes retourne true
* si erreur retourne false
*
*  implémentation :
*  30/04/2004 : prend en compte les attributs 'hostname' 'port' et 'description'
*    ajoute l'annuaire si la description et l'uri correspondante n'existe pas déjà
*
*  V0.4 (11-08-2004) prise en compte attribut filtre dans elem
*v1.2 prise en compte attribut maxHits
*
*  v2.4 renommée en PacomeParamAnnuaire
*  prise en compte attribut 'identifiant' de elemannuaire
*
* v3 - modifications pour Thunderbird 3
* Voir fichier 'mailnews/addrbook/prefs/content/pref-directory-add.js' pour exemple.
*  renommee en ParamAnnuaire
*/
function ParamAnnuaire(elemannuaire){

  PacomeTrace("ParamAnnuaire");

  let hostname=elemannuaire.getAttribute("hostname");
  let description=elemannuaire.getAttribute("description");
  let port=elemannuaire.getAttribute("port");
  let filtre=elemannuaire.getAttribute("filtre");
  //idann -> cle du serveur dans les préférences
  let idann=elemannuaire.getAttribute("identifiant");

  PacomeTrace("ParamAnnuaire hostname="+hostname);
  PacomeTrace("ParamAnnuaire description="+description);
  PacomeTrace("ParamAnnuaire idann="+idann);

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
  let srvstr="ldap_2.servers."+idann;
  let adrBook=pacomeGetAnnuaire(idann);

  if (null==adrBook) {
    PacomeTrace("ParamAnnuaire creation de l'annuaire.");
    //creer annuaire
    MailServices.ab.newAddressBook(description, ldapUrl.spec, kLDAPDirectory, srvstr);

  } else {
    PacomeTrace("ParamAnnuaire modification annuaire existant.");
    //modifier existant
    adrBook.dirName=description;
    let ldapdir=adrBook.QueryInterface(Components.interfaces.nsIAbLDAPDirectory);
    ldapdir.lDAPURL=ldapUrl.QueryInterface(Components.interfaces.nsILDAPURL);
  }

  //finaliser maxHits
  let dir = MailServices.ab.getDirectory("moz-abldapdirectory://"+srvstr)
            .QueryInterface(Components.interfaces.nsIAbLDAPDirectory);

  dir.maxHits = maxHits;

  //autres préférences de l'annuaire
  let elemprefs=elemannuaire.getElementsByTagName("prefs");
  if (null!=elemprefs && 0!=elemprefs.length){
    elemprefs=elemprefs[0];
    PacomeSetPrefs(elemprefs,"ldap_2.servers."+idann+".");
  }

  return true;
}




/*
*  analyse le document xml anaismoz - extrait le code erreur et le message
*
*  @param  doc instance de document xml
*
*  @return true si code erreur = 0
* sinon retourne false (erreur globale dans gPacomeMsgErreur)
*
*  v1.2 changement d'élément racine pacome -> pacome
*
*/
function AnalyseErreurDoc(doc){

  let racine=doc.documentElement;

  if (null==racine || "pacome"!=racine.nodeName){
    PacomeSetErreurGlobale(-1, PacomeMessageFromId("PacomeErreurFormatDoc"));
    return false;
  }

  let resultat=racine.getElementsByTagName("resultat");

  PacomeSetErreurGlobale(resultat[0].getAttribute("code"), resultat[0].getAttribute("erreur"));

  if (gPacomeCodeErreur==null || gPacomeCodeErreur!=0){
    return false;
  }

  return true;
}



/**
*  traite un élément du type compte : crée ou met à jour le compte dans le gestionnaire
*
*  @param elemcompte élément XML "<compte>" du document
*
*  @return si succès retourne 0 si le compte est mis à jour, 1 s'il est créé
*  sinon retourne -1 (erreur positionnée dans gPacomeMsgErreur)
*
*  implémentation : Si compte existant-> met à jour sinon création
*  v0.94 mémorisation version de paramétrage
*  v0.94 l'identifiant de configuration est repris dans le document (pacome v0.92.202)
*  V0.95 serveur entrant <entrant>
*
*  v3.0 - cree ou met a jour simultanement
*/
function ParamComptePacome(elemcompte){

  PacomeTrace("ParamComptePacome");

  try{

    gPacomeAssitComplete=false;
    //indicateur nouveau compte
    let bnouveau=false;

    //elements identite, srventrant et srvsortant du document
    let elemidentite=elemcompte.getElementsByTagName("identite");
    elemidentite=elemidentite[0];
    let elemsrventrant=elemcompte.getElementsByTagName("srventrant");
    elemsrventrant=elemsrventrant[0];
    let elemsrvsortant =elemcompte.getElementsByTagName("srvsortant");
    elemsrvsortant=elemsrvsortant[0];

    //identifiants depuis document
    let uid=elemcompte.getAttribute("uid");
    PacomeTrace("ParamComptePacome uid="+uid);

    //serveur entrant
    PacomeTrace("ParamComptePacome parametrage du serveur entrant.");
    let srventrant=ParamServeurEntrant(elemsrventrant);
    if (null==srventrant){
      PacomeSetErreurGlobale(-1, PacomeMessageFromId("PacomeErreurParamSrv"));
      PacomeTrace("ParamComptePacome echec de parametrage du serveur entrant");
      return -1;
    }

    //serveur smtp
    PacomeTrace("ParamComptePacome parametrage du serveur smtp.");
    let smtpsrv=ParamServeurSmtp(elemsrvsortant);
    if (null==smtpsrv){
      PacomeSetErreurGlobale(-1, PacomeMessageFromId("PacomeErreurParamSmtp"));
      PacomeTrace("ParamComptePacome echec de parametrage du serveur smtp");
      return -1;
    }

    //recherche compte existant
    let compte=null;
    if (!bnouveau) {
      PacomeTrace("ParamComptePacome recherche du compte.");
      try {
        compte=MailServices.accounts.FindAccountForServer(srventrant);
      } catch (ex1){
        compte=null;
      }
      if (null==compte)
        PacomeTrace("ParamComptePacome compte inexistant.");
    }

    //identite
    let identite=null;
    let bNouvIdent=false;
    if (!bnouveau) {
      PacomeTrace("ParamComptePacome recherche de l'identite.");
      if (null!=compte) {
        identite=compte.defaultIdentity;
        PacomeTrace("ParamComptePacome identite identityName='"+identite.identityName+"' - email='"+identite.email+"'");
      }
    }
    if (null==identite) {
      PacomeTrace("ParamComptePacome creation de l'identite.");
      identite=MailServices.accounts.createIdentity();
      bNouvIdent=true;
    }
    let res=ParamIdentite(identite, elemidentite);
    if (!res){
      PacomeSetErreurGlobale(-1, PacomeMessageFromId("PacomeErreurParamIdent"));
      PacomeTrace("ParamComptePacome echec de parametrage de l'identite.");
      return -1;
    }
    identite.valid=true;
    identite.smtpServerKey=smtpsrv.key;

    //creation compte
    if (null==compte) {
      PacomeTrace("ParamComptePacome creation du compte.");
      compte=MailServices.accounts.createAccount();
      if (null==compte) {
        PacomeSetErreurGlobale(-1, PacomeMessageFromId("PacomeErreurParamCompte"));
        PacomeTrace("ParamComptePacome echec de creation du compte.");
        return -1;
      }
      bnouveau=true;
    }

    //complements parametrage (v6)
    if (bNouvIdent){
      PacomeTrace("ParamComptePacome ajout identite au compte");
      compte.addIdentity(identite);
    }
    if (null==compte.defaultIdentity){
      PacomeTrace("ParamComptePacome positionnement identite par defaut du compte");
      compte.defaultIdentity=identite;
    }
    if (null==compte.incomingServer ||
        compte.incomingServer.key!=srventrant.key){
        PacomeTrace("ParamComptePacome compte.incomingServer=srventrant");
        compte.incomingServer=srventrant;
    }

    //positionnement du compte par défaut si nécessaire
    try{
      if (null==MailServices.accounts.defaultAccount){
        PacomeTrace("ParamComptePacome positionnement du compte par defaut.");
        MailServices.accounts.defaultAccount=compte;
      }
    } catch(ex1){
      PacomeTrace("ParamComptePacome exception positionnement du compte par defaut:"+ex1);
    }

    //pour le compte par défaut: lecture mail au démarrage
    // +paramétrage d'impression
    if (MailServices.accounts.defaultAccount.key==compte.key){
      if (compte.incomingServer.canBeDefaultServer){
        PacomeTrace("ParamComptePacome positionnement lecture mail au demarrage");
        compte.incomingServer.loginAtStartUp=true;
        compte.incomingServer.downloadOnBiff=true;
      }
      PacomeTrace("ParamComptePacome parametrage impression");
      let elem=elemcompte.getElementsByTagName("impression");
      if (null!=elem && 0!=elem.length){
        elem=elem[0].getElementsByTagName("preferences");
        if (null!=elem && 0!=elem.length) PacomeSetPreferences(elem[0]);

        pacomeMajPrinter(elem[0]);
      }
    }

    //creer dossier local si necessaire
    let spamLevel=Services.prefs.getIntPref("mail.server."+srventrant.key+".spamLevel");
    let bRes=CreeLocalFolders(spamLevel);
    if (!bRes){
      return -1;
    }

    MailServices.accounts.saveAccountInfo();

    Services.prefs.savePrefFile(null);

    //retour resultat
    gPacomeAssitComplete=true;
    if (bnouveau) {
      PacomeTrace("ParamComptePacome parametrage nouveau compte termine.");
      return 1;
    }
    PacomeTrace("ParamComptePacome mise a jour parametrage du compte.");
    return 0;

  }  catch(ex){
    PacomeSetErreurGlobaleEx(-1, PacomeMessageFromId("PacomeErreurTraiteCompte"), ex);
    PacomeTrace("Exception ParamComptePacome:"+ex);
    return -1;
  }
}


/* Suppression d'un compte de boite
  return 1 si suppression effective, 0 si pas de suppression, -1 si erreur
*/
function PacomeSupprimeBoite(uid, confid){

  PacomeTrace("PacomeSupprimeBoite");

  //suppression du parametrage
  let nb=MailServices.accounts.accounts.length;
  for (var i=0;i<nb;i++){
    let compte=MailServices.accounts.accounts.queryElementAt(i,Components.interfaces.nsIMsgAccount);
    if (null==compte || null==compte.incomingServer) continue;
    let nom=compte.incomingServer.username;
    if (uid==nom){
      //verifie compte pacome
      let cfg=compte.incomingServer.getCharValue("pacome.confid");
      if (cfg==confid){
        //suppression effective
        PacomeTrace("PacomeSupprimeBoite suppression du compte uid:"+uid+" - confid:"+confid);
        MailServices.accounts.removeAccount(compte);
        return 1;
      }
    }
  }

  return 0;
}


/* paramétrage d'application et annuaires
  return 1 si succes, -1 si erreur
*/
function ParamAppli(docparam){

  //parametrage annuaires
  //a faire avant application
  PacomeTrace("ParamAppli parametrage annuaires");
  let annuaires=docparam.getElementsByTagName("annuaires");
  if (null!=annuaires){
    annuaires=annuaires[0].getElementsByTagName("annuaire");
    if (null!=annuaires){
      for (var i=0;i<annuaires.length;i++){
        let res=ParamAnnuaire(annuaires[i]);
        if (!res)
          PacomeAfficheMsgIdGlobalErr("ErreurCreationAnn");
      }
    }
  }

  //parametrage application
  PacomeTrace("ParamAppli parametrage application");
  let elemappli=PacomeElementAppli(docparam);
  if (null!=elemappli){
    PacomeTrace("ParamAppli traitement preferences");
    res=PacomeSetPreferences(elemappli);
    if (res==false){
      PacomeAfficheMsgIdGlobalErr("ErreurCreationPrefs");
      return -1;
    }
  }

  Services.prefs.savePrefFile(null);

  return 1;
}


/**
* v6 : paramétrage du proxy
* v6.1 : en mode mise à jour ne pas forcer, donc uniquement si pacome.config.proxy est present
* dans tous les cas, mettre à jour les exceptions si pacome.config.proxy_exceptions
*
* return 1 si succes, -1 si erreur
*/
function ParamProxy(docparam) {

  //parametres de proxy du document de parametrage
  PacomeTrace("ParamProxy parametrage proxy");
  let elemprx=PacomeElementProxy(docparam);

  //rechercher pacome.config.proxy dans elemprx
  let pacomeconfig="";
  let elems=elemprx.getElementsByTagName("preference");
  for (var i=0;i<elems.length;i++){
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
    let res=pacomeConfigProxy();
    if (false==res){
      PacomeAfficheMsgIdGlobalErr("ErreurCreationPrefs");
      return -1;
    }
  }

  if ("WINNT"!=os) {
    PacomeTrace("ParamProxy traitement preferences");
    res=PacomeSetPreferences(elemprx);
    if (false==res){
      PacomeAfficheMsgIdGlobalErr("ErreurCreationPrefs");
      return -1;
    }
  }

  //dans tous les cas, mettre à jour les exceptions si pacome.config.proxy_exceptions
  for (i=0;i<elems.length;i++){
    let nom=elems[i].getAttribute("nom");
    if ("pacome.config.proxy_exceptions"==nom){
      pacomeMajExceptions();
    }
  }

  //mise a jour numero de version
  MajVersionProxy(docparam)

  Services.prefs.savePrefFile(null);

  return 1;
}


/**
* mettre à jour numéro de version sans parametrer
*/
function MajVersionProxy(docparam) {

  //positionner les preferences
  PacomeTrace("MajVersionProxy");
  let elemprx=PacomeElementProxy(docparam);
  if (null==elemprx){
    PacomeTrace("Pas de document de parametrage proxy");
    return false;
  }

  //parcours des préférences
  let elems=elemprx.getElementsByTagName("preference");

  for (var i=0;i<elems.length;i++){

    let p=elems[i];
    let nom=p.getAttribute("nom");

    if ("pacome.proxy.version"==nom){
      let val=p.getAttribute("valeur");
      let cur=Services.prefs.getCharPref("pacome.proxy.version");
      if (cur!=val) {
        Services.prefs.setCharPref("pacome.proxy.version", val);
        PacomeTrace("Mise a jour version de proxy :"+val);
      }
      return true;
    }
  }

  return false;
}


/**
*  lecture configuration pour un compte depuis préférence 'pacome.comptes'
*
*  @param uid  identifiant de l'utilisateur
*  @param srv  nom du serveur
*
*  @return tableau avec 'confid' et 'version' si succès, null si le compte n'est pas enregistré ou erreur
*
*  implémentation :
*  v0.94 retourne identifiant et version (0 si pas d'info)
*  V0.95 les informations des comptes sont dans les préférences des serveurs entrants
*
*  v2.4 : utilisation MailServices.accounts
*/
function LitInfoCompte(uid,srv){


  let nbacc=MailServices.accounts.accounts.length;

  for (var j=0;j<nbacc;j++){
    let compte=MailServices.accounts.accounts.queryElementAt(j,Components.interfaces.nsIMsgAccount);
    if (null==compte || null==compte.incomingServer) continue;
    let username=compte.incomingServer.username;
    let hostname=compte.incomingServer.hostName;
    if (uid==username && srv==hostname){
      let conf=new Array();
      conf["confid"]=compte.incomingServer.getCharValue("pacome.confid");
      conf["version"]=compte.incomingServer.getCharValue("pacome.version");
      return conf;
    }
  }

  return null;
}

/* retourne état d'un compte de boite
  confid: null -> optionnel
  -1 si erreur, sinon constantes etat
*/
function PacomeEtatCompteBoite(uid, confid){

  //parcours des comptes
  let nbacc=MailServices.accounts.accounts.length;

  for (var j=0;j<nbacc;j++){

    let compte=MailServices.accounts.accounts.queryElementAt(j,Components.interfaces.nsIMsgAccount);
    if (null==compte || null==compte.incomingServer) continue;

    let username=compte.incomingServer.username;

    if (uid==username){

      let cfg=compte.incomingServer.getCharValue("pacome.confid");
      if (null!=cfg && cfg==confid){
        PacomeTrace("PacomeEtatCompteBoite boite existe");
        return PACOME_ETAT_PARAM;
      }
    }
  }

  //parcours inutilisés
  //boites non utilisées
  if (Services.prefs.prefHasUserValue(PACOME_IGNORE_UID)){
    let ignoreuids=Services.prefs.getCharPref(PACOME_IGNORE_UID);
    if (""!=ignoreuids){
      PacomeTrace("PacomeEtatCompteBoite "+PACOME_IGNORE_UID+": "+ignoreuids);
      let uids=ignoreuids.split(PACOME_IGNORE_UID_SEP);
      for (var i=0;i<uids.length;i++){
        if (null==uids[i] || 0==uids[i].length) continue;
        if (uid==uids[i]){
          PacomeTrace("PacomeEtatCompte boite non utilisee");
          return PACOME_ETAT_IGNORE;
        }
      }
    }
  }

  return PACOME_ETAT_ABSENT;
}




/* retourne element 'preferences' pour le parametrage d'application d'un document de paramétrage */
function PacomeElementAppli(docparam){

  const nbc=docparam.childNodes.length;

  for (var i=0;i<nbc;i++){

    if ("preferences"==docparam.childNodes[i].tagName){
      return docparam.childNodes[i];
    }
  }
  return null;
}

/* v6 - element de configuration proxy du document de parametrage */
function PacomeElementProxy(docparam){

  const nbc=docparam.childNodes.length;
  for (var i=0;i<nbc;i++){
    if ("proxy"==docparam.childNodes[i].tagName){

      return docparam.childNodes[i];
    }
  }
  return null;
}

/* MIGRATION DGGN : suppression des adressbook tbSync
*/
function DGGNMigreAnnuaires(){

  PacomeTrace("DGGNMigreAnnuaires");

  abObm = Services.prefs.getCharPref("extensions.obm.addressbooks", "").split(",");

  let supprimes = 0;
  try {
    let addressBooks=MailServices.ab.directories;
    while (addressBooks.hasMoreElements()) {

      let adrBook = addressBooks.getNext();

      if (adrBook instanceof Components.interfaces.nsIAbDirectory) {

        let prefid = adrBook.dirPrefId;
        let shortId = prefid ? prefid.split(".")[2] : "*";
        PacomeTrace("DGGNMigreAnnuaires dirPrefId=" + prefid);
        if (Services.prefs.getCharPref(prefid + '.tbSyncProvider', null)) {
          PacomeEcritLog(PACOME_LOGS_MODULE, "Suppression du carnet " + prefid, adrBook.URI);
          MailServices.ab.deleteAddressBook(adrBook.URI);
          Services.prefs.deleteBranch(prefid);
          supprimes += 1;
          PacomeEcritLog(PACOME_LOGS_MODULE, "Carnet supprime : " + prefid, adrBook.URI);
        }
        if (shortId && abObm.indexOf(shortId) !== -1) {
          PacomeEcritLog(PACOME_LOGS_MODULE, "Suppression du carnet OBM " + prefid, adrBook.URI);
          MailServices.ab.deleteAddressBook(adrBook.URI);
          Services.prefs.deleteBranch(prefid);
          supprimes += 1;
          PacomeEcritLog(PACOME_LOGS_MODULE, "Carnet OBM supprime : " + prefid, adrBook.URI);
        }


      }
    }
  } catch (ex) {
    PacomeTrace("DGGNMigreAnnuaires exception:"+ex);
    PacomeEcritLog(PACOME_LOGS_MODULE, "DGGNMigreAnnuaires exception:"+ex);
    return -2;
  }
  return supprimes;
}


/* pacome v3
identifiant : Amde, Maia (identifiant dans le document de paramétrage)
retourne instance nsIAbDirectory ou nsIAbLDAPDirectory
*/
function pacomeGetAnnuaire(identifiant){

  PacomeTrace("pacomeGetAnnuaire");

  const pref="ldap_2.servers."+identifiant;

  PacomeTrace("pacomeGetAnnuaire pref identifiant="+pref);

  let addressBooks=MailServices.ab.directories;

  while (addressBooks.hasMoreElements()) {

    let adrBook=addressBooks.getNext();

      if (adrBook instanceof Components.interfaces.nsIAbDirectory) {

      PacomeTrace("pacomeGetAnnuaire dirPrefId="+adrBook.dirPrefId);

      if (pref==adrBook.dirPrefId){

        return adrBook;
      }
    }
  }

  return null;
}



//remplace certains caracteres speciaux pour envoie configuration
function pacomeRemplaceCars(libelle) {

  if (null==libelle || ""==libelle) return libelle;

  libelle=libelle.replace(/&/g,"&amp;");
  libelle=libelle.replace(/"/g,"&quot;");
  libelle=libelle.replace(/'/g,"&#039;");
  libelle=libelle.replace(/</g,"&lt;");
  libelle=libelle.replace(/>/g,"&gt;");

  return libelle;
}


//mise a jour entetes des imprimantes
function pacomeMajPrinter(elem) {

  //parcours des préférences
  let elems=elem.getElementsByTagName("preference");

  let valeur="";

  for (var i=0;i<elems.length;i++){
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

  for (var i=0;i<nb.value;i++){

    let nompref=liste[i];

    if (null==nompref || ""==nompref){
      continue;
    }

    if (nompref.match(/\.print_headercenter$/)){
      PacomeTrace("pacomeMajPrinter preference:"+nompref);

      Services.prefs.setStringPref("print."+nompref, valeur);
    }
  }
}
