/**
* Synchronisation des etiquettes courrielleur
* fonctions utilitaires
*

 *  Format des donnees:
 *  Le document est au format JSON
 *
 *
 *  Liste complète des étiquettes
 *  -----------------------------
 *  "etiquettes":[ ETIQ, ... ],
 *  ETIQ={"key":"","tag":"","color":"","ordinal":""}
 *   => même attributs que nsIMsgTag
 *
 *  Liste des boîtes
 *  -----------------------------
 *   "boites": [<uid>, ...]
 *  liste d'identifiants.
 *  Par convention, identifiant principal en premier.
 *
 *  Liste des étiquettes partagées
 *  -----------------------------
 *  liste d'identifiants d'étiquettes partagées.
 *  "partages":[balp:key,...]
 *  balp : nom de partage
 *  key : identifiant d'étiquette
 *
 *  Liste des étiquettes synchronisées
 *  -----------------------------
 *  (retournées par le service lors de la synchronisation précédente)
 *  "synchro":{
 *  	"etiquettes":[ ETIQ, ... ],
 *  	"partages":[balp:key,...]
 *  },

Format de configuration retournee par le service
================================================
 *  Liste complète des étiquettes
 *  -----------------------------
 *  "etiquettes":[ ETIQ, ... ],
 *  ETIQ={"key":"","tag":"","color":"","ordinal":""}
 *   => même attributs que nsIMsgTag
 *
 *  Liste des boîtes partagees avec droit d'ecriture
 *  -----------------------------
 *   "droitsbalp": [<uid>, ...]
 *  liste d'identifiants.
 *  Par convention, identifiant principal en premier.
 *
 *  Liste des étiquettes partagées
 *  -----------------------------
 *  liste d'identifiants d'étiquettes partagées.
 *  "partages":[balp:key,...]
 *  balp : nom de partage
 *  key : identifiant d'étiquette

*/


ChromeUtils.import("resource:///modules/mailServices.js");
ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource:///modules/iteratorUtils.jsm");
ChromeUtils.import("resource://gre/modules/FileUtils.jsm");


const EXPORTED_SYMBOLS = ["ConfigCm2Tags", "MajConfigCm2Tags",
                    "cm2TagsPartage", "cm2TagsKeyIsShared", "cm2TagsPartageExist",
                    "cm2TagsSauveConfig", "cm2TagsReadConfigFile", "cm2TagsPrefsKeyRemove",
                    "IsEtiquetteDefaut", "cm2SynchroniseTags", "cm2TagsListeBoites",
                    "ETIQUETTES_SERVICE_URL", "ETIQUETTES_TEST", "ETIQUETTES_DEFAUT", "ETIQUETTES_PARTAGE_PREF"];


// url du service de synchronisation
// modifiable avec la preference "courrielleur.etiquettes.service"
const ETIQUETTES_SERVICE_URL="https://mceweb2.si.minint.fr/pacome/pacometags.php";


// liste des etiquettes courrielleur par defaut
const ETIQUETTES_DEFAUT=["$label1","$label2","$label3","$label4","$label5","~commente","~rdvtraite"];

// preference liste des partages
const ETIQUETTES_PARTAGE_PREF="courrielleur.etiquettes.partages";

// synchronisation des etiquettes : generation d'un rapport de tests
const ETIQUETTES_TEST="courrielleur.etiquettes.rapportdetest";


// log console (mode debug)
function cm2DebugMsg(msg){

  //Services.console.logStringMessage("*** cm2tags.jsm "+msg);
}

// retourne la liste des partages depuis la preference
// retourne vide si pas de valeur
function GetPrefPartageVals(){
  
  if (Services.prefs.prefHasUserValue(ETIQUETTES_PARTAGE_PREF)){
    return Services.prefs.getCharPref(ETIQUETTES_PARTAGE_PREF);
  }
  return "";
}


