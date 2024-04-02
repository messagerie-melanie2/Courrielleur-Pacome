pref("pacome.trace", false);
pref("pacome.majauto", true);


//url du serveur pacome de parametrage
pref("pacome.urlparam", "https://dev.autoconf.mce.interieur.rie.gouv.fr/param.php");

//url du serveur pacome de verification de mot de passe
pref("pacome.urlmdp", "https://dev.autoconf.mce.interieur.rie.gouv.fr/pacomemdp2.php");
//pref("pacome.urlmdp", "http://pacome.ida.melanie2.i2/pacomemdp2.php");

//url du serveur pacome de changement de mot de passe
pref("pacome.chgmdp", "https://dev.autoconf.mce.interieur.rie.gouv.fr/pacomemdp2.php");

//pacome v6 : version initiale du parametrage proxy
pref("pacome.proxy.version", "14");


pref("pacome.lienpolitiquemdp", "https://info.messagerie.interieur.rie.gouv.fr/");

pref("pacome.aideparametrage", "https://info.messagerie.interieur.rie.gouv.fr/");

pref("pacome.aidemiseajour", "https://info.messagerie.interieur.rie.gouv.fr/");


//url synchronisation des etiquettes
pref("courrielleur.etiquettes.service", "https://dev.autoconf.mce.interieur.rie.gouv.fr/pacometags.php");

// synchronisation automatique des etiquettes au demarrage (si true)
pref("courrielleur.etiquettes.majauto", true);

// synchronisation des etiquettes : generation d'un rapport de tests
pref("courrielleur.etiquettes.rapportdetest", false);


// si true affiche la case Enregistrer le mot de passe dans le courrielleur (true pour Min.Int)
pref("pacome.memomdp", true);


// si false, l'outil de migration Pablo vers MCE est désactivé
pref("pacome.migrationPablo.enabled", true);
