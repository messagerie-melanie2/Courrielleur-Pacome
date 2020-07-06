/**
* Module pacome
* module pour les fonctions de traitements pour la migration des serveurs de courrier des boites
*/

ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource:///modules/mailServices.js");
ChromeUtils.import("resource://gre/modules/FileUtils.jsm");



const EXPORTED_SYMBOLS = ["cm2AmMigreComptes", "cm2AmMigreBoite", "cm2AmMigreFichier"];

// preference informations des proxys pour migration
// format : {"proxy_boites":[{"uid":"", "entrant":"", "sortant":""}, ...]}
const PREF_PACOME_PROXYS="pacome.comptes.proxys";

/* fonction principale pour la migration des donnees
    traite toutes les boites
  */
function cm2AmMigreComptes(){

  let config_proxys=cm2AmGetConfig();
  if (null==config_proxys ||
      0==config_proxys.length){
    return;
  }

  Services.scriptloader.loadSubScript("chrome://pacome/content/pacomeutils.js");

  PacomeEcritLog("PACOME", "MIGRATION DES SERVEURS", "Nombre de comptes a migrer:"+config_proxys.length);

  cm2BackupPrefs();

  for (let config of config_proxys){
    if (null==config.uid || 0==config.uid.length){
      continue;
    }
    let res=cm2AmMigreBoite(config);

    if (0==res){
      PacomeEcritLog("PACOME", "MIGRATION DES SERVEURS", "Succès de migration de la boite identifiant:"+config.uid);

    } else {

      PacomeEcritLog("PACOME", "MIGRATION DES SERVEURS", "Echec de migration de la boite identifiant:"+config.uid);
    }
  }

  // effacer PREF_PACOME_PROXYS
  Services.prefs.clearUserPref(PREF_PACOME_PROXYS);

  //forcer rechargement des comptes
  MailServices.accounts.UnloadAccounts();
}

// retourne objet de configuration des proxys
// null si aucune configuration ou erreur
function cm2AmGetConfig(){

  // tester PREF_PACOME_PROXYS
  if (!Services.prefs.prefHasUserValue(PREF_PACOME_PROXYS)){
    // pas de migration a réaliser
    return null;
  }

  let pref_proxys=Services.prefs.getCharPref(PREF_PACOME_PROXYS);
  if (0==pref_proxys.length){
    // pas de migration a réaliser
    return null;
  }
  // conversion json => objet
  let config_proxys;
  try {

    config_proxys=JSON.parse(pref_proxys);

  } catch(ex){
    return null;
  }

  return config_proxys;
}



/* fonction principale pour la migration des donnees d'une boite

  config : objet de configuration {uid:"uidbali", entrant:"", sortant:""}

  retour : 0 si succès, -1 ou code erreur si erreur
  */
