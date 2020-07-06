
ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource://gre/modules/FileUtils.jsm");

//courrielleur 5.2T2+ => v6.0
//courrielleur 6.1 => v 6.4
//courrielleur 6.2T1 => v 6.5
//courrielleur 7.0T1 => 7.0
//courrielleur 7.1T1 => 7.1
//courrielleur 7.2T1 => 7.2
//courrielleur 7.2.1T1 => 7.2
//courrielleur 8.0 => 7.4
//courrielleur 8.5 => 8.5
const VERSION_PACOME="8.5";


/* liens d'aide */
var gUrlsAidesPacome=new Array();
gUrlsAidesPacome["pacome.lienpolitiquemdp"]="http://bureautique.metier.e2.rie.gouv.fr/supports/messagerie/courrielleur/co/81changerMDP.html";
gUrlsAidesPacome["pacome.aideparametrage"]="http://bureautique.metier.e2.rie.gouv.fr/supports/messagerie/courrielleur/co/85gererCompte.html";
gUrlsAidesPacome["pacome.aidemiseajour"]="http://bureautique.metier.e2.rie.gouv.fr/supports/messagerie/courrielleur/co/85gererCompte.html";


function PacomeGetCharPref(pref){

  return Services.prefs.getCharPref(pref);
}


/**
*  Ouvre un lien externe
*
*  @param pref nom de la préférence qui contient l'url
*  si la préférence n'existe pas, prendre la valeur dans le tableau gUrlsAidesPacome
*/
function PacomeOuvreLienPref(pref){

  let url=gUrlsAidesPacome[pref];

  let p=PacomeGetCharPref(pref);
  if (null!=p && 0!=p.length)
    url=p;

  PacomeOuvreUrlExterne(url);
}


/**
*  Ouvre une url externe
*
*  @param url l'url à ouvrir
*/
function PacomeOuvreUrlExterne(url){

  let newuri=Services.io.newURI(url, null, null);
  let extproc=Components.classes["@mozilla.org/uriloader/external-protocol-service;1"].getService(Components.interfaces.nsIExternalProtocolService);
  extproc.loadURI(newuri, null);
}



//liste des chaines pacome.properties
var g_messages_pacome=null;

//code dernière erreur
var gPacomeCodeErreur=0;
//message dernière erreur
var gPacomeMsgErreur="";

function PacomeSetErreurGlobale(code, msg){

  gPacomeCodeErreur=code;
  gPacomeMsgErreur=msg;
}

function PacomeSetErreurGlobaleEx(code, msg, ex){

  gPacomeCodeErreur=code;
  gPacomeMsgErreur=msg+"\nD\u00e9tail de l'exception:"+ex;
}


/**
*  Retourne une chaîne de message à partir de son identifiant dans le fichie pacome.properties
*/
function PacomeMessageFromId(msgid){

  if (null==g_messages_pacome)
    g_messages_pacome=Services.strings.createBundle("chrome://pacome/locale/pacome.properties");

  return g_messages_pacome.GetStringFromName(msgid);
}

/**
*  Affichage d'un message à partir de l'identifiant dans pacome.properties
*
*  @param msgid identifiant du message
*/
function PacomeAfficheMsgId(msgid){

  let msg=PacomeMessageFromId(msgid);

  PacomeMsgNotif("", msg);
}

/**
*  Affichage d'un message à partir de l'identifiant dans pacome.properties
*
*  @param msgid identifiant du message
*  @param msg2 message additionnel affiché sur nouvelle ligne (optionnel)
*/
function PacomeAfficheMsgId2(msgid,msg2){

  let msg=PacomeMessageFromId(msgid);

  PacomeMsgNotif(msg, msg2);
}

/**
*  Affichage d'un message à partir de l'identifiant dans pacome.properties
*
*  @param msgid identifiant du message
*  @param msg2 message additionnel affiché sur nouvelle ligne
*  @param msg3 message additionnel affiché sur nouvelle ligne
*/
function PacomeAfficheMsgId3(msgid, msg2, msg3){

  let msg=PacomeMessageFromId(msgid);

  PacomeMsgNotif(msg, msg2, msg3);
}


