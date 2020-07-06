
ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource:///modules/mailServices.js");
ChromeUtils.import("resource:///modules/FeedUtils.jsm");
ChromeUtils.import("resource:///modules/MailUtils.js");
ChromeUtils.import("resource:///modules/iteratorUtils.jsm");


const Ci=Components.interfaces;


// objet pour l'extraction des informations d'un compte de flux depuis le document de parametrage
// elemcompte : document de parametrage compte de flux (integre les flux)
// <compteflux libelle="Informations Mélanie2" version="4"> ...
function InfosCompteFlux(elemcompte){

  this.version=elemcompte.getAttribute("version");
  this.libelle=elemcompte.getAttribute("libelle");
  
  let elemsrv=elemcompte.getElementsByTagName("serveur");
  let srv=elemsrv[0];
  this.hostname=srv.getAttribute("hostname");
  this.type=srv.getAttribute("type");
  this.username=srv.getAttribute("userName");
    
  let elemprefs=srv.getElementsByTagName("prefs");
  this.prefs=elemprefs[0];
  
  let elemsflux=elemcompte.getElementsByTagName("listeflux");
  this.listeflux=elemsflux[0];
}

PacomeFlux.prototype={

  hostname:null,
  type:"rss",
  username:null,
  version:0,
  libelle:null,
  
  //tableau des preferences du document
  //<prefs> 
  //...
  prefs:null,
  
  //tableau des elements flux
  //<flux url=
  listeflux:null
}

// objet pour l'extraction des informations d'un flux depuis le document de parametrage
// elemflux : document de parametrage d'un flux
// <flux url="http://...
function PacomeFlux(elemflux){
  this.url=elemflux.getAttribute("url");
  this.quickMode=elemflux.getAttribute("quickMode");
  this.titre=elemflux.getAttribute("title");
  this.lien=elemflux.getAttribute("link");
  this.supprime=elemflux.getAttribute("supprime");
}

PacomeFlux.prototype=
{
  url:null,
  quickMode:null,
  titre:null,
  lien:null,

  get NomDossier(){
    return this.titre||this.url;
  }
}


/**
*  elemcompteflux : élément <compteflux>
*  return 0: compte a jour, 1 compte créé, -1 erreur
*/
function ParamCompteFlux(elemcompteflux){

  try{

    let res=-1;
    
    let infoscompte=new InfosCompteFlux(elemcompteflux);
    
    PacomeTrace("ParamCompteFlux libelle='"+infoscompte.libelle+"' - hostname='"+infoscompte.hostname+"' - userame='"+infoscompte.username+"' type='"+infoscompte.type+"'");

    let account=PacomeRechCompteFlux(infoscompte.libelle);

    if (null==account){

      PacomeTrace("ParamCompteFlux creation compte flux");
      res=pacomeCreeCompteFlux(infoscompte);
      if (0==res) res=1;

    } else {

      PacomeTrace("ParamCompteFlux mise a jour compte flux");
      res=pacomeMajCompteFlux(account, infoscompte);
    }

    PacomeTrace("ParamCompteFlux resultat res="+res);
    return res;
  }
  catch(ex){
    PacomeTrace("ParamCompteFlux exception:"+ex);
    return -1;
  }

  return 0;
}

/* Suppression d'un compte de flux
  return 1 compte supprimé, -1 erreur
*/
function pacomeSupCompteFlux(libelle){

  let account=PacomeRechCompteFlux(libelle);

  if (null!=account){

    try{

      PacomeTrace("pacomeSupCompteFlux suppression compte flux");
      MailServices.accounts.removeAccount(account);
      return 1;

    } catch(ex){
      return -1;
    }
  }

  return -1;
}

// infoscompte : instance InfosCompteFlux
function pacomeCreeCompteFlux(infoscompte){

  PacomeTrace("pacomeCreeCompteFlux");

  let serveur=MailServices.accounts.createIncomingServer(infoscompte.username, infoscompte.hostname, infoscompte.type);

  let account=MailServices.accounts.createAccount();
  account.incomingServer=serveur;

  //préférences
  let prefix="mail.server."+serveur.key+".";
  PacomeSetPrefs(infoscompte.prefs, prefix);

  //ajouter les flux
  let res=pacomeTraiteListeFlux(serveur, infoscompte.listeflux);

  return 0;
}

