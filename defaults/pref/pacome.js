pref("pacome.trace", false);
pref("pacome.majauto", true);


//url du serveur pacome de parametrage
pref("pacome.urlparam", "https://mceweb2.si.minint.fr/pacome/param.php");

//url du serveur pacome de verification de mot de passe
pref("pacome.urlmdp", "https://mceweb2.si.minint.fr/pacome/pacomemdp2.php");
//pref("pacome.urlmdp", "http://pacome.ida.melanie2.i2/pacomemdp2.php");

//url du serveur pacome de changement de mot de passe
pref("pacome.chgmdp", "https://mceweb2.si.minint.fr/pacome/pacomemdp2.php");

//pacome v6 : version initiale du parametrage proxy
pref("pacome.proxy.version", "14");


pref("pacome.lienpolitiquemdp", "http://bureautique.metier.e2.rie.gouv.fr/supports/messagerie/courrielleur/co/81changerMDP.html");

pref("pacome.aideparametrage", "http://bureautique.metier.e2.rie.gouv.fr/supports/messagerie/courrielleur/co/85gererCompte.html");

pref("pacome.aidemiseajour", "http://bureautique.metier.e2.rie.gouv.fr/supports/messagerie/courrielleur/co/85gererCompte.html");


//url synchronisation des etiquettes
pref("courrielleur.etiquettes.service", "https://mceweb2.si.minint.fr/pacome/pacometags.php");

// synchronisation automatique des etiquettes au demarrage (si true)
pref("courrielleur.etiquettes.majauto", true);

// synchronisation des etiquettes : generation d'un rapport de tests
pref("courrielleur.etiquettes.rapportdetest", false);

// si true affiche la case Enregistrer le mot de passe dans le courrielleur (true pour Min.Int)
pref("pacome.memomdp", true);