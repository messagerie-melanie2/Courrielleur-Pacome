
ChromeUtils.import("resource:///modules/mailServices.js");
ChromeUtils.import("resource://gre/modules/pacomeAuthUtils.jsm");
ChromeUtils.import("resource://gre/modules/oidcAuthUtils.jsm");

//préférence serveur pacomemdp2 de vérification de mot de passe
const PACOME_PREF_URLMDP="pacome.urlmdp";

//url de la page de verification de mot de passe
//v0.94 modifiable par la préférence "pacome.urlmdp"
const PACOME_URL_VERIFMDP="https://pacome.s2.m2.e2.rie.gouv.fr/pacomemdp2.php";


//message de la requete
var g_msgReq="";

function authMethodCallbackSSO()
{
  PacomeTrace("Pacomemdp authMethodCallbackSSO");

  if(TbbbbUtils._token)
  {
    PacomeTrace("Pacomemdp authMethodCallbackSSO avec Jeton OIDC");

    // Remplacement des identifiants
    document.getElementById("pacomemdp.mdp").value = TbbbbUtils._token;
    document.getElementById("pacomemdp.uid").value = window.arguments[0].uid; // /!\ Valeur récupérée par la fenêtre et non par Cerbère

    // Appel à la validation
    ValiderMdp();
  }
  else
  {
    PacomeTrace("Pacomemdp authMethodCallbackSSO sans Jeton OIDC");
  }
}

function triggerSSO()
{
  PacomeTrace("Pacomemdp triggerSSO");

  TbbbbUtils.launchSSO(authMethodCallbackSSO);
}

function autoSSO()
{
  // #8119 - Sauvegarde de l'état de la checkbox de sauvegarde d'authentification SSO
  var autoSSO = document.getElementById("pacomemdp.cbCerbere").checked;
  console.log("in autoSSO - Utiliser automatiquement l'authentification SSO: "+autoSSO);
  Services.prefs.setCharPref("pacome.autosso", autoSSO);
}

function initAutoSSO()
{
  // #8119 - On positionne la checkbox au lancement, et on lance l'authentification si elle est cochée
  console.log("in initAutoSSO - Positionnement de la checkbox autoSSO.");
  var checkboxSSO = document.getElementById("pacomemdp.cbCerbere");
  checkboxSSO.checked = true;

  if(checkboxSSO.checked)
  {
    console.log("in initAutoSSO - Lancement automatique de l'authentification SSO.");
    triggerSSO();
  }
}

function checkSSO()
{
  try
  {
    PacomeTrace("Pacomemdp checkSSO");
    InitPacomeMdp();

    if(TbbbbUtils._token)
    {
      // InitPacomeMdp();

      setTimeout(FocusPacomeDlg, 1000);

      pacomeLogStartTime();

      authMethodCallbackSSO();
    }
  }
  catch (error)
  {
    PacomeTrace("Pacomemdp checkSSO - ERROR");
    PacomeTrace(error);
  }
}

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
function InitPacomeMdp(){

  PacomeTrace("Pacomemdp InitPacomeMdp");

  //annulation par défaut
  window.arguments[0].res=0;
  window.arguments[0].mdp="";

  //identifiant
  if (null==window.arguments[0] || null==window.arguments[0].uid){
    PacomeAfficheMsgId("PacomeMdpErreurInit");
    window.close();
    return;
  }

  let uid=window.arguments[0].uid;

  document.getElementById("pacomemdp.uid").value=uid;
}

function FocusPacomeDlg() {

  window.focus();

  document.getElementById("pacomemdp.mdp").focus();
}


function QuittePacomeMdp(){

  PacomeTrace("Pacomemdp QuittePacomeMdp");
}

/*
*  bouton annuler
*
*/
function AnnulerMdp(){

  window.arguments[0].res=0;
  window.arguments[0].mdp="";

  window.close();
}

function setBoutonAnnuler(etat){

  let bt=document.getElementById("pacomemdp.btAnnuler");
  bt.disabled=!etat;
}

