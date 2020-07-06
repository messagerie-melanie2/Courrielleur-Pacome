
ChromeUtils.import("resource://gre/modules/Services.jsm");

var gRetourParam=null;

/* Recherche mises à jour
   retourfin : fonction optionnelle de retour en fin de parametrage
*/
function PacomeMajParam(retourfin){

  PacomeEcritLog(PACOME_LOGS_MAJ, "Demarrage processus recherche mises a jour", "");

  gRetourParam=retourfin;

  //tester si aucun compte
  let uids=PacomeListeUid();
  if (null==uids || 0==uids.length){
    PacomeTrace("PacomeMajParam aucun compte");
    if (gRetourParam)
      gRetourParam();
    return;
  }

  //document de configuration
  let config=PacomeDocumentConfig();
  if (null==config){
    PacomeTrace("PacomeMajParam erreur de lecture de configuration");
    PacomeEcritLog(PACOME_LOGS_MAJ, "erreur de lecture de configuration", "");
    if (gRetourParam)
      gRetourParam();
    return;
  }

  PacomeEcritLog(PACOME_LOGS_MAJ, "Valeur de configuration", config);

  //envoyer la requete
  let ret=RequeteParametrage(config, ReceptionMajParam, true);
  if (false==ret){
    PacomeTrace("PacomeMajParam erreur d'envoi de la requete");
  }
}

/* reception reponse parametrage de mise à jour */
function ReceptionMajParam(responseXML){

  if (null==responseXML){
    PacomeTrace("ReceptionMajParam null==responseXML");
    PacomeEcritLog(PACOME_LOGS_MAJ, "reponse serveur absente", "");
    if (gRetourParam)
      gRetourParam();
    return;
  }

  //analyser la réponse
  let res=AnalyseErreurDoc(responseXML);
  if (!res){
    PacomeTrace("ReceptionMajParam erreur de verification du document:"+gPacomeMsgErreur);
    PacomeEcritLog(PACOME_LOGS_MAJ, "erreur de verification du document", gPacomeMsgErreur);
    if (gRetourParam)
      gRetourParam();
    return;
  }

  // Mantis 4423 détecter  et enregistrer la valeur dans les preferences
  let proxy_boites=responseXML.getElementsByTagName("proxy_boites");
  if (null!=proxy_boites && 0!=proxy_boites.length){
    let infos=proxy_boites[0];
    let config=infos.innerHTML;
    if (null!=config && ""!=config){
      Services.prefs.setCharPref("pacome.comptes.proxys", config);
      PacomeEcritLog(PACOME_LOGS_MAJ, "Réception d'un document de migration", config);
      PacomeTrace("Réception d'un document de migration:"+config);
    }
  }

  //verification pacome_ui
  let pacomeui=responseXML.getElementsByTagName("pacome_ui");
  if (null==pacomeui || 0==pacomeui.length){
    PacomeTrace("ReceptionMajParam pas d'element pacome_ui");
    //v3.3 - traiter les categories horde
    pacomeCatsTraiteDoc(responseXML);
    if (gRetourParam)
      gRetourParam();
    return;
  }
  //nombre choix_ui
  let choixui=pacomeui[0].getElementsByTagName("choix_ui");
  if (null==choixui || 0==choixui.length){
    PacomeTrace("ReceptionMajParam aucune mise a jour");
    PacomeEcritLog(PACOME_LOGS_MAJ, "aucune mise a jour", "");
    //v3.3 - traiter les categories horde
    pacomeCatsTraiteDoc(responseXML);
    if (gRetourParam)
      gRetourParam();
    return;
  }

  //au moins une mise a jour visible pour l'utilisateur -> afficher l'assistant de mise à jour
  let baffiche=false;
  let comptes=pacomeui[0].getElementsByTagName("compte");
  for (var i=0;null!=comptes && i<comptes.length;i++){
    if ("true"==comptes[i].getAttribute("visible")){
      baffiche=true;
      break;
    }
  }
  if (!baffiche){
    let ag=pacomeui[0].getElementsByTagName("agenda");
    for (var i=0;null!=ag && i<ag.length;i++){
      if ("true"==ag[i].getAttribute("visible")){
        baffiche=true;
        break;
      }
    }
  }
  if (!baffiche){
    let flux=pacomeui[0].getElementsByTagName("compteflux");
    for (var i=0;null!=flux && i<flux.length;i++){
      if ("true"==flux[i].getAttribute("visible")){
        baffiche=true;
        break;
      }
    }
  }
  if (!baffiche){
    let app=pacomeui[0].getElementsByTagName("application");
    if (null!=app && 1==app.length){
      if ("true"==app[0].getAttribute("visible")){
        baffiche=true;
      }
    }
  }
  if (!baffiche){
    let prx=pacomeui[0].getElementsByTagName("proxy");
    if (null!=prx && 1==prx.length){
      if ("true"==prx[0].getAttribute("visible")){
        baffiche=true;
      }
    }
  }

  if (baffiche){
    PacomeTrace("ReceptionMajParam affichage assistant de mise a jour");
    PacomeEcritLog(PACOME_LOGS_MAJ, "affichage assistant de mise a jour", "");
    PacomeAfficheDglMaj(responseXML);
  } else {
    //v3.3 - traiter les categories horde
    pacomeCatsTraiteDoc(responseXML);
  }

  //traitement des elements non visibles
  PacomeMAJSilence(responseXML);


  if (gRetourParam)
    gRetourParam();
}



