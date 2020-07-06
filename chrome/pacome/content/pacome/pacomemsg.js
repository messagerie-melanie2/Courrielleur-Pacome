/* initialisation message
  Arguments:
  mode: PACOMEMSG_NOTIF, PACOMEMSG_CONFIRM
  titre:
  texte:
*/
function InitPacomeMsg(){

  if (null!=window.arguments[0]){

    var mode=window.arguments[0].mode;
    var titre=window.arguments[0].titre;
    var texte=window.arguments[0].texte;
    var texte2=null;
    if (window.arguments[0].texte2)
      texte2=window.arguments[0].texte2;

    var elem=document.getElementById("bandeau-titre");
    elem.value=titre;
    elem=document.getElementById("pacomemsg.texte");
    elem.textContent=texte;
    if (texte2){
      elem=document.getElementById("pacomemsg.texte2");
      elem.textContent=texte2;
    }

    if (PACOMEMSG_CONFIRM==mode){

      document.getElementById("btOk").setAttribute("hidden", true);

      document.getElementById("btOUI").focus();

      if (null!=window.arguments[0].libbtOUI){
        document.getElementById("btOUI").setAttribute("label", window.arguments[0].libbtOUI);
      }
      if (null!=window.arguments[0].libbtNON){
        document.getElementById("btNON").setAttribute("label", window.arguments[0].libbtNON);
      }

    } else{

      document.getElementById("btOUI").setAttribute("hidden", true);
      document.getElementById("btNON").setAttribute("hidden", true);

      document.getElementById("btOk").focus();
    }
  }

}

function Valider(){
  if (window.arguments) window.arguments[0].res=1;
  window.close();
}

function Annuler(){
  if (window.arguments) window.arguments[0].res=0;
  window.close();
}
