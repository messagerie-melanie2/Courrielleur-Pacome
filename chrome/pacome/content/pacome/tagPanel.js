
ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource:///modules/mailServices.js");
ChromeUtils.import("resource://gre/modules/cm2tags.jsm");
ChromeUtils.import("resource:///modules/pacomeUtils.jsm");



// suffixe ajouté dans la liste pour les etiquettes partagées
const INFOTAG_PARTAGE=" (partagée)";

// balp configurees avec uid et libelle (pour tooltip partages)
var gBalpConf=[];
// bali configurees
var gBaliConf=[];
// derniere synchro
var gSynchro;



function cm2TagsInit(){

  // balp et bali configurees avec uid et libelle (pour tooltip partages)
  let allServers=MailServices.accounts.allServers;
  for (var server of fixIterator(allServers,
                                Components.interfaces.nsIMsgIncomingServer)){

    if (("imap"==server.type ||
        "pop3"==server.type) &&
        null!=server.getCharValue("pacome.confid")) {
      let uid=server.username;
      let compos=SplitUserBalp(uid);
      if (compos && 2==compos.length)
        uid=compos[1];
      let balp=[];
      balp["uid"]=uid;
      balp["cn"]=server.prettyName;
    
      if (2!=compos.length)
        gBaliConf.push(balp);
      else
        gBalpConf.push(balp);
    }
  }
  // derniere synchro
  gSynchro=cm2TagsReadConfigFile();

  // bouton partager : liste des boites
  InitMenuPartage();
}

function InitMenuPartage(){

  // bouton partager : liste des boites
  // n'afficher que les balp paramétrées
  let partageMenu=document.getElementById("partageMenu");
  let nb=partageMenu.childNodes.length;
  while (nb){
    let elem=partageMenu.childNodes[nb-1];
    partageMenu.removeChild(elem);
    nb--;
  }

  let nbp=gSynchro.droitsbalp.length;
  let nbc=gBalpConf.length;

  for (var i=0;i<nbp;i++){
    let balp=gSynchro.droitsbalp[i];
    let uid=balp["uid"];
    let compos=SplitUserBalp(uid);
    if (compos && 2==compos.length)
      uid=compos[1];
    var labelList = [];

    for (var b=0;b<nbc;b++)
    if (gBalpConf[b]["uid"]==uid){
      let cn=gBalpConf[b]["cn"];

      let item=document.createElement("menuitem");
      item.setAttribute("label", cn);
      item.setAttribute("value", uid);
      item.setAttribute("type", "checkbox");
      item.setAttribute("oncommand",  "partageTagButton('"+uid+"');");
      
      // #5846
      if(!labelList.includes(cn))
      {
        labelList.push(cn);
        partageMenu.appendChild(item);
      }
    }
  }
}

// selection d'une etiquette
function cm2TagSelect(){

  let boutonPart=document.getElementById("partageTagButton");
  let tag=GetSelectedTag();
  if (null==tag){
    boutonPart.disabled=true;
    return;
  }
  let key=tag.getAttribute("value");

  //pas de suppression d'etiquette partagee
  //aucun droit=> griser
  //etiquette par defaut => griser
  let tagdefaut=IsEtiquetteDefaut(key);
  let boutonDel=document.getElementById("removeTagButton");

  if (tagdefaut){
    boutonDel.disabled=true;
    boutonPart.disabled=true;
  } else{
    boutonDel.disabled=false;
    boutonPart.disabled=false;
  }
  if (0==gSynchro.droitsbalp.length)
    boutonPart.disabled=true;
}


// menus du bouton partager
function UpdateMenuPartage(){

  let tag=GetSelectedTag();
  let key=tag.getAttribute("value");
  let partageMenu=document.getElementById("partageMenu");
  let nb=partageMenu.childNodes.length;
  for (var m=0;m<nb;m++){
    let item=partageMenu.childNodes[m];
    let uid=item.getAttribute("value");
    let partage=uid+":"+key;
    let p=cm2TagsPartageExist(partage);
    item.setAttribute("checked", p);
  }
}


// bouton partager
function partageTagButton(pourbalp){

  let tag=GetSelectedTag();
  if (null==tag)
    return;
  let key=tag.getAttribute("value");

  cm2TagsPartage(key, pourbalp);

  let lib=MailServices.tags.getTagForKey(key);
  tag.label=lib+INFOTAG_PARTAGE;

  cm2TagSelect();
}

// bouton synchroniser
function synchroTagButton(){

  if (Services.io.offline){
    PacomeAfficheMsgId("EtiqDeconnecte");
    return;
  }

  gSynchro=null;// force rechargement

  // retour synchronisation
  function retourSynchro(result, config){

    // si succes => mettre a jour la liste des etiquettes
    if (0==result.code){

      // derniere synchro
      gSynchro=cm2TagsReadConfigFile();

      RebuilTagList();

      // bouton partager : liste des boites
      InitMenuPartage();

      PacomeAfficheMsgId("EtiqSynchroSucces");

      // mode generation d'un rapport de tests
      if (Services.prefs.prefHasUserValue(ETIQUETTES_TEST) &&
          Services.prefs.getBoolPref(ETIQUETTES_TEST)){
        SauveRapportTest(config);
      }

    } else {

      PacomeAfficheMsgId("EtiqSynchroErreur");

      // log erreur dans la console
      Services.console.logStringMessage("Erreur de synchronisation des etiquettes code:'"+result.code+"' - erreur:'"+result.erreur+"'");
    }
  }

  // lancer la synchronisation
  cm2SynchroniseTags(retourSynchro);
}


