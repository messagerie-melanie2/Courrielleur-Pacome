/*
* Fonctions pour migration compte pop vers imap
* realise les opérations complémentaires (après création compte imap):
*    - transfert des messages (imap ou dossier local)
*    - filtres de messages
*    - couleurs des dossiers
*    - dossiers virtuels
*    - classsement des comptes => pas nécessaire => compte imap a la place du pop convient
*    - paramètres d'archivage
*    - suppression compte pop
*    - positionner compte imap en premier (ou position pop)
*/


ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource:///modules/MailUtils.js");
ChromeUtils.import("resource:///modules/mailServices.js");
ChromeUtils.import("resource:///modules/iteratorUtils.jsm");
ChromeUtils.import("resource://calendar/modules/calUtils.jsm");

ChromeUtils.import("resource://gre/modules/cm2MigreAmelie.jsm");


const Ci=Components.interfaces;
const Cc=Components.classes;


function Init(){

  //identifiant
  if (null==window.arguments[0] ||
      null==window.arguments[0].uid){
    PacomeTrace("popimap.xul pas d'uid en argument!");
    window.close();
    return;
  }

  let uid=window.arguments[0].uid;

  let res=MigrePopImap(uid);

  if (res)
    window.arguments[0].res=1;
  else
    window.arguments[0].res=-1;

  window.close();
}

// fonction principale de complement de migration
let imapaccount;
let popaccount;

function MigrePopImap(uid){

  PacomeTrace("MigrePopImap uid"+uid);

  // retrouver les comptes pop et imap
  let allServers=MailServices.accounts.allServers;
  for (var server of fixIterator(allServers,
                                Ci.nsIMsgIncomingServer)){
    if (server.username==uid){
      let confid=server.getCharValue("pacome.confid");
      if (null==confid)
        continue;
      if ("pop3"==server.type)
        popaccount=MailServices.accounts.FindAccountForServer(server);
      else if ("imap"==server.type)
        imapaccount=MailServices.accounts.FindAccountForServer(server);
    }
  }

  if (null==imapaccount || null==popaccount){
    PacomeTrace("MigrePopImap null==imapaccount || null==popaccount !");
    return false;
  }

	// transfert des messages (imap ou dossier local)
  // operation asynchrone
  let res=transfertLocal(popaccount);
  if (!res){
    PacomeTrace("MigrePopImap echec transfert des messages");
    return res;
  }
}

// fonction de rappel appelee apres transfert des messages
function MigrePopImap2(){

  PacomeTrace("MigrePopImap2");

	// filtres de messages
  // ne pas faire : URI non compatibles (ex: Inbox/INBOX)
  //migreFiltres();

	// dossiers virtuels


	// paramètres d'archivage
  ParamArchivage(popaccount, imapaccount);

  // classsement des comptes
  migreTBSortFolders(popaccount, imapaccount);


  // mise a jour agendas
  let oldKey=popaccount.defaultIdentity.key;
  let newKey=imapaccount.defaultIdentity.key;
  MajAgendas(oldKey, newKey);

  // initialiser mot de passe, sinon boite peut s'afficher
  imapaccount.incomingServer.password=popaccount.incomingServer.password;

	// suppression compte pop
  let prefordre=Services.prefs.getCharPref("mail.accountmanager.accounts");
  PacomeTrace("MigrePopImap2 prefordre:"+prefordre);
  let idpop=popaccount.key;

  suppressionPOP(popaccount);

	// positionner compte imap avec position pop
  let idimap=imapaccount.key;
  prefordre=prefordre.replace(idpop, idimap);
  Services.prefs.setCharPref("mail.accountmanager.accounts", prefordre);
  PacomeTrace("MigrePopImap2 prefordre:"+prefordre);
  Services.prefs.setCharPref("mail.accountmanager.defaultaccount", idimap);

  Services.prefs.savePrefFile(null);
}

