/* 
 * Fonctions GN spécifiques équivalent à celles de pacomeparam.js
 * 
 * Aspects spécifiques GN (2024/03)
 * Le client pacome est modifié pour configurer les boites partagées. 
 * La configuration de la bali ne change pas.
  Les boites partagées sont à configurer avec l'identité de la bali en tant qu'identité principale.
  Les identités des boites partagées sont ajoutées aux comptes si le droit d'émission est présent.
  La configuration envoyée par le client est à adapter pour conserver le fonctionnement standard de l'assistant (affichage des comptes de boites selon le contenu retourné par le serveur).

  exemple :

  le client envoie uid
  le serveur retourne:
    . 1 bali + 2 balp (même type donc même serveur imap)
    
  Le document serveur est de la forme:
  compte bali
    |_ identité bali
    |_ serveur entrant bali (imap)
    |_ serveur sortant bali (smtp)
  compte balp1
    |_ identité balp1
    |_ serveur entrant balp1 (imap)
    |_ serveur sortant balp1 (smtp)
  compte balp2
    |_ identité balp2 (sans droit d'émission)
    |_ serveur entrant balp2 (imap)
    |_ serveur sortant balp2 (smtp)  
    
    
  Paramétrages client:

    compte bali
    |_ identité bali
    |_ serveur entrant bali (imap)
    |_ serveur sortant bali (smtp)
    (identique fonctionnement actuel)
    
    compte balp
      |_ identité bali (principale : 1ère de la liste)
      |_ identité balp1
      |_ serveur entrant balp1 (imap) avec username bali
      |_ serveur sortant bali (smtp)
 * 
 */
 
ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource:///modules/mailServices.js");
ChromeUtils.import("resource:///modules/pacomeUtils.jsm");
ChromeUtils.import("resource://gre/modules/pacomeAuthUtils.jsm");
 
 
 // type boite individuelle
 const TYPE_BALI=1;
 // type boite partagée
 const TYPE_BALP=2;
 
 const AT_INTERIEUR="@gendarmerie.interieur.gouv.fr";


/*
 * Version GN de ParamComptePacome
 * paramétrage bali ou balp
 *  @param elemcompte élément XML "<compte>" du document
 *
 *  @return si succès retourne 0 si le compte est mis à jour, 1 s'il est créé
 *  sinon retourne -1 (erreur positionnée dans gPacomeM
 */
function ParamComptePacomeGN(elemcompte) {
  
  let typebal=GetTypeBoiteGN(elemcompte);

  if (-1==typebal) {
    PacomeTrace("ParamComptePacomeGN type de boite incorrect");
    return -1;
  }
  
  if (TYPE_BALI==typebal)
    return ParamBoiteBaliGN(elemcompte);
  
  // cas boites partagées GN
  return ParamBoiteBalpGN(elemcompte);
}