function PacomeAfficheMsgIdMsgId(msgid,msgid2){

  PacomeMsgNotif(PacomeMessageFromId(msgid), PacomeMessageFromId(msgid2));
}

/**
*  Affichage d'un message à partir de l'identifiant dans pacome.properties
*  ajoute code et message erreur globale
*
*  @param msgid identifiant du message
*/
function PacomeAfficheMsgIdGlobalErr(msgid){

  let titre=PacomeMessageFromId(msgid);

  let txt="D\u00e9tail de l'erreur\nCode:"+gPacomeCodeErreur;
  txt+="\nMessage:"+gPacomeMsgErreur;

  PacomeMsgNotif(titre, txt);
}



/**
*  Génération de traces
*/
var gPacomeInitTrace=false;
var gPacomeConsole=null;


function PacomeTrace(msg){

  if (!gPacomeInitTrace){
    let t=Services.prefs.getBoolPref("pacome.trace");
    if (t)
      gPacomeConsole=Services.console;
    gPacomeInitTrace=true;
  }

  if (gPacomeConsole) {
    gPacomeConsole.logStringMessage("[pacome] "+msg);
  }
}


/**
* Fonctions d'appel de la boîte de message
*/
const PACOMEMSG_NOTIF=0;
const PACOMEMSG_CONFIRM=1;
//url boite de message
const PACOME_PACOMEMSG="chrome://pacome/content/pacomemsg.xul";
//url boite de saisie
const PACOME_PACOMESAISIE="chrome://pacome/content/pacomesaisie.xul";

//message de notification -> bouton fermer
function PacomeMsgNotif(titre, texte, texte2){

  let args=new Array();
  args["mode"]=PACOMEMSG_NOTIF;
  args["titre"]=titre;
  args["texte"]=texte;
  if (texte2)
    args["texte2"]=texte2;

  window.openDialog(PACOME_PACOMEMSG,"","chrome,modal,centerscreen,titlebar,resizable=no", args);
}

//message de confirmation -> boutons OUI/NON
//retour: 1 si OUI, sinon 0
function PacomeMsgConfirm(titre, texte){

  let args=new Array();
  args["mode"]=PACOMEMSG_CONFIRM;
  args["titre"]=titre;
  args["texte"]=texte;

  window.openDialog(PACOME_PACOMEMSG,"","chrome,modal,centerscreen,titlebar,resizable=no", args);

  if (null!=args["res"])
    return args["res"];

  return 0;
}

//message de confirmation avec libellés boutons -> boutons libbtOUI/libbtNON
//retour: 1 si OUI, sinon 0
function PacomeMsgConfirmBt(titre, texte, libbtOUI, libbtNON){

  let args=new Array();
  args["mode"]=PACOMEMSG_CONFIRM;
  args["titre"]=titre;
  args["texte"]=texte;
  args["libbtOUI"]=libbtOUI;
  args["libbtNON"]=libbtNON;

  window.openDialog(PACOME_PACOMEMSG,"","chrome,modal,centerscreen,titlebar,resizable=no", args);

  if (null!=args["res"])
    return args["res"];

  return 0;
}


//boite de saisie (identifiant)
// retourne valeur saisie ou null si annulation
function PacomeDlgSaisie(titre, texte, libelle, valeur, regexpr){

  let args=new Array();

  args["titre"]=titre;
  args["texte"]=texte;
  args["libelle"]=libelle;
  args["valeur"]=valeur;
  args["regexpr"]=regexpr;

  window.openDialog(PACOME_PACOMESAISIE,"","chrome,modal,centerscreen,titlebar,resizable=no", args);

  if (1==args["res"])
    return args["valeur"];

  return null;
}


/* teste si fenetre authentification ouverte */
function PacomeDlgMdpActive(){

  let liste=Services.wm.getEnumerator("pacomemdp");
  if (liste.hasMoreElements())
    return true;

  return false;
}


/*
*  fonctions d'enregistrement des evenements (fichier log)
*/
//nom du fichier log
const PACOME_FICHIER_LOG="pacome.log";

