
ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource:///modules/mailServices.js");

const Cc=Components.classes;
const Ci=Components.interfaces;


/*
*  initialisation boite de création de dossier
*
*/
function initDlg(){

  document.getElementById("dossierlocalnom").focus();

  if (window.arguments)
    window.arguments[0].res=0;
}


/*
*  création du dossier local (bouton valider)
*
*  @return  true si ok, false si erreur
*
*/
function btCreeDossierLocal(){

  try{

    //vérification des paramètres
    let nom=document.getElementById("dossierlocalnom").value;
    if (nom==""){
      PacomeAfficheMsgId("NomPasRenseigne");
      return;
    }

    //libellé pas déjà utilisé
    let serveurs=MailServices.accounts.allServers;
    for (var i=0;i<serveurs.length;i++){
      let srv=serveurs.queryElementAt(i, Ci.nsIMsgIncomingServer);
      if (nom==srv.prettyName)
      {
        PacomeAfficheMsgId("DossierExiteDeja");
        return;
      }
    }

    let dossier=document.getElementById("dossierlocalchemin").value;
    if (dossier==""){
      PacomeAfficheMsgId("DossierPasRenseigne");
      return;
    }

    //création du dossier local
    let ret=creeDossierLocal(nom,dossier);

    if (null!=ret){

      //message de confirmation d'opération
      let titre=PacomeMessageFromId("DossierMsgFinTitre");
      let texte=PacomeMessageFromId("DossierMsgFinText");
      texte=texte.replace("%1",nom);
      texte=texte.replace("%2",dossier);
      PacomeMsgNotif(titre, texte);
    }

    if (window.arguments) {
      PacomeTrace("btCreeDossierLocal retour OK nom="+nom);
      window.arguments[0].res=1;
      window.arguments[0].nom=ret.incomingServer.prettyName;
      window.arguments[0].dossier=ret.incomingServer.localPath.path;
      window.arguments[0].hostname=ret.incomingServer.hostName;
    }

    window.close();
  }
  catch(ex){
     PacomeAfficheMsgId2("ErreurCreationDossier",ex);
    window.close();
  }
}


/**
*  sélection du chemin d'un nouveau dossier
*
*  @return  true si ok, false si erreur
*
* v3 nsIMsgIncomingServer.localPath -> nsIFile
*/
function SelectChemin(){

  let fp=Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
  fp.init(window, document.getElementById("dossierlocalcheminbtsel").getAttribute("dossierlocalchemin.browsertitle"), Ci.nsIFilePicker.modeGetFolder);

  let courant=Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  let selection=document.getElementById("dossierlocalchemin");
  if (selection.value)
    courant.initWithPath(selection.value);
  fp.displayDirectory=courant;

  fp.open(function(rv){

    if (Ci.nsIFilePicker.returnOK==rv){

      let dossier=fp.file;

      if (selection.value==dossier.path) return true;

      //vérifier que le chemin est valide
      let bValid=ValidRepLocal(dossier);

      if (false==bValid){
        PacomeAfficheMsgId("RepNonValide");
        return false;
      }

      //vérifier que l'emplacement n'est pas déjà utilisé
      let serveurs=MailServices.accounts.allServers;
      for (var i=0;i<serveurs.length;i++) {
      let srv=serveurs.queryElementAt(i, Ci.nsIMsgIncomingServer);
        if (srv.localPath.equals(dossier)){

          PacomeAfficheMsgId("RepertoireDejaUtilise");
          return false;
        }
      }

      selection.value=dossier.path;

      //remplissage automatique du libelle du dossier
      let libctrl=document.getElementById("dossierlocalnom");
      if (null==libctrl.value || ""==libctrl.value){
        PacomeTrace("Dossier local remplissage automatique du libelle:"+dossier.leafName);
        libctrl.value=dossier.leafName;
      }
    }
  });

  return true;
}


/*
*  creation du compte de dossier local
*
*  @param nom nom d'affichage du dossier
*  @param chemin disque du dossier
*
*  @return  instance  nsIMsgAccount du compte créé si ok, false si erreur
*
*  implémentation : l'appel à cette fonction suppose que l'appelant a vérifier que le compte n'existe pas déjà
*  nom et chemin pas déjà utilisés
*
*/
function creeDossierLocal(libelle, chemin){

  try{

    PacomeTrace("creeDossierLocal libelle:"+libelle+" - chemin:"+chemin);

    //v3.1T2 - identifiant unique
    let libid=encodeURIComponent(libelle);
    // Ajout de SRV pour être sûr d'avoir des lettres dans ident.
    let ident=PacomeGetUniqueIdLocal("srv"+libid);

    let accman=MailServices.accounts;
    let srv=accman.createIncomingServer("nobody",  ident, "none");

    let fichier=Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    fichier.initWithPath(chemin);

    srv.localPath=fichier;
    srv.prettyName=libelle;

    let account=accman.createAccount();
    account.incomingServer=srv;

    //spamLevel "mail.server.default.spamLevel"
    let prefBranch=Services.prefs.getBranch("mail.server.");
    let spamLevel=prefBranch.getIntPref("default.spamLevel");
    let pref=srv.key+".spamLevel";
    prefBranch.setIntPref(pref, spamLevel);

    //3965
    prefBranch.setBoolPref(srv.key+".canDelete", true);

    Services.prefs.savePrefFile(null);

    return account;
  }
  catch(ex){
    PacomeAfficheMsgId2("ErreurCreationDossier",ex);
    return null;
  }
}


/*
*  calcule un identifiant de dossier local unique a partir du libelle saisi
*  v3.1T2 - permettre de réutiliser un libelle modifie par la suite
*/
function PacomeGetUniqueIdLocal(lib) {

  //liste des identifiants de serveur
  let liste=[];
  let serveurs=MailServices.accounts.allServers;
  for (var i=0;i<serveurs.length;i++) {
    let srv=serveurs.queryElementAt(i, Ci.nsIMsgIncomingServer);
    PacomeTrace("PacomeGetUniqueIdLocal srv.hostName:"+srv.hostName);
    liste.push(srv.hostName);
  }
  //calcul id
  let ident0=lib;
  let ident=ident0;
  let suffix=0;
  const nb=liste.length;
  for (var i=0;i<nb;i++){
    if (liste[i]==ident){
      PacomeTrace("PacomeGetUniqueIdLocal identifiant existant:"+ident);
      suffix++;
      ident=ident0+suffix;
      i=0;
    }
  }

  return ident;
}



/*
*  test si un répertoire est valide pour créer un dossier local
*
*  @param rep instance nsIFile
*
*  @return true si valid, sinon false
*
*  implémentation : true si vide ou contient un ou plus ficher .msf
*  v2.4: correctif pas de parcours récursif, le répertoire testé doit être vide ou comporter au moins 1 msf
*/
function ValidRepLocal(rep){

  PacomeTrace("ValidRepLocal rep:"+rep.path );

  let item=null;
  let iter=rep.directoryEntries;
  if (!iter.hasMoreElements()){
    PacomeTrace("ValidRepLocal rep vide:"+rep.path);
    return true;
  }

  while (iter.hasMoreElements()){

    item=iter.getNext();
    item=item.QueryInterface(Ci.nsIFile);

    if (item.isFile()){
      PacomeTrace("ValidRepLocal item file:"+item.path);
      bValid=false;
      let tab=item.leafName.split(".");
      if (0!=tab.length){
        if ("msf"==tab[tab.length-1]){
          PacomeTrace("ValidRepLocal item msf");
          return true;
        }
      }
    }
  }

  return false;
}