/* version GN de ParamComptePacome pour les boite BALI */
function ParamBoiteBaliGN(elemcompte){

  try{
    //identifiants depuis document
    let uid=elemcompte.getAttribute("uid");
    PacomeTrace("ParamBoiteBaliGN cas bali GN uid="+uid);

  }  catch(ex){
    PacomeSetErreurGlobaleEx(-1, PacomeMessageFromId("PacomeErreurTraiteCompte"), ex);
    PacomeTrace("Exception ParamBoiteBaliGN:"+ex);
    return -1;
  }    

  // on appelle la fonction standard
  let res=ParamComptePacome(elemcompte);
  if (res==-1){
    PacomeTrace("ParamBoiteBaliGN echec parametrage bali");
    return res;
  }

  try{

    // retrouver compte bali
    let elemsrventrant=elemcompte.getElementsByTagName("srventrant");
    elemsrventrant=elemsrventrant[0];

    let uid=elemsrventrant.getAttribute("username");
    let srvname=elemsrventrant.getAttribute("hostname");
    let typein=elemsrventrant.getAttribute("type");

    let srventrant=MailServices.accounts.FindServer(uid, srvname, typein);
    let compte=MailServices.accounts.FindAccountForServer(srventrant); 

    let identBali=GetIdentiteInterieur(compte);
    PacomeTrace("ParamBoiteBaliGN identBali:"+identBali);
    compte.defaultIdentity=identBali;

    // cas ou la boite a d'autres adresses
    let othersemail=GetOthersEmail(elemcompte);
    PacomeTrace("ParamBoiteBaliGN othersemail:"+othersemail);

    if (""==othersemail){

      // ne conserver que l'identité en interieur
      let i=compte.identities.length-1;
      while (i>=0){
        let ident=compte.identities.queryElementAt(i, Components.interfaces.nsIMsgIdentity);
        if (!ident.email.endsWith(AT_INTERIEUR)){
          compte.removeIdentity(ident);
        }
        i--;
      }
    } else{

      // ajouter et/ou supprimer autres identités avec adresses supplémentaires
      let courriels=othersemail.split(" ");

      // supprimer les identites obsoletes
      let i=compte.identities.length-1;
      while (i>=0){

        let ident=compte.identities.queryElementAt(i, Components.interfaces.nsIMsgIdentity);

        if (!ident.email.endsWith(AT_INTERIEUR)){
          if (!courriels.includes(ident.email)){
            PacomeTrace("ParamBoiteBaliGN suppresion identité bali:"+ident.email);
            compte.removeIdentity(ident);
          }
        } else{
          compte.defaultIdentity=ident;
        }
        i--;
      }

      // ajouter ou mettre à jour les identites
      for (c=0; c<courriels.length; c++){

        let courriel=courriels[c];

        // rechercher identite
        for (i=0;i<compte.identities.length;i++){
          let ident=compte.identities.queryElementAt(i, Components.interfaces.nsIMsgIdentity);
          if (ident.email==courriel){

            PacomeTrace("ParamBoiteBaliGN mise a jour identité bali:"+ident.email);
            // mettre à jour
            ident.copy(identBali);
            // modification email
            ident.email=courriel;
          }
        }
        if (i==compte.identities.length){

          // ajouter identite
          let ident2=MailServices.accounts.createIdentity();
          ident2.copy(identBali);
          // modification email
          ident2.email=courriel;
          // identityName
          Services.prefs.setCharPref("mail.identity."+ident2.key+".identityName", courriel);

          PacomeTrace("ParamBoiteBaliGN ajout identité à la bali:"+ident2.email);
          compte.addIdentity(ident2);
        }
      }
    }

    PacomeTrace("ParamBoiteBaliGN parametrage bali termine");

  }  catch(ex){
    PacomeSetErreurGlobaleEx(-1, PacomeMessageFromId("PacomeErreurTraiteCompte"), ex);
    PacomeTrace("Exception ParamBoiteBaliGN:"+ex);
    return -1;
  } 
    
  return res;
}

// retourne l'identité en interieur du compte 
// compte : instance compte courrier
// en principe ce sera l'identité par défaut mais on recherche quand même
function GetIdentiteInterieur(compte){

  for (let i=0;i<compte.identities.length;i++){
    let ident=compte.identities.queryElementAt(i, Components.interfaces.nsIMsgIdentity);
    if (ident.email.endsWith(AT_INTERIEUR)){
      return ident;
    }
  }
  
  return null;
}

// retourne la valeur de useremail de l'identité à partir de l'élément compte du document
// peut être vide (cas pas de droit d'emission)
function GetUseremail(elemcompte){

  let elemidentite=elemcompte.getElementsByTagName("identite");
  elemidentite=elemidentite[0];
  let elemprefs=elemidentite.getElementsByTagName("prefs");
  let prefs=elemprefs[0].getElementsByTagName("pref");

  for (let i=0;i<prefs.length;i++){
    let p=prefs[i];

    let nom=p.getAttribute("nom");
    if (nom=="useremail"){
      return p.getAttribute("valeur");
    }
  }

  return "";
}

