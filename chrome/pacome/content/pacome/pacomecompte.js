
ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource:///modules/MailUtils.js");
ChromeUtils.import("resource:///modules/mailServices.js");
ChromeUtils.import("resource:///modules/pacomeUtils.jsm");


/* constantes des actions de parametrage */
const PACOME_ACTION_PARAM      ="param";
const PACOME_ACTION_IGNORE    ="ignore";
const PACOME_ACTION_SUPPRIME  ="supprime";
const PACOME_ACTION_PRESERVE  ="preserve";
const PACOME_ACTION_MAJ        ="maj";

/* constantes de resultat */
const PACOME_PARAM_SUCCESS="Succ\u00e8s";
const PACOME_PARAM_ERREUR="Erreur";


/* variables globales */
var gPacomeAssitVars={

  //controle saisie identifiant dans l'assistant
  ctrlSaisieUid:null,

  //tableau des identifiants de pages (depend du mode d'execution)
  pagesids:null,
  //fonctions d'initialisation des pages
  pagesinit:null,
  //fonctions boutons suivant de page
  pagesquitte:null,
  //fonctions boutons retour de page
  pagesprec:null,
  //etat boutons retour
  etatsbtprec:null,
  //etat boutons suivant
  etatsbtsuiv:null,

  //elements pages
  pages:null,
  //boutons
  btretour:null,
  btsuivant:null,
  btquitte:null,
  //elements du bandeau
  titre:null,
  texte1:null,
  texte2:null,

  //index page courante
  pagecourante:0,

  //donnees parametrage (racine -> documentElement)
  docpacomesrv:null,

  //fonction de rappel
  fncrappel:null

}