/* initialisation de l'assistant de mise à jour */
function InitDlgMaj(){

  try{

    gPacomeAssitVars.docpacomesrv=window.arguments[0].docmaj.documentElement;

  } catch(ex){
    PacomeTrace("InitDlgMaj exception initialisation document."+ex);
    PacomeEcritLog(PACOME_LOGS_MAJ, "exception initialisation document assistant", ex);
    window.close();
  }

  //déterminer quelles pages afficher
  let pacomeui=gPacomeAssitVars.docpacomesrv.getElementsByTagName("pacome_ui");
  if (null==pacomeui || 0==pacomeui.length){
    PacomeTrace("InitDlgMaj pas d'element pacome_ui");
    window.close();
  }
  pacomeui=pacomeui[0];

  let pagecompte=false;
  let comptes=pacomeui.getElementsByTagName("compte");
  if (null!=comptes && 0!=comptes.length){
    for (var i=0; i<comptes.length;i++){
      if ("true"==comptes[i].getAttribute("visible")){
        PacomeTrace("InitDlgMaj la page comptes doit etre affichee");
        pagecompte=true;
        break;
      }
    }
  }
  if (pagecompte){
    MailServices.accounts.addIncomingServerListener(gIncomingServerListener);
    gIncomingServerListener.actif=true;
  }

  let pageautres=false;
  let autres=pacomeui.getElementsByTagName("compteflux");
  if (null!=autres && 0!=autres.length){
    for (var i=0;i<autres.length;i++){
      if ("true"==autres[i].getAttribute("visible")){
        PacomeTrace("InitDlgMaj la page autres doit etre affichee");
        pageautres=true;
        break;
      }
    }
  }
  autres=pacomeui.getElementsByTagName("application");
  if (null!=autres && 0!=autres.length &&
      "true"==autres[0].getAttribute("visible")){
    PacomeTrace("InitDlgMaj la page autres doit etre affichee");
    pageautres=true;
  }

  //v6 - parametrage proxy
  autres=pacomeui.getElementsByTagName("proxy");
  if (null!=autres && 0!=autres.length &&
      "true"==autres[0].getAttribute("visible")){
    PacomeTrace("InitDlgMaj la page autres doit etre affichee");
    pageautres=true;
  }

  //agendas
  let pagecal=false;
  let agendas=pacomeui.getElementsByTagName("agenda");
  if (null!=agendas && 0!=agendas.length){
    for (var i=0;i<agendas.length;i++){
      if ("true"==agendas[i].getAttribute("visible")){
        PacomeTrace("InitDlgMaj la page agendas doit etre affichee");
        pagecal=true;
        break;
      }
    }
  }

  //initialiser les pages
  gPacomeAssitVars.pagesids=new Array();
  gPacomeAssitVars.pagesinit=new Array();
  gPacomeAssitVars.pagesquitte=new Array();
  gPacomeAssitVars.etatsbtprec=new Array();
  gPacomeAssitVars.etatsbtsuiv=new Array();
  let index=0;
  if (pagecompte){
    gPacomeAssitVars.pagesids[index]=PACOME_PAGES_MAJ_IDS[0];
    gPacomeAssitVars.pagesinit[index]=PACOME_PAGES_MAJ_INIT[0];
    gPacomeAssitVars.pagesquitte[index]=PACOME_PAGES_MAJ_QUITTE[0];
    gPacomeAssitVars.etatsbtprec[index]=PACOME_PAGES_MAJ_BTPREC[0];
    gPacomeAssitVars.etatsbtsuiv[index]=PACOME_PAGES_MAJ_BTSUIV[0];
    index++;
  }
  //agendas
  if (pagecal){
    gPacomeAssitVars.pagesids[index]=PACOME_PAGES_MAJ_IDS[1];
    gPacomeAssitVars.pagesinit[index]=PACOME_PAGES_MAJ_INIT[1];
    gPacomeAssitVars.pagesquitte[index]=PACOME_PAGES_MAJ_QUITTE[1];
    gPacomeAssitVars.etatsbtprec[index]=PACOME_PAGES_MAJ_BTPREC[1];
    gPacomeAssitVars.etatsbtsuiv[index]=PACOME_PAGES_MAJ_BTSUIV[1];
    index++;
  }
  if (pageautres){
    gPacomeAssitVars.pagesids[index]=PACOME_PAGES_MAJ_IDS[2];
    gPacomeAssitVars.pagesinit[index]=PACOME_PAGES_MAJ_INIT[2];
    gPacomeAssitVars.pagesquitte[index]=PACOME_PAGES_MAJ_QUITTE[2];
    gPacomeAssitVars.etatsbtprec[index]=PACOME_PAGES_MAJ_BTPREC[2];
    gPacomeAssitVars.etatsbtsuiv[index]=PACOME_PAGES_MAJ_BTSUIV[2];
    index++;
  }
  //page de fin
  gPacomeAssitVars.pagesids[index]=PACOME_PAGES_MAJ_IDS[3];
  gPacomeAssitVars.pagesinit[index]=PACOME_PAGES_MAJ_INIT[3];
  gPacomeAssitVars.pagesquitte[index]=PACOME_PAGES_MAJ_QUITTE[3];
  gPacomeAssitVars.etatsbtprec[index]=PACOME_PAGES_MAJ_BTPREC[3];
  gPacomeAssitVars.etatsbtsuiv[index]=PACOME_PAGES_MAJ_BTSUIV[3];

  if (!pagecompte){
    gPacomeAssitVars.etatsbtprec[0]=false;
  }

  //elements d'interface
  const nb=gPacomeAssitVars.pagesids.length;
  gPacomeAssitVars.pages=new Array(nb);
  for (var p=0;p<nb;p++){
    gPacomeAssitVars.pages[p]=document.getElementById(gPacomeAssitVars.pagesids[p]);
  }
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

    let fnc=gPacomeAssitVars.pagesinit[0];
    eval(fnc);
  }
}