// paramètres d'archivage
function ParamArchivage(popaccount, imapaccount){

  // preférences tb
  let popid=popaccount.defaultIdentity.key;
  let imapid=imapaccount.defaultIdentity.key;

  if (Services.prefs.prefHasUserValue("mail.identity."+popid+".archive_granularity")){
    let val=Services.prefs.getIntPref("mail.identity."+popid+".archive_granularity");
    Services.prefs.setIntPref("mail.identity."+imapid+".archive_granularity", val);
  }
  if (Services.prefs.prefHasUserValue("mail.identity."+popid+".archive_folder")){
    let val=Services.prefs.getCharPref("mail.identity."+popid+".archive_folder");
    Services.prefs.setCharPref("mail.identity."+imapid+".archive_folder", val);
  }
  if (Services.prefs.prefHasUserValue("mail.identity."+popid+".archive_keep_folder_structure")){
    let val=Services.prefs.getBoolPref("mail.identity."+popid+".archive_keep_folder_structure");
    Services.prefs.setBoolPref("mail.identity."+imapid+".archive_keep_folder_structure", val);
  }

  // preférences archibald
  popid=popaccount.incomingServer.key;
  imapid=imapaccount.incomingServer.key;
  if (Services.prefs.prefHasUserValue("mail.server."+popid+".archibald.jours")){
    let val=Services.prefs.getIntPref("mail.server."+popid+".archibald.jours");
    Services.prefs.setIntPref("mail.server."+imapid+".archibald.jours", val);
  }
  if (Services.prefs.prefHasUserValue("mail.server."+popid+".archibald.dossier")){
    let val=Services.prefs.getCharPref("mail.server."+popid+".archibald.dossier");
    Services.prefs.setCharPref("mail.server."+imapid+".archibald.dossier", val);
  }
  if (Services.prefs.prefHasUserValue("mail.server."+popid+".archibald.etat")){
    let val=Services.prefs.getBoolPref("mail.server."+popid+".archibald.etat");
    Services.prefs.setBoolPref("mail.server."+imapid+".archibald.etat", val);
  }
}


// mise à jour des agendas ()
function MajAgendas(oldKey, newKey){

  let calMan=cal.getCalendarManager();
  if (null==calMan)
    return;

  let agendas=calMan.getCalendars({});
  const nb=agendas.length;

  for (var i=0; i<nb; i++) {

    let agenda=agendas[i];

    if (agenda.getProperty("pacome")) {
      let key=agenda.getProperty("imip.identity.key");
      if (oldKey==key){
        agenda.setProperty("imip.identity.key", newKey);
      }
    }
  }
}



// transfert des messages (dossier local)
// popaccount : nsIMsgAccount pop
function transfertLocal(popaccount){

  // creer dossier local dans Mail du profil
  let maildir=Services.dirsvc.get("ProfD", Ci.nsIFile);
  maildir.append("Mail");

  let rep=popaccount.incomingServer.key+".pop";
  let ficdir=maildir.clone();
  ficdir.append(rep);
  if (ficdir.exists()){
    PacomeTrace("transfertLocal repertoire existe:"+ficdir.path);
    for (var i=0;i<10;i++){
      ficdir=maildir.clone();
      ficdir.append(rep+i);
      if (!ficdir.exists()){
        break;
      }
    }
    if (ficdir.exists()){
      PacomeTrace("transfertLocal trop de repertoires existants!");
      return false;
    }
  }
  PacomeTrace("transfertLocal repertoire:"+ficdir.path);

  let srv=MailServices.accounts.createIncomingServer("nobody",  ficdir.leafName, "none");
  let nom=popaccount.incomingServer.username+" (ancien compte pop)";
  srv.prettyName=nom;
  let account=MailServices.accounts.createAccount();
  account.incomingServer=srv;

  // transferer les messages pop vers le dossier local
  gArchiveur.TransfertMessages(popaccount, account);

  return true;
}



