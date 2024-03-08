/*
  Module pacome - fonctions utilitaires pour l'authentification
*/

var EXPORTED_SYMBOLS = [ "PacomeAuthUtils"];


var { Services } = ChromeUtils.import("resource:///modules/Services.jsm");
var { MailServices } = ChromeUtils.import("resource:///modules/MailServices.jsm");
var { PacomeUtils } = ChromeUtils.import("resource:///modules/pacome/pacomeUtils.jsm");
var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");


//pas un serveur melanie2
const NON_MELANIE2=0;
//serveur de messagerie melanie2
const MSG_MELANIE2=1;
//serveur d'application melanie2
const APP_MELANIE2=2;


// séparateur identifiant de balp
const MSG_SEP_BALP=".-.";


//serveurs de messagerie melanie2
const regServeursMel2=/^amelie-([\d]{1,2}\.ac|ida01(\.ida)?)\.melanie2\.i2$|^(amelie|smtp)\.s2\.m2\.e2\.rie\.gouv\.fr$/;
//serveurs melanie2 dont l'authentification est basée sur le compte principal
const regServeursAppM2=/^(pacome|pacome\.ida|melanie2web|agenor|edroh|davy\.ida|davy|yvad|syncon|nocnys)(\.melanie2\.i2|defi\.application\.i2|\.s2\.m2\.e2\.rie\.gouv\.fr)$/;
// test proxy amande
const ExpProxyAmande=/(.e2.rie.gouv.fr|.i2)$/;


const urlPacomeAuth="chrome://pacome/content/pacomeAuth.xhtml";