/* teste les choix utilisateur: préviens si aucun mise a jour */
function SortiePageMaj(){

  //compter le nombre d'actions de mise à jour
  //si aucune demander confirmation
  let uneaction=false;

  //page comptes?
  if ("PageMajComptes"==gPacomeAssitVars.pagesids[gPacomeAssitVars.pagecourante] &&
      ("PageMajCals"==gPacomeAssitVars.pagesids[gPacomeAssitVars.pagecourante+1]||
        "PageMajAutres"==gPacomeAssitVars.pagesids[gPacomeAssitVars.pagecourante+1])){
    return true;
  }

  //page agenda
  if ("PageMajCals"==gPacomeAssitVars.pagesids[gPacomeAssitVars.pagecourante] &&
      "PageMajAutres"==gPacomeAssitVars.pagesids[gPacomeAssitVars.pagecourante+1]){
    return true;
  }

  //tests des actions dans les pages
  function TestPageAction(pageid) {

    let page=document.getElementById(pageid);
    if (null!=page){
      let elems=page.getElementsByTagName("menulist");
      if (null!=elems){
        for (var i=0;i<elems.length;i++){
          let menu=elems[i].selectedItem;
          if (null==menu) continue;
          let action=menu.getAttribute("action");
          if (PACOME_ACTION_PRESERVE!=action){

            return true;
          }
        }
      }
    }
    return false;
  }

  for (var i=0;i<gPacomeAssitVars.pagesids.length-1;i++) {

    let pageid=gPacomeAssitVars.pagesids[i];

    if (TestPageAction(pageid)) return true;
  }

  PacomeTrace("SortiePageMaj aucune mise a jour selectionnee");

  let res=PacomeMsgConfirm(PacomeMessageFromId("PageMajRefusTitre"), PacomeMessageFromId("PageMajRefusMsg"));

  if (1==res){

    //mettre à jour numéro de version sans parametrer
    PacomeEcritLog(PACOME_LOGS_ASSISTANT, "Mise a jour du numero de version du proxy sans parametrage", "");
    MajVersionProxy(gPacomeAssitVars.docpacomesrv);

    //sortie de l'assistant
    window.close();

    return true;
  }

  return false;
}