const PACOME_FICHIER_LOG_SEP="\t";

var gPacomeFichierLogs=null;

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

/* v2.6 - rotation fichier logs
 supprime *-1.log existant
 renomme en *-1.log
 cree *.log
*/
function PacomeLogsRotate(){

  PacomeTrace("PacomeLogsRotate.");

  let fichier=Services.dirsvc.get("ProfD", Components.interfaces.nsIFile);
  fichier.append(PACOME_FICHIER_LOG);
  fichier.moveTo(null, PACOME_FICHIER_LOG1);
}


//initialisation
function PacomeInitLogs(){

  let fichier=Services.dirsvc.get("ProfD", Components.interfaces.nsIFile);
  fichier.append(PACOME_FICHIER_LOG);

  if (fichier.exists()){
    //v2.6 - test taille fichier
    if (fichier.fileSize>PACOME_LOGS_MAX)
      PacomeLogsRotate();
  } else
    fichier.create(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, FileUtils.PERMS_FILE);

  gPacomeFichierLogs=Components.classes["@mozilla.org/network/file-output-stream;1"].createInstance(Components.interfaces.nsIFileOutputStream);
  gPacomeFichierLogs.init(fichier, FileUtils.MODE_WRONLY|FileUtils.MODE_CREATE|FileUtils.MODE_APPEND,
                          FileUtils.PERMS_FILE,0);
}


//écriture evenement
function PacomeEcritLog(source, description, donnees){

  if (null==gPacomeFichierLogs)
    PacomeInitLogs();
  if (null==gPacomeFichierLogs){
    PacomeTrace("PacomeEcritLog fichier non initialise");
    PacomeInitLogs();
    return;
  }

  //date heure
  let dh=new Date();
  let strdh="["+dh.getDate()+"/"+(dh.getMonth()+1)+"/"+dh.getFullYear()+" "+dh.getHours()+":"+dh.getMinutes()+":"+dh.getSeconds()+"]";
  let src="";
  if (null!=source)
    src=source;
  let desc="";
  if (null!=description)
    desc=description;
  let don="";
  if (null!=donnees)
    don=donnees;

  let msg=strdh+PACOME_FICHIER_LOG_SEP+"["+src+"]"+PACOME_FICHIER_LOG_SEP+
          "\""+desc+"\""+PACOME_FICHIER_LOG_SEP+"\""+don+"\"\x0D\x0A";

  gPacomeFichierLogs.write(msg, msg.length);
  gPacomeFichierLogs.flush();
}


/*
*  passe le client en mode hors-ligne (déconnecté)
*
*/
function passerHorsLigne(){

  Services.io.manageOfflineStatus=false;
  Services.io.offline=true;
}


/* retourne la partie a gauche de .-. d'un identifiant */
function GetUidReduit(uid){

  let pos=uid.indexOf(".-.");
  if (-1!=pos) {
    return uid.substr(0,pos);
  }
  return uid;
}



// 4582 : Logguer le temps de chargement du Courrielleur
function pacomeLogStartTime(){

  if (null==gPacomeFichierLogs)
    PacomeInitLogs();
  if (null==gPacomeFichierLogs){
    PacomeTrace("PacomeEcritLog fichier non initialise");
    PacomeInitLogs();
    return;
  }

  let startTime=Services.prefs.getCharPref("courrielleur.startTime");
  startTime=new Date(new Number(startTime));
  let totalTime=Services.prefs.getIntPref("courrielleur.totalTime");

  let strdh="["+startTime.getDate()+"/"+(startTime.getMonth()+1)+"/"+startTime.getFullYear()+" "+startTime.getHours()+":"+startTime.getMinutes()+":"+startTime.getSeconds()+"]";

  let msg=strdh+PACOME_FICHIER_LOG_SEP+"[Affichage authentification]"+PACOME_FICHIER_LOG_SEP+
          "\"Temps pour affichage\""+PACOME_FICHIER_LOG_SEP+"\""+totalTime+" s\"\x0D\x0A";

  gPacomeFichierLogs.write(msg, msg.length);
  gPacomeFichierLogs.flush();
}
