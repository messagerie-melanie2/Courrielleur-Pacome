
ChromeUtils.import("resource://gre/modules/Services.jsm");


//préférence serveur pacomesrv
const PREF_URLPARAM="pacome.urlparam";



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
*  uid : optionnel identifiant utilisateur
*  mdp : optionnel mot de passe utilisateur
*
*  fonction modifiée pour vérification authentification
*  si authentification appel AuthPacome avant ExecRequeteParam
*  sinon appel ExecRequeteParam
*/
function RequeteParametrage(config, fncrappel, bmaj, uid=null, mdp=null){

  try {

    PacomeTrace("RequeteParametrage");

    //url
    let url=Services.prefs.getCharPref(PREF_URLPARAM, "");
    if (""==url){
      PacomeTrace("!!! url paramétrage pacome non définie");
      fncrappel(null);
      return;
    }
    PacomeTrace("RequeteParametrage url serveur:"+url);
    PacomeEcritLog(PACOME_LOGS_REQ, "url du serveur pacome", url);

    // vérifier que l'url est bien gérée par pacome
    if (!PacomeAuthUtils.TestServeurMelanie2(url)){
      PacomeTrace("!!! url paramétrage pacome non gérée par pacome");
      fncrappel(null);
      return;
    }

    // cas authentification
    if (Services.prefs.getBoolPref("pacome.auth", true)){

      AuthReqPacome(url, config, fncrappel, bmaj, uid, mdp);

    } else {

      ExecRequeteParam(url, config, fncrappel, bmaj, uid, mdp)
    }

    return true;

  } catch(ex){
    PacomeSetErreurGlobaleEx(-1, PacomeMessageFromId("PacomeErreurReqEx"), ex);
    PacomeEcritLog(PACOME_LOGS_REQ, "exception", ex);
    return false;
  }
}

/*
* Vérifie le mot de passe utilisateur avant d'envoyer la requete pacome
*
*/
function AuthReqPacome(url, config, fncrappel, bmaj, uid=null, mdp=null){

  if (null==uid || null==mdp || ""==mdp){

    let login=PacomeAuthUtils.GetLoginPrincipal();

    if (null==login && null==uid){
      PacomeTrace("AuthReqPacome pas de compte pour l'authentification");
      fncrappel(null);
      return;
    }

    if (null!=login) {
      uid=login.username;
      mdp=login.password;
    }

    PacomeTrace("AuthReqPacome GetLoginPrincipal uid:"+uid);

    if (null==mdp || ""==mdp){

      let mdpout={};

      let ok=PacomeAuthUtils.PromptMdpRec(uid, mdpout);

      if (!ok){
        PacomeTrace("AuthReqPacome pas de mot passe pour l'authentification");
        fncrappel(null);
        return;
      }

      mdp=mdpout.value;

      // si ok le mot de passe est valide
      // donc pas nécessaire de vérifier à nouveau
      ExecRequeteParam(url, config, fncrappel, bmaj, uid, mdp);

      return;
    }
  }

  let retourVerif=function(code, message) {

    PacomeTrace("AuthReqPacome retourVerif code:"+code+" - message:"+message);

    if (0==code || 0xFFFF==code) {

      // mot de passe est valide
      PacomeTrace("AuthReqPacome retourVerif mot de passe est valide");

      ExecRequeteParam(url, config, fncrappel, bmaj, uid, mdp);

      return;

    } else if (-1==code) {

      // echec de vérification
      PacomeTrace("AuthReqPacome retourVerif erreur de vérification");
      fncrappel(null);
      return;

    } else {

      PacomeTrace("AuthReqPacome retourVerif mot de passe non valide");

      // saisie mdp
      //le mot de passe n'est pas valide
      let mdpout={};

      PacomeTrace("AuthReqPacome retourVerif saisie du mot de passe");
      let ok=PacomeAuthUtils.PromptMdpRec(uid, mdpout);

      if (ok){

        mdp=mdpout.value;

        ExecRequeteParam(url, config, fncrappel, bmaj, uid, mdp);

        return;

      } else {
        // mot de passe non valide ou erreur => annulation
        fncrappel(null);
        return;
      }
    }
  };

  // on verifie le mdp passé en paramètre de AuthReqPacome
  PacomeAuthUtils.VerifieMdp(uid, mdp, retourVerif);
}

/*
* appelée par RequeteParametrage
* exécute la requête proprement dit
*/
function ExecRequeteParam(url, config, fncrappel, bmaj, uid=null, mdp=null){

  PacomeTrace("ExecRequeteParam");

  let httpRequest=new XMLHttpRequest();

  //parametres
  let param=null;
  if (bmaj)
    param="op="+PACOMESRV_OP_MAJ;
  else
    param="op="+PACOMESRV_OP_PARAM;

  param+="&"+PACOMESRV_PARAM_CONFIG+"="+encodeURIComponent(config);
  param+="&"+PACOMESRV_PARAM_VER+"="+encodeURIComponent(PacomeAuthUtils.VERSION_PACOME);

  httpRequest.open("POST", url, true);

  httpRequest.setRequestHeader("Content-Type","application/x-www-form-urlencoded; charset=UTF-8");

  // cas authentification
  if (null!=uid && null!=mdp){

    httpRequest.setRequestHeader("Authorization", "Basic "+btoa(uid+":"+mdp));
  }


  httpRequest.onreadystatechange=function(){

    switch(httpRequest.readyState) {

    case 4:
      let statut=0;
      try{
        statut=httpRequest.status;
      }
      catch(ex1){
        PacomeTrace("ExecRequeteParam exception httpRequest.status");
        //statut=0;
        //v1.1.1
        let req=httpRequest.channel.QueryInterface(Components.interfaces.nsIRequest);
        statut=req.status;
      }
      PacomeTrace("ExecRequeteParam httpRequest.status:"+statut);
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
            PacomeSetErreurGlobale(statut, PacomeMessageFromId("PacomeErreurSrv"));
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

  PacomeTrace("ExecRequeteParam send param:"+param);
  PacomeEcritLog(PACOME_LOGS_REQ, "envoie des parametres", param);
  httpRequest.send(param);
}