/* initilisation page de fin de l'assistant de mise à jour
  affichage des actions a réaliser
*/
function InitMajPageFin(){

  PageInit();

  //vider la liste des elements
  VideListeElements("pacomepar-liste");

  let listeui=document.getElementById("pacomepar-liste");

  //boites a modifier
  let elems=GetPageListItems("PageMajComptes");
  if (null!=elems){

    for (var i=0;i<elems.length;i++){

      let elem=elems[i];
      let infos=GetInfosElemList(elem);
      if (null==infos) {
        PacomeTrace("InitMajPageFin parametrage des boites erreur d'infos pour:"+elem.value);
        continue;
      }

      let res=TraiteElementCompte(infos["uid"], infos["confid"], infos["action"], true);

      if (-1==res) InsertInfosPageFin(listeui, infos["libelle"], infos["image"], "Erreur!");
      if (1==res) InsertInfosPageFin(listeui, infos["libelle"], infos["image"], infos["libmenu"]);
    }
  }

  //agendas à modifier
  elems=GetPageListItems("PageMajCals");
  if (null!=elems){

    for (var i=0;i<elems.length;i++){

      let elem=elems[i];
      let infos=GetInfosElemList(elem);
      if (null==infos) {
        PacomeTrace("InitMajPageFin parametrage des agendas erreur d'infos pour:"+elem.value);
        continue;
      }

      let res=TraiteElementAgenda(infos["uid"], infos["action"], true);

      if (-1==res) InsertInfosPageFin(listeui, infos["libelle"], infos["image"], "Erreur!");
      if (1==res) InsertInfosPageFin(listeui, infos["libelle"], infos["image"], infos["libmenu"]);
    }
  }

  //autres a modifier
  elems=GetPageListItems("PageMajAutres");
  if (null!=elems){

    for (var i=0;i<elems.length;i++){

      let res=0;
      let elem=elems[i];
      let infos=GetInfosElemList(elem);
      if (null==infos) {
        PacomeTrace("InitMajPageFin autres parametrages erreur d'infos pour:"+elem.value);
        continue;
      }

      if ("flux"==infos["confid"]){

        let res=TraiteElementFlux(infos["libelle"], infos["confid"], infos["action"], true);

        if (-1==res) InsertInfosPageFin(listeui, infos["libelle"], infos["image"], "Erreur!");
        if (1==res) InsertInfosPageFin(listeui, infos["libelle"], infos["image"], infos["libmenu"]);

      } else if (PACOME_ACTION_PARAM==infos["action"]||
              PACOME_ACTION_MAJ==infos["action"]) {

        InsertInfosPageFin(listeui, infos["libelle"], infos["image"], infos["libmenu"]);
      }
    }
  }
}

/* Mise à jour silencieuse
  utilisée uniquement dans le cas ou aucun element n'est visible par l'utilisateur
  correspond à des suppressions d'éléments */