function cm2AmMigreBoite(config){

  // verifications infos
  if (null==config.uid || ""==config.uid ||
      null==config.entrant || ""==config.entrant ||
      null==config.sortant || ""==config.sortant){
    PacomeEcritLog("PACOME", "MIGRATION DES SERVEURS", "Erreur de verification pour la migration de la boite identifiant:"+config.uid);
    return -1;
  }

  PacomeEcritLog("PACOME", "MIGRATION DES SERVEURS", "Migration de la boite identifiant:"+config.uid);

  // retrouver compte
  let compte=cm2AmGetAccount(config.uid);
  if (null==compte){
    return -1;
  }
  // valeurs d'origine
  let entrant_nom=compte.incomingServer.hostName;
  let smtpsrv=MailServices.smtp.getServerByKey(compte.defaultIdentity.smtpServerKey);
  let sortant_nom=smtpsrv.hostname;
  // valeurs calculées
  let uidatsrv1="/"+config.uid+"@"+entrant_nom;
  let uidatsrv2="/"+config.uid+"@"+config.entrant;

  // la boite n'est pas migrée si deja fait
  // (cas preference proxy non effacee)
  if (entrant_nom==config.entrant &&
      sortant_nom==config.sortant){
    return -1;
  }

  // migrer les preferences
  PacomeEcritLog("PACOME", "MIGRATION DES SERVEURS", "Migration des preferences de la boite");

  let res=cm2AmModifPrefs(compte, config);
  if (!res){
    PacomeEcritLog("PACOME", "MIGRATION DES SERVEURS", "Echec de l'opération");
    return -1;
  }

  // preference "mail.last_msg_movecopy_target_uri"
  if (Services.prefs.prefHasUserValue("mail.last_msg_movecopy_target_uri")){
    let val=Services.prefs.getCharPref("mail.last_msg_movecopy_target_uri");
    val=val.replace(uidatsrv1, uidatsrv2);
    Services.prefs.setCharPref("mail.last_msg_movecopy_target_uri", val);
  }

  // boite pop migrer popstate.dat
  if ("pop3"==compte.incomingServer.type){
    PacomeEcritLog("PACOME", "MIGRATION DES SERVEURS", "Migration du fichier popstate.dat");
    res=cm2MigrePopstate(compte.incomingServer.localPath, entrant_nom, config.entrant);
    if (!res){
      PacomeEcritLog("PACOME", "MIGRATION DES SERVEURS", "Echec de l'opération");
    }
  }

  // filtres de messages
  let dirMail=Services.prefs.getCharPref("mail.server."+compte.incomingServer.key+".directory");
  let filtSrc=new FileUtils.File(dirMail);
  filtSrc.append("msgFilterRules.dat");
  if (filtSrc.exists()){
    PacomeEcritLog("PACOME", "MIGRATION DES SERVEURS", "Migration des filtres de message");
    let filtDest=filtSrc.clone();
    filtDest.leafName+=".migre";
    res=cm2AmMigreFichier(filtSrc, filtDest, uidatsrv1, uidatsrv2);
    if (res){
      // remplacer
      filtDest.renameTo(filtSrc.parent, filtSrc.leafName);
    }
  } else {
    PacomeEcritLog("PACOME", "MIGRATION DES SERVEURS", "Aucun filtre de message");
  }

  // dossiers virtuels
  let profd=Services.dirsvc.get("ProfD", Components.interfaces.nsIFile);
  let virtSrc=profd.clone();
  virtSrc.append("virtualFolders.dat");
  if (virtSrc.exists()){
    PacomeEcritLog("PACOME", "MIGRATION DES SERVEURS", "Migration des dossiers virtuels");
    let virtDest=profd.clone();
    virtDest.append("virtualFolders.dat"+".migre");
    res=cm2AmMigreFichier(virtSrc, virtDest, uidatsrv1, uidatsrv2);
    if (res){
      // remplacer
      virtDest.renameTo(virtSrc.parent, virtSrc.leafName);
    } else {
      PacomeEcritLog("PACOME", "MIGRATION DES SERVEURS", "Echec de l'opération");
    }
  }

  // options des dossiers d'archivage
  let archSrc=profd.clone();
  archSrc.append("archibald.rdf");
  if (archSrc.exists()){
    PacomeEcritLog("PACOME", "MIGRATION DES SERVEURS", "Migration des options des dossiers d'archivage");
    let archDest=profd.clone();
    archDest.append("archibald.rdf"+".migre");
    res=cm2AmMigreFichier(archSrc, archDest, uidatsrv1, uidatsrv2);
    if (res){
      // remplacer
      archDest.renameTo(archSrc.parent, archSrc.leafName);
    } else {
      PacomeEcritLog("PACOME", "MIGRATION DES SERVEURS", "Echec de l'opération");
    }
  }

  // fichier session.json
  let sessSrc=profd.clone();
  sessSrc.append("session.json");
  if (sessSrc.exists()){
    PacomeEcritLog("PACOME", "MIGRATION DES SERVEURS", "Migration du fichier session.json");
    let sessDest=profd.clone();
    sessDest.append("session.json"+".migre");
    res=cm2AmMigreFichier(sessSrc, sessDest, uidatsrv1, uidatsrv2);
    if (res){
      // remplacer
      sessDest.renameTo(sessSrc.parent, sessSrc.leafName);
    } else {
      PacomeEcritLog("PACOME", "MIGRATION DES SERVEURS", "Echec de l'opération");
    }
  }

  // fichier 'folderTree.json'
  let treeSrc=profd.clone();
  treeSrc.append("folderTree.json");
  if (treeSrc.exists()){
    PacomeEcritLog("PACOME", "MIGRATION DES SERVEURS", "Migration du fichier folderTree.json");
    let treeDest=profd.clone();
    treeDest.append("folderTree.json"+".migre");
    res=cm2AmMigreFichier(treeSrc, treeDest, uidatsrv1, uidatsrv2);
    if (res){
      // remplacer
      treeDest.renameTo(treeSrc.parent, treeSrc.leafName);
    } else {
      PacomeEcritLog("PACOME", "MIGRATION DES SERVEURS", "Echec de l'opération");
    }
  }

  // réglages de l'extension tbsortfolders
  // "extensions.tbsortfolders@xulforum.org.tbsf_data"
  if (Services.prefs.prefHasUserValue("extensions.tbsortfolders@xulforum.org.tbsf_data")){
    let valeur=Services.prefs.getCharPref("extensions.tbsortfolders@xulforum.org.tbsf_data");
    let re=new RegExp(uidatsrv1, 'g');
    Services.prefs.setCharPref("extensions.tbsortfolders@xulforum.org.tbsf_data", valeur.replace(re, uidatsrv2));
  }
  // mantis 4709
  if (Services.prefs.prefHasUserValue("extensions.tbsortfolders@xulforum.org.startup_folder")){
    let val=Services.prefs.getCharPref("extensions.tbsortfolders@xulforum.org.startup_folder");
    if (0!=val.indexOf(uidatsrv1)){
      let re=new RegExp(uidatsrv1);
      Services.prefs.setCharPref("extensions.tbsortfolders@xulforum.org.startup_folder", val.replace(re, uidatsrv2));
    }
  }
  // fin mantis 4709

  // indexation des messages
  res=cm2AmMigreMsgBase(uidatsrv1, uidatsrv2);

  return res;
}


