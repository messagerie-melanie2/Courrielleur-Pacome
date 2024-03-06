/* Authentification Pacome */


var { PacomeUtils } = ChromeUtils.import("resource:///modules/pacome/PacomeUtils.jsm");
var { PacomeAuthUtils } = ChromeUtils.import("resource:///modules/pacome/PacomeAuthUtils.jsm");
var { MailServices } = ChromeUtils.import("resource:///modules/MailServices.jsm");

//préférence serveur pacomemdp2 de vérification de mot de passe
const PACOME_PREF_URLMDP="pacome.urlmdp";

//url de la page de verification de mot de passe
//v0.94 modifiable par la préférence "pacome.urlmdp"
const PACOME_URL_VERIFMDP="https://pacome.s2.m2.e2.rie.gouv.fr/pacomemdp2.php";


const PACOME_LOGS_AUTH="AUTHENTIFICATION";



/*
*  initialisation de la boîte de demande de mot de passe
*
*  arguments d'appel de la boîte :
* uid (in) : identifiant
* mdp (out) : mot de passe saisi (vide si annulation ou erreur)
* res (out) : code retour 1->valide 0->annulation -1->erreur
*
*  res : Codes de retour (V0.94):
*  1 -> Mot de passe valide
*  0 -> Annulation par l'utilisateur
*  -1 -> Erreur
*/
window.addEventListener("load", () => {

	PacomeUtils.PacomeTrace("PacomeAuth load");

	let dialog=document.getElementById("pacomeauth");

  //identifiant
  if (null==window.arguments || null==window.arguments[0] ||
			null==window.arguments[0].uid) {
		Services.prompt.alert(window, "Erreur", PacomeUtils.MessageFromId("PacomeAuthErreurInit"));
		FermePacomeAuth();
    return;
  }

	//annulation par défaut
  window.arguments[0].res=0;
  window.arguments[0].mdp="";

  let uid=window.arguments[0].uid;

  document.getElementById("uid").value=uid;

	  let btValider=document.getElementById("boutonValider");
  btValider.setAttribute("disabled",true);

	// tests
	//document.getElementById("uid").value="Prenom.NOM";

	dialog.showModal();
});



