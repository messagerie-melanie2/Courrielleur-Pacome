
ChromeUtils.import("resource:///modules/pacomeUtils.jsm");

var gPacomeSaisieRegExp=null;

var gPacomeSaisieCtrl=null;

function InitPacomeSaisie(){

  //annulation par défaut
  window.arguments[0].res=0;

  document.getElementById("bandeau-titre").value=window.arguments[0].titre;
  document.getElementById("pacometexte").textContent=window.arguments[0].texte;
  document.getElementById("libelle").value=window.arguments[0].libelle;
  gPacomeSaisieCtrl=document.getElementById("valeur");
  gPacomeSaisieCtrl.value=window.arguments[0].valeur;
  gPacomeSaisieRegExp=window.arguments[0].regexpr;
  gPacomeSaisieCtrl.focus();

}

function btValider(){

  if (""==gPacomeSaisieCtrl.value){
    PacomeMsgNotif(window.arguments[0].titre, "Saisir une valeur");
    return;
  }

  window.arguments[0].valeur=gPacomeSaisieCtrl.value;
  window.arguments[0].res=1;
  window.close();
}

function btAnnuler(){
  window.arguments[0].res=0;
  window.close();
}

function ValideSaisie(){

  if (null==gPacomeSaisieRegExp) 
    return true;

  //caractères autorisés
  let str=gPacomeSaisieCtrl.value;
  if (""==str) 
    return true;
  str=str.match(gPacomeSaisieRegExp);
  if (null==str) {
    gPacomeSaisieCtrl.value="";
    return;
  }
  str=str[0];

  //v0.91 suppression .-.
  if (-1!=str.indexOf(MCE_SEP_BOITE,)){
    //message utilisateur
    PacomeAfficheMsgId("PacomeSaisieUidCar");
  }

  const re = new RegExp(MCE_SEP_BOITE, "g");
  str=str.replace(re, "");
  gPacomeSaisieCtrl.value=str;
}
