

ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource://gre/modules/cm2tags.jsm");
ChromeUtils.import("resource:///modules/mailServices.js");
ChromeUtils.import("resource://calendar/modules/calUtils.jsm");
ChromeUtils.import("resource://gre/modules/pacomeAuthUtils.jsm");
ChromeUtils.import("resource://calendar/modules/cmelSynchroAgenda.jsm");

window.addEventListener("load", initMessengerOverlay);

//positionne a false lors de la creation d'un profil => ne recherche pas de mise a jour
var gPacomeMAJ=true;


function cm2SynchroEtiquettes(){

  if (Services.io.offline)
    return;

  let maj=Services.prefs.getBoolPref("courrielleur.etiquettes.majauto");
  if (!maj)
    return;

  PacomeTrace("messenger-overlay - synchronisation automatique des etiquettes");
  function retourSynchro(result, config){
    if (0!=result.code)
      Services.console.logStringMessage("Erreur de synchronisation des etiquettes code:'"+result.code+"' - erreur:'"+result.erreur+"'");
  }
  cm2SynchroniseTags(retourSynchro);
}


function cm2ExecPacome(okCallback){

  PacomeTrace("cm2ExecPacome");

  gPacomeMAJ=false;

  function cm2ExecPacomeCallback(){

    okCallback();
    PacomeTrace("cm2ExecPacomeCallback");

    let uidp=PacomeAuthUtils.GetUidComptePrincipal();
    if (null!=uidp && ""!=uidp) {

      // demarrer les agendas
      cmelSynchroAgenda.Demarre();

      //configuration des carnets
      PacomeTrace("Configuration des carnets");
      cleanupAddressBooks();
      //demarrer le timer => declenche configuration+synchronisation
      cm2davStartTimerRefresh(10000);

      //synchronisation etiquettes
      cm2SynchroEtiquettes();
    }
  }

  setTimeout(PacomeAfficheAssistant, 0, msgWindow, cm2ExecPacomeCallback);
}


// instance nsIFolderListener
var gPacomeFolderListener={

  OnItemAdded: function(parentItem, item) {

    if (!(item instanceof Components.interfaces.nsIMsgFolder))
      return;

    if (item.isServer)
      return;

    let confid=item.server.getCharValue("pacome.confid");
    if (null==confid)
      return;

    //boite individuelle pop
    if ("std2"==confid) {
      if ("Junk"==item.name || this.nomDosIndesirable==item.name){
        if (item.server.getBoolValue("pacome.install.spam")){
          item.setFlag(nsMsgFolderFlags.Junk);
          item.clearFlag(nsMsgFolderFlags.Offline);
          item.server.setBoolValue("pacome.install.spam",false);
          item.server.setBoolValue("moveOnSpam",true);
        }
      }
    }
  },

  OnItemRemoved: function(parentItem, item) {},

  OnItemPropertyChanged: function(item, property, oldValue, newValue) {
    if (!(item instanceof Components.interfaces.nsIMsgFolder))
      return;
  },

  OnItemIntPropertyChanged: function(item, property, oldValue, newValue) {},

  OnItemBoolPropertyChanged: function(item, property, oldValue, newValue) {},

  OnItemUnicharPropertyChanged: function(item, property, oldValue, newValue){
    if (!(item instanceof Components.interfaces.nsIMsgFolder))
      return;
    if ("Name"==property.toString() && "Junk"==newValue &&
        "std2"==item.server.getCharValue("pacome.confid"))
      item.name=this.nomDosIndesirable;
  },

  OnItemPropertyFlagChanged: function(item, property, oldFlag, newFlag) {
    if (!(item instanceof Components.interfaces.nsIMsgFolder))
      return;
  },

  OnItemEvent: function(folder, event) {

    if (folder.isServer)
      return;

    let confid=folder.server.getCharValue("pacome.confid");
    if (null==confid)
      return;

    // mantis 4488
    if ("RenameCompleted"==event.toString() &&
        "imap"==folder.server.type &&
        !folder.getFlag(nsMsgFolderFlags.Offline)){

      let imapsrv=folder.server.QueryInterface(Components.interfaces.nsIImapIncomingServer);
      if (imapsrv &&
          imapsrv.offlineDownload){
        // remettre flag Offline
        folder.setFlag(nsMsgFolderFlags.Offline);
      }
    }

    if ("FolderCreateCompleted"!=event.toString() &&
        "FolderLoaded"!=event.toString()) {
      return;
    }

    //boite individuelle
    if ("std1"==confid) {

      //indesirables
      if (folder.parent.isServer) {
        if ("Junk"==folder.name || this.nomDosIndesirable==folder.name) {

          if (folder.server.getBoolValue("pacome.install.spam")){

            folder.setFlag(nsMsgFolderFlags.Junk);
            folder.setFlag(nsMsgFolderFlags.CheckNew);
            folder.clearFlag(nsMsgFolderFlags.Offline);

            folder.server.setBoolValue("pacome.install.spam",false);
            folder.server.setBoolValue("moveOnSpam",true);
          }

        }  else if ("Corbeille"==folder.name || "Trash"==folder.name)
          folder.clearFlag(nsMsgFolderFlags.Offline);
      }
    }
    //boite partagee
    else if ("par1"==confid){

      if (folder.parent.isServer) {
        //imap://<uid>.-.<partage>@<serveur>/INBOX
        if (folder.getFlag(nsMsgFolderFlags.Inbox) &&
            ("INBOX"==folder.name || this.nomDosEntrant==folder.name)) {

          folder.clearFlag(nsMsgFolderFlags.Inbox);
          folder.clearFlag(nsMsgFolderFlags.Offline);
          folder.clearFlag(nsMsgFolderFlags.Favorite);

        } else if ("Corbeille"==folder.name || "Trash"==folder.name){
          folder.clearFlag(nsMsgFolderFlags.Offline);

        } else if (this.nomDosBalPartage==folder.name){
          folder.clearFlag(nsMsgFolderFlags.CheckNew);
          folder.clearFlag(nsMsgFolderFlags.Offline);
        }
      } else {

        //imap://<uid>.-.<partage>@<serveur>/Boite partagee/<partage>
        if (this.nomDosBalPartage==folder.parent.name &&
            folder.parent.parent.isServer) {
          //valider courrier entrant balp
          let username=folder.username;
          if (username) {
            let parts=username.split(MCE_SEP_BOITE);
            if (2==parts.length &&
                folder.name==parts[1]){
              folder.setFlag(nsMsgFolderFlags.Inbox);
              folder.setFlag(nsMsgFolderFlags.GotNew);
              folder.setFlag(nsMsgFolderFlags.CheckNew);
            } else
              folder.clearFlag(nsMsgFolderFlags.Offline);
          }
        }
        //autres dossiers
        else {
          //indesirables
          if ("Junk"==folder.name || this.nomDosIndesirable==folder.name) {

            if (folder.server.getBoolValue("pacome.install.spam")){
              folder.setFlag(nsMsgFolderFlags.Junk);
              folder.setFlag(nsMsgFolderFlags.CheckNew);
              folder.clearFlag(nsMsgFolderFlags.Offline);
              folder.server.setBoolValue("pacome.install.spam",false);
              folder.server.setBoolValue("moveOnSpam",true);
            }
          }
        }
      }
    }
  },

  nomDosIndesirable : null,
  nomDosBalPartage : null,
  nomDosEnvoyes : null,
  nomDosEntrant : null,

  Init : function(){

    this.nomDosIndesirable=PacomeMessageFromId("NomDosIndesirable");
    this.nomDosBalPartage=PacomeMessageFromId("NomDosBalPartage");
    this.nomDosEnvoyes=PacomeMessageFromId("NomDosElemEnvoyes");
    this.nomDosEntrant=PacomeMessageFromId("NomDosEntrant");
  }
};