function PacomeMAJSilence(docparam){

  let pacomeui=docparam.getElementsByTagName("pacome_ui");
  if (null==pacomeui || 0==pacomeui.length){
    PacomeTrace("PacomeMAJSilence pas d'element pacome_ui");
    return;
  }
  let choixui=pacomeui[0].getElementsByTagName("choix_ui");
  if (null==choixui || 0==choixui.length){
    PacomeTrace("PacomeMAJSilence aucune mise a jour");
    return;
  }

  if (null==gPacomeAssitVars.docpacomesrv){
    gPacomeAssitVars.docpacomesrv=docparam;
  }

  //traitement des boites
  let comptes=pacomeui[0].getElementsByTagName("compte");
  for (var i=0;null!=comptes && i<comptes.length;i++){
    if ("false"==comptes[i].getAttribute("visible")){

      let uid=comptes[i].getAttribute("uid");

      let choix=comptes[i].getElementsByTagName("choix");
      if (null==choix || 0==choix.length){
        PacomeTrace("PacomeMAJSilence erreur de choix pour uid:"+uid);
        continue;
      }
      let confid=choix[0].getAttribute("confid");
      let action=choix[0].getAttribute("action");

      if ("supprime"==action){
        let etat=PacomeEtatCompteBoite(uid, confid);
        PacomeTrace("PacomeMAJSilence uid:'"+uid+"' etat initial:"+etat);

        if (PACOME_ETAT_IGNORE==etat){

          PacomeEcritLog(PACOME_LOGS_MAJAUTO, "Suppression automatique d'une boite non utilisee uid:", uid);
          PacomeSupBoiteIgnore(uid);

        } else{
          PacomeTrace("PacomeMAJSilence erreur etat initial");
        }

      } else if ("maj"==action){

        let elemcompte=ExtraitElementCompte(uid, confid);

        PacomeTrace("PacomeMAJSilence mise a jour silencieuse du compte uid:"+uid);
        PacomeEcritLog(PACOME_LOGS_MAJAUTO, "parametrage d'une boite", "uid:'"+uid+
                      "' - confid:'"+confid+"' - action:'maj'");
        let res=ParamComptePacome(elemcompte);
        if (-1==res)
          PacomeEcritLog(PACOME_LOGS_ASSISTANT, "Echec de mise a jour");
        else
          PacomeEcritLog(PACOME_LOGS_ASSISTANT, "Succes de mise a jour");
      }
    }
  }

  //traitement des agendas
  let agendas=pacomeui[0].getElementsByTagName("agenda");
  for (var i=0;null!=agendas && i<agendas.length;i++){
    if ("false"==agendas[i].getAttribute("visible")){

      let url=agendas[i].getAttribute("url");

      let choix=agendas[i].getElementsByTagName("choix");
      if (null==choix || 0==choix.length){
        PacomeTrace("PacomeMAJSilence erreur de choix pour url:"+url);
        continue;
      }
      let action=choix[0].getAttribute("action");
      if ("supprime"!=action){
        PacomeTrace("PacomeMAJSilence erreur d'action pour url:"+url);
        continue;
      }

      let etat=pacomeCalEtat(url);
      PacomeTrace("PacomeMAJSilence url:'"+url+"' etat initial:"+etat);

      if (PACOME_ETAT_IGNORE==etat){

        PacomeEcritLog(PACOME_LOGS_MAJAUTO, "Suppression automatique d'un agenda non utilise url:", url);
        pacomeCalSupIgnore(agendas[i]);

      } else{
        PacomeTrace("PacomeMAJSilence erreur etat initial");
      }
    }
  }

  //traitement des flux
  let flux=pacomeui[0].getElementsByTagName("compteflux");
  for (var i=0;null!=flux && i<flux.length;i++){
    if ("false"==flux[i].getAttribute("visible")){

      let libelle=flux[i].getAttribute("libelle");

      let choix=flux[i].getElementsByTagName("choix");
      if (null==choix || 0==choix.length){
        PacomeTrace("PacomeMAJSilence erreur de choix pour flux:"+libelle);
        continue;
      }
      let action=choix[0].getAttribute("action");
      if ("supprime"!=action){
        PacomeTrace("PacomeMAJSilence erreur d'action pour flux:"+libelle);
        continue;
      }

      let etat=PacomeEtatCompteFlux(libelle);

      PacomeTrace("PacomeMAJSilence flux:'"+libelle+"' etat initial:"+etat);

      if (PACOME_ETAT_IGNORE==etat){

        PacomeSupFluxIgnore(libelle);
        PacomeEcritLog(PACOME_LOGS_MAJAUTO, "Suppression automatique d'un flux non utilise:", libelle);

      } else{
        PacomeTrace("PacomeMAJSilence erreur etat initial");
      }
    }
  }

  // application/annuaires
  let appli=pacomeui[0].getElementsByTagName("application");
  if (appli && 1==appli.length){

    appli=appli[0];

    if ("false"==appli.getAttribute("visible")){

      var choix=appli.getElementsByTagName("choix");

      if (null!=choix && 0!=choix.length){

        var action=choix[0].getAttribute("action");

        if ("maj"==action){
          PacomeTrace("PacomeMAJSilence mise à jour application");
          PacomeEcritLog(PACOME_LOGS_MAJAUTO, "Parametrage application");
          ParamAppli(docparam.documentElement);

        } else {
          PacomeTrace("PacomeMAJSilence erreur d'action pour application");
        }

      } else {
        PacomeTrace("PacomeMAJSilence erreur de choix pour application");
      }
    }
  }
}