/**
* Retourne la liste des identifiants de boites (configurees pacome)
* l'identifiant principal doit etre en premier
*/
function cm2TagsListeBoites(){

  let boites=new Array();
  let allServers=MailServices.accounts.allServers;
  for (let server of fixIterator(allServers,
                                Components.interfaces.nsIMsgIncomingServer)){

    if (("imap"==server.type ||
         "pop3"==server.type) &&
         (null!=server.getCharValue("pacome.confid")) ) {
      cm2DebugMsg("cm2TagsListeBoites uid:"+server.username);
      boites.push(server.username);
    }
  }

  if (0==boites.length){
    return boites;
  }

  let uid=MailServices.accounts.defaultAccount.incomingServer.username;
  if (uid){
    let pos=uid.indexOf(".-.");
    if (-1!=pos) {
      uid=uid.substr(0,pos);
    }
  }
  cm2DebugMsg("cm2TagsListeBoites uid principal:"+uid);
  cm2DebugMsg("cm2TagsListeBoites nombre:"+boites.length);

  if (boites[0]!=uid){
    cm2DebugMsg("cm2TagsListeBoites tri des boites - uid principal en premier");
    boites.sort(function(a,b){
      if (a==uid) return -1;
      if (b==uid) return 1;
      return 0;
    });
  }
  
  cm2DebugMsg("cm2TagsListeBoites:"+JSON.stringify(boites));
  return boites;
}


/**
* Construit et retourne la configuration du client
* retour objet de configuration
* voir:Format de configuration pour la synchronisation
*/
function ConfigCm2Tags(){

  let config_cm2={};

  config_cm2.etiquettes=MailServices.tags.getAllTags({});

  let synchro=cm2TagsReadConfigFile();
  config_cm2.synchro={};
  config_cm2.synchro.etiquettes=synchro.etiquettes;
  config_cm2.synchro.partages=synchro.partages;

  config_cm2.boites=cm2TagsListeBoites();

  config_cm2.partages=[];
  let vals=GetPrefPartageVals();
  // nouveau format
  if (0!=vals.length){
    let pos=vals.indexOf(":");
    if (-1==pos){
      // ancien format non compatible
      vals="";
      Services.prefs.setCharPref(ETIQUETTES_PARTAGE_PREF, "");
    }
    config_cm2.partages=vals.split(",");
  } else{
    config_cm2.partages=[];
  }

  return config_cm2;
}


/**
* Met à jour la configuration a partir de la configuration du service
* specifie la nouvelle configuration
* strConfigService: chaine json de configuration retournee par le service
* retour 0 si succes, -1 si erreur
*/
function MajConfigCm2Tags(strConfigService){

  //conversion strConfigService
  let configService=JSON.parse(strConfigService);
  if (null==configService){
    cm2DebugMsg("MajConfigCm2Tags erreur conversion strConfigService");
    return -1;
  }

  //etiquettes client
  let etiquettes=MailServices.tags.getAllTags({});

  //etiquettes client supprimmees (dans etiquettes, pas dans configService)
  for (let cl of etiquettes){
    // on ne supprime pas les etiquettes par defaut
    if (IsEtiquetteDefaut(cl.key))
      continue;
    let present=false;
    for (let srv of configService.etiquettes){
      if (srv.key==cl.key){
        present=true;
        break;
      }
    }
    if (!present){
      cm2DebugMsg("MajConfigCm2Tags etiquettes client supprimmee cl:"+cl.key);
      MailServices.tags.deleteKey(cl.key);
    }
  }

  //etiquettes client ajoutees (dans configService, pas dans etiquettes)
  for (let srv of configService.etiquettes){
    let present=false;
    for (let cl of etiquettes){
      if (srv.key==cl.key){
        present=true;
        break;
      }
    }
    if (!present){
      cm2DebugMsg("MajConfigCm2Tags etiquettes serveur ajoutee srv:"+srv.key);
      MailServices.tags.addTagForKey(srv.key, srv.tag, srv.color, srv.ordinal);
    }
  }

  //etiquettes client mise a jour (dans configService et dans etiquettes)
  for (let srv of configService.etiquettes){
    for (let cl of etiquettes){
      if (srv.key==cl.key){
        if (srv.tag!=cl.tag){
          cm2DebugMsg("MajConfigCm2Tags mise a jour du libelle d'etiquette:"+srv.key);
          MailServices.tags.setTagForKey(srv.key, srv.tag);
        }
        if (srv.color!=cl.color){
          cm2DebugMsg("MajConfigCm2Tags mise a jour de la couleur d'etiquette:"+srv.key);
          MailServices.tags.setColorForKey(srv.key, srv.color);
        }
        break;
      }
    }
  }

  //mise a jour partages
  Services.prefs.setCharPref(ETIQUETTES_PARTAGE_PREF, configService.partages);

  Services.prefs.savePrefFile(null);

  return 0;
}


