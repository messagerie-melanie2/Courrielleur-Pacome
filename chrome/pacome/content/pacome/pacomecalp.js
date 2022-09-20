
ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource:///modules/mailServices.js");
ChromeUtils.import("resource://calendar/modules/calUtils.jsm");


const couleurs=["#9999CC","#666699","#660000","#663300","#996633","#003300","#003333","#003399",
"#000066","#330066","#660066","#990000","#993300","#CC9900","#006600","#336666",
"#0033FF","#000099","#660099","#990066","#CC0000","#CC3300","#FFCC00","#009900",
"#006666","#0066FF","#0000CC","#663399","#CC0099","#FF0000","#FF3300","#FFFF00",
"#00CC00","#009999","#0099FF","#0000FF","#9900CC","#FF0099","#CC3333","#FF6600",
"#FFFF33","#00FF00","#00CCCC","#00CCFF","#3366FF","#9933FF","#FF00FF","#FF6666",
"#FF6633","#FFFF66","#66FF66","#66CCCC","#00FFFF","#3399FF","#9966FF","#FF66FF",
"#FF9999","#FF9966","#FFFF99","#99FF99","#66FFCC","#99FFFF","#66CCFF","#9999FF",
"#FF99FF","#FFCCCC","#FFCC99","#FFFFCC","#CCFFCC","#99FFCC","#CCFFFF","#99CCFF","#CCCCFF","#FFCCFF"];



//preference de la liste des agendas non utilisés
//format <url>PACOME_IGNORE_CAL_SEPELEMS[<url>PACOME_IGNORE_CAL_SEPELEMS]
const PACOME_IGNORE_CAL="pacome.cal.ignorecals";
const PACOME_IGNORE_CAL_SEPELEMS=";";

const PACOME_CAL_PROVIDER="caldav";

/*
  Migration DGGN : on supprime les calendriers avec des URL MCE non geres par Pacome
 */
