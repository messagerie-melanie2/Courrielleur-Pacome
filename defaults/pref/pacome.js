pref("pacome.trace", false);
pref("pacome.majauto", true);

// prise en compte de Kerberos
pref("pacome.krbauth.enabled", true);

// url de récupération de l'identité
pref("pacome.krbauth.whoami", "http://intranet.krb.gendarmerie.fr:14382/krbWhoAmI.php");
// url de negotiate autorisées au lancement
pref("network.negotiate-auth.trusted-uris", ".krb.gendarmerie.fr, intranet.sso.gendarmerie.fr");

//url du serveur pacome de parametrage
pref("pacome.urlparam", "https://pacome.s2.m2.e2.rie.gouv.fr/param.php");

//Gendarmerie ---
//pref("pacome.urlparam", "http://localhost:14382/param.php");
//pref("pacome.urlparam.krb", "http://intranet.krb.gendarmerie.fr:14382/krbparam.php");
//url du serveur pacome de parametrage sÃ©curisÃ©e hors krb ?
//pref("pacome.urlparam.auth", true);
//Gendarmerie ---

//url du serveur pacome de verification de mot de passe
pref("pacome.urlmdp", "https://pacome.s2.m2.e2.rie.gouv.fr/pacomemdp2.php");

//url du serveur pacome de changement de mot de passe
pref("pacome.chgmdp", "https://pacome.s2.m2.e2.rie.gouv.fr/pacomemdp2.php");


//Gendarmerie ---
//pref("pacome.urlmdp", "http://localhost:14382/pacomemdp2.php");
//pref("pacome.chgmdp", "http://localhost:14382/pacomemdp2.php");
//Gendarmerie ---

//pacome v6 : version initiale du parametrage proxy
pref("pacome.proxy.version", "14");


pref("pacome.lienpolitiquemdp", "http://bureautique.metier.e2.rie.gouv.fr/supports/messagerie/courrielleur/co/81changerMDP.html");

pref("pacome.aideparametrage", "http://bureautique.metier.e2.rie.gouv.fr/supports/messagerie/courrielleur/co/85gererCompte.html");

pref("pacome.aidemiseajour", "http://bureautique.metier.e2.rie.gouv.fr/supports/messagerie/courrielleur/co/85gererCompte.html");


//url synchronisation des etiquettes
pref("courrielleur.etiquettes.service", "https://pacome.s2.m2.e2.rie.gouv.fr/pacometags.php");

//Gendarmerie ---
//pref("courrielleur.etiquettes.service", "http://localhost:14382/pacometags.php");
//pref("courrielleur.etiquettes.service.krb", "http://intranet.krb.gendarmerie.fr:14382/krbpacometags.php");
//Gendarmerie ---

// synchronisation automatique des etiquettes au demarrage (si true)
pref("courrielleur.etiquettes.majauto", true);

// synchronisation des etiquettes : generation d'un rapport de tests
pref("courrielleur.etiquettes.rapportdetest", false);
