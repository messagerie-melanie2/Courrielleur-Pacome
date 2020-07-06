

//document de parametrage
var g_docpacomesrv=null;


function InitAddCal() {

  //lecture configuration pacome
  let config=PacomeDocumentConfig();
  if (null==config){
    PacomeTrace("PacomeAjoutAG erreur de lecture de configuration");
    PacomeEcritLog(PACOME_LOGS_AG, "erreur de lecture de configuration", "");

    PacomeAfficheMsgIdMsgId("PacomeAjoutAgenda", "PacomeErreurLitConfig");
    window.close();
    return;
  }
  PacomeTrace("Ajout agenda - config:"+config);

  //requete parametrage complet
  window.setCursor("wait");

  let ret=RequeteParametrage(config, ReceptionAddCal, false);

  if (false==ret) {
    window.setCursor("auto");
    PacomeAfficheMsgIdGlobalErr("PacomeErreurInitListeCals");
    window.close();
  }
}


function ReceptionAddCal(responseXML) {

  window.setCursor("auto");

  try {

    if (null==responseXML){
      PacomeTrace("ReceptionMajParam null==responseXML");
      PacomeEcritLog(PACOME_LOGS_AG, "reponse serveur absente", "");

      PacomeAfficheMsgIdGlobalErr("PacomeErreurInitListeCals");
      window.close();
    }

    //analyser la réponse
    let res=AnalyseErreurDoc(responseXML);
    if (!res){
      PacomeTrace("ReceptionMajParam erreur de verification du document:"+gPacomeMsgErreur);
      PacomeEcritLog(PACOME_LOGS_AG, "erreur de verification du document", gPacomeMsgErreur);

      PacomeAfficheMsgIdGlobalErr("PacomeErreurInitListeCals");
      window.close();
    }

    //verification pacome_ui
    let pacomeui=responseXML.getElementsByTagName("pacome_ui");
    if (null==pacomeui || 0==pacomeui.length){

      PacomeAfficheMsgIdGlobalErr("PacomeErreurInitListeCals");
      window.close();
    }
    //nombre choix_ui
    let choixui=pacomeui[0].getElementsByTagName("choix_ui");
    if (null==choixui || 0==choixui.length){
      PacomeEcritLog(PACOME_LOGS_AG, "aucun agenda", "");

      PacomeAfficheMsgIdMsgId("PacomeAjoutAgenda", "PacomeAjoutAgendaAucun");
      window.close();
    }

    //construire la liste des agendas
    ConstruitListeAgendas(pacomeui);


    g_docpacomesrv=responseXML;

  } catch(ex) {
    PacomeAfficheMsgId2("PacomeAjoutAgendaListeErr", ex);
    window.close();
  }
}


function ConstruitListeAgendas(pacomeui) {

  let nbadd=0;

  let listeags=document.getElementById("pacomeaddcal-ags");

  let agendas=pacomeui[0].getElementsByTagName("agenda");
  if (null==agendas || 0==agendas.length){
    PacomeAfficheMsgIdMsgId("PacomeAjoutAgenda", "PacomeAjoutAgendaAucun");
    window.close();
  }

  for (var i=0;i<agendas.length;i++){
    let agenda=agendas[i];

    let choix=agenda.getElementsByTagName("choix");
    if (choix && 0<choix.length) {

      for (var c=0;c<choix.length;c++) {

        if ("ignore"==choix[c].getAttribute("action")){

          listeags.appendItem(agenda.getAttribute("libelle"), agenda.getAttribute("url"));

          nbadd++;
        }
      }
    }
  }


  if (0==nbadd) {
    PacomeAfficheMsgIdMsgId("PacomeAjoutAgenda", "PacomeAjoutAgendaAucun");
    window.close();
  }

  document.getElementById("btValider").removeAttribute("disabled");
}


function AjouteAgenda() {

  //agenda selectionne?
  let listeags=document.getElementById("pacomeaddcal-ags");

  if (null==listeags.selectedItem) {

    PacomeAfficheMsgIdMsgId("PacomeAjoutAgenda", "PacomeAjoutAgendaSel");
    return;
  }

  try {
    //configuration agenda
    let url=listeags.selectedItem.value;
    PacomeTrace("Ajout agenda - AjouteAgenda url selection:"+url);

    let agendas=g_docpacomesrv.getElementsByTagName("agendas");
    if (null==agendas){
      PacomeAfficheMsgIdMsgId("PacomeAjoutAgenda", "PacomeAjoutAgendaErrConf");
      window.close();
    }
    agendas=agendas[0].getElementsByTagName("agenda");
    if (null==agendas || 0==agendas.length){
      PacomeAfficheMsgIdMsgId("PacomeAjoutAgenda", "PacomeAjoutAgendaErrConf");
      window.close();
    }

    for (var i=0;i<agendas.length;i++){
      let agenda=agendas[i];
      PacomeTrace("Ajout agenda - AjouteAgenda agenda:"+agenda.getAttribute("url"));
      if (agenda.getAttribute("url")==url) {
        pacomeCalAjoutAgenda(agenda);
        break;
      }
    }

    window.close();

  } catch(ex) {
    PacomeAfficheMsgId2("PacomeAjoutAgendaErr", ex);
  }
}