// infoscompte : instance InfosCompteFlux
function pacomeMajCompteFlux(account, infoscompte){

  let serveur=account.incomingServer;

  //préférences
  let prefix="mail.server."+serveur.key+".";
  PacomeSetPrefs(infoscompte.prefs, prefix);

  //version pacome
  let cle=account.incomingServer.key;
  let pref="mail.server."+cle+".pacome.version";
  Services.prefs.setCharPref(pref, infoscompte.version);

  //mise à jour des flux
  let res=pacomeTraiteListeFlux(serveur, infoscompte.listeflux);

  return 0;
}

// elemsflux : elements flux du document de parametrage
function pacomeTraiteListeFlux(serveur, elemsflux){

  PacomeTrace("pacomeTraiteListeFlux serveur:"+serveur.hostName);
  let listeflux=elemsflux.getElementsByTagName("flux");
  let nbflux=listeflux.length;

  for (var i=0;i<nbflux;i++){

    let infosflux=listeflux[i];
    let flux=new PacomeFlux(infosflux);
    PacomeTrace("pacomeTraiteListeFlux flux url:"+flux.url);

    //suppression
    let bsup=flux.supprime;
    //tester si existe
    let bexist=FeedUtils.feedAlreadyExists(flux.url, serveur);

    if (bsup && bexist){
      //supprimer
      PacomeTrace("pacomeTraiteListeFlux suppression flux.");
      try{
        pacomeSupprimeFlux(serveur, flux);
      } catch(ex){
        PacomeTrace("pacomeTraiteListeFlux exception suppression flux."+ex);
      }
      continue;
    }
    
    if (bsup){
      //ignorer
      continue;
    }

    if (!bexist){
      //ajouter
      PacomeTrace("pacomeTraiteListeFlux ajout flux.");
      let res=pacomeAjoutFlux(serveur, flux);
      if (0!=res){
        return res;
      }
      continue;
    }

    //mettre à jour
    PacomeTrace("pacomeTraiteListeFlux mise a jour flux.");
    let res=pacomeMajFlux(serveur, flux);
    if (-1==res){
      return res;
    }
  }

  return 0;
}


function pacomeDossierFlux(serveur, flux){

  let nom=FeedUtils.strings.GetStringFromName("ImportFeedsNew");
  let nomdos=FeedUtils.getSanitizedFolderName(serveur.rootMsgFolder,
                                              flux.titre,
                                              nom,
                                              true);
  PacomeTrace("pacomeDossierFlux nom du dossier:"+nomdos);
  let dossier=serveur.rootMsgFolder.QueryInterface(Ci.nsIMsgLocalMailFolder)
                     .createLocalSubfolder(nomdos);
  return dossier;
}


function pacomeAjoutFlux(serveur, flux){

  let dossier=pacomeDossierFlux(serveur, flux);
  if (null==dossier){
    return -1;
  }
  PacomeTrace("pacomeAjoutFlux dossier.URI:"+dossier.URI);

  try{

    PacomeTrace("pacomeAjoutFlux addFeed");
    let feed={
      url:flux.url,
      folder:dossier,
      title:flux.titre,
      server:serveur
    };

    FeedUtils.addFeed(feed);

  } catch(ex){
    PacomeTrace("pacomeAjoutFlux exception:"+ex);
    return -1;
  }

  return 0;
}


function pacomeMajFlux(serveur, flux){

  let feed=new Feed(flux.url, serveur.rootMsgFolder);

  let res=0;
  if (feed.quickMode!=flux.quickMode){
    feed.quickMode=flux.quickMode;
    res=1;
  }
  if (feed.title!=flux.titre){
    feed.title=flux.titre;
    res=1;
  }
  if (feed.link!=flux.lien){
    feed.link=flux.lien;
    res=1;
  }

  return res;
}

function pacomeSupprimeFlux(serveur, flux){

  let itemResource=FeedUtils.rdf.GetResource(flux.url);
  let ds=FeedUtils.getSubscriptionsDS(serveur);
  let dossier=ds.GetTarget(itemResource, FeedUtils.FZ_DESTFOLDER, true);
 
  let dossierURI=dossier.QueryInterface(Ci.nsIRDFResource).Value;
  dossier=MailUtils.getFolderForURI(dossierURI);
    
  FeedUtils.deleteFeed(itemResource,
                        serveur,
                        serveur.rootFolder);
                        
  let tab=toXPCOMArray([dossier], Ci.nsIMutableArray);
  dossier.parent.deleteSubFolders(tab, null);

  return 0;
}


