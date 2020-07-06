
/* libelle des bulles d'aide pour les images des types de boites */
var libsimages=new Object();
libsimages["bala.gif"]="Bo\u00eete \u00e0 lettres applicative";
libsimages["bala_l.gif"]="Bo\u00eete \u00e0 lettres applicative (locale)";
libsimages["balf.gif"]="Bo\u00eete \u00e0 lettres fonctionnelle";
libsimages["balf_l.gif"]="Bo\u00eete \u00e0 lettres fonctionnelle (locale)";
libsimages["bali.gif"]="Bo\u00eete \u00e0 lettres individuelle";
libsimages["bali_l.gif"]="Bo\u00eete \u00e0 lettres individuelle (locale)";
libsimages["balr.gif"]="Bo\u00eete \u00e0 lettres de ressource";
libsimages["balr_l.gif"]="Bo\u00eete \u00e0 lettres de ressource (locale)";
libsimages["bals.gif"]="Bo\u00eete \u00e0 lettres de service";
libsimages["bals_l.gif"]="Bo\u00eete \u00e0 lettres de service (locale)";
libsimages["balu.gif"]="Bo\u00eete \u00e0 lettres d'unit\u00e9";
libsimages["balu_l.gif"]="Bo\u00eete \u00e0 lettres d'unité (locale)";
libsimages["ldab.gif"]="Liste de diffusion";
libsimages["ldab_l.gif"]="Liste de diffusion (locale)";
libsimages["ldis.gif"]="Liste de diffusion";
libsimages["ldis_l.gif"]="Liste de diffusion (locale)";
libsimages["refx.gif"]="Destinataire particulier";
libsimages["calendar.gif"]="Agenda";



/* cree l'element d'interface pour les images des types de boites */
function CreeElemImgBoite(nomfichier){

  let box=document.createElement("vbox");
  let bh=document.createElement("box");
  bh.setAttribute("flex","1");
  box.appendChild(bh);
  let img=document.createElement("image");
  if (null!=nomfichier) {
    let pos=nomfichier.lastIndexOf("/");
    if (-1!=pos) nomfichier=nomfichier.substr(pos+1);
    img.setAttribute("src", "chrome://pacome/content/img/"+nomfichier);
    if (null!=libsimages[nomfichier])
      img.setAttribute("tooltiptext", libsimages[nomfichier]);
  }
  box.appendChild(img);
  let bb=document.createElement("box");
  bb.setAttribute("flex","1");
  box.appendChild(bb);
  return box;
}