/**
* Marque une etiquette comme partagee
* key : identifiant etiquette
* uid : identifiant ou nom de partage de boite partagee
* retour true si succes, false sinon
*/
function cm2TagsPartage(key, uid){

  cm2DebugMsg("cm2TagsPartage key:"+key+" - uid:"+uid);

  // tag thunderbird
  let exist=MailServices.tags.isValidKey(key);
  if (!exist){
    return false;
  }
  
  // nom de partage
  let partage=uid;
  let pos=uid.indexOf(".-.");
  if (-1!=pos) {
    partage=uid.substr(pos+3);
  }
  partage+=":"+key;

  exist=cm2TagsPartageExist(partage);
  if (exist){
    cm2DebugMsg("cm2TagsPartage existe deja");
    return false;
  }
  cm2DebugMsg("cm2TagsPartage nouveau partage:"+partage);
  let vals=GetPrefPartageVals();

  if (0!=vals.length)
    vals+=",";
  vals+=partage;
  Services.prefs.setCharPref(ETIQUETTES_PARTAGE_PREF, vals);

  return true;
}


/**
* Teste si un identifiant d'etiquette est present dans la preference 'courrielleur.etiquettes.partages'
* key :identifiant de l'etiquette
* return true si present, false sinon
*/
function cm2TagsKeyIsShared(key){

  let vals=GetPrefPartageVals();
  if (""==vals)
    return false;
  let tab=vals.split(",");
  for (let i=0;i<tab.length;i++){
    let pos=tab[i].indexOf(":");
    if (-1!=pos){
      let val=tab[i].substr(pos+1);
      if (val==key)
        return true;
    }
  }

  return false;
}

/**
* Teste si un partage est present dans la preference 'courrielleur.etiquettes.partages'
* partage : <nom de partage>:<identifiant de l'etiquette>
* return true si present, false sinon
*/
function cm2TagsPartageExist(partage){

  let vals=GetPrefPartageVals();
  if (""==vals)
    return false;
  let tab=vals.split(",");
  return tab.includes(partage);
}



/**
* Retire un partage dans la preference 'courrielleur.etiquettes.partages'
* partage : <nom de partage>:<identifiant de l'etiquette>
* return true si succes
*/
function cm2TagsPrefsKeyRemove(partage){

  let vals=GetPrefPartageVals();
  if (""==vals)
    return false;
  let tab=vals.split(",");
  let tab2=tab.filter(function(value){return value!=partage});
  vals=tab2.join(",");
  Services.prefs.setCharPref(ETIQUETTES_PARTAGE_PREF, vals);

  return true;
}


/**
* Enregistre la configuration des etiquettes
* utilise pour memoriser l'etat apres synchronisation
* envoye a la prochaine synchronisation
* Enregistre dans le fichier CM2TAGS_SAVE dans le profil utilisateur
* config : objet au format JSON contenant la reponse du serveur
* {"etiquettes":[], "partages":[], droitsbalp:[]}
* enregistre etiquettes et partages
* retourne 0 si succes, sinon -1
*/
const CM2TAGS_SAVE="cm2tags.json";