var PacomeAuthUtils = {

	// test si origin est du type melanie2
  // retourne le type NON_MELANIE2, MSG_MELANIE2 ou APP_MELANIE2
	// origin : imap:// https://serveur/card.php serveur2 etc...
  TestServeurMelanie2(origin) {

		this.logMsg("TestServeurMelanie2 origin:"+origin);

    if (null==origin || ""==origin) return NON_MELANIE2;

    //start width imap://, pop3:// smtp:// https://
    //extraire hostname
    let srv=this.extraitServeur(origin);
		this.logMsg("TestServeurMelanie2 extraitServeur:"+srv);

    if (null==srv) return NON_MELANIE2;

    //tester serveur de messagerie
    if (srv.match(regServeursMel2)) return MSG_MELANIE2;

    //tester serveur application M2
    if (srv.match(regServeursAppM2)) return APP_MELANIE2;

    return NON_MELANIE2;
  },

  // retourne instance nsIMsgAccount
  //Test du compte de messagerie par défaut. Si compte pacome, on prend l'uid réduit.
  //Sinon parcours de comptes de messagerie et prise en compte du premier compte pacome trouvé.
  GetComptePrincipal() {

    let compte=null;

    try {
      compte=MailServices.accounts.defaultAccount;
    } catch(ex) {}

    if (null!=compte && null!=compte.incomingServer && null!=compte.incomingServer.getCharValue("pacome.confid"))
      return compte;

		for (compte of MailServices.accounts.accounts) {
			//test boite pacome
			if ("imap"!=compte.incomingServer.type && "pop3"!=compte.incomingServer.type)
				continue;
			let confId=compte.incomingServer.getCharValue("pacome.confid");
			if (null==confId || ""==confId)	continue;
			return compte;
		}
		this.logMsg("GetComptePrincipal => null");
    return null;
  },

  // retourne uid du compte principal (bali) si existe
  // sinon null
  GetUidComptePrincipal() {

    let compte=this.GetComptePrincipal();

    if (null==compte || null==compte.incomingServer) return null;

    let uid=compte.incomingServer.username;

    return this.GetUidReduit(uid);
  },

  // retourne uid réduit de uid (partie à gauche de .-.)
  GetUidReduit(uid) {

    if (null==uid) return uid;

    return uid.split(MSG_SEP_BALP)[0];
  },

  // test si hostname est dans melanie2 (courrier, agenda, etc)
  isMelanie2Host(hostname) {
		this.logMsg("isMelanie2Host hostname:"+hostname);
    if (null==hostname || ""==hostname) return false;

    let srvm2=this.TestServeurMelanie2(hostname);

    if (NON_MELANIE2!=srvm2) return true;

    return false;
  },

  // extrait le nom du serveur de origin
  // origin : imap:// https://serveur/card.php serveur2 etc...
  extraitServeur(origin) {

    if (null==origin || ""==origin) return null;

    const r=/((.*):\/\/)?([^\/:]+)/;
    let m=origin.match(r);

		if (!m || 4!=m.length) return null;

    return m[3];
  },

  // v3.4 - recherche uid pour agenda
  // recherche agenda correspondant, si l'identité mail associée est valide retourne identifiant
	// urlagenda : l'url complete de l'agenda
  // sinon retour null
  GetUidAgenda(urlagenda) {
		this.logMsg("GetUidAgenda urlagenda:"+urlagenda);
    if (null==urlagenda || ""==urlagenda) return null;

		for (let agenda of cal.manager.getCalendars()) {

			if (agenda.getProperty("pacome")) {

				let caluri=agenda.getProperty("uri");

				if (0==urlagenda.indexOf(caluri)||
						0==caluri.indexOf(urlagenda)) {

					//imip.identity.key
					let ident=agenda.getProperty("imip.identity.key");

					try {

						if (null==ident || ""==ident) {
							// prendre identite par defaut
							ident=MailServices.accounts.defaultAccount.defaultIdentity;
						}

						if (null==ident || ""==ident) break;

						let pref="mail.identity."+ident.key+".identityName";
						let uid=Services.prefs.getCharPref(pref);

						return uid;

					} catch(ex) {
						continue;
					}
				}
			}
		}

    return null;
  },

  // teste si origin est un proxy amande
  // dans TB, Proxies don't have a scheme, but we'll use "moz-proxy://"
  // return true si ok
  isHostProxyAmande(origin) {
		this.logMsg("isHostProxyAmande origin:"+origin);
    if (null==origin || ""==origin) return false;

    let serveur=this.extraitServeur(origin);

    return serveur.match(this.regProxyAmande);
  },

  // teste si les parametres correspondent a une authenfication sur un proxy amande
  // aChannel instance nsIProxiedChannel
  // authInfo instance nsIAuthInformation
  // return true si ok
  isAuthProxyAmande(aChannel, authInfo) {

		this.logMsg("isAuthProxyAmande");
    if (aChannel instanceof Ci.nsIProxiedChannel &&
        authInfo instanceof Ci.nsIAuthInformation) {

      let flags=authInfo.flags;

      if (!(Ci.nsIAuthInformation.AUTH_PROXY & flags)) return false;

      if (null==aChannel.proxyInfo) return false;

      let host=aChannel.proxyInfo.host;
      let scheme=authInfo.authenticationScheme;
      let realm=authInfo.realm;

      return (this.isHostProxyAmande(host) &&
							"digest"==scheme.toLowerCase() &&
							"AMANDE"==realm);

		}
    return false;
  },

  //retourne l'expression de test du proxy AMANDE (usage interne)
  get regProxyAmande() {

    try {
      let val=Services.prefs.getCharPref("courrielleur.proxy.amande", "");

      if (""==val) return ExpProxyAmande;

      let exp=new RegExp(val+"$");

      return exp;

    } catch(ex) {}

    return ExpProxyAmande;
  },


  // appel boite authentification pacome
  // aParent : window parente
  // username : identifiant
  // outmdp : objet pour retour mdp
  // retourn true si OK, sinon false
  PromptPacomeMdp(aParent, username, outmdp) {

		this.logMsg("PromptPacomeMdp username:"+username);
    if (Services.io.offline) return false;

    if (null==aParent || null==aParent.openDialog)
      aParent=Services.wm.getMostRecentWindow("mail:3pane");

    const args = { uid: this.GetUidReduit(username), };
		args.wrappedJSObject = args;

    try
    {
      const dg = aParent.openDialog(
        // -----
        // aUrl: The url which will be loaded into the new window. Must already be escaped, if applicable. It can be null.
        urlPacomeAuth,
        // -----
        // aName: The window name from JS window.open. It can be null.
        "_blank",
        // -----
        // aFeatures: Window features from JS window.open. It can be null.
				"centerscreen,chrome,modal,titlebar,width=400,height=200",
        // -----
        // aArguments: Extra argument(s) to the new window, to be attached as the arguments property. An nsISupportsArray will be unwound into multiple arguments (but not recursively!). It can be null.
        args,
      );

    }
    catch (error) {
      console.log('PromptPacomeMdp openDialog error', error);
    }

    // 0005099: Action en cas de non-saisie de mot de passe au démarrage
    if (0==args.res && ""==args.mdp) {
			this.PacomeTrace("PromptPacomeMdp non-saisie de mot de passe => offline");
      Services.io.offline=true;
      return false;
    }

    if (outmdp && null!=args.mdp) outmdp.value=args.mdp;

		this.PacomeTrace("PromptPacomeMdp res:"+args.res);
    return (1==args.res);
  },

  // version melanie2 de storage-json.sys.mjs searchLogins
  searchLogins(matchData) {

		this.logMsg("searchLogins");
    let pacome=0, username="", origin="";

		for (let field in matchData) {

			let wantedValue = matchData[field];

			switch (field) {
         case "pacome": pacome=wantedValue;
                        break;
         case "username": username=wantedValue;
                        break;
         case "origin": origin=wantedValue;
                        break;
      }
		}
		this.logMsg("searchLogins username:"+username);
		this.logMsg("searchLogins origin:"+origin);
    if (0==pacome || NON_MELANIE2==this.TestServeurMelanie2(origin)) {
      return [];
    }

    //gestion pacome -> determiner login sur la base de l'identifiant (reduit)
    //v6.5 ajout :
    //mantis 4171 : La règle à implémenter serait :
    //Lors d'une demande d'authentification avec un identifiant <uid0>,
    //si <uid0> se trouve être la partie droite d'un compte de balp <uid1.-.uid0>
    //et que <uid1> existe comme compte supportant authentification M2 alors utiliser le mdp de <uid1> pour <uid0>
    let logins=[];
    let srvname=this.extraitServeur(origin);
    let uidreduit=this.GetUidReduit(username);

		for (let serveur of MailServices.accounts.allServers) {
			if (("imap"==serveur.type || "pop3"==serveur.type) &&
          null!=serveur.password && ""!=serveur.password &&
          MSG_MELANIE2==this.TestServeurMelanie2(serveur.hostName)) {

				//test sur uid reduit
				if (uidreduit==this.GetUidReduit(serveur.username)) {

					this.logMsg("searchLogins login.init srvname:"+srvname);
					let login=Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
					login.init(srvname, null, null, username, serveur.password, null, null);
					logins.push(login);
					//retourne le premier trouve
					break;

				} else {
					//mantis 4171
					let compos=serveur.username.split(/\.-\./);
					if (2==compos.length) {
						let user=compos[0];
						let partage=compos[1];
						//ici pas uidreduit mais username presente
						if (partage==username) {
							for (let serveur of MailServices.accounts.allServers) {
								if (serveur &&
										("imap"==serveur.type || "pop3"==serveur.type) &&
										null!=serveur.password && ""!=serveur.password &&
										MSG_MELANIE2==this.TestServeurMelanie2(serveur.hostName)) {

									this.logMsg("searchLogins login.init srvname:"+srvname);
									let login=Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
									login.init(srvname, null, null, username, serveur.password, null, null);
									logins.push(login);
									break;
								}
							}
						}
					}
				}
			}
		}

		this.logMsg("searchLogins logins.length:"+logins.length);
    return logins;
  },

  // version melanie2 de storage-json.sys.mjs findLogins
  findLogins: function (origin, formSubmitURL, httpRealm) {
		this.logMsg("findLogins origin:"+origin);
    let typeSrv=NON_MELANIE2;

    if (origin)
      typeSrv=this.TestServeurMelanie2(origin);
    else
      typeSrv=this.TestServeurMelanie2(formSubmitURL);

    if (NON_MELANIE2==typeSrv) {
      return [];
    }

    //gestion pacome
    //origin : protocole://serveur
    let logins=[];

    if (MSG_MELANIE2==typeSrv) {

			this.logMsg("findLogins recherche dans les comptes de messagerie");

			let _this=this;

      function addlogins(srv) {

        const nb=logins.length;
        let i=0;
        for (;i<nb;i++) {
          if (logins[i].username==srv.username)
            break;
        }
        if (i==nb && null!=srv.password && ""!=srv.password) {
          let srvname;
          if (srv instanceof Ci.nsISmtpServer)
            srvname=srv.hostname;
          else
            srvname=srv.hostName;

					_this.logMsg("findLogins login.init srvname:"+srvname);

          let login=Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
          login.init(srvname, null, null, srv.username, srv.password, null, null);
          logins.push(login);
        }
      };

      let srvname=this.extraitServeur(origin);

			// pop/imap
			for (let serveur of MailServices.accounts.allServers) {
				if ((serveur.type=="imap" || serveur.type=="pop3") &&
						this.isMelanie2Host(serveur.hostName) &&
            srvname==serveur.hostName) {

           addlogins(serveur);
        }
			}
			// smtp
			for (let serveur of MailServices.smtp.servers) {

				if (this.isMelanie2Host(serveur.hostname) &&
            srvname==serveur.hostName)
					addlogins(serveur);
			}

    } else if (APP_MELANIE2==typeSrv) {

      //v3.4 - cas agenda : rechercher uid
      if (formSubmitURL && ""!=formSubmitURL) {

				this.logMsg("findLogins recherche dans agenda");

        let uid=this.GetUidAgenda(formSubmitURL);

        if (uid && ""!=uid) {

          //rechercher compte mail
					for (let serveur of MailServices.accounts.allServers) {
						if (serveur.username==uid &&
								(serveur.type=="imap" || serveur.type=="pop3") &&
								this.isMelanie2Host(serveur.hostName) ) {

							if (serveur.password && ""!=serveur.password) {
                let login=Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
                login.init(origin, null, null, uid, serveur.password, null, null);
                logins.push(login);
              }

              return logins;
						}
					}
        }
      }

			this.logMsg("findLogins prendre compte principal");

      let compte=this.GetComptePrincipal();
      if (null==compte || null==compte.incomingServer ||
          null==compte.incomingServer.password || ""==compte.incomingServer.password) {

        return logins;
      }
      let login=Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);

      login.init(origin, null, null, this.GetUidReduit(compte.incomingServer.username),
                  compte.incomingServer.password, null, null);
      logins.push(login);
    }

		this.logMsg("findLogins logins.length:"+logins.length);
    return logins;
  },

  //Modification du mot de passe pour les comptes Pacome
  // pour tous les comptes Pacome sur la base de uid réduit identique
  // si mdp null => mot de passe réinitialise.
  modifyMdpPacome: function(uid, mdp) {

		this.logMsg("modifyMdpPacome uid:"+uid);


    let uidReduit=this.GetUidReduit(uid);

    //serveurs entrants
		for (let serveur of MailServices.accounts.allServers) {
			if ((serveur.type=="imap" || serveur.type=="pop3") &&
          this.isMelanie2Host(serveur.hostName)) {

				let uid2=this.GetUidReduit(serveur.username);
				if (uidReduit!=uid2)
					continue;

				this.logMsg("modifyMdpPacome mise à jour mot de passe serveur entrant pour:"+serveur.username);
        serveur.password=mdp;
      }
		}

    //serveurs sortants
		for (let serveur of MailServices.smtp.servers) {
			if (this.isMelanie2Host(serveur.hostname)) {

				let uid2=this.GetUidReduit(serveur.username);
				if (uidReduit!=uid2)
					continue;

				this.logMsg("modifyMdpPacome mise à jour mot de passe serveur sortant pour:"+serveur.username);
        serveur.password=mdp;
			}
		}
  },

  removeAllLogins: function () {
		this.logMsg("removeAllLogins");

		//serveurs entrants
		for (let serveur of MailServices.accounts.allServers) {
			if ((serveur.type=="imap" || serveur.type=="pop3") &&
          this.isMelanie2Host(serveur.hostName)) {

				this.logMsg("removeAllLogins reinitialisation mot de passe serveur entrant pour:"+serveur.username);
        serveur.password=null;
      }
		}

    //serveurs sortants
		for (let serveur of MailServices.smtp.servers) {
			if (this.isMelanie2Host(serveur.hostname)) {

				this.logMsg("removeAllLogins reinitialisation mot de passe serveur sortant pour:"+serveur.username);
        serveur.password=null;
			}
		}
  },

	// trace dans la console
	PacomeTrace(msg) {
		PacomeUtils.PacomeTrace(msg);
	},

	// pour debug
	logMsg(msg) {
		// décommenter pour debug
		PacomeUtils.PacomeTrace(msg);
	},

}