function DGGNpurgeCalMCEnonPacome() {

  //agendas actifs
  let calMan = cal.getCalendarManager();
  if (null == calMan) {
    PacomeTrace("DGGNpurgeCalMCEnonPacome pas de configuration d'agenda");
    return -1;
  }
  let supprimes = 0;
  try {
    let agendas = calMan.getCalendars({});
    const nb = agendas.length;
    PacomeTrace("DGGNpurgeCalMCEnonPacome nb=" + nb);

    for (var i = 0; i < nb; i++) {
      let agenda = agendas[i];
      if (agenda && agenda.getProperty("uri")) {

        let uri = agenda.getProperty("uri");
        PacomeEcritLog(PACOME_LOGS_MODULE, "Agenda tbsync ? " + uri, agenda.getProperty("tbSyncProvider") ? "oui":"non");
        PacomeEcritLog(PACOME_LOGS_MODULE, "Agenda OBM ? " + uri, agenda.getProperty("X-OBM-EMAIL") ? "oui":"non");

        if (uri && ((uri.match(/^https:\/\/mce-dav.krb.gendarmerie.fr\//)
            && agenda.getProperty("tbSyncProvider") && !agenda.getProperty("pacome"))
            || agenda.getProperty("X-OBM-EMAIL")) ) {

          PacomeEcritLog(PACOME_LOGS_MODULE, "Ancien agenda OBM ou MCE non Pacome trouve tbSync?" + uri, agenda.getProperty("tbSyncProvider"));
          calMan.unregisterCalendar(agenda);
          calMan.removeCalendar(agenda);
          supprimes += 1;
          PacomeEcritLog(PACOME_LOGS_MODULE, "Ancien agenda MCE non Pacome supprime", uri);
          PacomeTrace("DGGNpurgeCalMCEnonPacome agenda supprime url=" + uri);
        }
      }
    }
  } catch(ex){
    PacomeTrace("DGGNpurgeCalMCEnonPacome exception:"+ex);
    PacomeEcritLog(PACOME_LOGS_MODULE, "DGGNpurgeCalMCEnonPacome exception:"+ex, ex);
    return -2;
  }
  return supprimes;
}

/* calcul la configuration des agendas pour les requetes client
 retourne le contenu pour la fonction PacomeDocumentConfig
 format:
<agendas>
<agenda [uid='<uid>'] libelle='<libelle>' url='<url>' [color='<color>'] usage='true'|'false' [alarme='true'|'false']/>
...
</agendas>
*/
function pacomeCalConfiguration() {

  let config="<agendas>";

  //agendas actifs
  let calMan=cal.getCalendarManager();

  if (null==calMan) {
    PacomeTrace("pacomeCalConfiguration pas de configuration d'agenda");
    config+="</agendas>";
    return config;
  }

  let agendas=calMan.getCalendars({});

  const nb=agendas.length;

  PacomeTrace("pacomeCalConfiguration nb="+nb);

  for (var i=0; i<nb; i++) {

    let agenda=agendas[i];

    if (agenda && agenda.getProperty("pacome")) {

      let url=agenda.getProperty("uri");
      PacomeTrace("pacomeCalConfiguration url="+url);
      //identite - l'utilisateur peut l'avoir supprime
      let ident=null;
      let key=agenda.getProperty("imip.identity.key");
      PacomeTrace("pacomeCalConfiguration key="+key);
      if (null!=key && ""!=key)
        ident=pacomeCalIdentiteFromKey(key);
      if (null==ident || ""==ident) {
        // prendre identite par defaut
        ident=MailServices.accounts.defaultAccount.defaultIdentity;
      }
      PacomeTrace("pacomeCalConfiguration ident="+ident);
      let uid="";
      if (null!=ident) {
        try {
          let pref="mail.identity."+ident.key+".identityName";
          uid=Services.prefs.getCharPref(pref);
        } catch(ex) {}
      }
      PacomeTrace("pacomeCalConfiguration uid="+uid);

      let alarme="true";
      if (agenda.getProperty("suppressAlarms"))
        alarme="false";

      let color=agenda.getProperty("color");

      let lib=pacomeRemplaceCars(agenda.getProperty("name"));

      let cache=agenda.getProperty("cache.enabled");
      let readonly=agenda.getProperty("readOnly");
      let refreshInterval=agenda.getProperty("refreshInterval");
      if (null==refreshInterval) refreshInterval='';

      let cfg="<agenda uid='"+uid+"' libelle='"+lib+"' url='"+url+"' color='"+color+
                "' usage='true' alarme='"+alarme+"' cache='"+cache+
                "' readonly='"+readonly+"' refreshInterval='"+refreshInterval+"'/>";

      config+=cfg;
    }
  }

  //agendas non utilisés
  if (Services.prefs.prefHasUserValue(PACOME_IGNORE_CAL)){

    let ignorecals=Services.prefs.getCharPref(PACOME_IGNORE_CAL);

    PacomeTrace("pacomeCalConfiguration PACOME_IGNORE_CAL:"+ignorecals);

    if (0!=ignorecals.length && ""!=ignorecals.length){

      let urls=ignorecals.split(PACOME_IGNORE_CAL_SEPELEMS);

      for (var i=0;i<urls.length;i++){

        let url=urls[i];
        if (null==url || ""==url)
          continue;

        //vérifier que l'agenda n'est pas utilise (cas bug utilise/non utilise)
        if (PACOME_ETAT_PARAM==pacomeCalEtat(url))
          continue;

        let cfg="<agenda uid='' libelle='' url='"+url+"' color='' usage='false' alarme='' refreshInterval=''/>";

        config+=cfg;
      }
    }
  }

  config+="</agendas>";

  return config;
}



//ajoute un agenda non utilisé
//elemcal : element <agenda> de parametrage
//<agenda url="" libelle="" uid="" alarme=""/>
function pacomeCalIgnore(elemcal) {

  let url=elemcal.getAttribute("url");
  pacomeCalIgnoreUL(url);
}

function pacomeCalIgnoreUL(url) {

  let ignorecals="";
  let ignorecals2="";

  if (Services.prefs.prefHasUserValue(PACOME_IGNORE_CAL)){

    ignorecals=Services.prefs.getCharPref(PACOME_IGNORE_CAL);
  }
  let bpresent=false;
  if (0!=ignorecals.length && ""!=ignorecals.length){

    let cals=ignorecals.split(PACOME_IGNORE_CAL_SEPELEMS);

    for (var i=0;i<cals.length;i++){

      let ag=cals[i];
      if (null==ag || ""==ag)
        break;

      if (url==ag)
        bpresent=true;

      ignorecals2+=ag+PACOME_IGNORE_CAL_SEPELEMS;
    }
  }
  if (!bpresent) {
    ignorecals2+=url+PACOME_IGNORE_CAL_SEPELEMS;
  }

  Services.prefs.setCharPref(PACOME_IGNORE_CAL, ignorecals2);
}

//retire un agenda de la liste des ignores
//elemcal : element <agenda> de parametrage
function pacomeCalSupIgnore(elemcal) {

  let url=elemcal.getAttribute("url");
  pacomeCalSupIgnoreUL(url);
}

function pacomeCalSupIgnoreUL(url) {

  let ignorecals="";
  let ignorecals2="";

  if (Services.prefs.prefHasUserValue(PACOME_IGNORE_CAL)){

    ignorecals=Services.prefs.getCharPref(PACOME_IGNORE_CAL);
  }
  let bpresent=false;
  if (0!=ignorecals.length && ""!=ignorecals.length){

    let cals=ignorecals.split(PACOME_IGNORE_CAL_SEPELEMS);

    for (var i=0;i<cals.length;i++){

      let ag=cals[i];
      if (null==ag || ""==ag)
        break;

      if (url!=ag)
        ignorecals2+=ag+PACOME_IGNORE_CAL_SEPELEMS;
      else
        bpresent=true;
    }
  }

  if (bpresent)
    Services.prefs.setCharPref(PACOME_IGNORE_CAL, ignorecals2);
}


//ajoute un agenda
//elemcal : element <agenda> de parametrage
//retourne agenda cree, si existe le modifie
function pacomeCalAjoutAgenda(elemcal) {

  let calMan=cal.getCalendarManager();
  if (null==calMan)
    return null;

  //tester si existe
  let agenda=pacomeCalGetAgenda(elemcal);
  if (null!=agenda) {
    PacomeTrace("pacomeCalAjoutAgenda agenda existant url="+elemcal.getAttribute("url"));
    agenda=pacomeCalModifAgenda(elemcal);
    return agenda;
  }

  let url=elemcal.getAttribute("url");
  PacomeTrace("pacomeCalAjoutAgenda url="+url);
  let uid=elemcal.getAttribute("uid");
  let alarme=elemcal.getAttribute("alarme");
  let libelle=elemcal.getAttribute("libelle");
  let color=elemcal.getAttribute("color");
  let cache=elemcal.getAttribute("cache");
  let readonly=elemcal.getAttribute("readonly");
  let refreshInterval=elemcal.getAttribute("refreshInterval");

  PacomeTrace("pacomeCalAjoutAgenda createCalendar url:"+url);
  agenda=calMan.createCalendar(PACOME_CAL_PROVIDER, pacomeMakeURI(url));
  agenda.name=libelle;
  if ("false"==alarme)
    agenda.setProperty('suppressAlarms', true);

  let ident=pacomeCalIdentiteFromUid(uid);

  if (null!=ident)
    agenda.setProperty("imip.identity.key", ident.key);
  else
    PacomeTrace("pacomeCalAjoutAgenda aucune identite ne correspond uid="+uid);

  color=pacomeCalGetColor(color);
  agenda.setProperty("color", color);
  agenda.setProperty("pacome", true);

  if ("true"==cache)
    agenda.setProperty("cache.enabled", true);
  else
    agenda.setProperty("cache.enabled", false);
  if ("true"==readonly)
    agenda.setProperty("readOnly", true);
  else
    agenda.setProperty("readOnly", false);
  agenda.setProperty("refreshInterval", refreshInterval);

  PacomeTrace("pacomeCalAjoutAgenda registerCalendar");
  calMan.registerCalendar(agenda);

  return agenda;
}

//modifie un agenda
//elemcal : element <agenda> de parametrage
//retourne agenda modifie
function pacomeCalModifAgenda(elemcal) {

  let agenda=pacomeCalGetAgenda(elemcal);
  if (null==agenda) {
    PacomeTrace("pacomeCalModifAgenda agenda inexistant url="+elemcal.getAttribute("url"));
    return null;
  }

  let uid=elemcal.getAttribute("uid");
  let alarme=elemcal.getAttribute("alarme");
  let libelle=elemcal.getAttribute("libelle");
  let color=elemcal.getAttribute("color");
  let ident=pacomeCalIdentiteFromUid(uid);
  let key=agenda.getProperty("imip.identity.key");
  let cache=elemcal.getAttribute("cache");
  let readonly=elemcal.getAttribute("readonly");
  let refreshInterval=elemcal.getAttribute("refreshInterval");

  if (null==ident)
    PacomeTrace("pacomeCalModifAgenda aucune identite ne correspond uid="+uid);
  else if (ident.key!=key) {
    PacomeTrace("pacomeCalModifAgenda modifie imip.identity.key ancien="+key+" - nouveau="+ident.key);
    agenda.setProperty("imip.identity.key", ident.key);
  }
  if (libelle!=agenda.getProperty("name")){
    PacomeTrace("pacomeCalModifAgenda modifie libelle");
    agenda.setProperty("name", libelle);
  }
  if (alarme==agenda.getProperty("suppressAlarms")) {
    PacomeTrace("pacomeCalModifAgenda modifie alarme");
    agenda.setProperty("suppressAlarms", !alarme);
  }

  agenda.setProperty("pacome", true);

  if ("true"==cache)
    agenda.setProperty("cache.enabled", true);
  else
    agenda.setProperty("cache.enabled", false);

  if ("true"==readonly)
    agenda.setProperty("readOnly", true);
  else
    agenda.setProperty("readOnly", false);

  agenda.setProperty("refreshInterval", refreshInterval);

  PacomeTrace("pacomeCalSupAgenda agenda modifier url="+elemcal.getAttribute("url"));

  return agenda;
}

//supprime un agenda
//elemcal : element <agenda> de parametrage
//return true si ok
function pacomeCalSupAgenda(elemcal) {

  let url=elemcal.getAttribute("url");

  return pacomeCalSupAgendaUrl(url);
}

function pacomeCalSupAgendaUrl(url) {

  let calMan=cal.getCalendarManager();
  if (null==calMan)
    return false;

  let agenda=pacomeCalGetAgendaUrl(url);
  if (null==agenda) {
    PacomeTrace("pacomeCalSupAgendaUrl agenda inexistant url="+url);
    return false;
  }

  //marquer pacome à false pour éviter ajout non utilise depuis gPacomeCalManagerObserver
  agenda.setProperty("pacome", false);

  calMan.unregisterCalendar(agenda);
  calMan.removeCalendar(agenda);

  PacomeTrace("pacomeCalSupAgendaUrl agenda supprime url="+url);

  return true;
}

//recherche (test) si un agenda existe déjà
function pacomeCalGetAgenda(elemcal) {

  let url=elemcal.getAttribute("url");

  return pacomeCalGetAgendaUrl(url);
}

function pacomeCalGetAgendaUrl(url) {

  let calMan=cal.getCalendarManager();
  if (null==calMan)
    return null;

  let agendas=calMan.getCalendars({});

  let nb=agendas.length;

  PacomeTrace("pacomeCalGetAgenda nb="+nb);

  for (var i=0; i<nb; i++) {

    let agenda=agendas[i];

    PacomeTrace("pacomeCalGetAgenda agenda.uri:"+agenda.getProperty("uri"));

    if (agenda.getProperty("pacome")) {

      if (url==agenda.getProperty("uri")) {

        PacomeTrace("pacomeCalGetAgenda agenda existe url="+url);
        return agenda;
      }
    }
  }

  PacomeTrace("pacomeCalGetAgenda agenda absent url="+url);
  return null;
}


//retourne l'identifiant du compte de messagerie pour uid
function pacomeCalIdentiteFromUid(uid) {

  PacomeTrace("pacomeCalIdentiteFromUid uid="+uid);

  let idents=MailServices.accounts.allIdentities;

  for (var i=0;i<idents.length;i++){
    let ident=idents.queryElementAt(i,Components.interfaces.nsIMsgIdentity);

    let pref="mail.identity."+ident.key+".identityName";
    // la pref peut etre absente si on n'est pas sur un compte Pacome => null
    let uid_pref=Services.prefs.getCharPref(pref, null);

    PacomeTrace("pacomeCalIdentiteFromUid uid_pref="+uid_pref);
    if (uid_pref==uid) {
      return ident;
    }
  }

  PacomeTrace("pacomeCalIdentiteFromUid key=null uid="+uid);
  return null;
}

//retourne l'identite du compte de messagerie à partir de son identifiant imip.identity.key
function pacomeCalIdentiteFromKey(key) {

  let idents=MailServices.accounts.allIdentities;

  for (var i=0;i<idents.length;i++){
    let ident=idents.queryElementAt(i,Components.interfaces.nsIMsgIdentity);
    PacomeTrace("pacomeCalIdentiteFromKey ident.identityName="+ident.identityName);
    if (ident.key==key) {
      return ident;
    }
  }

  PacomeTrace("pacomeCalIdentiteFromKey null==ident key="+key);
  return null;
}


function pacomeMakeURI(url) {

  return Services.io.newURI(url, null, null);
}


//test l'etat d'un agenda
function pacomeCalEtat(url) {

  //parametre
  let calMan=cal.getCalendarManager();
  if (null==calMan) {
    return null;
  }

  let agendas=calMan.getCalendars({});

  let nb=agendas.length;

  PacomeTrace("pacomeCalEtat nb="+nb);

  for (var i=0; i<nb; i++) {

    let agenda=agendas[i];

    if (agenda && agenda.getProperty("pacome") &&
        url==agenda.getProperty("uri")) {
      return PACOME_ETAT_PARAM;
    }
  }

  //non utilise
  if (Services.prefs.prefHasUserValue(PACOME_IGNORE_CAL)) {

    let ignorecals=Services.prefs.getCharPref(PACOME_IGNORE_CAL);

    if (0!=ignorecals.length && ""!=ignorecals.length) {

      let cals=ignorecals.split(PACOME_IGNORE_CAL_SEPELEMS);

      for (var i=0;i<cals.length;i++) {

        let ag=cals[i];
        if (null==ag || ""==ag)
          break;

        if (url==ag)
          return PACOME_ETAT_IGNORE;
      }
    }
  }

  return PACOME_ETAT_ABSENT;
}

//ecouter pour le gestionnaire des calendriers (calICalendarManager)
var gPacomeCalManagerObserver={

  onCalendarRegistered : function(agenda) {

    PacomeTrace("gPacomeCalManagerObserver onCalendarRegistered agenda.id:"+agenda.id);

    if (agenda.getProperty("pacome")) {

      let url=agenda.getProperty("uri");

      PacomeTrace("gPacomeCalManagerObserver ajout d'un agenda pacome url="+url);

      pacomeCalSupIgnoreUL(url);
    }
  },
  onCalendarUnregistering : function(agenda) {

    PacomeTrace("gPacomeCalManagerObserver onCalendarUnregistering agenda.id:"+agenda.id);

    //un calendrier va etre supprime le marquer comme inutilise si pacome
    if (agenda.getProperty("pacome")) {

      let url=agenda.getProperty("uri");

      PacomeTrace("gPacomeCalManagerObserver suppression d'un agenda pacome url="+url);

      pacomeCalIgnoreUL(url);
    }
  },
  onCalendarDeleting : function(agenda) {

  }
};

//retourne une couleur inutilisee pour un agenda
function pacomeCalGetColor(color) {

  let calMan=cal.getCalendarManager();
  if (null==calMan)
    return null;
  let agendas=calMan.getCalendars({});

  let nb=agendas.length;
  if (0==nb)
    return color;

  let nbc=couleurs.length;
  for (var n=0;n<nbc;n++) {

    let c=couleurs[n];
    for (var i=0; i<nb; i++) {
      let agenda=agendas[i];
      if (c==agenda.getProperty("color"))
        break;
    }
    if (i==nb)
      return c;
  }
  return couleurs[nbc-1];
}