/*
  modifie les preferences
  retour : true si ok, sinon false
*/
function cm2AmModifPrefs(compte, config){

  try{

    let entrant_key=compte.incomingServer.key;
    let entrant_nom=compte.incomingServer.hostName;
    let ident_key=compte.defaultIdentity.key;
    let smtpServerKey=compte.defaultIdentity.smtpServerKey;

    let ident_dos=[
      ".archive_folder",
      ".draft_folder",
      ".fcc_folder",
      ".stationery_folder"
    ];

    let valeur;
    for (let dos of ident_dos){
      valeur=Services.prefs.getCharPref("mail.identity."+ident_key+dos);
      Services.prefs.setCharPref("mail.identity."+ident_key+dos, valeur.replace(entrant_nom, config.entrant));
    }

    Services.prefs.setCharPref("mail.server."+entrant_key+".hostname", config.entrant);

    valeur=Services.prefs.getCharPref("mail.server."+entrant_key+".spamActionTargetAccount");
    Services.prefs.setCharPref("mail.server."+entrant_key+".spamActionTargetAccount", valeur.replace(entrant_nom, config.entrant));

    valeur=Services.prefs.getCharPref("mail.server."+entrant_key+".spamActionTargetFolder");
    Services.prefs.setCharPref("mail.server."+entrant_key+".spamActionTargetFolder", valeur.replace(entrant_nom, config.entrant));

    // serveur sortant
    Services.prefs.setCharPref("mail.smtpserver."+smtpServerKey+".hostname", config.sortant);
    Services.prefs.setIntPref("mail.smtpserver."+smtpServerKey+".port", config.smtp_port);

  } catch(ex){
    PacomeEcritLog("PACOME", "MIGRATION DES SERVEURS", "Erreur:"+ex);
    return false;
  }

  return true;
}