// retourne l'etiquette selectionnee dans la liste, null si aucune
function GetSelectedTag(){

  let index=gDisplayPane.mTagListBox.selectedIndex;
  if (index >= 0){
    let tag=gDisplayPane.mTagListBox.getItemAtIndex(index);
    return tag;
  }
  return null;
}


// force la reconstruction de la liste des etiquettes
function RebuilTagList(){

  let nb=gDisplayPane.mTagListBox.itemCount;
  if (0==nb)
    return;

  while (nb--)
    gDisplayPane.mTagListBox.removeItemAt(0);

  gDisplayPane.buildTagList();

  cm2TagSelect();
}

// bouton edition
function BoutonEdit(){

  // mettre a jour information (partagée)
  let tag=GetSelectedTag();
  if (null==tag)
    return;
  let key=tag.getAttribute("value");

  let lib=MailServices.tags.getTagForKey(key);

  if (cm2TagsKeyIsShared(key) &&
      !IsEtiquetteDefaut(key)){
    tag.label=lib+INFOTAG_PARTAGE;
  } else
    tag.label=lib;
}

// reconstruction de la liste des etiquettes
// surcharge tb // #5846
gDisplayPane.buildTagList=function(){

  let tagArray=MailServices.tags.getAllTags({});

  for (var i=0; i<tagArray.length; ++i){
    let taginfo=tagArray[i];
    if (cm2TagsKeyIsShared(taginfo.key) &&
        !IsEtiquetteDefaut(taginfo.key)){
      let item=gDisplayPane.appendTagItem(taginfo.tag+INFOTAG_PARTAGE, taginfo.key, taginfo.color);
      item.setAttribute("tooltip", "cm2tagtip");
    }
    else
      gDisplayPane.appendTagItem(taginfo.tag, taginfo.key, taginfo.color);
  }
}

// enregistrement du rapport de tests
function SauveRapportTest(config){

  if (null==config.rapportdetest)
    return;

  const nsIFilePicker=Components.interfaces.nsIFilePicker;
  let fp=Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
  fp.init(window, "Enregistrer le rapport de synchronisation", nsIFilePicker.modeSave);
  fp.appendFilters(nsIFilePicker.filterHTML);
  fp.defaultExtension="html";

  fp.open(function(rv){

    if (nsIFilePicker.returnOK==rv ||
        nsIFilePicker.returnReplace==rv){

      let fichier=fp.file;

      if (!fichier.exists()){
        fichier.create(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, FileUtils.PERMS_FILE);
      }

      let outStream=Components.classes["@mozilla.org/network/file-output-stream;1"].
                    createInstance(Components.interfaces.nsIFileOutputStream);
      outStream.init(fichier, FileUtils.MODE_WRONLY|FileUtils.MODE_CREATE|FileUtils.MODE_TRUNCATE, FileUtils.PERMS_FILE,0);

      let converter=Components.classes["@mozilla.org/intl/converter-output-stream;1"].
                              createInstance(Components.interfaces.nsIConverterOutputStream);
      converter.init(outStream, "UTF-8", 0, 0);
      converter.writeString(config.rapportdetest);
      converter.close();
    }
  });
}


/*function majtagtip(listitem){

  if (null==gSynchro ||
      null==listitem)
    return;

  let cm2tagtip=document.getElementById("cm2tagtiplabel");
  cm2tagtip.textContent="";
  let sep="";

  let key=listitem.getAttribute("value");
  if (null==key)
    return;

  // balis
  let nb=gBaliConf.length;
  for (var i=0;i<nb;i++){
    let uid=gBaliConf[i]["uid"];
    let par=uid+":"+key;
    if (gSynchro.balis.includes(par)){
      cm2tagtip.textContent+=sep+gBaliConf[i]["cn"];
      sep="\u000A";
      break;
    }
  }

  // balps
  nb=gBalpConf.length;
  for (var i=0;i<nb;i++){
    let uid=gBalpConf[i]["uid"];
    let par=uid+":"+key;
    if (gSynchro.partages.includes(par)){
      cm2tagtip.textContent+=sep+gBalpConf[i]["cn"];
      sep="\u000A";
    }
  }
}*/

// Surcharge de tb: appends the tag to the tag list box
gDisplayPane.appendTagItem=function(aTagName, aKey, aColor)
{
  cm2TagsInit();
  
  let item = this.mTagListBox.appendItem(aTagName, aKey);
  item.style.color = aColor;
  if(aTagName.includes(INFOTAG_PARTAGE))
    item.setAttribute("tooltiptext", getToolTip(aKey));
  
  return item;
}

// #5846 génération des tooltip
function getToolTip(key)
{
  //console.log("getToolTip, key = " + key);
  toolTip = "";
  sep = "";
  var toolTipArray = [];
  
  // balis
  let nb=gBaliConf.length;
  for (var i=0;i<nb;i++){
    let uid=gBaliConf[i]["uid"];
    let par=uid+":"+key;
    if (gSynchro.balis.includes(par)){
      toolTipArray.push(sep+gBaliConf[i]["cn"]);//toolTip+=sep+gBaliConf[i]["cn"];
      sep="\u000A";
    }
  }
  
  // balps
  nb=gBalpConf.length;
  for (var i=0;i<nb;i++){
    let uid=gBalpConf[i]["uid"];
    let par=uid+":"+key;
    if (gSynchro.partages.includes(par)){
      toolTipArray.push(gBalpConf[i]["cn"]);//toolTip+=sep+gBalpConf[i]["cn"];
      sep="\u000A";
    }
  }
  
  uniqToolTipArray = [...new Set(toolTipArray)];
  toolTip = uniqToolTipArray.join(sep);

  //console.log("tooltip = " + toolTip);
  return(toolTip);
}