function cm2TagsSauveConfig(config){

  try{

    if (null==config.etiquettes){
      cm2DebugMsg("cm2TagsSauveConfig null==config.etiquettes");
      return -1;
    }

    let cm2tags={};
    cm2tags.etiquettes=config.etiquettes;
    cm2tags.droitsbalp=config.droitsbalp;
    cm2tags.balis=config.balis;
    cm2tags.partages=config.partages;

    let donnees=JSON.stringify(cm2tags);

    let fichier=Services.dirsvc.get("ProfD", Components.interfaces.nsIFile);
    fichier.append(CM2TAGS_SAVE);

    if (!fichier.exists()){
      fichier.create(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, FileUtils.PERMS_FILE);
    }

    let outStream=Components.classes["@mozilla.org/network/file-output-stream;1"].
                  createInstance(Components.interfaces.nsIFileOutputStream);
    outStream.init(fichier, FileUtils.MODE_WRONLY|FileUtils.MODE_CREATE|FileUtils.MODE_TRUNCATE, FileUtils.PERMS_FILE,0);

    let converter=Components.classes["@mozilla.org/intl/converter-output-stream;1"].
                  createInstance(Components.interfaces.nsIConverterOutputStream);
    converter.init(outStream, "UTF-8", 0, 0);
    converter.writeString(donnees);
    converter.close();

    return 0;

  } catch(ex){
    cm2DebugMsg("cm2TagsSauveConfig exception:"+ex);
  }
  return -1;
}

/**
* Lit la configuration memorisee dans le fichier CM2TAGS_SAVE
* retourne objet json des etiquettes, null si erreur ou "" si pas de fichier
*/
function cm2TagsReadConfigFile(){

  try{

    let configStr="";

    let fichier=Services.dirsvc.get("ProfD", Components.interfaces.nsIFile);
    fichier.append(CM2TAGS_SAVE);

    if (!fichier.exists()){
      cm2DebugMsg("cm2TagsReadConfigFile fichier inexistant");
      return [];
    }

    let inStream=Components.classes["@mozilla.org/network/file-input-stream;1"].
                  createInstance(Components.interfaces.nsIFileInputStream);
    inStream.init(fichier, -1, 0, 0);

    let converter=Components.classes["@mozilla.org/intl/converter-input-stream;1"].
                  createInstance(Components.interfaces.nsIConverterInputStream);
    converter.init(inStream, "UTF-8", 0, 0);

    let str={};
    let read=0;
    do {
      read=converter.readString(0xffffffff, str);
      configStr+=str.value;
    } while (read!=0);

    converter.close();

    cm2DebugMsg("cm2TagsReadConfigFile configStr:"+configStr);

    let config=JSON.parse(configStr);

    // ancien format non compatible
    if (config.etiquettes && config.partages)
      return config;

    return {"etiquettes":[],"partages":[]};

  } catch(ex){
    cm2DebugMsg("cm2TagsReadConfigFile exception:"+ex);
  }
  return null;
}


/**
* Fonction principal du processus de synchronisation des etiquettes
* Séquence de synchronisation :
* - Construction de la configuration de client
* - Requête http auprès du service : envoie de la configuration
* - Attente retour du service
* - Si succès, traitement de la configuration retournée par le service :
* - - mise a jour du client (étiquettes et partages)
* - - sauvegarde de la nouvelle configuration
* - Si erreur, log et/ou message
*
* fncRappel : fonction de rappel (result, config)
*             result : objet resultat avec membre code (entier) et erreur (chaine)
*                       retour 0 si succes, code si erreur
*             config : objet de configuration retournee par le service
*/
function cm2SynchroniseTags(fncRappel){

  // Construction de la configuration de client
  let configCm2=ConfigCm2Tags();
  if (null==configCm2){
    // erreur de configuration client
    cm2DebugMsg("cm2SynchroniseTags erreur de configuration client");
    if (fncRappel){
      let result={};
      result.code="-1";
      result.erreur="Erreur de configuration client";
      fncRappel(result, null);
    }
    return;
  }
  
  // si aucune boite pas de synchro
  if (0==configCm2.boites.length){
    cm2DebugMsg("cm2SynchroniseTags aucune boîte pas de synchro");
    if (fncRappel){
      let result={};
      result.code="-1";
      result.erreur="Pas de synchronisation car aucune boite n'est configuree";
      fncRappel(result, null);
    }
    return;
  }

  // mode generation d'un rapport de tests
  if (Services.prefs.prefHasUserValue(ETIQUETTES_TEST) &&
      Services.prefs.getBoolPref(ETIQUETTES_TEST)){
    configCm2.rapportdetest={};
  }

  let strConfig=JSON.stringify(configCm2);
  if (null==strConfig){
    // erreur de configuration client
    cm2DebugMsg("cm2SynchroniseTags erreur de configuration client (conversion)");
    if (fncRappel){
      let result={};
      result.code="-1";
      result.erreur="Erreur de configuration client";
      fncRappel(result, null);
    }
    return;
  }

  //fonction de rappel pour la reponse du service
  function ReponseService(result, strConfigService){
    cm2DebugMsg("cm2SynchroniseTags ReponseService");
    if (200!=result.code){
      //erreur
      if (fncRappel){
        fncRappel(result, strConfigService);
      }
      return;
    }
    // mise a jour de la configuration client
    let res=MajConfigCm2Tags(strConfigService);
    if (0!=res){
      if (fncRappel){
        let result={};
        result.code="-1";
        result.erreur="Erreur de mise a jour de la configuration client";
        fncRappel(result, null);
      }
      return;
    }

    // enregistrer la configuration
    let configService=JSON.parse(strConfigService);
    res=cm2TagsSauveConfig(configService);
    if (0!=res){
      if (fncRappel){
        let result={};
        result.code="-1";
        result.erreur="Erreur d'enregistrement de la synchronisation";
        fncRappel(result, null);
      }
      return;
    }

    if (fncRappel){
      let result={};
      result.code="0";
      result.erreur="Succes de la mise a jour de la configuration client";
      fncRappel(result, configService);
    }

    return;
  }

  cm2ReqServiceTags(strConfig, ReponseService);

}


