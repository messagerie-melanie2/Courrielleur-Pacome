pref("pacome.trace", true);
pref("pacome.majauto", true);

// prise en compte de Kerberos
pref("pacome.krbauth.enabled", true);
// url de recuperation de l'identite
pref("pacome.krbauth.whoami", "https://mce-conf.krb.gendarmerie.fr/krbWhoAmI.php");
// url de negotiate autorisees au lancement
pref("network.negotiate-auth.trusted-uris", ".krb.gendarmerie.fr, intranet.sso.gendarmerie.fr");

//url du serveur pacome de parametrage
pref("pacome.urlparam", "https://mce-conf.krb.gendarmerie.fr/param.php");
pref("pacome.urlparam.krb", "http://intranet.krb.gendarmerie.fr:14382/krbparam.php");
//url du serveur pacome de parametrage securisee hors krb ?
pref("pacome.urlparam.auth", true);

//url du serveur pacome de verification de mot de passe
pref("pacome.urlmdp", "http://localhost:14382/pacomemdp2.php");

//url du serveur pacome de changement de mot de passe
pref("pacome.chgmdp", "http://localhost:14382/pacomemdp2.php");

//pacome v6 : version initiale du parametrage proxy
pref("pacome.proxy.version", "14");


pref("pacome.lienpolitiquemdp", "http://bureautique.metier.e2.rie.gouv.fr/supports/messagerie/courrielleur/co/81changerMDP.html");

pref("pacome.aideparametrage", "http://bureautique.metier.e2.rie.gouv.fr/supports/messagerie/courrielleur/co/85gererCompte.html");

pref("pacome.aidemiseajour", "http://bureautique.metier.e2.rie.gouv.fr/supports/messagerie/courrielleur/co/85gererCompte.html");


//url synchronisation des etiquettes
pref("courrielleur.etiquettes.service", "https://mce-conf.krb.gendarmerie.fr/pacometags.php");
pref("courrielleur.etiquettes.service.krb", "https://mce-conf.krb.gendarmerie.fr/krbpacometags.php");

// synchronisation automatique des etiquettes au demarrage (si true)
pref("courrielleur.etiquettes.majauto", true);

// synchronisation des etiquettes : generation d'un rapport de tests
pref("courrielleur.etiquettes.rapportdetest", false);