// retourne la valeur de l'attribut 'othersemail' (mailalternateaddress) de l'identité
// peut retourner une chaine vide ou une ou plusieurs adresses séparées par des espaces.
function GetOthersEmail(elemcompte){

  let elemidentite=elemcompte.getElementsByTagName("identite");
  elemidentite=elemidentite[0];
  let elemprefs=elemidentite.getElementsByTagName("prefs");
  let prefs=elemprefs[0].getElementsByTagName("pref");

  for (let i=0;i<prefs.length;i++){
    let p=prefs[i];

    let nom=p.getAttribute("nom");
    if (nom=="othersemail"){
      return p.getAttribute("valeur");
    }
  }

  return "";
}



/* version GN de ParamComptePacome pour les boite partagees */
function ParamBoiteBalpGN(elemcompte){

  try{

    //identifiants depuis document
    let uid=elemcompte.getAttribute("uid");
    PacomeTrace("ParamBoiteBalpGN cas boites partagees GN uid="+uid);

    // droit emission si useremail défini
    let useremail=GetUseremail(elemcompte);
    let emission=(""!=useremail);
    
    // compte bali (pour reprise identité / serveur smtp)
    let compteBali=FindCompteBaliGN();
    if (null==compteBali) {
      PacomeTrace("ParamBoiteBalpGN pas de compte BALI!!!");
      return -1;
    }
    let identite_bali=compteBali.defaultIdentity;

    // paramétrage serveur entrant (création ou mise à jour)
    let elemsrventrant=elemcompte.getElementsByTagName("srventrant");
    elemsrventrant=elemsrventrant[0];  
    PacomeTrace("ParamBoiteBalpGN parametrage du serveur entrant.");
    let srventrant=ParamServeurEntrantGN(elemsrventrant, compteBali.incomingServer.username);
    if (null==srventrant) {
      PacomeSetErreurGlobale(-1, PacomeMessageFromId("PacomeErreurParamSrv"));
      PacomeTrace("ParamBoiteBalpGN echec de parametrage du serveur entrant");
      return -1;
    }
    // modification paramétrage des dossiers
    ParamDossiersServeurGN(compteBali.incomingServer, srventrant);
    
    //recherche compte existant
    let compte=null;
    let bnouveau=false;

    PacomeTrace("ParamBoiteBalpGN recherche du compte hostname:'"+srventrant.hostname+"'");
    try {
      if (null!=srventrant)
        compte=MailServices.accounts.FindAccountForServer(srventrant);
    } catch (ex1) {// pas une erreur
      compte=null;
    }
    if (null==compte) {
      PacomeTrace("ParamBoiteBalpGN compte inexistant => création");
      compte=MailServices.accounts.createAccount();
      if (null==compte) {
        PacomeSetErreurGlobale(-1, PacomeMessageFromId("PacomeErreurParamCompte"));
        PacomeTrace("ParamBoiteBalpGN echec de creation du compte.");
        return -1;
      }
      bnouveau=true;
    }

    if (null==compte.incomingServer || compte.incomingServer.key!=srventrant.key){
        PacomeTrace("ParamBoiteBalpGN compte.incomingServer=srventrant");
        compte.incomingServer=srventrant;
    }

    // creation de compte : ajouter identite bali par défaut
    if (bnouveau){

      PacomeTrace("ParamBoiteBalpGN ajout de l'identite bali au compte");
      let identBali=MailServices.accounts.createIdentity();
      identBali.copy(compteBali.defaultIdentity);

      // forcer identityName
      let clebali=Services.prefs.getCharPref("mail.identity."+compteBali.defaultIdentity.key+".identityName", "");
      let bdef=clebali.includes(".defense.");
      if (bdef) clebali=clebali.replace(".defense.", ".interieur.");
      Services.prefs.setCharPref("mail.identity."+identBali.key+".identityName", clebali);
      // cas courriel en defense => interieur sur balp
      if (bdef) identBali.email=identBali.email.replace(".defense.", ".interieur.");

      // paramétrage des dossiers
      ParamDossiersIdentiteGN(compteBali.defaultIdentity, identBali, compteBali.incomingServer.hostName, srventrant.hostName);

      identBali.valid=true;
      compte.addIdentity(identBali);

      // identité par défaut   
      PacomeTrace("ParamBoiteBalpGN positionnement identite par defaut du compte");
      compte.defaultIdentity=identBali;
    }

    // identité balp 
    let elemidentite=elemcompte.getElementsByTagName("identite");
    elemidentite=elemidentite[0];
    let identNom=GetIdentityName(elemidentite);
    let identite=FindIdentiteCompteGN(compte, identNom);

    if (emission) {  

      // si droit d'émission (.-.)
      PacomeTrace("ParamBoiteBalpGN droit d'emission");

      let ajoutIdent=false;

      // ajouter ou mettre à jour identité secondaire 
      PacomeTrace("ParamBoiteBalpGN identite balp avec emission:"+identNom);
      
      if (null==identite) {
        PacomeTrace("ParamBoiteBalpGN creation de l'identite");
        identite=MailServices.accounts.createIdentity();
        ajoutIdent=true;
      }

      let res=ParamIdentite(identite, elemidentite);
      if (!res) {
        PacomeSetErreurGlobale(-1, PacomeMessageFromId("PacomeErreurParamIdent"));
        PacomeTrace("ParamBoiteBalpGN echec de parametrage de l'identite.");
        return -1;
      }    
      identite.smtpServerKey=compteBali.defaultIdentity.smtpServerKey;

      // modifier paramétrage des dossiers identite
      ParamDossiersIdentiteGN(compteBali.defaultIdentity, identite, compteBali.incomingServer.hostName, srventrant.hostName);

      if (ajoutIdent) {
        PacomeTrace("ParamBoiteBalpGN ajout identite balp au compte");
        identite.valid=true;
        compte.addIdentity(identite);    
      }
    }
    else {

      PacomeTrace("ParamBoiteBalpGN pas de droit d'emission");
      if (identite){
        PacomeTrace("ParamBoiteBalpGN suppression de l'identité du compte");
        compte.removeIdentity(identite);      
      }
    }

    // mettre à jour "mail.server.server<n>.listeuids"
    MajServeurListeUids(srventrant, uid, true);


    // enregistrer les modifications
    MailServices.accounts.saveAccountInfo();
    Services.prefs.savePrefFile(null);

    //retour resultat
    gPacomeAssitComplete=true;
    if (bnouveau) {
      PacomeTrace("ParamBoiteBalpGN parametrage nouveau compte termine.");
      return 1;
    }
    PacomeTrace("ParamBoiteBalpGN mise a jour parametrage du compte.");
    return 0;

  } catch(ex) {
    PacomeSetErreurGlobaleEx(-1, PacomeMessageFromId("PacomeErreurTraiteCompte"), ex);
    PacomeTrace("Exception ParamBoiteBalpGN:"+ex);
    return -1;
  }
}