/**
* Fonction interne pour l'envoi de la requete au service
* strConfig : chaine JSON de la configuration client
* fncRappel : fonction de rappel (result, config)
*             result : objet resultat avec membre code (entier) et erreur (chaine)
*                       retour 0 si succes, code si erreur
*             config : configuration retournee par le service
*/
function cm2ReqServiceTags(strConfig, fncRappel){

  // Requête http auprès du service : envoie de la configuration
  // asynchrone
  let httpRequest=new XMLHttpRequest();

  let url=ETIQUETTES_SERVICE_URL;
  try {
    url=Services.prefs.getCharPref("courrielleur.etiquettes.service");
  } catch(ex){}
  cm2DebugMsg("cm2ReqServiceTags url:"+url);
  cm2DebugMsg("cm2ReqServiceTags configuration:"+strConfig);


  httpRequest.open("POST", url, true);

  httpRequest.setRequestHeader("Accept-Charset", "UTF-8");
  httpRequest.setRequestHeader("Content-Type", "application/json");

  httpRequest.onload=function(aEvt) {

    let request=aEvt.target;
    let statut=request.status;

    if (200==statut){

      //extraire la reponse
      let contentType=request.getResponseHeader('Content-Type');
      if (null!=contentType &&
          null!=httpRequest.responseText &&
          0<httpRequest.responseText.length &&
          0==contentType.indexOf('application/json')){
        cm2DebugMsg("cm2ReqServiceTags onload responseText:'"+httpRequest.responseText+"'");
        if (fncRappel){
          let result={};
          result.code=statut;
          result.erreur="";
          fncRappel(result, httpRequest.responseText);
        }
        return;
      }

    }
    // erreur
    cm2DebugMsg("cm2ReqServiceTags onload statut:'"+statut+"' - erreur:'"+request.statusText+"'");
    if (fncRappel){
      let result={};
      result.code=statut;
      result.erreur=request.statusText;
      fncRappel(result, null);
    }
    return;
  }

  httpRequest.onerror=function(aEvt) {

    let request=aEvt.target;
    let statut=request.status;
    cm2DebugMsg("cm2ReqServiceTags onerror statut:'"+statut+"' - erreur:'"+request.statusText+"'");
    if (fncRappel){
      let result={};
      result.code=(0==statut)?-1:statut;
      result.erreur=(0==statut)?"Erreur réseau lors de la synchronisation":request.statusText;
      fncRappel(result, null);
    }
    return;
  }
  cm2DebugMsg("cm2ReqServiceTags envoie de la requete");
  httpRequest.send(strConfig);
}


// teste si une cle correspond a une etiquette par defaut
// dans la liste ETIQUETTES_DEFAUT
// retour true si etiquette par defaut, sinon false
function IsEtiquetteDefaut(cle){

  if (-1==ETIQUETTES_DEFAUT.indexOf(cle))
    return false;
  return true;
}