/*
*  bouton valider
*
*  Implémentation:
*  V0.94 : utilise une requete asynchrone pour la vérification
*  Codes de retour:
*  0 -> Mot de passe valide
*  1 -> Annulation par l'utilisateur
*  2 -> Mot de passe valide mais doit changer
*  3 -> Vérification impossible
*  Pas de cas non valide: l'utilisateur doit saisir le mot de passe ou annuler
*
* *  v1.2 valeur du paramètre appver: url de mise à jour
*
*/
function ValiderAuth() {

	PacomeUtils.PacomeTrace("PacomeAuth ValiderAuth");

  // identifiant + mot de passe saisi
	let uid=document.getElementById("uid").value;
  let mdp=document.getElementById("mdp").value;

  EcritLog("Verification du mot de passe pour l'identifiant:", uid);

  let msgReq="";

  //désactiver le bouton valider pour éviter deuxième appel
  let btValider=document.getElementById("boutonValider");
  btValider.setAttribute("disabled",true);
  btValider.focus();

  setBoutonAnnuler(false);

  //vérifier (requête asynchrone)
  sablier();
  //url modifiable dans les préférences
  //nom de préférence definie par PACOME_PREF_URLMDP
  //si valeur absente, on utilise la valeur par défaut
  let url=PACOME_URL_VERIFMDP;

	let p=Services.prefs.getCharPref(PACOME_PREF_URLMDP, "");
	if (null!=p && 0!=p.length)
		url=p;

  EcritLog("url serveur de verification de mot de passe", url);

  let httpRequest=new XMLHttpRequest();

  let param="op=verifmdp&uid="+encodeURIComponent(uid);
  param+="&mdp="+encodeURIComponent(mdp);
  param+="&extver="+encodeURIComponent(PacomeUtils.version);

  //Bug mantis 0004135: Traces incontournables avec uid et version du courrielleur
  let cm2ver=Services.prefs.getCharPref("courrielleur.version", "");
  param+="&cm2ver="+cm2ver;
  //org
  let org=GetOrgForUid(uid);
  param+="&org="+org;

  // 4582 : Logguer le temps de chargement du Courrielleur
  try{
    let startlog=Services.prefs.getIntPref("courrielleur.startlog");
    if (0==startlog) {
      let totalTime=Services.prefs.getIntPref("courrielleur.totalTime");
      param+="&totaltime="+totalTime;
      Services.prefs.setIntPref("courrielleur.startlog", 1);
    }
  }catch(ex) {}

  httpRequest.onreadystatechange=function() {

    switch(httpRequest.readyState) {
    case 4:
      let statut=0;
      try{
        statut=httpRequest.status;
      }
      catch(ex1) {
        //statut=0;
        //v1.1.1
        let req=httpRequest.channel.QueryInterface(Components.interfaces.nsIRequest);
        statut=req.status;
      }

      passablier();

      PacomeUtils.PacomeTrace("PacomeAuth ValiderAuth statut:"+statut);

      if(statut !=200) {

        EcritLog("code de reponse du serveur", statut);

        //v1.1.1
        if (0==statut) {
          msgReq=PacomeUtils.MessageFromId("PacomeAuthErreurSrv")+"\nStatut:"+statut;
        }
        else{
          try{
            //v1.11
            msgReq=PacomeUtils.MessageFromId("pacomesrverr-"+statut);
          }
          catch(ex1) {
            msgReq=PacomeUtils.MessageFromId("PacomeAuthErreurSrv")+"\nStatut:"+statut;
          }
        }

        //Traiter erreur spécifique
        //erreur du serveur PacomeMdpErreurSrv
				let res=MsgAuthErreurSrv(msgReq);

        PacomeUtils.PacomeTrace("PacomeAuth MsgAuthErreurSrv res="+res);

        //v2.4: 1->continuer
        if (1==res) {

          //passage en mode déconnecté
					PacomeUtils.PacomeTrace("erreur du serveur - passage en mode deconnecte", msgReq);
          EcritLog("erreur du serveur - passage en mode deconnecte", msgReq);
          PacomeUtils.passerHorsLigne();
          //annulation
          window.arguments[0].res=-1;
          window.arguments[0].mdp="";

        } else {

					// bouton continuer
					PacomeUtils.PacomeTrace("erreur du serveur - mot de passe force", msgReq);
          EcritLog("erreur du serveur - mot de passe force", msgReq);

          window.arguments[0].res=1;
          window.arguments[0].mdp=mdp;
        }

        FermePacomeAuth();
        return;

      } else{

        let reponse=httpRequest.responseText;
        PacomeUtils.PacomeTrace("PacomeAuth ValiderAuth reponse='"+reponse+"'");

        //reponse='code=0;message=;versionsconfigs=std1:2-2+std2:2-2+par1:2-2;openhours=7:30-20:30-Mon/Tue/Wed;comptesflux=Informations Mélanie2:4-4;'
        //analyser le code retour
        //0 si succès
        //0xFFFF : vérification ok mais le mot de passe doit changer (texte dans g_msgReq)
        //autre : mot de passe non valide -> continuer saisie
        let code=-1;
        let message="";
        msgReq=PacomeUtils.MessageFromId("PacomeAuthErreurSrv");

        let tab=reponse.split(";");
        if (0<tab.length) {
          let res=tab[0].split("=");
          if (res[0]=="code")
            code=res[1];
        }
        if (1<tab.length) {
          let res=tab[1].split("=");
          if (res[0]=="message")
            message=res[1];
        }

				 PacomeUtils.PacomeTrace("PacomeAuth ValiderAuth code retourné:"+code);
				 PacomeUtils.PacomeTrace("PacomeAuth ValiderAuth message retourné:"+message);

        //tests
        //code=0xFFFF;
        //message="Test le mot de passe doit changé";

        //cas mot de passe valide
        if (0==code || 0xFFFF==code) {

          // PacomeSetOpenHours(reponse);
          let argchg=Array();

          if (0xFFFF==code) {

            //le mot de passe doit changer
            PacomeUtils.PacomeTrace("PacomeAuth ValiderAuth le mot de passe doit changer");

            EcritLog("le mot de passe doit changer", "");
            //si l'utilisateur change le mot de passe, le nouveau mot de passe est retourné dans argchg["nouveau"]
            argchg["uid"]=uid;
            argchg["actuel"]=mdp;
            argchg["mineqpassworddoitchanger"]=message;

            let res=window.openDialog("chrome://pacome/content/pacomechgmdp.xul","","chrome,modal,centerscreen,titlebar",argchg);

            if (null!=argchg["nouveau"]) {
              EcritLog("le mot de passe a chang\u00e9", "");
              mdp=argchg["nouveau"];
            }

          }

          window.arguments[0].res=1;
          window.arguments[0].mdp=mdp;

          FermePacomeAuth();

          return;

        }  else {

          EcritLog("mot de passe non valide code:", code);

          //le mot de passe n'est pas valide ou erreur
          //mot de passe non valide
          if (49==code) {

            // cas mot de passe aurait du etre changé (mantis 5393)
            if (""!=message &&
                0==message.indexOf("GRILLED : ")) {

              let msgsrv=message.substr(10);
              PacomeAfficheMsgId3("PacomeAuthErreurSrvTitre", PacomeUtils.MessageFromId("PacomeAuthNonValide"), msgsrv);

              PacomeUtils.passerHorsLigne();

              //annulation
              window.arguments[0].res=-1;
              window.arguments[0].mdp="";

              FermePacomeAuth();
              return;

            } else PacomeAfficheMsgIdMsgId("PacomeAuthErreurSrvTitre", "PacomeMdpNonValide");

          } else if (-1==code) {

						let res=MsgAuthErreurSrv(PacomeUtils.MessageFromId("PacomeAuthErreurSrvLib"));

						PacomeUtils.PacomeTrace("PacomeAuth MsgAuthErreurSrv res="+res);

            //v2.4: 1->continuer
            if (1==res) {

              //passage en mode déconnecté
							PacomeUtils.PacomeTrace("erreur du serveur - passage en mode deconnecte", "");
              EcritLog("erreur du serveur - passage en mode deconnecte", "");
              PacomeUtils.passerHorsLigne();
              //annulation
              window.arguments[0].res=-1;
              window.arguments[0].mdp="";

            } else {

							// bouton continuer
							PacomeUtils.PacomeTrace("erreur du serveur - mot de passe force", "");
              EcritLog("erreur du serveur - mot de passe force", "");

              window.arguments[0].res=1;
              window.arguments[0].mdp=mdp;
            }

            FermePacomeAuth();
            return;

          } else {

						PacomeUtils.PacomeTrace("PacomeAuth PacomeAuthNonValide");
						Services.prompt.alert(window, PacomeUtils.MessageFromId("PacomeAuthNonValide"), msgReq+" (code "+code+")");

						FermePacomeAuth();
            return;
          }

          let btValider=document.getElementById("boutonValider");
          btValider.removeAttribute("disabled");
          let txtuid=document.getElementById("mdp");
          txtuid.value="";
          txtuid.focus();
        }

        setBoutonAnnuler(true);
      }
      break;
    }
  };


  httpRequest.open("POST", url, true, null, null);

  httpRequest.setRequestHeader("Content-Type","application/x-www-form-urlencoded;charset=ISO-8859-1");

  httpRequest.send(param);
}


