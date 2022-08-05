
ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource:///modules/pacomeUtils.jsm");

/*/preference serveur pacomesrv
const gParams.PREF_URLPARAM="pacome.urlparam";
const gParams.PREF_URLPARAM_KRB="pacome.urlparam.krb";

//url du serveur pacomesrv (parametrage)
const gParams.PACOME_URLPARAM="http://pacome.s2.m2.e2.rie.gouv.fr/pacomesrv.php";
const gParams.PACOME_URLPARAM_KRB="http://pacome.s2.m2.e2.rie.gouv.fr/krbpacomesrv.php";
*/

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
*  bmaj : si true requete de mise a jour
*  creds : login/pw si fournis
*/
function RequeteParametrage(config, fncrappel, bmaj, creds = null){

  try {

    PacomeTrace("RequeteParametrage");

    let httpRequest=new XMLHttpRequest();

    //url
    // utilise-t-on kerberos ?
    const krb = Services.prefs.getBoolPref(gParams.PREF_KRB_ENABLED, false) && !Services.prefs.getBoolPref(gParams.PREF_KRB_SKIP, false);

    /*let url= krb ? gParams.PACOME_URLPARAM_KRB : gParams.PACOME_URLPARAM;
    let p=Services.prefs.getCharPref(krb ? gParams.PREF_URLPARAM_KRB : gParams.PREF_URLPARAM, "");
    if (p!=="")
      url=p;*/
    const url = PacomeGetUrlParams();
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

    // doit-on s'authentifier pour recuperer les paramÃ¨tres hors krb ?
    const paramsAuth = !krb || gParams.PACOME_URLPARAM_AUTH || Services.prefs.getBoolPref(gParams.PREF_URLPARAM_AUTH, false);

    if (krb || paramsAuth) {
      httpRequest.withCredentials = true;
    }

    // si on a un login/pw fourni, on le presente
    if (paramsAuth && creds && creds.uid && creds.pw) {
      httpRequest.setRequestHeader("Authorization", "Basic " + btoa(creds.uid +":"+ creds.pw));
      // On stocke le pw pour les appels suivants
      PacomeStoreParamsCreds(url, creds);
    }

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