//reponse='code=0;message=;versionsconfigs=std1:2-2+std2:2-2+par1:2-2;openhours=7:30-20:30-Mon/Tue/Wed;comptesflux=Informations Mélanie2:4-4;'
function PacomeSetOpenHours(reponse)
{
  Services.prefs.setCharPref("mail.identity.openhours","none");
  let resArray=reponse.split(";");
  for(let i = 0; i < resArray.length; i++)
  {
    if(resArray[i].includes("openhours"))
    {
      Services.prefs.setCharPref("mail.identity.openhours",resArray[i].split("=")[1]);
      break;
    }
  }
}

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
function ValiderMdp(){

  //mot de passe saisi
  let mdp=document.getElementById("pacomemdp.mdp").value;
  let uid=document.getElementById("pacomemdp.uid").value;

  PacomeEcritLog(PACOME_LOGS_MDP, "Verification du mot de passe pour l'identifiant:", uid);

  let msgReq="";

  //désactiver le bouton valider pour éviter deuxième appel
  let bt=document.getElementById("pacomemdp.btValider");
  bt.setAttribute("disabled",true);
  bt.focus();

  setBoutonAnnuler(false);

  //vérifier (requête asynchrone)
  window.setCursor("wait");
  //url modifiable dans les préférences
  //nom de préférence definie par PACOME_PREF_URLMDP
  //si valeur absente, on utilise la valeur par défaut
  let url=PACOME_URL_VERIFMDP;

  try{
    let p=PacomeGetCharPref(PACOME_PREF_URLMDP);
    if (null!=p && 0!=p.length)
      url=p;
  }catch(ex){}

  PacomeEcritLog(PACOME_LOGS_MDP, "url serveur de verification de mot de passe", url);

  let httpRequest=new XMLHttpRequest();

  let param="op=verifmdp&uid="+encodeURIComponent(uid);
  param+="&mdp="+encodeURIComponent(mdp);
  param+="&extver="+encodeURIComponent(VERSION_PACOME);

  //#7754: Prise en compte du cas d'authentification Cerbere depuis un compte Mél sans auth Cerbere activée
  let SsoPassword = false;
  if(mdp.length >= 250)
    SsoPassword = true;

  //Bug mantis 0004135: Traces incontournables avec uid et version du courrielleur
  let cm2ver=PacomeGetCharPref("courrielleur.version");
  param+="&cm2ver="+cm2ver;
  //org
  let org=GetOrgForUid(uid);
  param+="&org="+org;

  // 4582 : Logguer le temps de chargement du Courrielleur
  try{
    let startlog=Services.prefs.getIntPref("courrielleur.startlog");
    if (0==startlog){
      let totalTime=Services.prefs.getIntPref("courrielleur.totalTime");
      param+="&totaltime="+totalTime;
      Services.prefs.setIntPref("courrielleur.startlog", 1);
    }
  }catch(ex){}

  httpRequest.onreadystatechange=function (){

    switch(httpRequest.readyState){
    case 4:
      let statut=0;
      try{
        statut=httpRequest.status;
      }
      catch(ex1){
        //statut=0;
        //v1.1.1
        let req=httpRequest.channel.QueryInterface(Components.interfaces.nsIRequest);
        statut=req.status;
      }

      window.setCursor("auto");

      PacomeTrace("Pacomemdp ValiderMdp statut:"+statut);

      if(statut !=200){

        PacomeEcritLog(PACOME_LOGS_MDP, "code de reponse du serveur", statut);

        //v1.1.1
        if (0==statut){
          msgReq=PacomeMessageFromId("PacomeMdpErreurSrv")+"\nStatut:"+statut;
        }
        else{
          try{
            //v1.11
            msgReq=PacomeMessageFromId("pacomesrverr-"+statut);
          }
          catch(ex1){
            msgReq=PacomeMessageFromId("PacomeMdpErreurSrv")+"\nStatut:"+statut;
          }
        }
        PacomeTrace("Pacomemdp msgReq="+msgReq);

        //Traiter erreur spécifique
        //erreur du serveur PacomeMdpErreurSrv
        let msgerr=PacomeMessageFromId("PacomeMdpErreurSrvLib")+"\nErreur:\n"+msgReq;
        PacomeTrace("Pacomemdp msgerr="+msgerr);

        let res=PacomeMsgConfirmBt(PacomeMessageFromId("PacomeMdpErreurSrvTitre"), msgerr, "Continuer", "Hors ligne");

        PacomeTrace("Pacomemdp PacomeMsgConfirmBt res="+res);

        //v2.4: 1->continuer
        if (1!=res){

          //passage en mode déconnecté
          PacomeEcritLog(PACOME_LOGS_MDP, "erreur du serveur - passage en mode deconnecte", msgerr);
          passerHorsLigne();
          //annulation
          window.arguments[0].res=-1;
          window.arguments[0].mdp="";

        }  else{

          PacomeEcritLog(PACOME_LOGS_MDP, "erreur du serveur - mot de passe force", msgerr);

          window.arguments[0].res=1;
          window.arguments[0].mdp=mdp;
        }

        window.close();
        return;

      } else{

        let reponse=httpRequest.responseText;
        PacomeTrace("Pacomemdp ValiderMdp reponse='"+reponse+"'");

        //reponse='code=0;message=;versionsconfigs=std1:2-2+std2:2-2+par1:2-2;openhours=7:30-20:30-Mon/Tue/Wed;comptesflux=Informations Mélanie2:4-4;'
        //analyser le code retour
        //0 si succès
        //0xFFFF : vérification ok mais le mot de passe doit changer (texte dans g_msgReq)
        //autre : mot de passe non valide -> continuer saisie
        let code=-1;
        let message="";
        msgReq=PacomeMessageFromId("PacomeMdpErreurSrv");

        let tab=reponse.split(";");
        if (0<tab.length){
          let res=tab[0].split("=");
          if (res[0]=="code"){
            code=res[1];
          }
        }
        if (1<tab.length){
          let res=tab[1].split("=");
          if (res[0]=="message"){
            message=res[1];
          }
        }

        //tests
        //code=0xFFFF;
        //message="Test le mot de passe doit changé";

        //cas mot de passe valide
        if (0==code || 0xFFFF==code)
        {
          PacomeSetOpenHours(reponse);
          let argchg=Array();

          if (0xFFFF==code) {

            //le mot de passe doit changer
            PacomeTrace("Pacomemdp ValiderMdp le mot de passe doit changer");

            PacomeEcritLog(PACOME_LOGS_MDP, "le mot de passe doit changer", "");
            //si l'utilisateur change le mot de passe, le nouveau mot de passe est retourné dans argchg["nouveau"]
            argchg["uid"]=uid;
            argchg["actuel"]=mdp;
            argchg["mineqpassworddoitchanger"]=message;

            let res=window.openDialog("chrome://pacome/content/pacomechgmdp.xul","","chrome,modal,centerscreen,titlebar",argchg);

            if (null!=argchg["nouveau"]){
              PacomeEcritLog(PACOME_LOGS_MDP, "le mot de passe a chang\u00e9", "");
              mdp=argchg["nouveau"];
            }

          }

          if (null==argchg["nouveau"]) {

            //v3 mettre à jour les comptes
            MajMdpClient(uid, mdp);
          }

          window.arguments[0].res=1;
          window.arguments[0].mdp=mdp;

          window.close();

          return;

        }
        else
        {
          //#7754: Prise en compte du cas d'authentification Cerbere depuis un compte Mél sans auth Cerbere activée
          if(SsoPassword)
            PacomeEcritLog(PACOME_LOGS_MDP, "sso non disponible, code:", code);
          else
            PacomeEcritLog(PACOME_LOGS_MDP, "mot de passe non valide, code:", code);

          //le mot de passe n'est pas valide ou erreur
          //mot de passe non valide
          if (49==code){

            // cas mot de passe aurait du etre changé (mantis 5393)
            if (""!=message &&
                0==message.indexOf("GRILLED : ")){

              let msgsrv=message.substr(10);
              PacomeAfficheMsgId3("PacomeMdpErreurSrvTitre", PacomeMessageFromId("PacomeMdpNonValide"), msgsrv);

              passerHorsLigne();

              //annulation
              window.arguments[0].res=-1;
              window.arguments[0].mdp="";

              window.close();
              return;

            }
            else
            {
              //#7754: Prise en compte du cas d'authentification Cerbere depuis un compte Mél sans auth Cerbere activée
              if(SsoPassword)
                PacomeAfficheMsgIdMsgId("PacomeMdpErreurSrvTitre", "PacomeSsoDesactive");
              else
                PacomeAfficheMsgIdMsgId("PacomeMdpErreurSrvTitre", "PacomeMdpNonValide");
            }
          }
          else if (-1==code)
          {
            let msgerr=PacomeMessageFromId("PacomeMdpErreurSrvLib");

            let res=PacomeMsgConfirmBt(PacomeMessageFromId("PacomeMdpErreurSrvTitre"), msgerr, "Continuer", "Hors ligne");

            PacomeTrace("Pacomemdp PacomeMsgConfirmBt res="+res);

            //v2.4: 1->continuer
            if (1!=res){

              //passage en mode déconnecté
              PacomeEcritLog(PACOME_LOGS_MDP, "erreur du serveur - passage en mode deconnecte", "");
              passerHorsLigne();
              //annulation
              window.arguments[0].res=-1;
              window.arguments[0].mdp="";

            }  else{

              PacomeEcritLog(PACOME_LOGS_MDP, "erreur du serveur - mot de passe force", "");

              window.arguments[0].res=1;
              window.arguments[0].mdp=mdp;
            }

            window.close();
            return;

          } else{
            PacomeAfficheMsgId2("PacomeMdpNonValide", msgReq);
          }

          let bt=document.getElementById("pacomemdp.btValider");
          bt.removeAttribute("disabled");
          let txtuid=document.getElementById("pacomemdp.mdp");
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



//v1.2 - préférence serveur pacomemdp2 de changement de mot de passe
const PACOME_PREF_CHGMDP="pacome.chgmdp";

//url de la page de modification de mot de passe
//v0.94 modifiable par la préférence "pacome.urlmdp"
//v1.2 - changement de serveur
const PACOME_URL_CHGMDP="https://pacome.s2.m2.e2.rie.gouv.fr/pacomemdp2.php";



/**
*  verifie la saisie du mot de passe
*
*
*  @return si succes retourne true
* si erreur retourne false
*
*  implémentation :

Pour suivre Cerbere, la regle sera:
Les expression regulieres suivantes doit s'appliquer au mot de passe
si non :
 /[A-Z]/ => message d'erreur "au moins 1 majuscule"
 /[a-z]/ => message d'erreur "au moins 1 minuscule"
 /[0-9]/ => message d'erreur "au moins 1 chiffre"
 /[\x21-\x2F\x3A-\x3F\x5B-\x5F\x7B-\x7E]/ => "au moins 1 caractère spécial"

  courrielleur v7 : longueur minimale de 1 caractère (unique vérification)
*/
function VerifSaisiemdp(){

  let nouveau=document.getElementById("pacomechgmdp.nouveau");
  nouveau=nouveau.value;

  PacomeSetErreurGlobale(-1, PacomeMessageFromId("ChgMdpRegleMdp"));

  //test longueur
  if (0==nouveau.length){
    return false;
  }

  PacomeSetErreurGlobale(0, "");

  let confirm=document.getElementById("pacomechgmdp.confirm");
  confirm=confirm.value;
  if (nouveau!=confirm){
    PacomeSetErreurGlobale(-1, PacomeMessageFromId("ChgMdpDiffere"));
    return false;
  }

  return true;
}


function setBoutonsChgMdp(etat){

  let bt=document.getElementById("pacomechgmdp.btQuitter");
  bt.disabled=!etat;
  bt=document.getElementById("pacomechgmdp.btValider");
  bt.disabled=!etat;
}


/**
*  gestion du bouton Valider
*
*
*  @return si succes retourne true
* si erreur retourne false
*
*  implémentation :
*  V0.94 : envoie la requete de changement de mot de passe en mode asynchrone
*/
function ValiderChgMdp(){

  let actuel=document.getElementById("pacomechgmdp.ancien").value;
  let nouveau=document.getElementById("pacomechgmdp.nouveau").value;
  let uid=document.getElementById("pacomechgmdp.uid").value;

  //vérifier la saisie
  let bOk=VerifSaisiemdp();
  if (!bOk){
    PacomeMsgNotif("Erreur", gPacomeMsgErreur);
    return;
  }

  //mise à jour du serveur
  window.setCursor("wait");

  setBoutonsChgMdp(false);

  try{

    //url modifiable dans les préférences
    //nom de préférence: 'pacome.urlmdp'
    //si valeur absente, on utilise la valeur par défaut
    let url=PACOME_URL_CHGMDP;
    let p=PacomeGetCharPref(PACOME_PREF_CHGMDP);
    if (null!=p && 0!=p.length) url=p;

    PacomeEcritLog(PACOME_LOGS_CHGMDP, "url serveur de changement de mot de passe", url);

    let httpRequest=new XMLHttpRequest();

    let param="op=chgmdp&uid="+encodeURIComponent(uid);
    param+="&mdp="+encodeURIComponent(actuel);
    param+="&nouv="+encodeURIComponent(nouveau);
    param+="&extver="+encodeURIComponent(VERSION_PACOME);

    httpRequest.onreadystatechange= function() {

      switch(httpRequest.readyState) {
      case 4:
        let statut=0;
        try{
          statut=httpRequest.status;
        }
        catch(ex1){
          //statut=0;
          //v1.1.1
          let req=httpRequest.channel.QueryInterface(Components.interfaces.nsIRequest);
          statut=req.status;
        }
        window.setCursor("auto");

        if(statut!=200){

          PacomeEcritLog(PACOME_LOGS_CHGMDP, "code de reponse du serveur", statut);

          if (0==statut){
            PacomeSetErreurGlobale(-1, PacomeMessageFromId("ChgMdpErreurMajSrv"));
          }
          else{
            try{
              //v1.11
              PacomeSetErreurGlobale(statut, PacomeMessageFromId("pacomesrverr-"+statut));
            }
            catch(ex1){
              PacomeSetErreurGlobale(statut, PacomeMessageFromId("ChgMdpErreurMajSrv"));
            }
            PacomeSetErreurGlobale(statut, PacomeMessageFromId("ChgMdpErreurMajSrv"));
          }

          PacomeAfficheMsgId2("ChgMdpErreurMajSrv",gPacomeMsgErreur);

        }  else{

          let reponse=httpRequest.responseText;
          httpRequest=null;
          //analyser le code retour
          let code=-1;
          let msg=PacomeMessageFromId("ChgMdpErreurSrv");
          let tab=reponse.split(";");
          for (var i=0;i<tab.length;i++){
            let res=tab[i].split("=");
            if (res[0]=="code"){
              code=res[1];
            }
            if (res[0]=="message"){
              msg=res[1];
            }
          }

          PacomeEcritLog(PACOME_LOGS_CHGMDP, "code retour (0=succes):", code);

          if (code!=0){
            gPacomeMsgErreur="Code="+code+"\nMesssage="+msg;
            let pos=reponse.indexOf("message=");
            if (-1!=pos){
              msg=reponse.substr(pos+"message=".length);
            }
            let msg23=msg.split(" - erreur:");
            if (2==msg23.length)
              PacomeAfficheMsgId3("ChgMdpErreurMajSrv", msg23[0], msg23[1]);
            else
              PacomeAfficheMsgId2("ChgMdpErreurMajSrv", msg);

            setBoutonsChgMdp(true);
            return;
          }

          //v3 mettre à jour les comptes
          MajMdpClient(uid, nouveau);

          //retourner le nouveau mot de passe
          window.arguments[0]["nouveau"]=nouveau;

          PacomeAfficheMsgId("ChgMdpMajOk");
          window.close();
        }

        setBoutonsChgMdp(true);

        break;
      }
    };

    httpRequest.open("POST", url, true, null, null);

    httpRequest.setRequestHeader("Content-Type","application/x-www-form-urlencoded;charset=ISO-8859-1");
    httpRequest.send(param);

  } catch(ex){
    PacomeEcritLog(PACOME_LOGS_CHGMDP, "echec changement mot de passe", ex);
    window.setCursor("auto");
    PacomeAfficheMsgId2("ChgMdpErreurSrvEx",ex);
  }
}



/**
*  initialisation de la boîte de changement de mot de passe
*
*
*  @return si succes retourne true
* si erreur retourne false
*
*  implémentation :
*
*/
function InitChgMdp(){

  let util=document.getElementById("pacomechgmdp.uid");
  let lib=document.getElementById("pacomechgmdp.texte1");

  //utilisateur prérempli
  let uid=window.arguments[0].uid;
  if (uid && ""!=uid){
    util.value=uid;
  }
  //mot de passe actuel pré-rempli
  let actuel=document.getElementById("pacomechgmdp.ancien");
  actuel.focus();
  if (window.arguments[0].actuel &&
      ""!=window.arguments[0].actuel){

    actuel.value=window.arguments[0].actuel;
    let nouveau=document.getElementById("pacomechgmdp.nouveau");
    nouveau.focus();
  }

  //09-04-2004 si paramètre 'mineqpassworddoitchanger' spécifié changer le texte de la boîte
  if ((window.arguments[0].mineqpassworddoitchanger)&&(window.arguments[0].mineqpassworddoitchanger!="")){
    lib.value=window.arguments[0].mineqpassworddoitchanger;
  }

  // 0004357: Vérifier que lors des erreurs de cht de mot de passe par wsAmande l'explication est bien remontée à l'utilisateur
  // requete pour obtenir texte changement de mot de passe
  pacomeReqMdptxt();

  return true;
}



/**
*  mise à jour des mots de passe du client
*
*  @param  uid attribut ldap uid de l'utilisateur
*  @param  mdp mot de passe
*
*  @return si succes retourne true
* si erreur retourne false
*
*  implémentation : change les mots de passe des serveurs du type imap, pop ou smtp
*  pour les noms d'utilisateur de la forme 'uid' et 'uid'+'.-.'
*  change les mots de passe temporaire (dans les instances en mémoire)
*  Les mots de passe ne sont changés qui si la valeur originale est vide
*/
function MajMdpClient(uid,mdp){

  PacomeTrace("MajMdpClient uid="+uid);

  //serveurs entrants
  PacomeTrace("MajMdpClient serveurs entrants");
  let uid2=uid+".-.";
  let serveurs=MailServices.accounts.allServers;
  for (var i=0;i<serveurs.length;i++){
    let s=serveurs.queryElementAt(i, Components.interfaces.nsIMsgIncomingServer);
    if (s){
      if ((s.type=="imap" || s.type=="pop3")&&
          MSG_MELANIE2==PacomeAuthUtils.TestServeurMelanie2(s.hostName)) {
        if (PacomeAuthUtils.GetUidReduit(s.username)==uid){
          PacomeTrace("MajMdpClient mise a jour uid entrant:"+s.username);
          s.password=mdp;
        }
      }
    }
  }

  //serveurs smtp
  PacomeTrace("MajMdpClient serveurs smtp");
  serveurs=MailServices.smtp.servers;
  while (serveurs.hasMoreElements()){
    let s=serveurs.getNext().QueryInterface(Components.interfaces.nsISmtpServer);
    if (MSG_MELANIE2==PacomeAuthUtils.TestServeurMelanie2(s.hostname)){
      if (PacomeAuthUtils.GetUidReduit(s.username)==uid){
        PacomeTrace("MajMdpClient mise a jour uid sortant:"+s.username);
        s.password=mdp;
      }
    }
  }

  return true;
}


function GetOrgForUid(uid){

  let idents=MailServices.accounts.allIdentities;
  for (var i=0;i<idents.length;i++){
    let ident=idents.queryElementAt(i, Components.interfaces.nsIMsgIdentity);
    let pref="mail.identity."+ident.key+".identityName";
    let uid_pref=Services.prefs.getCharPref(pref);
    if (uid_pref==uid) {
      return ident.organization;
    }
  }
  return "";
}

// 0004357: Vérifier que lors des erreurs de cht de mot de passe par wsAmande l'explication est bien remontée à l'utilisateur
// requete pour obtenir texte changement de mot de passe
function pacomeReqMdptxt(){

  let url=PACOME_URL_CHGMDP;
  let p=PacomeGetCharPref(PACOME_PREF_CHGMDP);
  if (null!=p && 0!=p.length)
    url=p;

  url+="?op=mdptxt&extver="+encodeURIComponent(VERSION_PACOME);

  let httpRequest=new XMLHttpRequest();

  httpRequest.onreadystatechange= function() {

    switch(httpRequest.readyState) {
    case 4:
      let statut=0;
      try{
        statut=httpRequest.status;
      }
      catch(ex1){
        //statut=0;
        //v1.1.1
        let req=httpRequest.channel.QueryInterface(Components.interfaces.nsIRequest);
        statut=req.status;
      }

      if(statut==200){

        // code=;message=
        let reponse=httpRequest.responseText;
        httpRequest=null;

        if (reponse && 0<reponse.length){

          let pos=reponse.indexOf("code=0;message=");
          if (0==pos){
            let msg=reponse.substr("code=0;message=".length);
            if (msg && msg.length){

              let ctrl=document.getElementById("mdptxt");
              //ctrl.textContent=msg;
              ctrl.value=msg;
              PacomeTrace("Message de changement de mot de passe (serveur):"+msg);

              window.sizeToContent();
            }
          }
        }
        return;

      }  else{

        PacomeTrace("Erreur de lecture du message de changement de mot de passe (serveur)");
      }

      break;

    default: return;
    }
  };

  PacomeTrace("pacomeReqMdptxt url:"+url);
  httpRequest.open("GET", url, true, null, null);
  httpRequest.send(null);
}


function onCarMDP(event){

  let tp=document.getElementById("majuscule");

  if (event.getModifierState("CapsLock")){
    let mdp=document.getElementById("pacomemdp.mdp");
    tp.openPopup(mdp, "bottomleft");

  } else {

    if ("open"==tp.state){
      tp.hidePopup();
    }
  }
}

function blurMDP(){
  let tp=document.getElementById("majuscule");
  tp.hidePopup();
}

function focusMDP(){

}