/*
* modification du parametrage dossiers d'une identité GN
*/
function ParamDossiersIdentiteGN(identBali, identBalp, serveurBali, serveurBalp) {

  PacomeTrace("ParamDossiersIdentiteGN balp:"+identBalp.identityName);

  // archive_folder
  let dossier=identBali.archiveFolder;
  identBalp.archiveFolder=dossier.replace(serveurBali, serveurBalp);
  // draft_folder
  dossier=identBali.draftFolder;
  identBalp.draftFolder=dossier.replace(serveurBali, serveurBalp);
  // fcc_folder
  dossier=identBali.fccFolder;
  identBalp.fccFolder=dossier.replace(serveurBali, serveurBalp);
  // stationery_folder
  dossier=identBali.stationeryFolder;
  identBalp.stationeryFolder=dossier.replace(serveurBali, serveurBalp);
}


/*
* modification du parametrage dossiers serveur entrant GN
*/
function ParamDossiersServeurGN(serveurBali, serveurBalp) {

  PacomeTrace("ParamDossiersServeurGN serveur balp:"+serveurBalp.hostName);

  let idBali=serveurBali.key;
  let idBalp=serveurBalp.key;

  // spamActionTargetAccount
  let val=Services.prefs.getCharPref("mail.server."+idBali+".spamActionTargetAccount", "");
  val=val.replace(serveurBali.hostName, serveurBalp.hostName);
  Services.prefs.setCharPref("mail.server."+idBalp+".spamActionTargetAccount", val);

  // spamActionTargetFolder
  val=Services.prefs.getCharPref("mail.server."+idBali+".spamActionTargetFolder", "");
  val=val.replace(serveurBali.hostName, serveurBalp.hostName);
  Services.prefs.setCharPref("mail.server."+idBalp+".spamActionTargetFolder", val);
}