function cm2ReparePbHostnames(){

  let bRestart=false;

  let allServeurs=MailServices.accounts.allServers;
  let nbServers=allServeurs.length;
  for (var i=0; i<nbServers; i++){

    let server=allServeurs.queryElementAt(i, Components.interfaces.nsIMsgIncomingServer);

    if ("none"==server.type){

      var hostName=server.hostName;
      var modifs=hostName.replace(/[\x7F-\xFF]/g, "");
      if (hostName!=modifs){
        server.hostName=modifs;
        bRestart=true;
      }

    } else {

      let confid=server.getCharValue("pacome.confid");
      if (null==confid ||
          "flux"!=confid)
        continue;

      // verifier hostname du flux
      let hostName=server.hostName;
      if ("Feeds"!=hostName &&
          "InformationsMelanie2"!=hostName){

        server.hostName="Feeds";

        // forcer maj
        server.setCharValue("pacome.version", 3);

        bRestart=true;
      }
    }
  }

  // cas pacome.ignoreflux
  if (Services.prefs.prefHasUserValue("pacome.ignoreflux")) {
    let ignore=Services.prefs.getStringPref("pacome.ignoreflux");
    if (ignore.includes("Informations M") &&
        "Informations Mélanie2"!=ignore){
      Services.prefs.setStringPref("pacome.ignoreflux", "Informations Mélanie2");
      Services.prefs.savePrefFile(null);

      bRestart=true;
    }
  }

  if (bRestart)
    Services.startup.quit(Services.startup.eForceQuit | Services.startup.eRestart);
}

/**
*  chargement du messenger
*
*
*/
const nsIFolderListener=Components.interfaces.nsIFolderListener;
function initMessengerOverlay(){

  PacomeTrace("initMessengerOverlay");

  PacomeInitLogs();

  cm2ReparePbHostnames();

  //log demarrage
  PacomeEcritLog(PACOME_LOGS_MODULE, "Demarrage du module pacome", "");

  window.removeEventListener("load",initMessengerOverlay);
  window.addEventListener("unload",unloadMessengerOverlay);

  //pour spam settings et dossiers hors ligne
  gPacomeFolderListener.Init();

  MailServices.mailSession.AddFolderListener(gPacomeFolderListener, nsIFolderListener.added | nsIFolderListener.event | nsIFolderListener.unicharPropertyChanged);

  setTimeout("initMessengerOverlayDelai()", 0);
}

function initMessengerOverlayDelai(){

  PacomeTrace("initMessengerOverlayDelai");

  //Enregistrement de l'écouteur  gPacomeCalManagerObserver
  let calMan=cal.getCalendarManager();
  if (null!=calMan)
    calMan.addObserver(gPacomeCalManagerObserver);
}

function unloadMessengerOverlay(){

  window.removeEventListener("unload",unloadMessengerOverlay);

  let calMan=cal.getCalendarManager();
  if (null!=calMan)
    calMan.removeObserver(gPacomeCalManagerObserver);

  MailServices.mailSession.RemoveFolderListener(gPacomeFolderListener);
}


function pacomeRetourParam(){

  // demarrer les agendas
  cmelSynchroAgenda.Demarre();

  //demarrer le timer => declenche configuration+synchronisation
  cm2davStartTimerRefresh(10000);

  //synchronisation etiquettes
  cm2SynchroEtiquettes();
}

function pacomeDemarre(){

  if (!Services.io.offline){
    // au moins 1 compte => maj pacome
    PacomeMajParam(pacomeRetourParam);
    return;
  }

  pacomeRetourParam();
}