// filtres de messages
function migreFiltres(){

  let popval="mailbox://"+popaccount.incomingServer.username+"@"+popaccount.incomingServer.hostName;
  let imapval="imap://"+imapaccount.incomingServer.username+"@"+imapaccount.incomingServer.hostName;
  let dirMail=Services.prefs.getCharPref("mail.server."+popaccount.incomingServer.key+".directory");
  let filtSrc=new FileUtils.File(dirMail);
  filtSrc.append("msgFilterRules.dat");
  if (filtSrc.exists()){
    let imapdirMail=Services.prefs.getCharPref("mail.server."+imapaccount.incomingServer.key+".directory");
    let filtImap=new FileUtils.File(imapdirMail);
    filtImap.append("msgFilterRules.dat");
    cm2AmMigreFichier(filtSrc, filtImap, popval, imapval);
  }
}


// suppression compte pop
function suppressionPOP(popaccount){
  PacomeTrace("suppressionPOP");
  MailServices.accounts.removeAccount(popaccount);

  return true;
}


// classsement des comptes
function migreTBSortFolders(popaccount, imapaccount){

  if (Services.prefs.prefHasUserValue("extensions.tbsortfolders@xulforum.org.tbsf_data")){
    let val=Services.prefs.getStringPref("extensions.tbsortfolders@xulforum.org.tbsf_data");
    if (""!=val){
      try{
        let tbsf_data=JSON.parse(val);
        let nom=popaccount.incomingServer.prettyName;
        if (tbsf_data[nom]){
          tbsf_data[nom]=[];
        }
        val=JSON.stringify(tbsf_data);
        Services.prefs.setStringPref("extensions.tbsortfolders@xulforum.org.tbsf_data", val);
      } catch(ex){}
    }
  }
  if (Services.prefs.prefHasUserValue("extensions.tbsortfolders@xulforum.org.startup_folder")){
    let val=Services.prefs.getCharPref("extensions.tbsortfolders@xulforum.org.startup_folder");
    if (0==val.indexOf(popval)){
      Services.prefs.clearUserPref("extensions.tbsortfolders@xulforum.org.startup_folder");
    }
  }
}


/* composant pour le transfert des messages (basé sur archibald) */

const FLAGS_DOSSIERS=Ci.nsMsgFolderFlags;

//liste des drapeaux des dossiers spéciaux à traiter lors de la création
let ARCH_DOSSIERS_SPECIAUX=[
  FLAGS_DOSSIERS.SentMail,
  FLAGS_DOSSIERS.Drafts,
  FLAGS_DOSSIERS.Inbox,
  FLAGS_DOSSIERS.Templates,
  FLAGS_DOSSIERS.Virtual
];