function FermePacomeAuth() {

	PacomeUtils.PacomeTrace("PacomeAuth FermePacomeAuth");

	let dialog=document.getElementById("pacomeauth");
	dialog.close();
	window.close();
}


function Annuler() {

	PacomeUtils.PacomeTrace("PacomeAuth Annuler");

	window.arguments[0].res=0;
  window.arguments[0].mdp="";

	FermePacomeAuth();
}


function EcritLog(message, donnees) {

	PacomeUtils.EcritLog(PACOME_LOGS_AUTH, message, donnees);
}


function sablier() {
	document.body.classList.remove("passablier");
	document.body.classList.add("sablier");
}

function passablier() {
	document.body.classList.remove("sablier");
	document.body.classList.add("passablier");
}

function setBoutonAnnuler(etat) {

  let bt=document.getElementById("boutonAnnuler");
  bt.disabled=!etat;
}


// organisation à partir de l'identifiant
function GetOrgForUid(uid) {

	for (let identity of MailServices.accounts.allIdentities) {
		let pref="mail.identity."+identity.key+".identityName";
    let uid_pref=Services.prefs.getCharPref(pref, "");
    if (uid_pref==uid) {
      return identity.organization;
    }
	}

  return "";
}

// saisie dans le champ mdp
function saisieMdp() {

	let saisie=document.getElementById("mdp").value;

	let btValider=document.getElementById("boutonValider");

	if (saisie.length)
		btValider.removeAttribute("disabled");
	else
		btValider.setAttribute("disabled", true);

}


// affichage erreur de vérification de mot de passe
function MsgAuthErreurSrv(msgReq) {

	PacomeUtils.PacomeTrace("PacomeAuth MsgAuthErreurSrv:"+msgReq);

	let checkbox = { value: false };

	let choix=Services.prompt.confirmEx(window,
																			PacomeUtils.MessageFromId("PacomeAuthErreurSrvTitre"),
																			msgReq,
																			Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_0 +
																			Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_1,
																			"Continuer", "Hors ligne",
																			null,
																			null,
																			checkbox);

	return choix;
}