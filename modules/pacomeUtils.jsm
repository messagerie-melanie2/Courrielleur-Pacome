/**
* Module pour courrielleur mce
* fonctions utilitaires
*
*/


ChromeUtils.import("resource:///modules/mce/customMinistere.jsm");

const Cc=Components.classes;
const Ci=Components.interfaces;

this.EXPORTED_SYMBOLS=["GetUidReduit", "SplitUserBalp", "MCE_SEP_BOITE"];

// retourne la partie gauche d'un identifiant 'uid MCE_SEP_BOITE par'
function GetUidReduit(uid) {
  //console.log('*********** GetUidReduit '+uid);

  // a-t-on une fonction personnalisée pour ce ministère ?
  if (typeof CUSTOM_GETUIDREDUIT !== "undefined") {
    return CUSTOM_GETUIDREDUIT(uid);
  }

  if (null == uid || "" == uid)
    return null;

  let pos = uid.indexOf(MCE_SEP_BOITE);

  if (-1 != pos) {
    return uid.substr(0, pos);
  }

  return uid;

}

// Extrait l'identifiant utilisateur et l'identifiant BALP d'un identifiant user.-.balp
function SplitUserBalp(uid) {
  //console.log('*************** SplitUserBalp '+uid)

  // a-t-on une fonction personnalisée pour ce ministère ?
  if (typeof CUSTOM_SPLITUSERBALP !== "undefined") {
    return CUSTOM_SPLITUSERBALP(uid);
  }

  if (null == uid || "" == uid)
    return null;

  const compos = uid.split(MCE_SEP_BOITE);
  if (2==compos.length) {
    // console.log('***********',compos);
    return compos;
  } else {
    // console.log('**********',[uid,null]);
    return [uid];
  }
}