/* modifie la base global-messages-db.sqlite table folderLocations
  remplace les occurences uidatsrv1 par uidatsrv2

  uidatsrv<n> : en principe de forme uid@serveur
  uid : identifiant de boite
  serveur : nom du serveur

  retour : 0 si ok, sinon -1
*/
function cm2AmMigreMsgBase(uidatsrv1, uidatsrv2){

  PacomeEcritLog("PACOME", "MIGRATION DES SERVEURS", "Migration de la base des messages de la boite");

  let dbFile=Services.dirsvc.get("ProfD", Components.interfaces.nsIFile);
  dbFile.append("global-messages-db.sqlite");

  let conn=Services.storage.openDatabase(dbFile);
  if (!conn.connectionReady){
    return -1;
  }

  let req="UPDATE folderLocations SET folderURI=replace(folderURI, '"+uidatsrv1+"', '"+uidatsrv2+"')";
  conn.executeSimpleSQL(req);

  conn.close();

  return 0;
}


/* fonction generique de modification de fichier
  remplace les occurences uidatsrv1 par uidatsrv2

  uidatsrv<n> : en principe de forme uid@serveur
  uid : identifiant de boite
  serveur : nom du serveur
  original : instance nsIFile du fichier à migrer
  migre : instance nsIFile du fichier de destination

  retour : true si ok, sinon false
*/
function cm2AmMigreFichier(original, migre, uidatsrv1, uidatsrv2){

  // lire source => modifier => ecrire dans dest
  // si ok => delete source rename dest=>source
  if (!original.exists()){
    return false;
  }

  let data="";
  let fstream=Components.classes["@mozilla.org/network/file-input-stream;1"].
                        createInstance(Components.interfaces.nsIFileInputStream);
  let cstream=Components.classes["@mozilla.org/intl/converter-input-stream;1"].
                        createInstance(Components.interfaces.nsIConverterInputStream);
  fstream.init(original, -1, 0, 0);
  cstream.init(fstream, "UTF-8", 0, 0);
  let read=0;
  do {
    let str={};
    read=cstream.readString(0xffffffff, str);
    data+=str.value;
  } while (read!=0);

  cstream.close();
  fstream.close();

  // modifications
  let reg=new RegExp(uidatsrv1, 'g');
  let modifs=data.replace(reg, uidatsrv2);

  // ecriture
  let foStream=Components.classes["@mozilla.org/network/file-output-stream;1"].
                          createInstance(Components.interfaces.nsIFileOutputStream);
  foStream.init(migre, -1, -1, 0);
  let converter=Components.classes["@mozilla.org/intl/converter-output-stream;1"].
                          createInstance(Components.interfaces.nsIConverterOutputStream);
  converter.init(foStream, "UTF-8", 0, 0);
  let res=converter.writeString(modifs);
  converter.close();
  foStream.close();

  if (!res){
    return false;
  }

  return true;
}


function cm2AmGetAccount(uid){

  let am=MailServices.accounts;
  let allServers=am.allServers;

  for (let i=0; i<allServers.length; i++){
    let server=allServers.queryElementAt(i, Components.interfaces.nsIMsgIncomingServer);
    if (uid==server.username){
      let compte=am.FindAccountForServer(server);
      return compte;
    }
  }

  return null;
}


// sauvegarde des preferences
function cm2BackupPrefs(){

  let ladate=new Date();
  let mois=ladate.getMonth();
  mois+=1;
  let suffix=ladate.getFullYear()+"-"+mois+"-"+ladate.getDate();
  let fic=Services.dirsvc.get("ProfD", Components.interfaces.nsIFile);
  fic.append("prefs.js-"+suffix);
  Services.prefs.savePrefFile(fic);
  PacomeEcritLog("PACOME", "MIGRATION DES SERVEURS", "Preferences sauvegardées sous:"+fic.leafName);
}

function cm2MigrePopstate(fic, ancien, nouveau){

  let fichier=fic.clone();
  fichier.append("popstate.dat");

  if (!fichier.exists()){
    return false;
  }

  let fichier2=fichier.clone();
  fichier2.leafName+=".migre";

  let res=cm2AmMigreFichier(fichier, fichier2, ancien, nouveau);
  if (!res){
    return res;
  }

  fichier2.renameTo(fichier.parent, fichier.leafName);

  return true;
}
