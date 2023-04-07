/**
 * Paramétrages spécifiques aux ministères
 *
 * Permet d'implémenter des fonctions personnalisées pour GetUidReduit et SplitUserBalp
 *
 * Un exemple d'implémentation est fourni ici. Il suffit de décommenter pour l'activer
 *
 * Si on n'a besoint de rien, il suffit de laisser le tableau optional_customs vide
 *
 */

var optional_customs = [/*"CUSTOM_GETUIDREDUIT", "CUSTOM_SPLITUSERBALP"*/];

this.EXPORTED_SYMBOLS=["MCE_SEP_BOITE", "regServeursMCE"].concat(optional_customs);


// separateur uid/boite partagee
const MCE_SEP_BOITE=".-.";

// expression pour le test des serveurs MCE (messagerie, agenda)
// const regServeursMCE=/^web-srv.mce.com$|^sabredav-srv.mce.com$/;
const regServeursMCE=/^mce-imap.krb.gendarmerie.fr$|^mce-dav.krb.gendarmerie.fr$/;

/*
// regexp maison
const maillocalregexp = /^(([a-zA-Z][a-zA-Z0-9-]+\.?[a-zA-Z0-9]+)(?:.-.([a-zA-Z][a-zA-Z0-9-]+\.?[a-zA-Z0-9\.]+)(?:%((?:(?:gendarmerie|police)\.)?interieur\.gouv\.fr))?)?)@((?:(?:gendarmerie|police)\.)?interieur\.gouv\.fr)$/;

function CUSTOM_GETUIDREDUIT(uid) {
  
    if (null==uid || ""==uid)
      return null;
  
    // voir https://regex101.com/r/8aKQTe/3
    // et pour JS : https://regex101.com/r/CWKxXM/2
    // [ 'sylvain.-.stc.bmpn.stsisi%interieur.gouv.fr@gendarmerie.interieur.gouv.fr',
    //   'sylvain.-.stc.bmpn.stsisi%interieur.gouv.fr',
    //   'sylvain',
    //   'stc.bmpn.stsisi',
    //   'interieur.gouv.fr',
    //   'gendarmerie.interieur.gouv.fr',
    //   index: 0,
    //   input: 'sylvain.-.stc.bmpn.stsisi%interieur.gouv.fr@gendarmerie.interieur.gouv.fr',
    //   groups: undefined ]
    // var re = /^(([a-zA-Z][a-zA-Z0-9-]+\.?[a-zA-Z0-9]+)(?:.-.([a-zA-Z][a-zA-Z0-9-]+\.?[a-zA-Z0-9\.]+)(?:%((?:(?:gendarmerie|police)\.)?interieur\.gouv\.fr))?)?)@((?:(?:gendarmerie|police)\.)?interieur\.gouv\.fr)$/;
    var matches = uid.match(maillocalregexp); 
    if (!matches || !matches[2] || !matches[5]) {
      return uid;
    }
  
    return matches[2] + '@' + (matches[4] ? matches[4] : matches[5]);
}
  
function CUSTOM_SPLITUSERBALP(uid) {

  if (null==uid)
    return null;
  if (""===uid)
    return [];

  const matches = uid.match(maillocalregexp);
  if (!matches || !matches[2] || !matches[5]) {
    return [uid];
  }

  if (!matches[3]) {
    return [ matches[2] + '@' + (matches[4] ? matches[4] : matches[5]) ];
  } else {
    return [
      matches[2] + '@' + (matches[4] ? matches[4] : matches[5]),
      matches[3] + matches[5],
    ];
  }
}

*/