/* Retourne attribut identityName de l'élément identite de paramétrage
*/
function GetIdentityName(elemidentite) {

  let elemprefs=elemidentite.getElementsByTagName("prefs");
  let prefs=elemprefs[0].getElementsByTagName("pref");

  for (let i=0;i<prefs.length;i++) {
    let p=prefs[i];

    if ("identityName"==p.getAttribute("nom"))
      return p.getAttribute("valeur");
  }
  return "";
}

/*
* recherche identité existante
*/
function FindIdentiteCompteGN(compte, uid) {

  let identities=compte.identities;
  for (let i=0;i<identities.length;i++) {
    let identite=identities.queryElementAt(i, Components.interfaces.nsIMsgIdentity);
    // tester avec pref identityName
    if (Services.prefs.getCharPref("mail.identity."+identite.key+".identityName","")==uid) return identite;
  }
  return null;
}


/*
 * détermine le type de boite à paramétrer
 * 
 */
 function GetTypeBoiteGN(elemcompte) {
   
  // uid sans .-. => BALI
   // valeur de l'attribut uid dans l'éléments compte 
   let uid=elemcompte.getAttribute("uid");
   if (-1==uid.indexOf(".-.")) return TYPE_BALI;
   
   return TYPE_BALP;
 }
 
 /*
  * retourne compte bali (le compte doit exister)
  */
function FindCompteBaliGN() {
  
  let accmanager=MailServices.accounts;
  let nb=accmanager.accounts.length;
  for (let c=0;c<nb;c++) {
    let compte=accmanager.accounts.queryElementAt(c, Ci.nsIMsgAccount);
    if (null!=compte && null!=compte.incomingServer &&
        "imap"==compte.incomingServer.type &&
        "std1"==compte.incomingServer.getCharValue("pacome.confid") &&
        -1==compte.incomingServer.username.indexOf(".-.")) {// a priori si std1 pas de .-.
      console.log("Compte bali Pacome trouve : ", compte.incomingServer.username);
      return compte;
    }
  }
  return null;
}  


/*
* version GN de ParamServeurEntrant
* username : username de la bali
*/
function ParamServeurEntrantGN(elemsrventrant, username) {

  PacomeTrace("ParamServeurEntrantGN");

  //identifiants depuis document
  let srvname=elemsrventrant.getAttribute("hostname");
  let typein=elemsrventrant.getAttribute("type");

  PacomeTrace("ParamServeurEntrantGN username="+username);
  PacomeTrace("ParamServeurEntrantGN serveur entrant="+srvname);
  PacomeTrace("ParamServeurEntrantGN type serveur entrant="+typein);

  PacomeTrace("ParamServeurEntrantGN recherche du serveur entrant.");
  let srventrant=null;
  let bNouveau=false;
  try {
    srventrant=MailServices.accounts.FindServer(username, srvname, typein);
  } catch(ex1) {
    PacomeTrace("ParamServeurEntrantGN pas de serveur entrant correspondant.");
    srventrant=null;
  }
  if (null==srventrant) {
    PacomeTrace("ParamServeurEntrantGN creation du serveur entrant.");
    //creer nouveau
    srventrant=MailServices.accounts.createIncomingServer(username, srvname, typein);
    if (null==srventrant) {
      PacomeSetErreurGlobale(-1, PacomeMessageFromId("PacomeErreurParamSrv"));
      PacomeTrace("ParamServeurEntrantGN echec de creation du serveur entrant");
      return null;
    }
    bNouveau=true;
  } else
    PacomeTrace("ParamServeurEntrantGN serveur entrant existant.");

  //préférences
  let elemprefs=elemsrventrant.getElementsByTagName("prefs");
  let prefix="mail.server."+srventrant.key+".";
  PacomeSetPrefs(elemprefs[0], prefix);

  //cas imap, désactiver le spam lors de la creation, repositionne au demarrage
  if (bNouveau && "imap"==srventrant.type &&
      srventrant.getBoolValue("pacome.install.spam")) {
    PacomeTrace("ParamServeurEntrantGN moveOnSpam force a false");
    srventrant.setBoolValue("moveOnSpam", false);
  }

  return srventrant;
}
 

