ChromeUtils.import("resource://gre/modules/Services.jsm");

/* certaines portions de code sont basées sur du code mozilla/lightning

* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Calendar component utils.
 *
 * The Initial Developer of the Original Code is
 *   Joey Minta <jminta@gmail.com>
 * Portions created by the Initial Developer are Copyright (C) 2006
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Philipp Kewisch <mozilla@kewis.ch>
 *   Daniel Boelzle <daniel.boelzle@sun.com>
 *   Berend Cornelius <berend.cornelius@sun.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */



const PREF_CATEGORIES="calendar.categories.names";


/*
*  Fonction principale de traitement des categories horde
* a partir du document pacome de paramétrage
*  docpacome : document xml pacome retourne par le serveur
* ajout et/ou met a jour les categories dans les preferences
* ne realise pas de suppression
*/
function pacomeCatsTraiteDoc(docpacome){

  PacomeEcritLog(PACOME_LOGS_MAJAUTO, "Processus de traitement des categories horde", "");

  try{

    //construire la liste des categories horde (tableau d'objets avec libelle/couleur)
    let catshorde=pacomeCatsConstruitCatHorde(docpacome);

    if (0==catshorde.length){
      PacomeTrace("Absence de categories horde dans le document du serveur");
      PacomeEcritLog(PACOME_LOGS_MAJAUTO, "Absence de categories horde dans le document du serveur", "");
      return;
    }
    PacomeTrace("pacomeCatsTraiteDoc nombre de categories horde:"+catshorde.length);

    //construire un tableau de categories lightning existante
    let catsLn=pacomeCatsGetCatLn();
    PacomeTrace("pacomeCatsTraiteDoc nombre de categories lightning existantes:"+catsLn.length);

    //mettre a jour les preferences
    pacomeCatsMajPrefs(catsLn, catshorde);

    PacomeEcritLog(PACOME_LOGS_MAJAUTO, "Fin de traitement des categories horde", "");

  } catch(ex){
    PacomeTrace("pacomeCatsTraiteDoc exception:"+ex);
  }
}


function pacomeCatsMajPrefs(catsLn, catshorde) {

  //categories ln
  let categories=new Array();
  for (var i=0;i<catsLn.length;i++){
    categories.push(catsLn[i].libelle);
  }

  //nouvelles categories/couleurs a modifier
  let categoryPrefBranch=Services.prefs.getBranch("calendar.category.color.");

  for (var i=0;i<catshorde.length;i++){
    let cat=catshorde[i];
    let index=pacomeCatsGetIndex(catsLn, cat.libelle);
    if (-1==index){
      //ajout
      PacomeEcritLog(PACOME_LOGS_MAJAUTO, "Categorie horde a ajouter:"+cat.libelle);
      categories.push(cat.libelle);

      if (""!=cat.color){
        let categoryNameFix=formatStringForCSSRule(cat.libelle);
        categoryPrefBranch.setCharPref(categoryNameFix, cat.color);
      }

    } else {
      //mise a jour?
      if (catsLn[index].libelle!=cat.libelle){
        for (var c=0;c<categories.length;c++){
          if (categories[c]==catsLn[index].libelle){
            categories[c]=cat.libelle;
            //supprimer ancienne preference couleur
            let categoryNameFix=formatStringForCSSRule(catsLn[index].libelle);
            try {
              categoryPrefBranch.clearUserPref(categoryNameFix);
            } catch (ex) {}
            break;
          }
        }
      }

      if (catsLn[index].color!=cat.color){
       // PacomeTrace("pacomeCatsMajPrefs mise a jour couleur de categorie:"+cat.libelle);
        //supprimer ancienne preference couleur
        let categoryNameFix=formatStringForCSSRule(catsLn[index].libelle);
        try {
          categoryPrefBranch.clearUserPref(categoryNameFix);
        } catch (ex) {}
        if (""!=cat.color){
          let categoryNameFix=formatStringForCSSRule(cat.libelle);
          categoryPrefBranch.setCharPref(categoryNameFix, cat.color);
        }
      }
    }
  }

  //sauvegarde libelles categories
  categories.sort(function (a,b){
                    let la=a.toLowerCase();
                    let lb=b.toLowerCase();
                    if (la==lb) return 0;
                    if (la>lb) return 1;
                    return -1;
                  });
                  
  function escapeComma(category) { 
    return category.replace(/,/g,"\\,"); 
  }
  categories=categories.map(escapeComma).join(",");

  let oldpref="";
  try{
    oldpref=Services.prefs.getStringPref(PREF_CATEGORIES);
  } catch(ex){}
  
  if (oldpref!=categories){
    PacomeTrace("pacomeCatsMajPrefs mise a jour de la preference des categories:"+categories);
    Services.prefs.setStringPref(PREF_CATEGORIES, categories);
  }

  //sauvegarde
  Services.prefs.savePrefFile(null);
}