let gArchiveur={

  src:null,
  racinesrc:null,
  dest:null,
  racinedest:null,

  dossiers:null,
  index:0,
  dossierdest:null,

  archiveur:null,
  config:null,


  // transfert des messages d'un compte vers un autre
  // fonction asynchrone
  // utilise l'archivage dossier d'archibald
  // src : nsIMsgAccount source
  // dest : nsIMsgAccount destination
  // transfert des messages d'un compte vers un autre
  // fonction asynchrone
  // utilise l'archivage dossier d'archibald
  // src : nsIMsgAccount source
  // dest : nsIMsgAccount destination
  TransfertMessages: function(src, dest){

    this.src=src;
    this.racinesrc=this.src.incomingServer.rootMsgFolder;
    this.dest=dest;
    this.racinedest=this.dest.incomingServer.rootMsgFolder;

    this.dossiers=[];
    this.index=0;
    this.ListageDossiers(this.racinesrc);

    if (0==this.dossiers.length){
      this.OnTransfertEnd();
      return;
    }

    // traiter le premier dossier
    this.transfertDossierCourant();
  },

  ListageDossiers: function(dossier){

    if (dossier.hasSubFolders){

      let subFolders=dossier.subFolders;

      while (subFolders.hasMoreElements()) {

        let suivant=subFolders.getNext().QueryInterface(Ci.nsIMsgFolder);
        if (null==suivant) {
          continue;
        }
        //dossier virtuel?
        if (suivant.getFlag(Ci.nsMsgFolderFlags.Virtual)){
          continue;
        }
        PacomeTrace("ListageDossiers dossier:"+suivant.URI);
        this.dossiers.push(suivant);

        this.ListageDossiers(suivant);
      }
    }
  },

  //transfert du dossier courant
  transfertDossierCourant: function(){

    let dos=this.getDossierCourant();

    PacomeTrace("transfertDossierCourant dossier:"+dos.URI);

    let listemsg=[];

    this.OnDossierStart(dos);

    let enumerator=dos.messages;

    while (enumerator.hasMoreElements()){
      let header=enumerator.getNext();
      if (header instanceof Ci.nsIMsgDBHdr){
        listemsg.push(header);
      }
    }

    //transfert des messages
    if (0==listemsg.length){
      this.OnDossierEnd();
      return;
    }

    this.archiveListeMessages(dos, listemsg);
  },

  archiveListeMessages: function(dossier, listemsg) {

    const nb=listemsg.length;

    let msgs=Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);

    for (var m=0;m<nb;m++) {
      msgs.appendElement(listemsg[m], false);
    }

    this.dossierdest=this.GetDossierArchive(dossier);

    MailServices.copy.CopyMessages(dossier, msgs, this.dossierdest, false, this, null, false);
  },

  //retourne le dossier en cours de traitement dans this.ListageDossiers
  getDossierCourant: function() {

    if (0>this.index ||
        this.index+1 > this.dossiers.length)
      return null;

    return this.dossiers[this.index];
  },

  //retourne le dossier suivant a traiter
  getDossierSuivant: function() {

    if (this.index+1 == this.dossiers.length)
      return null;

    return this.dossiers[++this.index];
  },

  //determine le dossier d'archivage du compte correspondant au dossier source (meme arborescence)
  //dossiersrc: instance dossier source
  GetDossierArchive: function(dossiersrc) {

    PacomeTrace("GetDossierArchive dossiersrc:"+dossiersrc.URI);

    //dosdest: dossier de destination
    let dosdest=this.racinedest;
    let urisrc=this.racinesrc.URI;

    let elems=dossiersrc.URI.split("/");
    const nb=elems.length;

    for (var i=3;i<nb;i++){

      urisrc+="/"+elems[i];
      PacomeTrace("GetDossierArchive urisrc:"+urisrc);
      let dossrc=MailUtils.getFolderForURI(urisrc, 0);

      let lib=dossrc.name;
      if (this.win32) {
        //sous win32 supprimer les points terminaux
        lib=lib.replace(/\.*$/,"");
      }
      PacomeTrace("GetDossierArchive libelle:"+lib);

      if (!dosdest.containsChildNamed(lib)) {
        //creer dossier destination
        PacomeTrace("GetDossierArchive creation dossier destination:"+lib);
        dosdest.createSubfolder(lib, null);
      }

      dosdest=dosdest.getChildNamed(lib);
      PacomeTrace("GetDossierArchive dossier destination:"+dosdest.URI);

      //flags
      for (var d=0;d<ARCH_DOSSIERS_SPECIAUX.length;d++){
        let flag=ARCH_DOSSIERS_SPECIAUX[d];
        if (dossrc.getFlag(flag))
          dosdest.setFlag(flag);
      }
    }

    return dosdest;
  },


  //nsIMsgCopyServiceListener
  OnStartCopy: function() {
    PacomeTrace("OnStartCopy");

  },
  OnProgress: function(aProgress, aProgressMax) {
  },
  SetMessageKey: function(aKey) {
  },
  GetMessageId: function() {
  },
  OnStopCopy: function(aStatus) {
    PacomeTrace("OnStopCopy");
    this.OnDossierEnd();
  },

  //fonctions notifications des etapes
  OnErreurTransfert: function(errmsg) {
  },
  OnTransfertStart: function(config) {
  },
  OnTransfertEnd: function() {

    MigrePopImap2();

  },
  OnDossierStart: function(dos) {
  },
  OnDossierEnd: function() {

    let dos=this.getDossierSuivant();
    if (null==dos) {
      //tous les dossiers ont ete traites
      PacomeTrace("OnDossierEnd tous les dossiers ont ete traites");
      this.OnTransfertEnd();
      return;
    }

    this.transfertDossierCourant();
  }
};
