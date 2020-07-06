ChromeUtils.import("resource://gre/modules/Services.jsm");

const nsIWindowsRegKey=Components.interfaces.nsIWindowsRegKey;

const PREFS_PROXY_BOOL=["network.proxy.share_proxy_settings"];

const PREFS_PROXY_CHAR=["network.proxy.http",
                        "network.proxy.ftp",
                        "network.proxy.gopher",
                        "network.proxy.ssl",
                        "network.proxy.socks",
                        "network.proxy.socks_version",
                        "network.proxy.no_proxies_on",
                        "network.proxy.autoconfig_url"
                        ];

const PREFS_PROXY_INT=[ "network.proxy.type",
                        "network.proxy.http_port",
                        "network.proxy.ftp_port",
                        "network.proxy.gopher_port",
                        "network.proxy.ssl_port",
                        "network.proxy.socks_port",
                        "network.proxy.socks_version"
                        ];


/**
* Ordre de configuration:
* - si proxy pac => paramétrage avec proxy pac
* - sinon si proxy on => paramétrage avec valeurs du proxy ie
* - sinon => paramétrage pas de proxy
* return true si succes, false sinon 
*/
function pacomeConfigProxy(){

  try{
    //tableau avec nom des preferences en indices (proxy.network.xxx)
    let config=pacomeLitConfProxySys();

    if (null==config){
      PacomeTrace("Pas de configuration proxy ie: utilisation parametrage proxy pacome");
      //pas de proxy ie configuré!
      return;
    }

    let prefBranch=Services.prefs.getBranch(null);

    //paramétrage
    for (var p in PREFS_PROXY_CHAR){
      let pref=PREFS_PROXY_CHAR[p];
      if (pref in config)
        prefBranch.setCharPref(pref, config[pref]);
    }
    for (var p in PREFS_PROXY_INT){
      let pref=PREFS_PROXY_INT[p];
      if (pref in config)
        prefBranch.setIntPref(pref, config[pref]);
    }
    for (var p in PREFS_PROXY_BOOL){
      let pref=PREFS_PROXY_BOOL[p];
      if (pref in config)
        prefBranch.setBoolPref(pref, config[pref]);
    }

    //AutoConfigURL
    if (null!=config["network.proxy.autoconfig_url"] &&
        ""!=config["network.proxy.autoconfig_url"]){

      PacomeTrace("pacomeConfigProxy configuration 'proxy pac'");
      prefBranch.setIntPref("network.proxy.type", 2);

    } else if (null!=config["ProxyEnable"] &&
        true==config["ProxyEnable"]) {

      PacomeTrace("pacomeConfigProxy configuration 'proxy ie'");
      prefBranch.setIntPref("network.proxy.type", 1);

    } else {

      PacomeTrace("pacomeConfigProxy configuration 'pas de proxy'");
      prefBranch.setIntPref("network.proxy.type", 0);
    }
    
    //effacer les preferences non positionnees depuis ie
    if (null!=config["ProxyEnable"] &&
        true==config["ProxyEnable"]) {
      if (null==config["network.proxy.http"]){
        if (prefBranch.prefHasUserValue("network.proxy.http"))
          prefBranch.clearUserPref("network.proxy.http")
        if (prefBranch.prefHasUserValue("network.proxy.http_port"))
          prefBranch.clearUserPref("network.proxy.http_port")        
      } 
      if (null==config["network.proxy.ftp"]){
        if (prefBranch.prefHasUserValue("network.proxy.ftp"))
          prefBranch.clearUserPref("network.proxy.ftp")
        if (prefBranch.prefHasUserValue("network.proxy.ftp_port"))
          prefBranch.clearUserPref("network.proxy.ftp_port")        
      }
      if (null==config["network.proxy.ssl"]){
        if (prefBranch.prefHasUserValue("network.proxy.ssl"))
          prefBranch.clearUserPref("network.proxy.ssl")
        if (prefBranch.prefHasUserValue("network.proxy.ssl_port"))
          prefBranch.clearUserPref("network.proxy.ssl_port")        
      }
      if (null==config["network.proxy.socks"]){
        if (prefBranch.prefHasUserValue("network.proxy.socks"))
          prefBranch.clearUserPref("network.proxy.socks")
        if (prefBranch.prefHasUserValue("network.proxy.socks_port"))
          prefBranch.clearUserPref("network.proxy.socks_port")        
      }
    }    
    
    //succes
    return true;

  } catch (ex){
    PacomeTrace("pacomeConfigProxy exception:"+ex);
    PacomeAfficheMsgId("PacomeErrConfigProxy");
  }
  
  return false;
}


