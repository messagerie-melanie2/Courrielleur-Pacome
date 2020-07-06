
//url de l'assistant de paramétrage
const PACOME_URLASSISTANT="chrome://pacome/content/pacomecompte.xul";

//url dialog changement de mot de passe
const PACOME_DLG_CHANGEMDP="chrome://pacome/content/pacomechgmdp.xul";

//url dialog création dossier local
const PACOME_DLG_DOSSIER="chrome://pacome/content/dossierlocal.xul";

//url fenetre de resultat
const PACOME_DLG_RESULTATS="chrome://pacome/content/pacomerespar.xul";

//url assistant de mise a jour
const PACOME_DLG_MAJ="chrome://pacome/content/pacomemaj.xul";



/* appel assistant de parametrage */
function PacomeAfficheAssistant(msgWindow, okCallback){

  PacomeTrace("PacomeAfficheAssistant");

  let args=new Object();
  args["msgWindow"]=msgWindow;
  args["okCallback"]=okCallback;

  window.openDialog(PACOME_URLASSISTANT,"","chrome,modal,centerscreen,titlebar,resizable=no", args);

  PacomeTrace("PacomeAfficheAssistant code retour="+args["res"]);

  return args["res"];
}

/* appel boite changement de mot de passe */
function PacomeDlgChangeMDP(uid){

  let args=new Object();
  args["uid"]=uid;

  window.openDialog(PACOME_DLG_CHANGEMDP,"","chrome,modal,centerscreen,titlebar,resizable=no",args);

  if (null!=args["nouveau"]){
    return args["nouveau"];
  }
  return null;
}

function PacomeDlgDossierLocal(){

  let args=new Object();

  window.openDialog(PACOME_DLG_DOSSIER,"","chrome,modal,centerscreen,titlebar,resizable=no", args);

  return args["res"];
}



/* appel assistant de mise a jour */
function PacomeAfficheDglMaj(docmaj){

  if (PacomeDlgMdpActive()){
    PacomeTrace("PacomeAfficheDglMaj fenetre authentication active");
    window.setTimeout(PacomeAfficheDglMaj, 5000, docmaj);
    return;
  }

  let args=new Object();
  args["docmaj"]=docmaj;

  window.openDialog(PACOME_DLG_MAJ,"","chrome,modal,centerscreen,titlebar,resizable=no",args);

}

/* affichage des resultats de parametrage */
function PacomeAfficheResultats(tblresultats, bredemarre){

  let args=new Object();
  args["resultats"]=tblresultats;
  args["bredemarre"]=bredemarre;

  window.openDialog(PACOME_DLG_RESULTATS,"","chrome,modal,centerscreen,titlebar,resizable=no",args);

}