//liste des caractères valides pour l'identifiant
//v2.4: pas de majuscules
//const PACOME_FILTRE_UID=/([a-zA-Z0-9\.\-])+/g;
//const PACOME_FILTRE_UID=/([a-z0-9\.\-])+/g;
// mantis 4866
// pour validation en cours de saisie
const PACOME_FILTRE_UID=/[a-z0-9\-\.\'_]+(\@[a-z0-9\-\.]*)?/i;


/**
*  Configurations des pages de l'assistant:
* Configuration 1ere utilisation
* Configuration parametrage manuel
*
*  Paramétrage des pages:
*  PACOME_PAGES_xxx_IDS : identifiants des pages dans l'ordre d'exécution
*  PACOME_PAGES_xxx_INIT : fonctions d'initialisation des pages
*  PACOME_PAGES_xxx_QUITTE : fonctions de sortie des page sur bouton suivant
*
* Navigation et fonctions de pages:
* Bouton suivant:
*  la fonction de sortie de page est appelée pour la page courante
* la fonction d'initialisation est appelée pour la page suivant
*  Bouton retour:
*  la page courante est masquée
*  la page précédente est affichée dans son état précédent
*/

/* pages en mode 1ere utilisation (ordre d'execution) */
const PACOME_PAGES_NOUVEAU_IDS=["PageUid","PageComptes","PageCals","PageAutres","PageFin"];
//fonctions initialisation (vide si aucune)
const PACOME_PAGES_NOUVEAU_INIT=["InitPageUid()", "InitPageComptes()", "InitPageCals()", "InitPageAutres()", "InitPageFin()"];
//fonctions boutons suivant de page (vide si aucune)
const PACOME_PAGES_NOUVEAU_QUITTE=["SortiePageSaisieUid()", "PageQuitte()", "PageQuitte()","SortiePageAutres()", "SortiePageFin()"];
//etat bouton retour des pages
const PACOME_PAGES_NOUVEAU_BTPREC=[false,true,true,true,true];
//etat bouton suivant des pages
const PACOME_PAGES_NOUVEAU_BTSUIV=[true,true,true,true,true];


/* pages en mode parametrage manuel (au moins 1 compte) (ordre d'execution) */
const PACOME_PAGES_PARAM_IDS=["PageAcc","PageIdents","PageComptes","PageCals","PageAutres","PageFin"];
//fonctions initialisation (vide si aucune)
const PACOME_PAGES_PARAM_INIT=["PageInit()", "InitPageIdents()", "InitPageComptes()", "InitPageCals()", "InitPageAutres()", "InitPageFin()"];
//fonctions boutons suivant de page (vide si aucune)
const PACOME_PAGES_PARAM_QUITTE=["PageQuitte()", "SortiePageIdents()", "PageQuitte()", "PageQuitte()", "SortiePageAutres()", "SortiePageFin()"];
//etat bouton retour des pages
const PACOME_PAGES_PARAM_BTPREC=[false,true,true,true,true,true];
//etat bouton suivant des pages
const PACOME_PAGES_PARAM_BTSUIV=[true,true,true,true,true,true];


/* pages en mode assistant de mise a jour */
const PACOME_PAGES_MAJ_IDS=["PageMajComptes","PageMajCals","PageMajAutres","PageMajFin"];
//fonctions initialisation (vide si aucune)
const PACOME_PAGES_MAJ_INIT=["InitPageComptes()", "InitPageCals()", "InitPageAutres()", "InitMajPageFin()"];
//fonctions boutons suivant de page (vide si aucune)
const PACOME_PAGES_MAJ_QUITTE=["SortiePageMaj()", "SortiePageMaj()", "SortiePageMaj()", "SortiePageFin()"];
//etat bouton retour des pages
const PACOME_PAGES_MAJ_BTPREC=[false,true,true,true];
//etat bouton suivant des pages
const PACOME_PAGES_MAJ_BTSUIV=[true,true,true,true];



//ecouteur pour l'ajout de boites depuis le gestionnaire (cas deja parametre)
var gIncomingServerListener = {

  onServerLoaded: function(server) {

    if (("imap"==server.type || "pop3"==server.type) &&
        Components.interfaces.nsIMsgFolder.nsMsgBiffState_Unknown==server.biffState) {

      let msgWin=MailServices.mailSession.topmostMsgWindow;
      server.getNewMessages(server.rootMsgFolder, msgWin, null);
    }
  },
  onServerUnloaded: function(server) {},
  onServerChanged: function(server) {},

  actif:false
}


/**
*  Fonctions appelées par les pages de l'assistant
*/

//méthode d'initialisation au démarrage
function InitAssistant(){

  try{

    PacomeTrace("InitAssistant");

    gPacomeAssitVars.fncrappel=null;
    if (window.arguments && window.arguments[0].okCallback)
      gPacomeAssitVars.fncrappel=window.arguments[0].okCallback;

    gPacomeAssitVars.ctrlSaisieUid=document.getElementById("pacomeuid");

    //déterminer mode d'exécution
    let uids=PacomeListeUid();
    if (0==uids.length){
      //1ere utilisation de pacome
      PacomeTrace("InitAssistant mode 1ere utilisation");
      PacomeEcritLog(PACOME_LOGS_ASSISTANT, "initialiation en mode 1ere utilisation", "");

      gPacomeAssitVars.pagesids=PACOME_PAGES_NOUVEAU_IDS;
      gPacomeAssitVars.pagesinit=PACOME_PAGES_NOUVEAU_INIT;
      gPacomeAssitVars.pagesquitte=PACOME_PAGES_NOUVEAU_QUITTE;
      gPacomeAssitVars.etatsbtprec=PACOME_PAGES_NOUVEAU_BTPREC;
      gPacomeAssitVars.etatsbtsuiv=PACOME_PAGES_NOUVEAU_BTSUIV;

    } else{
      //Au moins 1 compte pacome
      PacomeEcritLog(PACOME_LOGS_ASSISTANT, "initialiation", "");
      PacomeTrace("InitAssistant mode parametrage manuel");

      gPacomeAssitVars.pagesids=PACOME_PAGES_PARAM_IDS;
      gPacomeAssitVars.pagesinit=PACOME_PAGES_PARAM_INIT;
      gPacomeAssitVars.pagesquitte=PACOME_PAGES_PARAM_QUITTE;
      gPacomeAssitVars.etatsbtprec=PACOME_PAGES_PARAM_BTPREC;
      gPacomeAssitVars.etatsbtsuiv=PACOME_PAGES_PARAM_BTSUIV;

      MailServices.accounts.addIncomingServerListener(gIncomingServerListener);
      gIncomingServerListener.actif=true;
    }

    //elements d'interface
    const nb=gPacomeAssitVars.pagesids.length;
    gPacomeAssitVars.pages=new Array(nb);
    for (var p=0;p<nb;p++)
      gPacomeAssitVars.pages[p]=document.getElementById(gPacomeAssitVars.pagesids[p]);
    //boutons
    gPacomeAssitVars.btretour=document.getElementById("pacome.btRetour");
    gPacomeAssitVars.btsuivant=document.getElementById("pacome.btSuivant");
    gPacomeAssitVars.btquitte=document.getElementById("pacome.btQuitter");
    //elements du bandeau
    gPacomeAssitVars.titre=document.getElementById("bandeau-titre");
    gPacomeAssitVars.texte1=document.getElementById("pacome.texte1").firstChild;
    gPacomeAssitVars.texte2=document.getElementById("pacome.texte2").firstChild;

    //afficher 1ere page
    if (null!=gPacomeAssitVars.pagesinit[0]){
      PacomeTrace("InitAssistant initialisation 1ere page");
      let fnc=gPacomeAssitVars.pagesinit[0];
      eval(fnc);
    }

  }
  catch(ex){
    PacomeAfficheMsgId2("PacomeErreurInit",ex);
    PacomeEcritLog(PACOME_LOGS_ASSISTANT, "echec initialiation", ex);
  }
}

function FermeAssistant(){

  if (gIncomingServerListener.actif)
    MailServices.accounts.removeIncomingServerListener(gIncomingServerListener);

  if (null!=gPacomeAssitVars.fncrappel)
    gPacomeAssitVars.fncrappel();
}

/* initialisation page générique */
function PageInit(){

  let page=gPacomeAssitVars.pagesids[gPacomeAssitVars.pagecourante];

  //textes
  gPacomeAssitVars.titre.value=PacomeMessageFromId(page+"Titre");
  gPacomeAssitVars.texte1.nodeValue=PacomeMessageFromId(page+"Texte1");
  gPacomeAssitVars.texte2.nodeValue=PacomeMessageFromId(page+"Texte2");

  //boutons
  if (gPacomeAssitVars.etatsbtprec[gPacomeAssitVars.pagecourante])
    gPacomeAssitVars.btretour.removeAttribute("disabled");
  else gPacomeAssitVars.btretour.setAttribute("disabled",true);
  if (gPacomeAssitVars.etatsbtsuiv[gPacomeAssitVars.pagecourante])
    gPacomeAssitVars.btsuivant.removeAttribute("disabled");
  else gPacomeAssitVars.btsuivant.setAttribute("disabled",true);

  //zone de la page
  gPacomeAssitVars.pages[gPacomeAssitVars.pagecourante].hidden=false;
}

/* fonction générique sortie de page (sur bouton suivant)
  return : true si sortie valide, sinon false et reste sur la page
 */
function PageQuitte(){

  return true;
}


//wizard simulé : bouton Retour
function btPagePrecedente(){

  if (0==gPacomeAssitVars.pagecourante)
    return;

  //masquer page courante
  gPacomeAssitVars.pages[gPacomeAssitVars.pagecourante].hidden=true;

  //afficher page precedente (etat precedent)
  gPacomeAssitVars.pagecourante--;
  let page=gPacomeAssitVars.pagesids[gPacomeAssitVars.pagecourante];
  //textes
  gPacomeAssitVars.titre.value=PacomeMessageFromId(page+"Titre");
  gPacomeAssitVars.texte1.nodeValue=PacomeMessageFromId(page+"Texte1");
  gPacomeAssitVars.texte2.nodeValue=PacomeMessageFromId(page+"Texte2");

  //boutons
  if (gPacomeAssitVars.etatsbtprec[gPacomeAssitVars.pagecourante])
    gPacomeAssitVars.btretour.removeAttribute("disabled");
  else gPacomeAssitVars.btretour.setAttribute("disabled",true);
  if (gPacomeAssitVars.etatsbtsuiv[gPacomeAssitVars.pagecourante])
    gPacomeAssitVars.btsuivant.removeAttribute("disabled");
  else gPacomeAssitVars.btsuivant.setAttribute("disabled",true);

  //zone de la page
  gPacomeAssitVars.pages[gPacomeAssitVars.pagecourante].hidden=false;
}

//wizard simulé : bouton Suivant
function btPageSuivante(){

  //sortie de page
  if (null!=gPacomeAssitVars.pagesquitte[gPacomeAssitVars.pagecourante]){

    let fnc=gPacomeAssitVars.pagesquitte[gPacomeAssitVars.pagecourante];
    let ret=eval(fnc);
    if (!ret)
      return;
  }
  //masquer page courante
  gPacomeAssitVars.pages[gPacomeAssitVars.pagecourante].hidden=true;

  //page suivante
  if (gPacomeAssitVars.pagecourante+1==gPacomeAssitVars.pagesids.length){
    return;
  }
  gPacomeAssitVars.pagecourante++;

  if (null!=gPacomeAssitVars.pagesinit[gPacomeAssitVars.pagecourante]){
    let fnc=gPacomeAssitVars.pagesinit[gPacomeAssitVars.pagecourante];
    eval(fnc);
  }
}

//bouton quitter
function btQuitter(){

  if (!gPacomeAssitComplete){
    let res=PacomeMsgConfirm(PacomeMessageFromId("PacomeAssistQuitter"), PacomeMessageFromId("PacomeAssistQuitteAnnule"));
    if (0==res)
      return;
    if (window.arguments)
      window.arguments[0].res=0;
    PacomeEcritLog(PACOME_LOGS_ASSISTANT, "sortie de l'assistant", "");
    window.close();
    return;
  }

  if (window.arguments)
    window.arguments[0].res=0;

  window.close();
}

function PacomeRedemarreTB(){

  PacomeEcritLog(PACOME_LOGS_ASSISTANT, "redemarrage du courrielleur", "");

  Services.startup.quit(Services.startup.eRestart|Services.startup.eForceQuit);
}

function InitPageUid(){

  PageInit();
  document.getElementById("pacomeuid").focus();
}


/* sortie page saisie identifiant */
function SortiePageSaisieUid(){

  //vérifier identifiant
  let uid=document.getElementById("pacomeuid").value;
  if (null==uid || 0==uid.length){
    PacomeAfficheMsgIdMsgId("PacomeCompteEtatErreur", "RenseignerUtil");
    return false;
  }

  //construire paramètres de requete
  let config="<pacome><identifiants><identifiant>"+uid+"</identifiant></identifiants>";

  //document de configuration
  let config2=PacomeDocumentConfig();
  if (null==config2){
    PacomeAfficheMsgIdGlobalErr("PageIdentsErrConfig");
    return false;
  }
  let pos=config2.indexOf("<comptes>");
  let cfg=config+config2.substr(pos);

  PacomeEcritLog(PACOME_LOGS_ASSISTANT, "Valeur de configuration", cfg);

  //reinitialiser document parametrage
  gPacomeAssitVars.docpacomesrv=null;

  PacomeEcritLog(PACOME_LOGS_ASSISTANT, "page de saisie d'identifiant - envoie de la requete", cfg);

  //envoyer la requete
  let ret=RequeteParametrage(cfg, ReceptionParametrage, false);

  if (false==ret){
    PacomeAfficheMsgIdGlobalErr("PacomeErreurInitListeUid");
    return false;
  }

  //on retourne false : attente reponse
  window.setCursor("wait");
  return false;
}


/* initialisation page identifiants */
function InitPageIdents(){

  //appel PageInit par defaut
  PageInit();

  //vider la liste des identifiants
  let liste=document.getElementById("pacomeuids");
  let items=liste.getElementsByTagName("listitem");
  while (null!=items && items.length){
    liste.removeChild(items[0]);
  }

  //construire la liste des identifiants
  let uids=PacomeListeUid();

  const nb=uids.length;
  for (var i=0;i<nb;i++){
    let elem=document.createElement("listitem");
    elem.setAttribute("label", uids[i]);
    liste.appendChild(elem);
  }
}

/* sortie page gestion des identifiants */
function SortiePageIdents(){

  //liste des identifiants de la page
  let uids=new Array();
  let listeui=document.getElementById("pacomeuids");
  let items=listeui.getElementsByTagName("listitem");
  if (null!=items && 0!=items.length){
    for (var i=0;i<items.length;i++)
      uids.push(items[i].getAttribute("label"));
  }
  if (0==uids.length)
    PacomeTrace("SortiePageIdents tous les identifiants ont ete retires");

  //document de configuration
  let config=PacomeDocumentConfig();
  if (null==config){
    PacomeAfficheMsgIdGlobalErr("PageIdentsErrConfig");
    return false;
  }

  //remplacer identifiants par ceux de var uids
  let idents="<identifiants>";
  for (var i=0;i<uids.length;i++)
    idents+="<identifiant>"+uids[i]+"</identifiant>";
  idents+="</identifiants>";

  let pos=config.indexOf("<comptes>");
  let cfg="<pacome>"+idents+config.substr(pos);

  //reinitialiser document parametrage
  gPacomeAssitVars.docpacomesrv=null;

  PacomeEcritLog(PACOME_LOGS_ASSISTANT, "page des identifiants - envoie de la requete", cfg);

  //envoyer la requete
  let ret=RequeteParametrage(cfg, ReceptionParametrage, false);

  if (false==ret){
    PacomeAfficheMsgIdGlobalErr("PacomeErreurInitListeUid");
    return false;
  }

  //on retourne false : attente reponse
  window.setCursor("wait");
  return false;
}


//ajouter identifiant dans la page des identifiants
function btAjoutIdent(){

  let titre=PacomeMessageFromId("PageIdentsSaisie");
  let texte=PacomeMessageFromId("PageIdentsSaisieTxt");

  let val=PacomeDlgSaisie(titre, texte, "Identifiant:", "", PACOME_FILTRE_UID);
  if (null!=val){
    //vérifier que la valeur n'est pas dans la liste
    let pacomeuids=document.getElementById("pacomeuids");
    let items=pacomeuids.getElementsByTagName("listitem");
    if (null!=items && 0!=items.length){
      for (var i=0;i<items.length;i++){
        let lib=items[i].getAttribute("label");
        if (val==lib){
          PacomeAfficheMsgId("PacomeErreurSaiseUid");
          return;
        }
      }
    }

    //ajout

    let elem=document.createElement("listitem");
    elem.setAttribute("label", val);
    pacomeuids.appendChild(elem);
  }
}

//supprimer un identifiant dans la page des identifiants
function btSupprimeIdent(){

  let idents=document.getElementById("pacomeuids");
  let uid=idents.selectedItem.label;
  if (null!=uid && ""!=uid){
    let msg=PacomeMessageFromId("PageIdentsSupprimeUid");
    let txt=PacomeMessageFromId("PageIdentsSupprimeUidTxt").replace("%1", uid);
    let res=PacomeMsgConfirm(msg, txt);
    if (0==res)
      return;
    idents.removeChild(idents.selectedItem);
    document.getElementById("btSupprimeIdent").setAttribute("disabled", true);
  }
}

//selection dans la liste des identifiants a changé
function SelectionIdents(){

  let idents=document.getElementById("pacomeuids");
  if (null==idents.selectedItem)
    return;
  let uid=idents.selectedItem.label;

  if (null!=uid && ""!=uid)
    document.getElementById("btSupprimeIdent").removeAttribute("disabled");
}


// verifie que l'uid et/ou le courriel saisi a au moins une boite dans le document
// return false si aucune
function ValideUidBoiteDoc(doc){

  let uidmail=document.getElementById("pacomeuid").value;
  uidmail=uidmail.toLowerCase();
  let msg;

  let comptes=doc.getElementsByTagName("comptes");
  if (null==comptes){
    if (0!=gPacomeCodeErreur)
      PacomeAfficheMsgIdGlobalErr("PacomeErreurPacomeUIBoite");
    else{
      msg=PacomeMessageFromId("PacomeErreurPacomeUIErruid").replace("%S", " '"+uidmail+"' ");
      PacomeAfficheMsgId2("PacomeErreurPacomeUIBoite", msg);
    }
    return false;
  }
  comptes=comptes[0].getElementsByTagName("compte");
  if (null==comptes || 0==comptes.lenght){
    if (0!=gPacomeCodeErreur)
      PacomeAfficheMsgIdGlobalErr("PacomeErreurPacomeUIBoite");
    else{
      msg=PacomeMessageFromId("PacomeErreurPacomeUIErruid").replace("%S", " '"+uidmail+"' ");
      PacomeAfficheMsgId2("PacomeErreurPacomeUIBoite", msg);
    }
    return false;
  }

  // recherche uid et/ou courriel
  const nb=comptes.length;
  let isuid=!uidmail.includes("@");
  for (var i=0;i<nb;i++){
    let boite=comptes[i];

    if (isuid){

      let baluid=GetUidReduit(boite.getAttribute("uid"));
      baluid=baluid.toLowerCase();
      if (baluid==uidmail)
        return true;

    } else {

      let ident=boite.getElementsByTagName("identite");
      if (ident){
        let prefs=ident[0].getElementsByTagName("prefs");
        if (prefs){
          prefs=prefs[0];
          const nbp=prefs.children.length;
          for (var c=0; c<nbp; c++) {
            let pref=prefs.children[c];
            if ("useremail"==pref.getAttribute("nom") &&
                uidmail==pref.getAttribute("valeur").toLowerCase()){
              return true;
            }
          }
        }
      }
    }
  }

  if (0!=gPacomeCodeErreur)
    PacomeAfficheMsgIdGlobalErr("PacomeErreurPacomeUIBoite");
  else{
    msg=PacomeMessageFromId("PacomeErreurPacomeUIErruid").replace("%S", " '"+uidmail+"' ");
    PacomeAfficheMsgId2("PacomeErreurPacomeUIBoite", msg);
  }
  return false;
}

// valide les nouveaux uid et/ou courriel dans la liste, doivent avoir au moins une boîte
// supprime les identifiants non valides de la liste
function ValideListeUidBoiteDoc(doc){

  //uid originaux
  let listeuids=PacomeListeUid();
  const nb=listeuids.length;

  //uids interface
  let nouvuids=new Array();
  let listeui=document.getElementById("pacomeuids");
  let items=listeui.getElementsByTagName("listitem");
  if (null==items || 0==items.length){
    return true;
  }
  for (var i=0;i<items.length;i++){
    let uid=items[i].getAttribute("label");
    let c=0;
    for (;c<nb;c++){
      if (uid==listeuids[c])
        break;
    }
    if (c==nb){
      nouvuids.push(uid);
    }
  }
  if (0==nouvuids.length)
    return true;

  //comptes du document
  let comptes=doc.getElementsByTagName("comptes");
  if (null==comptes){
    if (0!=gPacomeCodeErreur)
      PacomeAfficheMsgIdGlobalErr("PacomeErreurPacomeUIBoite");
    else
      PacomeAfficheMsgIdMsgId("PacomeErreurPacomeUIBoite","PacomeErreurPacomeUIErruids");
    return false;
  }
  comptes=comptes[0].getElementsByTagName("compte");
  if (null==comptes || 0==comptes.lenght){
    if (0!=gPacomeCodeErreur)
      PacomeAfficheMsgIdGlobalErr("PacomeErreurPacomeUIBoite");
    else
      PacomeAfficheMsgIdMsgId("PacomeErreurPacomeUIBoite","PacomeErreurPacomeUIErruids");
    return false;
  }

  const nbc=comptes.length;
  let erreurs=false;

  for (var i=0;i<nouvuids.length;i++){
    let uidmail=nouvuids[i].toLowerCase();
    let isuid=!uidmail.includes("@");
    let c=0;
    for (;c<nbc;c++){
      if (isuid){

        let ic=GetUidReduit(comptes[c].getAttribute("uid"));
        if (uidmail==ic.toLowerCase())
          break;

      } else{

        // verifier courriel
        let ident=comptes[c].getElementsByTagName("identite");
        if (ident){
          let prefs=ident[0].getElementsByTagName("prefs");
          if (prefs){
            prefs=prefs[0];
            const nbp=prefs.children.length;
            let p=0;
            for (; p<nbp; p++) {
              let pref=prefs.children[p];
              if ("useremail"==pref.getAttribute("nom") &&
                  uidmail==pref.getAttribute("valeur").toLowerCase()){
                break;
              }
            }
            if (p<nbp)
              break;
          }
        }
      }
    }
    if (c==nbc){
      erreurs=true;
      let msg=PacomeMessageFromId("PacomeErreurPacomeUIErruid").replace("%S", " '"+uidmail+"' ");
      PacomeAfficheMsgId2("PacomeErreurPacomeUIBoite", msg);
      //supprimer de la liste
      for (var l=0;l<items.length;l++){
        let uidui=items[l].getAttribute("label").toLowerCase();
        if (uidmail==uidui){
          listeui.removeChild(items[l]);
          break;
        }
      }
    }
  }

  return !erreurs;
}

/* fonction de rappel requete de parametrage */
function ReceptionParametrage(responseXML){

  window.setCursor("auto");

  PacomeTrace("ReceptionParametrage");

  if (null==responseXML){
    PacomeAfficheMsgIdGlobalErr("PacomeErreurDoc");
    return false;
  }

  let res=AnalyseErreurDoc(responseXML);
  if (!res){
    PacomeAfficheMsgIdGlobalErr("PacomeErreurDoc");
    return false;
  }
  //verification pacome_ui
  let pacomeui=responseXML.getElementsByTagName("pacome_ui");

  if (null==pacomeui || 0==pacomeui.length){
    PacomeAfficheMsgIdGlobalErr("PacomeErreurPacomeUI");
    return false;
  }

  //verifier si identifiant(s) valides
  if ("PageUid"==gPacomeAssitVars.pagesids[gPacomeAssitVars.pagecourante]){

    res=ValideUidBoiteDoc(responseXML);
    if (!res)
      return false;

  } else if ("PageIdents"==gPacomeAssitVars.pagesids[gPacomeAssitVars.pagecourante]){

    res=ValideListeUidBoiteDoc(responseXML);
    if (!res)
      return false;
  }

  gPacomeAssitVars.docpacomesrv=responseXML.documentElement;

  //page suivante
  //masquer page courante
  gPacomeAssitVars.pages[gPacomeAssitVars.pagecourante].hidden=true;

  //page suivante
  gPacomeAssitVars.pagecourante++;

  if (null!=gPacomeAssitVars.pagesinit[gPacomeAssitVars.pagecourante]){
    let fnc=gPacomeAssitVars.pagesinit[gPacomeAssitVars.pagecourante];
    eval(fnc);
  }
  return true;
}

/* entree page comptes - initialisation */
function InitPageComptes(){

  try{

    //appel PageInit par defaut
    PageInit();

    //vider la liste des boites
    VideListeElements("pacome-listecompte");
    // et les tooltip
    VideListeElements("tooltip_comptes");

    //construire la liste des boites
    let listecompte=document.getElementById("pacome-listecompte");
    let pacomeui=gPacomeAssitVars.docpacomesrv.getElementsByTagName("pacome_ui");
    if (null!=pacomeui && 0!=pacomeui.length){
      let comptes=pacomeui[0].getElementsByTagName("compte");
      if (null==comptes || 0==comptes.length){
        PacomeAfficheMsgIdGlobalErr("PacomeErreurPacomeUIBoite");
        return;
      }
      const nb=comptes.length;
      for (var i=0;i<nb;i++){
        let boite=comptes[i];
        if ("true"==boite.getAttribute("visible")) {
          InsertBoiteUI(listecompte, boite);
        }
      }

      return;
    }

    PacomeAfficheMsgIdGlobalErr("PacomeErreurPacomeUIBoite");

  } catch(ex){
    let msg=PacomeMessageFromId("PacomeErreurInitListeComptes");
    PacomeMsgNotif(msg, "D\u00e9tail:"+ex);
    return;
  }
}

/* cree un element label pour les boites */
function CreeElemLibelleBoite(libelle, uid){

  let elemlib=document.createElement("label");
  elemlib.setAttribute("value", libelle);
  elemlib.setAttribute("flex", "1");
  elemlib.setAttribute("crop", "end");

  let tipset=document.getElementById("tooltip_comptes");
  let elemtip=document.createElement("tooltip");
  elemtip.id="tooltip_"+uid;
  elemtip.setAttribute("crop", "none");
  elemtip.setAttribute("orient", "vertical");
  let lib=document.createElement("description");
  lib.setAttribute("value", libelle);
  elemtip.appendChild(lib);
  lib=document.createElement("description");
  lib.setAttribute("value", "Identifiant:"+uid);
  elemtip.appendChild(lib);
  tipset.appendChild(elemtip);

  elemlib.setAttribute("tooltip", elemtip.id);

  return elemlib;
}


/* ajoute une boite dans la liste des boites */
function InsertBoiteUI(elemcomptes, doccompte){

  let listitem=document.createElement("richlistitem");
  let uid=doccompte.getAttribute("uid");
  listitem.setAttribute("value", uid);
  let vis=doccompte.getAttribute("visible");
  if ("false"==vis)
    listitem.hidden=true;

  let fichierimg=doccompte.getAttribute("image");
  let img=CreeElemImgBoite(fichierimg);
  listitem.appendChild(img);

  let libelle=doccompte.getAttribute("libelle");
  let elemlib=CreeElemLibelleBoite(libelle, uid)
  listitem.appendChild(elemlib);

  InsertionOptions(listitem, doccompte);

  elemcomptes.appendChild(listitem);
}



/* insertion des options de choix */
function InsertionOptions(elemUI, docelem){

  let choix=docelem.getElementsByTagName("choix");

  let menus=document.createElement("menulist");
  menus.setAttribute("class", "pacome-choix");
  let popup=document.createElement("menupopup");

  const nb=choix.length;
  let confid="";
  for (var i=0;i<nb;i++){
    let ch=choix[i];
    let action=ch.getAttribute("action");
    if (PACOME_ACTION_PRESERVE==action && ch.hasAttribute("confid"))
      confid=ch.getAttribute("confid");
  }
  for (var i=0;i<nb;i++){
    let ch=choix[i];
    let action=ch.getAttribute("action");
    let libelle=ch.getAttribute("libelle");
    let defaut=ch.getAttribute("defaut");

    let menu=document.createElement("menuitem");
    menu.setAttribute("label", libelle);
    menu.setAttribute("action", action);
    if ("true"==defaut)
      menu.setAttribute("selected", true);
    if (ch.hasAttribute("confid")){
      let cfg=ch.getAttribute("confid");
      menu.setAttribute("value", cfg);
      if (""!=confid){
        if (confid==cfg && PACOME_ACTION_PARAM==action)
          menu.setAttribute("class", "pacome-choix-defaut");
      }
      else if (0==i && 2<nb)
        menu.setAttribute("class", "pacome-choix-defaut");
    }
    popup.appendChild(menu);
  }

  menus.appendChild(popup);
  elemUI.appendChild(menus);
}

/* entree page autre parametrages - initialisation */
function InitPageAutres(){

  try{

    //appel PageInit par defaut
    PageInit();

    //vider la liste des elements
    VideListeElements("pacome-autres");

    let listeautres=document.getElementById("pacome-autres");

    let pacomeui=gPacomeAssitVars.docpacomesrv.getElementsByTagName("pacome_ui");
    if (null!=pacomeui && 0!=pacomeui.length){
      //construire la liste des flux
      let flux=pacomeui[0].getElementsByTagName("compteflux");
      if (null!=flux && 0!=flux.length){
        const nb=flux.length;
        for (var i=0;i<nb;i++){
          let fl=flux[i];
          if ("true"==fl.getAttribute("visible"))
            InsereElementFluxUI(listeautres, fl);
        }
      }
      //construire parametrage application
      let app=pacomeui[0].getElementsByTagName("application");
      if (null!=app && 0!=app.length){
        app=app[0];
        let listitem=document.createElement("richlistitem");
        listitem.setAttribute("value", "app");
        let vis=app.getAttribute("visible");
        if ("false"==vis)
          listitem.hidden=true;

        let libelle=app.getAttribute("libelle");
        let elemlib=CreeElemLibelle(libelle);
        listitem.appendChild(elemlib);

        InsertionOptions(listitem, app);

        listeautres.appendChild(listitem);
      }

      //pacome v6 : section proxy
      let prx=pacomeui[0].getElementsByTagName("proxy");
      if (null!=prx && 0!=prx.length){
        prx=prx[0];
        let listitem=document.createElement("richlistitem");
        listitem.setAttribute("value", "prx");
        let vis=prx.getAttribute("visible");
        if ("false"==vis)
          listitem.hidden=true;

        let libelle=prx.getAttribute("libelle");
        let elemlib=CreeElemLibelle(libelle);
        listitem.appendChild(elemlib);

        InsertionOptions(listitem, prx);

        listeautres.appendChild(listitem);
      }

      return;
    }

    PacomeAfficheMsgIdGlobalErr("PacomeErreurPacomeUIAutres");

  } catch(ex){
    let msg=PacomeMessageFromId("PacomeErreurInitPage");
    PacomeMsgNotif(msg, "D\u00e9tail:"+ex);
  }
}

function InsereElementFluxUI(elemautres, docflux){

  let listitem=document.createElement("richlistitem");
  listitem.setAttribute("value", "flux");
  let vis=docflux.getAttribute("visible");
  if ("false"==vis)
    listitem.hidden=true;

  let libelle=docflux.getAttribute("libelle");
  let elemlib=CreeElemLibelle(libelle);
  listitem.appendChild(elemlib);

  InsertionOptions(listitem, docflux);

  elemautres.appendChild(listitem);
}

/* vidage liste richlistitem */
function VideListeElements(idlist){

  let liste=document.getElementById(idlist);

  //childNodes
  if (null==liste)
    return;
  while (null!=liste.childNodes && liste.childNodes.length){
    liste.removeChild(liste.childNodes[0]);
  }
}

/* cree un element label pour les autres elements */
function CreeElemLibelle(libelle){

  let elemlib=document.createElement("label");
  elemlib.setAttribute("value", libelle);
  elemlib.setAttribute("tooltiptext", libelle);
  elemlib.setAttribute("flex", "1");
  elemlib.setAttribute("crop", "end");
  return elemlib;
}

/* retourne la sélection d'un élément richlistitem
  sous forme d'un tableau avec "uid", "action", "libelle", "confid" et "libmenu"
*/
function GetInfosElemList(richlistitem){

  let infos=new Array();
  infos["uid"]=richlistitem.value;
  infos["libelle"]=GetLibelleRichListItem(richlistitem);
  infos["image"]=GetImageRichListItem(richlistitem);

  let menus=richlistitem.getElementsByTagName("menulist");
  let menu=menus[0].selectedItem;
  if (null==menu)
    return null;

  infos["action"]=menu.getAttribute("action");
  infos["confid"]=menu.getAttribute("value");
  infos["libmenu"]=menu.getAttribute("label");

  return infos;
}

/* retourne les éléments richlistitem d'une page */
function GetPageListItems(pageid){

  let page=document.getElementById(pageid);
  if (null==page)
    return page;
  return page.getElementsByTagName("richlistitem");
}


/* sortie de la page Autres parametrages
  vérifie qu'au moins une operation de paramétrage a été sélectionnée
*/
function SortiePageAutres(){

  let uneaction=false;

  //boites a modifier
  let elems=GetPageListItems("PageComptes");
  if (null!=elems){

    for (var i=0;i<elems.length;i++){

      let elem=elems[i];
      let infos=GetInfosElemList(elem);
      if (null==infos)
        continue;

      let res=TraiteElementCompte(infos["uid"], infos["confid"], infos["action"], true);

      if (1==res) {
        uneaction=true;
        break;
      }
    }
  }

  //agendas a parametrer
  elems=GetPageListItems("PageCals");
  if (null!=elems){

    for (var i=0;i<elems.length;i++){

      let elem=elems[i];
      let infos=GetInfosElemList(elem);
      if (null==infos)
        continue;

      //infos["uid"] contient l'url de l'agenda
      let res=TraiteElementAgenda(infos["uid"], infos["action"], true);

      if (1==res) {
        uneaction=true;
        break;
      }
    }
  }

  //autres a modifier
  if (!uneaction){
    elems=GetPageListItems("PageAutres");
    if (null!=elems){

      for (var i=0;i<elems.length;i++){

        let res=0;
        let elem=elems[i];
        let infos=GetInfosElemList(elem);
        if (null==infos)
          continue;

        if ("flux"==infos["confid"]){

          let res=TraiteElementFlux(infos["libelle"], infos["confid"], infos["action"], true);

          if (1==res) {
            uneaction=true;
            break;
          }

        } else if (PACOME_ACTION_PARAM==infos["action"]||
                PACOME_ACTION_MAJ==infos["action"]) {

          uneaction=true;
          break;
        }
      }
    }
  }

  if (!uneaction){
    //PacomeAucuneAction
    PacomeAfficheMsgIdMsgId("PageFinTitre", "PacomeAucuneAction");
    return false;
  }

  return true;
}


/* initialisation page de fin */
function InitPageFin(){

  //appel PageInit par defaut
  PageInit();

  //vider la liste des elements
  VideListeElements("pacomepar-liste");

  let listeui=document.getElementById("pacomepar-liste");

  //boites a modifier
  let elems=GetPageListItems("PageComptes");
  if (null!=elems){

    for (var i=0;i<elems.length;i++){

      let elem=elems[i];
      let infos=GetInfosElemList(elem);
      if (null==infos)
        continue;

      let res=TraiteElementCompte(infos["uid"], infos["confid"], infos["action"], true);

      if (-1==res)
        InsertInfosPageFin(listeui, infos["libelle"], infos["image"], "Erreur!");
      else if (1==res)
        InsertInfosPageFin(listeui, infos["libelle"], infos["image"], infos["libmenu"]);
    }
  }

  //agendas a modifier
  elems=GetPageListItems("PageCals");
  if (null!=elems){

    for (var i=0;i<elems.length;i++){

      let elem=elems[i];
      let infos=GetInfosElemList(elem);
      if (null==infos)
        continue;

      //infos["uid"] contient l'url de l'agenda
      let res=TraiteElementAgenda(infos["uid"], infos["action"], true);

      if (-1==res)
        InsertInfosPageFin(listeui, infos["libelle"], infos["image"], "Erreur!");
      else if (1==res)
        InsertInfosPageFin(listeui, infos["libelle"], infos["image"], infos["libmenu"]);
    }
  }

  //autres a modifier
  elems=GetPageListItems("PageAutres");
  if (null!=elems){

    for (var i=0;i<elems.length;i++){

      let res=0;
      let elem=elems[i];
      let infos=GetInfosElemList(elem);
      if (null==infos)
        continue;

      if ("flux"==infos["confid"]){

        let res=TraiteElementFlux(infos["libelle"], infos["confid"], infos["action"], true);

        if (-1==res)
          InsertInfosPageFin(listeui, infos["libelle"], infos["image"], "Erreur!");
        else if (1==res)
          InsertInfosPageFin(listeui, infos["libelle"], infos["image"], infos["libmenu"]);

      } else if (PACOME_ACTION_PARAM==infos["action"]||
              PACOME_ACTION_MAJ==infos["action"]) {

        InsertInfosPageFin(listeui, infos["libelle"], infos["image"], infos["libmenu"]);
      }
    }
  }
}

function InsertInfosPageFin(liste, libelle, image, action){

  let listitem=document.createElement("richlistitem");

  let img=CreeElemImgBoite(image);
  listitem.appendChild(img);

  let elemlib=document.createElement("label");
  elemlib.setAttribute("value", libelle);
  elemlib.setAttribute("tooltiptext", libelle);
  elemlib.setAttribute("flex", "1");
  elemlib.setAttribute("crop", "end");
  listitem.appendChild(elemlib);

  let elemres=document.createElement("label");
  elemres.setAttribute("value", action);
  listitem.appendChild(elemres);

  liste.appendChild(listitem);
}


/* sortie page de fin -> parametrages */
function SortiePageFin(){

  //v3.1T4
  window.setCursor("wait");
  gPacomeAssitVars.btretour.setAttribute("disabled",true);
  gPacomeAssitVars.btsuivant.setAttribute("disabled",true);

  //tableau des resultats [libelle]=PACOME_PARAM_SUCCESS|PACOME_PARAM_ERREUR
  let tbl_results=new Array();
  let tbl_results_p=new Array();

  //identifiants des pages (fonction commune assistant parametrage/mise à jour)
  let pagecompteid="";
  let pageautresid="";
  let pagecalsid="";
  if ("PageMajComptes"==gPacomeAssitVars.pagesids[0] ||
      "PageMajAutres"==gPacomeAssitVars.pagesids[0] ||
      "PageMajCals"==gPacomeAssitVars.pagesids[0]){
    pagecompteid="PageMajComptes";
    pageautresid="PageMajAutres";
    pagecalsid="PageMajCals";
  } else{
    pagecompteid="PageComptes";
    pageautresid="PageAutres";
    pagecalsid="PageCals";
  }

  //operations de parametrage application et proxy
  let elemsautres=GetPageListItems(pageautresid);
  if (null!=elemsautres){

    for (var i=0;i<elemsautres.length;i++){

      let res=0;
      let elem=elemsautres[i];
      let infos=GetInfosElemList(elem);
      if (null==infos) {
        PacomeTrace("SortiePageFin autres parametrages erreur d'infos pour:"+elem.value);
        continue;
      }

      //application
      if ("app"==infos["confid"] &&
          (PACOME_ACTION_PARAM==infos["action"]||
          PACOME_ACTION_MAJ==infos["action"])) {

        PacomeEcritLog(PACOME_LOGS_ASSISTANT, "parametrage du courrielleur", "");

        let res=ParamAppli(gPacomeAssitVars.docpacomesrv);

        PacomeEcritLog(PACOME_LOGS_ASSISTANT, "resultat parametrage du courrielleur 1=succes, -1=erreur, 0 pas de traitement", res);

        if (-1==res){

          let results=new Object();
          results.libelle=infos["libelle"];
          results.image=infos["image"];
          results.action=infos["action"];
          results.statut=PACOME_PARAM_ERREUR;
          tbl_results_p.push(results);

          //PacomeErreurParamApp
          if (0!=gPacomeCodeErreur)
            PacomeAfficheMsgIdGlobalErr("PacomeErreurParamApp");
          else
            PacomeAfficheMsgId("PacomeErreurParamApp");

        } else{

          let results=new Object();
          results.libelle=infos["libelle"];
          results.image=infos["image"];
          results.action=infos["action"];
          results.statut=PACOME_PARAM_SUCCESS;
          tbl_results_p.push(results);
        }
      }
      //v6 : parametrage proxy
      else if ("prx"==infos["confid"]) {

        if (PACOME_ACTION_PARAM==infos["action"] ||
                PACOME_ACTION_MAJ==infos["action"]) {

          PacomeEcritLog(PACOME_LOGS_ASSISTANT, "parametrage du proxy", "");

          let res=ParamProxy(gPacomeAssitVars.docpacomesrv);

          PacomeEcritLog(PACOME_LOGS_ASSISTANT, "resultat parametrage du proxy 1=succes, -1=erreur, 0 pas de traitement", res);

          if (-1==res){

            let results=new Object();
            results.libelle=infos["libelle"];
            results.image=infos["image"];
            results.action=infos["action"];
            results.statut=PACOME_PARAM_ERREUR;
            tbl_results_p.push(results);

            if (0!=gPacomeCodeErreur)
              PacomeAfficheMsgIdGlobalErr("PacomeErreurParamPrx");
            else
              PacomeAfficheMsgId("PacomeErreurParamPrx");

          } else{

            let results=new Object();
            results.libelle=infos["libelle"];
            results.image=infos["image"];
            results.action=infos["action"];
            results.statut=PACOME_PARAM_SUCCESS;
            tbl_results_p.push(results);
          }
        } else if (PACOME_ACTION_PRESERVE==infos["action"]) {
          //mettre à jour numéro de version sans parametrer
          PacomeEcritLog(PACOME_LOGS_ASSISTANT, "Mise a jour du numero de version du proxy sans parametrage", "");
          MajVersionProxy(gPacomeAssitVars.docpacomesrv);
        }
      }
    }
    //sauvegarde préférence
    Services.prefs.savePrefFile(null);
  }

  //operations de parametrage des boites
  let bredemarre=false;

  let elems=GetPageListItems(pagecompteid);
  if (null!=elems){
    for (var i=0;i<elems.length;i++){

      let res=0;
      let elem=elems[i];
      let infos=GetInfosElemList(elem);
      if (null==infos) {
        PacomeTrace("SortiePageFin parametrage des boites erreur d'infos pour:"+elem.value);
        continue;
      }

      PacomeTrace("SortiePageFin Traitement du compte uid:"+infos["uid"]+" - confid:"+infos["confid"]+" - action:"+infos["action"]);

      PacomeEcritLog(PACOME_LOGS_ASSISTANT, "parametrage d'une boite", "uid:'"+infos["uid"]+
                    "' - confid:'"+infos["confid"]+"' - action:'"+infos["action"]+"'");

      res=TraiteElementCompte(infos["uid"], infos["confid"], infos["action"], false);

      PacomeEcritLog(PACOME_LOGS_ASSISTANT, "resultat parametrage d'une boite 1=succes, -1=erreur, 0 pas de traitement", res);

      if (null!=infos["libelle"] && ""!=infos["libelle"]){//element visible

        if (-1==res){

          let results=new Object();
          results.libelle=infos["libelle"];
          results.image=infos["image"];
          results.action=infos["action"];
          results.statut=PACOME_PARAM_ERREUR;
          tbl_results.push(results);

        } else if (1==res){

          let results=new Object();
          results.libelle=infos["libelle"];
          results.image=infos["image"];
          results.statut=PACOME_PARAM_SUCCESS;
          results.action=infos["action"];
          results.uid=infos["uid"];
          results.confid=infos["confid"];
          tbl_results.push(results);
        }
      }
    }
  }

  //operations de parametrage des agendas
  elems=GetPageListItems(pagecalsid);
  let bAffAg=true;
  if (null!=elems){
    for (var i=0;i<elems.length;i++){

      let res=0;
      let elem=elems[i];
      let infos=GetInfosElemList(elem);
      if (null==infos) {
        PacomeTrace("SortiePageFin parametrage des agendas erreur d'infos pour:"+elem.value);
        continue;
      }

      PacomeTrace("SortiePageFin Traitement de l'agenda url:"+infos["uid"]+" - action:"+infos["action"]);

      PacomeEcritLog(PACOME_LOGS_ASSISTANT, "parametrage d'un agenda", "url:'"+infos["uid"]+"' - action:'"+infos["action"]+"'");

      if (bAffAg && PACOME_ACTION_PARAM==infos["action"]){
        PacomeAffAg();
        bAffAg=false;
      }

      //infos["uid"] contient l'url de l'agenda
      res=TraiteElementAgenda(infos["uid"], infos["action"], false);

      PacomeEcritLog(PACOME_LOGS_ASSISTANT, "resultat parametrage d'un agenda 1=succes, -1=erreur, 0 pas de traitement", res);

      if (null!=infos["libelle"] && ""!=infos["libelle"]){//element visible

        if (-1==res){

          let results=new Object();
          results.libelle=infos["libelle"];
          results.image=infos["image"];
          results.action=infos["action"];
          results.statut=PACOME_PARAM_ERREUR;
          tbl_results.push(results);

        } else if (1==res){

          let results=new Object();
          results.libelle=infos["libelle"];
          results.image=infos["image"];
          results.action=infos["action"];
          results.statut=PACOME_PARAM_SUCCESS;
          tbl_results.push(results);
        }
      }
    }
  }

  //operations de parametrage des flux
  if (null!=elemsautres){

    for (var i=0;i<elemsautres.length;i++){

      let res=0;
      let elem=elemsautres[i];
      let infos=GetInfosElemList(elem);
      if (null==infos) {
        PacomeTrace("SortiePageFin autres parametrages erreur d'infos pour:"+elem.value);
        continue;
      }

      if ("flux"==infos["confid"]){

        PacomeEcritLog(PACOME_LOGS_ASSISTANT, "parametrage d'un flux", "libelle:'"+infos["libelle"]+
                    "' - confid:'"+infos["confid"]+"' - action:'"+infos["action"]+"'");

        let res=TraiteElementFlux(infos["libelle"], infos["confid"], infos["action"], false);

        PacomeEcritLog(PACOME_LOGS_ASSISTANT, "resultat parametrage d'un flux 1=succes, -1=erreur, 0 pas de traitement", res);

        if (null!=infos["libelle"] && ""!=infos["libelle"]){//element visible

          if (-1==res){

            let results=new Object();
            results.libelle=infos["libelle"];
            results.image=infos["image"];
            results.action=infos["action"];
            results.statut=PACOME_PARAM_ERREUR;
            tbl_results.push(results);

          } else if (1==res){

            let results=new Object();
            results.libelle=infos["libelle"];
            results.image=infos["image"];
            results.action=infos["action"];
            results.statut=PACOME_PARAM_SUCCESS;
            tbl_results.push(results);
          }
        }
      }
    }
  }

  //traitement des elements non visibles
  PacomeMAJSilence(gPacomeAssitVars.docpacomesrv);

  //v3.3 - traiter les categories horde
  pacomeCatsTraiteDoc(gPacomeAssitVars.docpacomesrv);

  window.setCursor("auto");

  //sauvegarde préférence
  Services.prefs.savePrefFile(null);

  // detection migration pop => imap
  if (detectMigrePopImap(tbl_results)){
    PacomeTrace("SortiePageFin detection migration pop => imap");
    // completer la migration
    let uids=cm2UidPopImap(tbl_results);
    let migreok=cm2MigrePopImap(uids);
    if (0<migreok)
      bredemarre=true;
  }

  //v6 - pas de redemarrage
  //bredemarre=false;
  //affichage resultats
  PacomeAfficheResultats(tbl_results.concat(tbl_results_p), bredemarre);

  if (bredemarre)
    PacomeRedemarreTB();

  if (window.arguments)
    window.arguments[0].res=1;

  window.close();
}



function GetLibelleRichListItem(richlistitem){

  let lib=richlistitem.getElementsByTagName("label");
  if (null==lib || 0==lib.length)
    return "";
  return lib[0].value;
}

function GetImageRichListItem(richlistitem){

  let img=richlistitem.getElementsByTagName("image");
  if (null==img || 0==img.length)
    return "chrome://pacome/content/img/blank.gif";
  return img[0].getAttribute("src");
}


/* traite l'action sur un element boite
  simul: si true n'effectue pas les opérations en réel
  return -1 si erreur, 0 si ne nécessite pas de traitement, 1 si succès
*/
function TraiteElementCompte(uid, confid, action, simul){

  //etat initial
  let etat=PacomeEtatCompteBoite(uid, confid);

  let elemcompte=null;
  if (null!=confid && ""!=confid)
    elemcompte=ExtraitElementCompte(uid, confid);
  if (null==elemcompte &&
      (PACOME_ACTION_SUPPRIME!=action) &&
      (!(PACOME_ETAT_IGNORE==etat || PACOME_ETAT_ABSENT==etat))){
    PacomeTrace("TraiteElementCompte erreur de compte uid:"+uid+" - confid:"+confid);
    return -1;
  }

  //creation et/ou parametrage
  if (PACOME_ACTION_PARAM==action){

    if (simul)
      return 1;

    let res=ParamComptePacome(elemcompte);
    if (-1==res){
      PacomeAfficheMsgIdGlobalErr("PacomeCompteEtatErreur");
      return -1;
    }
    if (PACOME_ETAT_IGNORE==etat){
      PacomeSupBoiteIgnore(uid);
    }
    return 1;
  }

  //mise a jour existant
  else if (PACOME_ACTION_MAJ==action){

    if (simul)
      return 1;

    let res=ParamComptePacome(elemcompte);
    if (-1==res){
      PacomeAfficheMsgIdGlobalErr("PacomeCompteEtatErreur");
      return -1;
    }
    return 1;
  }

  //non utilisée
  else if (PACOME_ACTION_IGNORE==action){

    if (PACOME_ETAT_IGNORE==etat)
      return 0;

    if (simul)
      return 1;

    if (PACOME_ETAT_PARAM==etat){
      let res=PacomeSupprimeBoite(uid, confid);
      if (-1==res){
        PacomeAfficheMsgIdGlobalErr("PacomeCompteEtatErreur");
        return -1;
      }
    }
    PacomeAjoutBoiteIgnore(uid);
    return 1;
  }

  //suppression
  else if (PACOME_ACTION_SUPPRIME==action){

    if (simul && (PACOME_ETAT_ABSENT==etat || PACOME_ETAT_IGNORE==etat))
      return 0;
    if (simul)
      return 1;

    if (PACOME_ETAT_PARAM==etat){
      let res=PacomeSupprimeBoite(uid, confid);
      if (-1==res){
        PacomeAfficheMsgIdGlobalErr("PacomeCompteEtatErreur");
        return -1;
      }
      return 1;
    }
    if (PACOME_ETAT_IGNORE==etat){
      PacomeSupBoiteIgnore(uid);
      return 1;
    }
    return 0;
  }
  //preserve -> ne rien faire
  return 0;
}

/* traite l'action sur un element flux
  simul: si true n'effectue pas les opérations en réel
  return -1 si erreur, 0 si ne nécessite pas de traitement, 1 si succès
*/
function TraiteElementFlux(libelle, confid, action, simul){

  //etat initial
  let etat=PacomeEtatCompteFlux(libelle);

  let elemflux=null;

  if (PACOME_ACTION_SUPPRIME!=action && PACOME_ACTION_IGNORE!=action)
    elemflux=ExtraitElementFlux(libelle);

  if (null==elemflux &&
      (PACOME_ACTION_SUPPRIME!=action) &&
      (!(PACOME_ETAT_IGNORE==etat || PACOME_ETAT_ABSENT==etat))){
    PacomeTrace("TraiteElementFlux erreur de flux:"+libelle);
    return -1;
  }

  //creation et/ou parametrage
  if (PACOME_ACTION_PARAM==action){

    if (simul)
      return 1;

    let res=ParamCompteFlux(elemflux);
    if (-1==res){
      PacomeAfficheMsgIdGlobalErr("PacomeCompteEtatErreur");
      return -1;
    }
    if (PACOME_ETAT_IGNORE==etat){
      PacomeSupFluxIgnore(libelle);
    }
    return 1;
  }
  //mise a jour existant
  else if (PACOME_ACTION_MAJ==action){

    if (simul)
      return 1;

    let res=ParamCompteFlux(elemflux);
    if (-1==res){
      PacomeAfficheMsgIdGlobalErr("PacomeCompteEtatErreur");
      return -1;
    }
    return 1;
  }

  //non utilisée
  else if (PACOME_ACTION_IGNORE==action){

    if (PACOME_ETAT_IGNORE==etat)
      return 0;

    if (simul)
      return 1;

    if (PACOME_ETAT_PARAM==etat){

      let res=pacomeSupCompteFlux(libelle);
      if (-1==res){
        PacomeAfficheMsgIdGlobalErr("PacomeCompteEtatErreur");
        return -1;
      }
    }
    PacomeAjoutFluxIgnore(libelle);
    return 1;
  }

  //suppression
  else if (PACOME_ACTION_SUPPRIME==action){

    if (simul && (PACOME_ETAT_ABSENT==etat || PACOME_ETAT_IGNORE==etat))
      return 0;

    if (simul)
      return 1;

    if (PACOME_ETAT_IGNORE==etat){
      PacomeSupFluxIgnore(libelle);
      return 1;
    }

    let res=pacomeSupCompteFlux(libelle);
    if (-1==res){
      PacomeAfficheMsgIdGlobalErr("PacomeCompteEtatErreur");
      return -1;
    }
    return 1;
  }

  return 0;
}


/* extrait element compte du document de parametrage */
function ExtraitElementCompte(uid, confid){

  if (null==gPacomeAssitVars.docpacomesrv){
    PacomeTrace("ExtraitElementCompte document inexistant");
    return null;
  }

  let comptes=gPacomeAssitVars.docpacomesrv.getElementsByTagName("comptes");
  if (null==comptes || 0==comptes.length){
    PacomeTrace("ExtraitElementCompte pas d'element 'comptes'");
    return null;
  }

  comptes=comptes[0].getElementsByTagName("compte");
  if (null==comptes){
    PacomeTrace("ExtraitElementCompte aucun compte");
    return null;
  }

  for (var i=0;i<comptes.length;i++){
    let compte=comptes[i];
    let c_uid=compte.getAttribute("uid");
    let c_cfg=compte.getAttribute("confid");
    if (uid==c_uid && confid==c_cfg)
      return compte;
  }

  PacomeTrace("ExtraitElementCompte compte absent");
  return null;
}

/* extrait element flux du document de parametrage */
function ExtraitElementFlux(libelle){

  if (null==gPacomeAssitVars.docpacomesrv){
    PacomeTrace("ExtraitElementFlux document inexistant");
    return null;
  }

  let comptes_flux=gPacomeAssitVars.docpacomesrv.getElementsByTagName("comptes_flux");
  if (null==comptes_flux || 0==comptes_flux.length){
    PacomeTrace("ExtraitElementFlux pas d'element 'comptes_flux'");
    return null;
  }

  let flux=comptes_flux[0].getElementsByTagName("compteflux");
  if (null==flux){
    PacomeTrace("ExtraitElementFlux aucun flux");
    return null;
  }

  for (var i=0;i<flux.length;i++){
    let fl=flux[i];
    let lib=fl.getAttribute("libelle");
    if (libelle==lib)
      return fl;
  }

  PacomeTrace("ExtraitElementFlux flux absent");
  return null;
}





/**
*  controle la saisie de l'identifiant
*
*
*  @return true
*
*  implémentation :
*
*/
function onSaisieUid(){

  //caractères autorisés
  let str=gPacomeAssitVars.ctrlSaisieUid.value;
  if (""==str)
    return true;
  str=str.match(PACOME_FILTRE_UID);
  if (null==str) {
    gPacomeAssitVars.ctrlSaisieUid.value="";
    return false;
  }
  str=str[0];

  //v0.91 suppression .-.
  if (-1!=str.indexOf(MCE_SEP_BOITE)){
    //message utilisateur
    PacomeAfficheMsgId("PacomeSaisieUidCar");
  }
  const re = new RegExp(MCE_SEP_BOITE, "g");
  str=str.replace(re, "");
  gPacomeAssitVars.ctrlSaisieUid.value=str;

  return true;
}


/* entree page agendas - initialisation */
function InitPageCals() {

  try{

    //appel PageInit par defaut
    PageInit();

    //vider la liste des boites
    VideListeElements("pacome-listecal");
    // et les tooltip
    //VideListeElements("tooltip_comptes");

    //construire la liste des agendas
    let listecals=document.getElementById("pacome-listecal");
    let pacomeui=gPacomeAssitVars.docpacomesrv.getElementsByTagName("pacome_ui");
    if (null!=pacomeui && 0!=pacomeui.length){
      let cals=pacomeui[0].getElementsByTagName("agenda");
      if (null==cals || 0==cals.length){
        //aucun agenda -> pas une erreur
        //pas d'agenda disponible -> le signaler à l'utilisateur
        gPacomeAssitVars.texte1.nodeValue=PacomeMessageFromId("PacomeErreurListeCals");
        gPacomeAssitVars.texte2.nodeValue=PacomeMessageFromId("PacomeReponseServeur")+ExtraitDocErreurCal();
        return;
      }
      const nb=cals.length;
      for (var i=0;i<nb;i++){
        let cal=cals[i];
        //si visible
        if ("true"==cal.getAttribute("visible"))
          InsertCalUI(listecals, cal);
      }

      return;
    }

  } catch(ex){
    PacomeTrace("InitPageCals exception:"+ex);
    let msg=PacomeMessageFromId("PacomeErreurInitListeCals");
    PacomeMsgNotif(msg, "D\u00e9tail:"+ex);
    return;
  }
}

//insertion elements page agenda
function InsertCalUI(listecals, docagenda) {

  let listitem=document.createElement("richlistitem");
  let url=docagenda.getAttribute("url");
  listitem.setAttribute("value", url);
  let vis=docagenda.getAttribute("visible");
  if ("false"==vis)
    listitem.hidden=true;

  let img=CreeElemImgBoite("calendar.gif");
  listitem.appendChild(img);

  let libelle=docagenda.getAttribute("libelle");
  let elemlib=CreeElemLibelle(libelle)
  listitem.appendChild(elemlib);

  InsertionOptions(listitem, docagenda);

  listecals.appendChild(listitem);
}

/* traite l'action sur un element agenda
  simul: si true n'effectue pas les opérations en réel
  return -1 si erreur, 0 si ne nécessite pas de traitement, 1 si succès
*/
function TraiteElementAgenda(url, action, simul) {

  //etat initial
  let etat=pacomeCalEtat(url);

  let elemagenda=ExtraitElementAgenda(url);
  if (null==elemagenda &&
      (PACOME_ACTION_SUPPRIME!=action) &&
      (!(PACOME_ETAT_IGNORE==etat || PACOME_ETAT_ABSENT==etat))){
    PacomeTrace("TraiteElementAgenda erreur d'agenda url:"+url);
    return -1;
  }

  //creation et/ou parametrage
  if (PACOME_ACTION_PARAM==action){

    if (simul)
      return 1;

    let res=pacomeCalAjoutAgenda(elemagenda);
    if (-1==res){
      PacomeAfficheMsgIdGlobalErr("PacomeCompteEtatErreur");
      return -1;
    }
    if (PACOME_ETAT_IGNORE==etat){
      pacomeCalSupIgnore(elemagenda);
    }
    return 1;
  }

  //mise a jour existant
  else if (PACOME_ACTION_MAJ==action){

    if (simul)
      return 1;

    let res=pacomeCalModifAgenda(elemagenda);
    if (-1==res){
      PacomeAfficheMsgIdGlobalErr("PacomeCompteEtatErreur");
      return -1;
    }
    return 1;
  }

  //non utilisée
  else if (PACOME_ACTION_IGNORE==action){

    if (PACOME_ETAT_IGNORE==etat){
      return 0;
    }

    if (simul)
      return 1;

    if (PACOME_ETAT_PARAM==etat){
      let res=pacomeCalSupAgenda(elemagenda);
      if (-1==res){
        PacomeAfficheMsgIdGlobalErr("PacomeCompteEtatErreur");
        return -1;
      }
    }
    pacomeCalIgnore(elemagenda);
    return 1;
  }

  //suppression
  else if (PACOME_ACTION_SUPPRIME==action){

    if (simul && (PACOME_ETAT_ABSENT==etat || PACOME_ETAT_IGNORE==etat))
      return 0;
    if (simul)
      return 1;

    if (PACOME_ETAT_PARAM==etat){
      let res=pacomeCalSupAgendaUrl(url);
      if (-1==res){
        PacomeAfficheMsgIdGlobalErr("PacomeCompteEtatErreur");
        return -1;
      }
      return 1;
    }
    if (PACOME_ETAT_IGNORE==etat){
      pacomeCalSupIgnoreUL(url);
      return 1;
    }
    return 0;
  }

  //preserve -> ne rien faire
  return 0;
}


/* extrait element agenda du document de parametrage */
function ExtraitElementAgenda(url){

  if (null==gPacomeAssitVars.docpacomesrv){
    PacomeTrace("ExtraitElementAgenda document inexistant");
    return null;
  }
  let agendas=gPacomeAssitVars.docpacomesrv.getElementsByTagName("agendas");
  if (null==agendas || 0==agendas.length){
    PacomeTrace("ExtraitElementAgenda pas d'element 'agendas'");
    return null;
  }
  agendas=agendas[0].getElementsByTagName("agenda");
  if (null==agendas){
    PacomeTrace("ExtraitElementAgenda aucun agenda");
    return null;
  }
  for (var i=0;i<agendas.length;i++){
    let agenda=agendas[i];
    if (url==agenda.getAttribute("url"))
      return agenda;
  }

  PacomeTrace("ExtraitElementAgenda agenda absent");
  return null;
}


//extrait le message d'erreur du document de parametrage des agendas
function ExtraitDocErreurCal() {

  let agendas=gPacomeAssitVars.docpacomesrv.getElementsByTagName("agendas");
  if (null==agendas || 0==agendas.length){
    PacomeTrace("ExtraitDocErreurCal pas d'element 'agendas'");
    return "Aucune information pour les agendas";
  }
  let msg=agendas[0].getAttribute("msgerr");
  return msg;
}


//affichage onglet agenda
function PacomeAffAg(){

  PacomeTrace("PacomeAffAg");

  try{

    let mainWindow=Services.wm.getMostRecentWindow("mail:3pane");

    mainWindow.document.getElementById('tabmail').openTab('calendar',
              { title: mainWindow.document.getElementById('calendar-tab-button').getAttribute('tooltiptext') });
  }catch(ex){
    PacomeTrace("PacomeAffAg exception:"+ex);
  }
}


// detection migration pop => imap
// tbl_results tableau remplit dans SortiePageFin
// recherche des uid qui ont été paramétrés en imap et qui existent en pop
// retourne true si au moins une migration pop => imap
function detectMigrePopImap(tbl_results){

  let nb=tbl_results.length;
  for (var i=0;i<nb;i++){
    let result=tbl_results[i];
    if (PACOME_PARAM_SUCCESS==result.statut &&
        "param"==result.action &&
        null!=result.uid &&
        "std1"==result.confid){
      PacomeTrace("detectMigrePopImap test uid:"+result.uid);
      let allServers=MailServices.accounts.allServers;
      for (var server of fixIterator(allServers,
                                 Components.interfaces.nsIMsgIncomingServer)){
        if (server.username==result.uid &&
            "std2"==server.getCharValue("pacome.confid")){
          PacomeTrace("detectMigrePopImap migration pop => imap detectee");
          return true;
        }
      }
    }
  }
  return false;
}


// retourne un tableau d'uid migres de pop vers imap
// tbl_results tableau remplit dans SortiePageFin
function cm2UidPopImap(tbl_results){

  let uids=new Array();

  let nb=tbl_results.length;
  for (var i=0;i<nb;i++){
    let result=tbl_results[i];
    if (PACOME_PARAM_SUCCESS==result.statut &&
        "param"==result.action &&
        null!=result.uid &&
        "std1"==result.confid){
      let allServers=MailServices.accounts.allServers;
      for (var server of fixIterator(allServers,
                                 Components.interfaces.nsIMsgIncomingServer)){
        if (server.username==result.uid &&
            "std2"==server.getCharValue("pacome.confid")){
          PacomeTrace("cm2UidPopImap migration pop=>imap uid:"+result.uid);
          uids.push(result.uid);
        }
      }
    }
  }

  return uids;
}

// complete le migration de boites pop vers imap
// uids : tableau d'uid migres de pop vers imap
function cm2MigrePopImap(uids){

  let nb=uids.length;
  let migreok=0;
  for (var i=0;i<nb;i++){
    let uid=uids[i];

    let args=new Object();
    args["uid"]=uid;

    window.openDialog("chrome://pacome/content/popimap.xul", "","chrome,modal,centerscreen,titlebar,resizable=no,close=no", args);

    if (args.res)
      migreok++;
  }
  return migreok;
}