/* Suppression d'un compte de boite
  version GN de PacomeSupprimeBoite
  si uid sans .-. => PacomeSupprimeBoite (ou confid != par1)
  suppprimer identité correpondante
  return 1 si suppression effective, 0 si pas de suppression, -1 si erreur
*/
function PacomeSupprimeBoiteGN(uid, confid) {

  PacomeTrace("PacomeSupprimeBoiteGN uid:"+uid+" - confid:"+confid);

  if (confid!="par1") {
    return PacomeSupprimeBoite(uid, confid);
  }

  let accmanager=MailServices.accounts;
  let nb=accmanager.accounts.length;
  for (let c=0;c<nb;c++) {
    let compte=accmanager.accounts.queryElementAt(c, Ci.nsIMsgAccount);
    if (null!=compte && null!=compte.incomingServer &&
        "imap"==compte.incomingServer.type &&
        "par1"==compte.incomingServer.getCharValue("pacome.confid")) {

      let listeuids=compte.incomingServer.getCharValue("listeuids");
      if (listeuids && listeuids.split(";").includes(uid)){
        PacomeTrace("PacomeSupprimeBoiteGN compte:"+compte.incomingServer.prettyName);

        // mettre à jour "mail.server.server<n>.listeuids"
        MajServeurListeUids(compte.incomingServer, uid, false);

        let identities=compte.identities;
        for (let i=0;i<identities.length;i++) {
          let identite=identities.queryElementAt(i, Components.interfaces.nsIMsgIdentity);
          let ident=Services.prefs.getCharPref("mail.identity."+identite.key+".identityName", "");
          if (ident==uid) {
            PacomeTrace("PacomeSupprimeBoiteGN suppression de l'identite :"+uid);
            compte.removeIdentity(identite);
          }
        }
   
        return 1;
      }
    }
  }
  
  return 0;
}

// mettre à jour "mail.server.server<n>.listeuids"
function MajServeurListeUids(serveur, uid, bAdd=true){

  PacomeTrace("MajServeurListeUids uid:"+uid);

  let listeUids;
  
  try{
    listeUids=serveur.getCharValue("listeuids");
  } catch(ex){}

  if (listeUids && ""!=listeUids) 
    listeUids=listeUids.split(";");
  else listeUids=[];
  
  let pos=listeUids.indexOf(uid);

  if (bAdd){
    if (-1==pos) listeUids.push(uid);
  }
  else if (-1!=pos) listeUids.splice(pos, 1);

  listeUids=listeUids.join(";");
  PacomeTrace("MajServeurListeUids mise à jour:"+listeUids);
  serveur.setCharValue("listeuids", listeUids);
}

