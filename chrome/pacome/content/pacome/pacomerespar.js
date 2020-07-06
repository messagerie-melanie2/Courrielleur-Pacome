ChromeUtils.import("resource://gre/modules/Services.jsm");

const PACOME_ACTION_IGNORE    ="ignore";
const PACOME_ACTION_PRESERVE  ="preserve";


function InitPacomeRes(){

  //resultats
  if (null!=window.arguments[0]){

    let tblresults=window.arguments[0].resultats;
    let bredemarre=window.arguments[0].bredemarre;

    let elem=document.getElementById("bredemarre");
    if (!bredemarre) elem.hidden=true;

    let liste=document.getElementById("pacomepar-liste");

    for (var i=0;i<tblresults.length;i++){

      let results=tblresults[i];

      if (PACOME_ACTION_IGNORE==results.action || PACOME_ACTION_PRESERVE==results.action)
        continue;

      PacomeTrace("InitPacomeRes libelle:"+results.libelle+" - res:"+results.statut);

      let listitem=document.createElement("richlistitem");

      let img=CreeElemImgBoite(results.image);
      PacomeTrace("InitPacomeRes image="+results.image);
      listitem.appendChild(img);

      let elemlib=document.createElement("label");
      elemlib.setAttribute("value", results.libelle);
      elemlib.setAttribute("tooltiptext", results.libelle);
      elemlib.setAttribute("flex", "1");
      elemlib.setAttribute("crop", "end");
      listitem.appendChild(elemlib);

      let elemres=document.createElement("label");
      elemres.setAttribute("value", results.statut);
      listitem.appendChild(elemres);

      liste.appendChild(listitem);
    }

    if (bredemarre)
      setTimeout(PacomeCloseMdp, 0);
  }
}


function btOk(){

  if (window.arguments) 
    window.arguments[0].res=1;
  window.close();
}


function PacomeCloseMdp() {

  var dlg=Services.wm.getMostRecentWindow("pacomemdp");

  if (null!=dlg)
    dlg.close();

  setTimeout(PacomeCloseMdp, 500);
}