/* construit la liste des categories horde
* a partir du document xml pacome de parametrage
* retourne un tableau d'objets avec libelle/couleur
*/
function pacomeCatsConstruitCatHorde(docpacome){

  let catshorde=new Array();

  let catuid=docpacome.getElementsByTagName("categorieshorde");

  if (null==catuid || 0==catuid.length)
    return catshorde;

  for (var i=0;i<catuid.length;i++){

    let cats=catuid[i].getElementsByTagName("categorie");
    if (0==cats.length)
      continue;

    for (var c=0;c<cats.length;c++){
      let cat=cats[c];
      let lib=cat.getAttribute("libelle");
      let color=cat.getAttribute("color");
      let index=pacomeCatsGetIndex(catshorde, lib);
      if (-1==index){
        let horde=new Object();
        horde.libelle=lib;
        horde.color=color;
        catshorde.push(horde);
      } else{
        catshorde[index].libelle=lib;
        catshorde[index].color=color;
      }
    }
  }

  return catshorde;
}


/*
*  Retourne l'index d'une categorie dans un tableau
* ne tient pas compte de la casse
* return -1 si absente
*/
function pacomeCatsGetIndex(tableau, libelle){

  let libmin=libelle.toLowerCase();

  for (var i=0;i<tableau.length;i++){
    let lib=tableau[i].libelle;
    if (libmin==lib.toLowerCase())
      return i;
  }
  return -1;
}


/*
*  Construit la liste des categories lightning
* retourne un tableau d'objets avec libelle/couleur
*/
function pacomeCatsGetCatLn(){

  let categories=new Array();

  let val;
  try{
    val=Services.prefs.getStringPref(PREF_CATEGORIES);
  } catch(ex){
    PacomeTrace("Pas de valeur pour la preference :"+PREF_CATEGORIES);
    return categories;
  }

  if (!val || ""==val) 
    return categories;

  //code basé sur Mozilla/lightning (fichier calUtils.js)
  function revertCommas(name) { 
    return name.replace(/\u001A/g, ","); 
  }
  let categoryList=val.replace(/\\,/g, "\u001A").split(",").map(revertCommas);

  //traiter les couleurs
  //code basé sur Mozilla/lightning (fichier categories.js)
  let categoryPrefBranch=Services.prefs.getBranch("calendar.category.color.");
  for (var i=0;i<categoryList.length;i++){

    let categoryNameFix=formatStringForCSSRule(categoryList[i]);
    let colorCode=""
    try{
      colorCode=categoryPrefBranch.getCharPref(categoryNameFix);
    } catch(ex){}

    let horde=new Object();
    horde.libelle=categoryList[i];
    horde.color=colorCode;

    categories.push(horde);
  }

  return categories;
}

/* fonction Mozilla/lightning (fichier calUtils.js) */
function formatStringForCSSRule(aString) {
  
  function toReplacement(ch) {
    // char code is natural number (positive integer)
    let nat = ch.charCodeAt(0);
    switch(nat) {
      case 0x20: // space
                return "_";
      default:
                return "-ux" + nat.toString(16) + "-"; // lowercase
    }
  }
  // Result must be lowercase or style rule will not work.
  return aString.toLowerCase().replace(/[^a-zA-Z0-9]/g, toReplacement);
}