function pacomeLitConfProxySys(){

  let config=new Array();

  try{

    let regkey=Components.classes["@mozilla.org/windows-registry-key;1"].createInstance(nsIWindowsRegKey);

    regkey.open(nsIWindowsRegKey.ROOT_KEY_CURRENT_USER,
                "Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
                nsIWindowsRegKey.ACCESS_READ);

    let ProxyEnable=0;

    if (regkey.hasValue("ProxyEnable")){
      ProxyEnable=regkey.readIntValue("ProxyEnable");
    }

    //AutoConfigURL
    if (regkey.hasValue("AutoConfigURL")){
      config["network.proxy.autoconfig_url"]=regkey.readStringValue("AutoConfigURL");
      PacomeTrace("pacomeLitConfProxySys AutoConfigURL="+config["network.proxy.autoconfig_url"]);
    }

    if (0!=ProxyEnable) {
    //proxy ie actif

      config["ProxyEnable"]=true;

      let ProxyServer="";
      if (regkey.hasValue("ProxyServer")){
        ProxyServer=regkey.readStringValue("ProxyServer");
      }
      let ProxyOverride="";
      if (regkey.hasValue("ProxyOverride")){
        ProxyOverride=regkey.readStringValue("ProxyOverride");
      }

      PacomeTrace("pacomeLitConfProxySys ProxyServer="+ProxyServer);
      PacomeTrace("pacomeLitConfProxySys ProxyOverride="+ProxyOverride);

      //serveur
      if (""!=ProxyServer) {
        if (-1!=ProxyServer.indexOf(";")){
          let protos=ProxyServer.split(";");
          for (var c in protos){
            let cfg=protos[c];
            let vals=cfg.split("=");
            let sufix1="";
            let sufix2="";
            if ("http"==vals[0]){
              sufix1="http";
              sufix2="http_port";
            } else if ("ftp"==vals[0]){
              sufix1="ftp";
              sufix2="ftp_port";
            } else if ("https"==vals[0]){
              sufix1="ssl";
              sufix2="ssl_port";
            } else if ("gopher"==vals[0]){
              sufix1="gopher";
              sufix2="gopher_port";
            } else if ("socks"==vals[0]){
              sufix1="socks";
              sufix2="socks_port";
            }
            vals=vals[1].split(":");
            config["network.proxy."+sufix1]=vals[0];
            config["network.proxy."+sufix2]=vals[1];
          }
          config["network.proxy.share_proxy_settings"]=false;

        } else {
          config["network.proxy.share_proxy_settings"]=true;
          let vals=ProxyServer.split(":");
          config["network.proxy.http"]=vals[0];
          config["network.proxy.http_port"]=vals[1];
        }
      }

      //exceptions
      let excepts=pacomeConvertExceptIE(ProxyOverride);
      PacomeTrace("pacomeLitConfProxySys conversion exceptions IE="+excepts);
      config["network.proxy.no_proxies_on"]=excepts;

    } else {

      config["ProxyEnable"]=false;
    }

    regkey.close();

  } catch (ex){
    PacomeTrace("pacomeLitConfProxySys exception"+ex);
    return null;
  }

  return config;
}

function pacomeConvertExceptIE(strie){

  if (null==strie || 0==strie.length) return "";

  let excepts="";

  let elems=strie.split(";");
  for (var e in elems){
    let val=elems[e];
    val=val.replace(/\s/g,"");
    PacomeTrace("pacomeConvertExceptIE exception val="+val);
    if (0!=excepts.length) excepts+=",";

    if ("<local>"==val){
      excepts+="local host";
    } else if (val.match(/^[0-9]{1,3}(\.[0-9]{1,3}|\.\*){1,3}$/)){

      let masque=0;
      let tab=val.split('.');
      for (var i=0; i<tab.length; i++){
        if ('*'==tab[i]){
          masque=8*i;
          tab[i]="0";
        }
      }

      let ip="";
      for (i=0; i<3; i++){
        if (i<tab.length){
          ip+=tab[i]+".";
        } else {
          ip+="0.";
        }
      }
      if (4==tab.length) ip+=tab[3];
      else ip+="0";

      if (0!=masque) excepts+=ip+"/"+masque;
      else excepts+=ip;

    } else {
      val=val.replace("*","");
      excepts+=val;
    }

  }

  return excepts;
}

// v6.1 : mise à jour des exceptions proxy
// met à jour 'network.proxy.no_proxies_on' avec 'pacome.config.proxy_exceptions'
function pacomeMajExceptions(){

  let prefBranch=Services.prefs.getBranch(null);
  
  let pacomeEx=prefBranch.getCharPref("pacome.config.proxy_exceptions");
  let excepts=prefBranch.getCharPref("network.proxy.no_proxies_on");
  
  let re=/\s*,\s*/;
  let listePac=pacomeEx.split(re);
  let listeCm2=excepts.split(re);
  let nb1=listeCm2.length;
  
  for (var i=0; i<listePac.length; i++){
    if (-1==listeCm2.indexOf(listePac[i])){
      PacomeTrace("Mise a jour des exceptions proxy ajout:"+listePac[i]);
      listeCm2.push(listePac[i]);
    }
  }
  
  if (listeCm2.length > nb1){
    excepts=listeCm2.join(",");
    prefBranch.setCharPref("network.proxy.no_proxies_on", excepts);
    PacomeTrace("Mise a jour des exceptions proxy terminee");
  }
}
