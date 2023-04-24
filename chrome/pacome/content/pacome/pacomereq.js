
ChromeUtils.import("resource://gre/modules/Services.jsm");


//préférence serveur pacomesrv
const PREF_URLPARAM="pacome.urlparam";

//url du serveur pacomesrv (parametrage)
const PACOME_URLPARAM="https://mceweb2.si.minint.fr/pacome/pacomesrv.php";


/* parametres de requete */
const PACOMESRV_OP_PARAM="parcfg";
const PACOMESRV_OP_MAJ="parmaj";
const PACOMESRV_PARAM_CONFIG="cfg";
const PACOMESRV_PARAM_VER="extver";


/**
*  Requete de parametrage asynchrone
*
*  config : element (xml) de configuration
*  fncrappel : fonction de rappel
*  bmaj : si true requete de mise à jour
*/
function RequeteParametrage(config, fncrappel, bmaj){

  try {

    PacomeTrace("RequeteParametrage");

    let httpRequest=new XMLHttpRequest();

    //url
    let url=PACOME_URLPARAM;
    let p=Services.prefs.getCharPref(PREF_URLPARAM);
    if (p!="")
      url=p;
    PacomeTrace("RequeteParametrage url serveur:"+url);
    PacomeEcritLog(PACOME_LOGS_REQ, "url du serveur pacome", url);

    //parametres
    let param=null;
    if (bmaj) 
      param="op="+PACOMESRV_OP_MAJ;
    else 
      param="op="+PACOMESRV_OP_PARAM;

    param+="&"+PACOMESRV_PARAM_CONFIG+"="+encodeURIComponent(config);
    param+="&"+PACOMESRV_PARAM_VER+"="+encodeURIComponent(VERSION_PACOME);

    httpRequest.open("POST", url, true);

    httpRequest.setRequestHeader("Content-Type","application/x-www-form-urlencoded; charset=UTF-8");

    httpRequest.onreadystatechange=function(){

      switch(httpRequest.readyState) {

      case 4:
        let statut=0;
        try{
          statut=httpRequest.status;
        }
        catch(ex1){
          PacomeTrace("RequeteParametrage exception httpRequest.status");
          //statut=0;
          //v1.1.1
          let req=httpRequest.channel.QueryInterface(Components.interfaces.nsIRequest);
          statut=req.status;
        }
        PacomeTrace("RequeteParametrage httpRequest.status:"+statut);
        if(statut !=200){

          PacomeEcritLog(PACOME_LOGS_REQ, "code de reponse du serveur", statut);

          if (0==statut){

            PacomeSetErreurGlobale(-1, PacomeMessageFromId("PacomeErreurAccesSrv"));
          }
          else{
            try{
              //v1.11
              PacomeSetErreurGlobale(statut, PacomeMessageFromId("pacomesrverr-"+statut));
            }
            catch(ex1){
              PacomeSetErreurGlobaleEx(statut, PacomeMessageFromId("PacomeErreurSrv"), ex1);
            }
          }

          fncrappel(null);
          return;
        }
        else{

          fncrappel(httpRequest.responseXML);

          return;
        }
        break;
      }
    }

    PacomeTrace("RequeteParametrage send param:"+param);
    PacomeEcritLog(PACOME_LOGS_REQ, "envoie des parametres", param);
    httpRequest.send(param);

    return true;

  } catch(ex){
    PacomeSetErreurGlobaleEx(-1, PacomeMessageFromId("PacomeErreurReqEx"), ex);
    PacomeEcritLog(PACOME_LOGS_REQ, "exception", ex);
    return false;
  }
}