/* ajoute un flux inutilisé dans la liste */
function PacomeAjoutFluxIgnore(libelle){

  if (Services.prefs.prefHasUserValue(PACOME_IGNORE_FLUX)){

    let ignorelibs=Services.prefs.getStringPref(PACOME_IGNORE_FLUX);
    PacomeTrace("PacomeAjoutFluxIgnore ignorelibs:"+ignorelibs);

    if (""!=ignorelibs){
      PacomeTrace("PacomeAjoutFluxIgnore "+PACOME_IGNORE_FLUX+": "+ignorelibs);
      let libs=ignorelibs.split(PACOME_IGNORE_FLUX_SEP);
      let bpresent=false;
      for (var i=0;i<libs.length;i++){
        if (libs[i]==libelle){
          bpresent=true;
          break;
        }
      }
      if (!bpresent){
        PacomeTrace("PacomeAjoutBoiteIgnore ajout:"+libelle);
        if (0!=ignorelibs.length)
          ignorelibs+=PACOME_IGNORE_FLUX_SEP;
        ignorelibs+=libelle;

        Services.prefs.setStringPref(PACOME_IGNORE_FLUX, ignorelibs);
      }
      return;
    }
  }

  Services.prefs.setStringPref(PACOME_IGNORE_FLUX, libelle);
}

/* retire un flux  de la liste des inutilisés*/
function PacomeSupFluxIgnore(libelle){

  if (!Services.prefs.prefHasUserValue(PACOME_IGNORE_FLUX)) return;
  let ignorelibs=Services.prefs.getStringPref(PACOME_IGNORE_FLUX);
  let libs=ignorelibs.split(PACOME_IGNORE_FLUX_SEP);
  ignorelibs="";
  for (var i=0;i<libs.length;i++){
    if (libs[i]!=libelle){
      if (0!=i) ignorelibs+=PACOME_IGNORE_FLUX_SEP;
      ignorelibs+=libs[i];
    } else{
      PacomeTrace("PacomeSupBoiteIgnore retire:"+libelle);
    }
  }

  Services.prefs.setStringPref(PACOME_IGNORE_FLUX, ignorelibs);
}


/* retourne état d'un compte de flux
  -1 si erreur, sinon constantes etat
*/
function PacomeEtatCompteFlux(libelle){

  try{

    //parcours des comptes
    let nbacc=MailServices.accounts.accounts.length;
    for (var j=0;j<nbacc;j++){
      let compte=MailServices.accounts.accounts.queryElementAt(j,Components.interfaces.nsIMsgAccount);
      if (null==compte || null==compte.incomingServer) continue;

      let prettyName=compte.incomingServer.prettyName;

      if (libelle==prettyName && "rss"==compte.incomingServer.type){
        let cfg=compte.incomingServer.getCharValue("pacome.confid");
        if (null!=cfg && "flux"==cfg){
          PacomeTrace("PacomeEtatCompteFlux compte flux existe");
          return PACOME_ETAT_PARAM;
        }
      }
    }

    //flux non utilisés
    if (Services.prefs.prefHasUserValue(PACOME_IGNORE_FLUX)){

      let ignoreflux=Services.prefs.getStringPref(PACOME_IGNORE_FLUX);
      if (""!=ignoreflux){
        PacomeTrace("PacomeEtatCompteFlux "+PACOME_IGNORE_FLUX+": "+ignoreflux);
        let flux=ignoreflux.split(PACOME_IGNORE_FLUX_SEP);
        for (var i=0;i<flux.length;i++){
          if (libelle==flux[i]){
            PacomeTrace("PacomeEtatCompteFlux flux non utilise");
            return PACOME_ETAT_IGNORE;
          }
        }
      }
    }

    return PACOME_ETAT_ABSENT;
  }
  catch(ex){
    PacomeTrace("Exception PacomeEtatCompteFlux"+ex);
    return -1;
  }
}


/* recherche d'un compte de flux pacome */
function PacomeRechCompteFlux(libelle){

  try{

    //parcours des comptes
    let nbacc=MailServices.accounts.accounts.length;
    for (var j=0;j<nbacc;j++){
      let compte=MailServices.accounts.accounts.queryElementAt(j,Components.interfaces.nsIMsgAccount);
      if (null==compte || null==compte.incomingServer) continue;

      let prettyName=compte.incomingServer.prettyName;

      if (libelle==prettyName && "rss"==compte.incomingServer.type){
        let cfg=compte.incomingServer.getCharValue("pacome.confid");
        if (null!=cfg && "flux"==cfg){
          PacomeTrace("PacomeRechCompteFlux compte flux existe");
          return compte;
        }
      }
    }
  } catch(ex){
    PacomeTrace("PacomeRechCompteFlux exception:"+ex);

  }
  return null;
}
