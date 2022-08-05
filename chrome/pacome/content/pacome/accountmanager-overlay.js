
ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource:///modules/mailServices.js");
ChromeUtils.import("resource:///modules/pacomeUtils.jsm");


//traitement du bouton "Gerer les comptes"
//appel l'assistant Pacome
function btGererComptes() {

  //gestion du mode offline
  if (Services.io.offline){
    PacomeAfficheMsgId("PacomeClientDeconnecte");
    return;
  }

  let ret=PacomeAfficheAssistant();

  if (1==ret){
    //l'assistant a modifier des donnees fermer le gestionnaire
    window.close();
  }
}


function initBoutonsCompte(menupopup){

  PacomeTrace("initBoutonsCompte");

  //appel fonction thunderbird originale
  initAccountActionsButtons(menupopup);

  //compte selectionne : AccountManager.js currentAccount
  let account=getSelAccount();

  //detection compte gere par Pacome
  let bSupport=false;
  if (null!=account) {
    let confid=account.incomingServer.getCharValue("pacome.confid")
    if (confid && "flux"!=confid)
      bSupport=true;
  }

  //etat des boutons
  //changement de mot de passe
  let elem=document.getElementById("pacome.btmotdepasse");
  if (!bSupport)
    elem.setAttribute("disabled",true);
  else
    elem.removeAttribute("disabled");

  //effacement de compte
  if (!bSupport && account){
    //cas dossier local?
    let key=account.incomingServer.key;
    if (key!=MailServices.accounts.localFoldersServer.key){
      bSupport=true;
      //mantis 3965
      try {
        if (!account.incomingServer.protocolInfo.canDelete){
          let pref="mail.server."+key+".canDelete";
          PacomeTrace("initBoutonsCompte mise a jour canDelete sur dossier local");
          Services.prefs.setBoolPref(pref, true);
        }
      } catch(ex) {
        PacomeTrace("initBoutonsCompte mise a jour canDelete exception:"+ex);
      }
    }
  }

  elem=document.getElementById("accountActionsDropdownRemove");

  if (!bSupport)
    elem.setAttribute("disabled",true);
  else
    elem.removeAttribute("disabled");
}


/**
*  appelle la boîte de changement de mot de passe
*
*
*  implementation : determine l'uid de l'utilisateur de compte par defaut et le passe en parametre uid
*
*/
function btMotDePasse(){

  //gestion du mode offline
  if (Services.io.offline){
    PacomeAfficheMsgId("PacomeClientDeconnecte");
    return;
  }

  //uid de l'utilisateur du compte selectionne
  let compte=getSelAccount();
  if (null==compte){
    PacomeMsgNotif("Erreur", gPacomeMsgErreur);
    return;
  }
  if (null==compte.incomingServer){
    PacomeAfficheMsgId("PacomeErreurCompteSel");
    return;
  }
  //cas identifiant boite partagee .-.
  let uid=compte.incomingServer.username;
  let compos=SplitUserBalp(uid);
  if (compos && 2==compos.length)
    uid=compos[0];

  //appel de la boite de changement de mot de passe
  PacomeDlgChangeMDP(uid);
}



/**
*  retourne l'objet du compte selectionne dans le gestionnaire de comptes
*
*
*  @return si succes retourne une instance nsIMsgAccount
* si erreur retourne null (erreur globale dans gCodeErreur et gMsgErreur)
*
*/
function getSelAccount(){

  let tree=document.getElementById("accounttree");

  let pos=tree.currentIndex;
  PacomeTrace("getSelAccount currentIndex:"+pos);
  if (0>pos)
    return null;

  let item=tree.view.getItemAtIndex(pos);
  return item._account;
}


/**
*  gere le bouton de suppression de compte original
*
*
*  @return si succes retourne true
* si erreur retourne false
*
*  implementation : appelle la fonction originale onRemoveAccount
*  si le compte est effectivement supprime, la configuration Pacome du compte est supprimee (preference pacome.comptes)
*
*/
function onSupprimeCompte(e){

  let serveur=currentAccount.incomingServer;
  let confid=serveur.getCharValue("pacome.confid");
  let ident=null;
  let tbsortpref=false;

  if (null!=confid){
    if ("flux"==confid){
      ident=serveur.prettyName;
    } else {
      ident=serveur.username;

      // mantis 4709
      if (Services.prefs.prefHasUserValue("extensions.tbsortfolders@xulforum.org.startup_folder")){
        let val=Services.prefs.getCharPref("extensions.tbsortfolders@xulforum.org.startup_folder");
        let uidsrv=ident+"@"+serveur.hostName;
        if (0!=val.indexOf(uidsrv)){
          tbsortpref=true;
        }
      }
      // fin mantis 4709
    }
  }

  // 4239 v2
  if (null!=confid) {
    PacomeTrace("onSupprimeCompte compte pacome password=null");
    serveur.password=null;
  }

  //code Thunderbird
  onRemoveAccount(e);

  if (tbsortpref)
    Services.prefs.clearUserPref("extensions.tbsortfolders@xulforum.org.startup_folder");

  let confid2=null;
  if (null!=currentAccount)
    confid2=currentAccount.incomingServer.getCharValue("pacome.confid");

  if (null!=confid && confid!=confid2) {
    PacomeTrace("onSupprimeCompte compte pacome");
    if ("flux"==confid){
      PacomeTrace("Gestionnaire des comptes - ajout libelle dans pacome.ignoreflux:"+ident);
      PacomeAjoutFluxIgnore(ident);

    } else{
      PacomeTrace("Gestionnaire des comptes - ajout uid dans pacome.ignoreuids:"+ident);
      PacomeAjoutBoiteIgnore(ident);
    }
  }
}


/**
*  clic sur le bouton pacome.btdossier -> appelle la boîte d'ajout d'un nouveau dossier
*
*  @return  true si ok, false si erreur
*
*/
function NouveauDossier(){

  let ret=PacomeDlgDossierLocal();

  if (1==ret){
    //v3.1T2 fermer le gestionnaire
    window.close();
  }
}
