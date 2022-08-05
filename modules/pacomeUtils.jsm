/**
* Module pour courrielleur mce
* fonctions utilitaires
*
*/


ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource:///modules/mce/customMinistere.jsm");

const Cc=Components.classes;
const Ci=Components.interfaces;

this.EXPORTED_SYMBOLS=[
  "gParams", "PacomeStoreParamsCreds", "PacomeFetchParamsCreds", "PacomeGetUrlParams",
  "GetUidReduit", "SplitUserBalp", "MCE_SEP_BOITE", "regServeursMCE"
];

const gParams = {
  //preference serveur pacomesrv
  PREF_URLPARAM: "pacome.urlparam",
  PREF_URLPARAM_KRB: "pacome.urlparam.krb",

  //url du serveur pacomesrv (parametrage)
  PACOME_URLPARAM: "http://pacome.s2.m2.e2.rie.gouv.fr/pacomesrv.php",
  PACOME_URLPARAM_KRB: "http://pacome.s2.m2.e2.rie.gouv.fr/krbpacomesrv.php",

  // valeur par defaut parametrage securise ?
  PACOME_URLPARAM_AUTH: false,
  // pref associee de parametrage securise
  PREF_URLPARAM_AUTH: "pacome.urlparam.auth",

  // preferences kerberos
  PREF_KRB_ENABLED: "pacome.krbauth.enabled",
  // preference user d'ignorer kerberos
  PREF_KRB_SKIP: "pacome.krbauth.skip",
};

function PacomeStoreParamsCreds(url, creds) {

  // racine de l'url pour le gestionnaire de mots de passe
  const url_root = url.replace(/^([a-z]+:\/\/[^\/]+(:\d+)?).*/, '$1');

  const nsLoginInfo = new Components.Constructor(
    "@mozilla.org/login-manager/loginInfo;1",
    Components.interfaces.nsILoginInfo,
    "init"
  );
  const authLoginInfo = new nsLoginInfo(
    url_root,
    null,
    'PACOME',
    creds.uid,
    creds.pw,
    "",
    ""
  );
  const passwordManager = Components.classes["@mozilla.org/login-manager;1"].getService(
    Components.interfaces. nsILoginManager
  );
  // on retire les anciens password enregistres (si avance/retour dans l'assistant)
  const logins = passwordManager.findLogins({}, url_root, null, 'PACOME');
  for (var i = 0; i < logins.length; i++) {
    // if (logins[i].username === creds.uid) { // on peut changer le login !
    passwordManager.removeLogin(logins[i]);
    //}
  }
  // on ajoute le password
  passwordManager.addLogin(authLoginInfo);
}

/**
 * Renvoie le(s) {username, password} stocke(s) dans le passwordManager pour l'url fournie
 * @param url string url de la page web qui renvoie le 401
 * @param first boolean veut-on le premier login uniquement ?
 * @returns {password: string, username: string}|{password: string, username: string}[]|null
 */
function PacomeFetchParamsCreds(url, first=true) {
  // racine de l'url pour le gestionnaire de mots de passe
  const url_root = url.replace(/^([a-z]+:\/\/[^\/]+(:\d+)?).*/, '$1');

  const passwordManager = Components.classes["@mozilla.org/login-manager;1"].getService(
    Components.interfaces. nsILoginManager
  );
  const logins = passwordManager.findLogins({}, url_root, null, 'PACOME');

  logins.forEach( e => { console.log('LLLLLLLLLLLLLLLLLLLLLLLL',e.username, e.hostname)})
  if (first)  {
    if (logins.length === 0) {
      // on renvoie un login vide plutÃ´t que null
      return {username:'', password:''}
    }
    return logins[0];

  } else {

    return logins;
  }
}

/**
 * Renvoie l'url de recuperation des parametrages, en fonction de la configuration et des choix de l'utilisateur (kerberos, authentification...)
 * @returns string
 */
function PacomeGetUrlParams() {
  const krb = Services.prefs.getBoolPref(gParams.PREF_KRB_ENABLED, false) && !Services.prefs.getBoolPref(gParams.PREF_KRB_SKIP, false);
  const url = Services.prefs.getCharPref(krb ? gParams.PREF_URLPARAM_KRB : gParams.PREF_URLPARAM, krb ? gParams.PACOME_URLPARAM_KRB : gParams.PACOME_URLPARAM);
  return url;
}

// retourne la partie gauche d'un identifiant 'uid MCE_SEP_BOITE par'
function GetUidReduit(uid) {
  //console.log('*********** GetUidReduit '+uid);

  // a-t-on une fonction personnalisee pour ce ministere ?
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

  // a-t-on une fonction personnalisee pour ce ministere ?
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