/**
* Version GN de PacomeDocumentConfig
* Retourne la configuration pacome au format transmis dans les requetes de parametrage
*
*/
function PacomeDocumentConfigGN(){

  try{

    PacomeTrace("PacomeDocumentConfigGN construction configuration");

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
          PacomeTrace("PacomeDocumentConfigGN traitement boite Melanie2:"+compte.incomingServer.username);
          let ver=Services.prefs.getCharPref(pref, "");
          let ts=-1;
          let confid="";
          pref="mail.server."+cle+".pacome.confid";
          confid=Services.prefs.getCharPref(pref, "");
          if (""==confid) continue;// pas un compte pacome
          pref="mail.server."+cle+".pacome.ts";
          ts=Services.prefs.getCharPref(pref, "");

          let nom=pacomeRemplaceCars(compte.incomingServer.prettyName);

          // cas bali
          if ("par1"!=confid){
            let cfg="<compte uid='"+compte.incomingServer.username+"' serveur='"+compte.incomingServer.hostName+
                      "' confid='"+confid+"' version='"+ver;
            if (-1!=ts)
              cfg+="' ts='"+ts;
            cfg+="' usage='true' libelle='"+nom+"'/>";
            PacomeTrace("PacomeDocumentConfigGN config boite:"+cfg);
            configbal+=cfg;
          }
          else {
            // balp GN un ou plusieurs identifiant balp avec ou sans droit d'emission
            // l'attribut listeuids du serveur est mis en oeuvre pour gérer la liste
            let listeuids=Services.prefs.getCharPref("mail.server."+cle+".listeuids", "");
            if (listeuids=="") continue;// pas normal erreur
            PacomeTrace("PacomeDocumentConfigGN listeuids:"+listeuids);
            listeuids=listeuids.split(";");

            for (let uid of listeuids){
              PacomeTrace("PacomeDocumentConfigGN listeuids uid:"+uid);
              let cfg="<compte uid='"+uid+"' serveur='"+compte.incomingServer.hostName+
                      "' confid='"+confid+"' version='"+ver;
              if (-1!=ts)
                cfg+="' ts='"+ts;
              cfg+="' usage='true' libelle='"+nom+"'/>";

              PacomeTrace("PacomeDocumentConfigGN config boite:"+cfg);
              configbal+=cfg;
            }
          }
        }
      }
      //flux melanie2
      else if ("rss"==compte.incomingServer.type){
        let cle=compte.incomingServer.key;
        let pref="mail.server."+cle+".pacome.version";
        if (Services.prefs.prefHasUserValue(pref)){
          PacomeTrace("PacomeDocumentConfigGN traitement flux:"+compte.incomingServer.prettyName);

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
        PacomeTrace("PacomeDocumentConfigGN "+PACOME_IGNORE_UID+": "+ignoreuids);
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
        PacomeTrace("PacomeDocumentConfigGN "+PACOME_IGNORE_FLUX+": "+ignoreflux);
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
    PacomeTrace("PacomeDocumentConfigGN configuration:"+config);

    return config;

  } catch(ex){
    PacomeSetErreurGlobaleEx(-1, PacomeMessageFromId("PageIdentsErrConfig"), ex);
    return null;
  }
}

/* Version GN de PacomeEtatCompteBoite
  retourne état d'un compte de boite
  confid: null -> optionnel
  -1 si erreur, sinon constantes etat
*/
function PacomeEtatCompteBoiteGN(uid, confid){

  //parcours des comptes
  let nbacc=MailServices.accounts.accounts.length;

  for (var j=0;j<nbacc;j++){

    let compte=MailServices.accounts.accounts.queryElementAt(j,Components.interfaces.nsIMsgAccount);
    if (null==compte || null==compte.incomingServer) continue;

    if ("imap"==compte.incomingServer.type || "pop3"==compte.incomingServer.type){

      let cle=compte.incomingServer.key;
      let confid=Services.prefs.getCharPref("mail.server."+cle+".pacome.confid", "");

      if (confid!="par1"){
        // bali
        let username=compte.incomingServer.username;

        if (uid==username){

          let cfg=compte.incomingServer.getCharValue("pacome.confid");
          if (null!=cfg && cfg==confid){
            PacomeTrace("PacomeEtatCompteBoiteGN boite existe uid:"+uid);
            return PACOME_ETAT_PARAM;
          }
        }
      }
      else{
        // balp
        let listeuids=compte.incomingServer.getCharValue("listeuids");
        if (listeuids && listeuids.split(";").includes(uid)){
          PacomeTrace("PacomeEtatCompteBoiteGN boite partage existe uid:"+uid);
          return PACOME_ETAT_PARAM;
        }
      }
    }
  }

  //parcours inutilisés
  //boites non utilisées
  if (Services.prefs.prefHasUserValue(PACOME_IGNORE_UID)){
    let ignoreuids=Services.prefs.getCharPref(PACOME_IGNORE_UID);
    if (""!=ignoreuids){
      PacomeTrace("PacomeEtatCompteBoiteGN "+PACOME_IGNORE_UID+": "+ignoreuids);
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
