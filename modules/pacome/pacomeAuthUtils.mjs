/*
  Module pacome - fonctions utilitaires pour l'authentification
*/


const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

const { PacomeUtils, PACOME_SEP_UID } = ChromeUtils.importESModule("resource:///modules/pacome/pacomeUtils.mjs");


//pas un serveur melanie2
export const NON_MELANIE2 = 0;
//serveur de messagerie melanie2
export const MSG_MELANIE2 = 1;
//serveur d'application melanie2
export const APP_MELANIE2 = 2;


const PACOME_PREF_PROXY_AMANDE = "courrielleur.proxy.amande";

const urlPacomeAuth = "chrome://pacome/content/pacomeAuth.xhtml";


export const PacomeAuthUtils = {

  _regServeursMel2: null,
  _regServeursAppM2: null,
  _ExpProxyAmande: null,
  _lastSavedPassword: null,

  Init() {
    try {
      if (this._regServeursMel2 == null) {
        let policies = Services.policies.getExtensionPolicy("pacome");
        this._regServeursMel2 = policies.regServeursMel2;
        this._regServeursAppM2 = policies.regServeursAppM2;
        this._ExpProxyAmande = policies.ExpProxyAmande;
      }
    }
    catch { }
  },

  // test si origin est du type melanie2
  // retourne le type NON_MELANIE2, MSG_MELANIE2 ou APP_MELANIE2
  // origin : imap:// https://serveur/card.php serveur2 etc...
  TestServeurMelanie2(origin) {

    this.logMsg("TestServeurMelanie2 origin:" + origin);

    if (null == origin || "" == origin) return NON_MELANIE2;

    //start width imap://, pop3:// smtp:// https://
    //extraire hostname
    const srv = this.extraitServeur(origin);
    this.logMsg("TestServeurMelanie2 extraitServeur:" + srv);

    if (null == srv) return NON_MELANIE2;

    //tester serveur de messagerie
    if (srv.match(this._regServeursMel2)) return MSG_MELANIE2;

    //tester serveur application M2
    if (srv.match(this._regServeursAppM2)) return APP_MELANIE2;

    return NON_MELANIE2;
  },

  // retourne instance nsIMsgAccount
  //Test du compte de messagerie par défaut. Si compte pacome, on prend l'uid réduit.
  //Sinon parcours de comptes de messagerie et prise en compte du premier compte pacome trouvé.
  GetComptePrincipal() {

    let compte = null;

    try {
      compte = MailServices.accounts.defaultAccount;
    } catch (ex) { }

    if (null != compte && null != compte.incomingServer && null != compte.incomingServer.getStringValue("pacome.confid"))
      return compte;

    for (compte of MailServices.accounts.accounts) {

      //test boite pacome
      if ("imap" != compte.incomingServer.type && "pop3" != compte.incomingServer.type)
        continue;

      const confId = compte.incomingServer.getStringValue("pacome.confid");
      if (null == confId || "" == confId) continue;

      return compte;
    }
    this.logMsg("GetComptePrincipal => null");

    return null;
  },

  // retourne uid du compte principal (bali) si existe
  // sinon null
  GetUidComptePrincipal() {

    const compte = this.GetComptePrincipal();

    if (null == compte || null == compte.incomingServer) return null;

    const uid = compte.incomingServer.username;

    return this.GetUidReduit(uid);
  },

  // retourne uid réduit de uid (partie à gauche de .-.)
  GetUidReduit(uid) {

    if (null == uid) return uid;

    return uid.split(PACOME_SEP_UID)[0];
  },

  // test si hostname est dans melanie2 (courrier, agenda, etc)
  isMelanie2Host(hostname) {

    this.logMsg("isMelanie2Host hostname:" + hostname);

    if (null == hostname || "" == hostname) return false;

    const srvm2 = this.TestServeurMelanie2(hostname);

    if (NON_MELANIE2 != srvm2) return true;

    return false;
  },

  // extrait le nom du serveur de origin
  // origin : imap:// https://serveur/card.php serveur2 etc...
  extraitServeur(origin) {

    if (null == origin || "" == origin) return null;

    const r = /((.*):\/\/)?([^\/:]+)/;

    const m = origin.match(r);

    if (!m || 4 != m.length) return null;

    return m[3];
  },

  // v3.4 - recherche uid pour agenda
  // recherche agenda correspondant, si l'identité mail associée est valide retourne identifiant
  // urlagenda : l'url complete de l'agenda
  // sinon retour null
  GetUidAgenda(urlagenda) {

    this.logMsg("GetUidAgenda urlagenda:" + urlagenda);

    if (null == urlagenda || "" == urlagenda) return null;

    for (const agenda of cal.manager.getCalendars()) {

      if (agenda.getProperty("pacome")) {

        let caluri = agenda.getProperty("uri");

        if (0 == urlagenda.indexOf(caluri) ||
          0 == caluri.indexOf(urlagenda)) {

          //imip.identity.key
          let ident = agenda.getProperty("imip.identity.key");

          try {

            if (null == ident || "" == ident) {
              // prendre identite par defaut
              ident = MailServices.accounts.defaultAccount.defaultIdentity;
            }

            if (null == ident || "" == ident) break;

            let pref = "mail.identity." + ident.key + ".identityName";
            let uid = Services.prefs.getCharPref(pref);

            return uid;

          } catch (ex) {
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

    this.logMsg("isHostProxyAmande origin:" + origin);

    if (null == origin || "" == origin) return false;

    const serveur = this.extraitServeur(origin);

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

      const flags = authInfo.flags;

      if (!(Ci.nsIAuthInformation.AUTH_PROXY & flags)) return false;

      if (null == aChannel.proxyInfo) return false;

      const host = aChannel.proxyInfo.host;
      const scheme = authInfo.authenticationScheme;
      const realm = authInfo.realm;

      return (this.isHostProxyAmande(host) &&
        "digest" == scheme.toLowerCase() &&
        "AMANDE" == realm);

    }
    return false;
  },

  //retourne l'expression de test du proxy AMANDE (usage interne)
  get regProxyAmande() {

    try {

      const val = Services.prefs.getCharPref(PACOME_PREF_PROXY_AMANDE, "");

      if ("" == val) return this._ExpProxyAmande;

      const exp = new RegExp(val + "$");

      return exp;

    } catch (ex) { }

    return this._ExpProxyAmande;
  },


  // appel boite authentification pacome
  // aParent : window parente
  // username : identifiant
  // outmdp : objet pour retour mdp
  // checkBox : objet pour retour case à cocher (optionnel)
  // retourn true si OK, sinon false
  PromptPacomeMdp(aParent, username, outmdp, checkBox) {

    this.logMsg("PromptPacomeMdp username:" + username);
    if (Services.io.offline) return false;

    if (null == aParent || null == aParent.openDialog)
      aParent = Services.wm.getMostRecentWindow("mail:3pane");

    const args = { uid: this.GetUidReduit(username), };
    if (checkBox) {
      args.memomdp = checkBox.value;
    }
    args.wrappedJSObject = args;

    try {
      const dg = aParent.openDialog(
        // -----
        // aUrl: The url which will be loaded into the new window. Must already be escaped, if applicable. It can be null.
        urlPacomeAuth,
        // -----
        // aName: The window name from JS window.open. It can be null.
        "_blank",
        // -----
        // aFeatures: Window features from JS window.open. It can be null.
        "centerscreen,chrome,modal,titlebar,width=400,height=240",
        // -----
        // aArguments: Extra argument(s) to the new window, to be attached as the arguments property. An nsISupportsArray will be unwound into multiple arguments (but not recursively!). It can be null.
        args,
      );

    }
    catch (error) {
      console.log('PromptPacomeMdp openDialog error', error);
      return false;
    }

    // 0005099: Action en cas de non-saisie de mot de passe au démarrage
    if (0 == args.res && "" == args.mdp) {
      this.PacomeTrace("PromptPacomeMdp non-saisie de mot de passe => offline");
      Services.io.offline = true;
      return false;
    }

    if (outmdp && null != args.mdp) outmdp.value = args.mdp;

    if (checkBox && null != args.memomdp) {
      checkBox.value = args.memomdp;
      this.PacomeTrace("PromptPacomeMdp args.memomdp: " + args.memomdp);
    }

    this.PacomeTrace("PromptPacomeMdp res:" + args.res);
    return (1 == args.res);
  },

  // version melanie2 de storage-json.sys.mjs searchLogins
  searchLogins(matchData) {

    this.logMsg("searchLogins");
    let pacome = 0, username = "", origin = "";

    for (const field in matchData) {

      const wantedValue = matchData[field];

      switch (field) {
        case "pacome": pacome = wantedValue;
          break;
        case "username": username = wantedValue;
          break;
        case "origin": origin = wantedValue;
          break;
      }
    }
    this.logMsg("searchLogins username:" + username);
    this.logMsg("searchLogins origin:" + origin);

    if (0 == pacome || NON_MELANIE2 == this.TestServeurMelanie2(origin)) {
      return [];
    }

    //gestion pacome -> determiner login sur la base de l'identifiant (reduit)
    //v6.5 ajout :
    //mantis 4171 : La règle à implémenter serait :
    //Lors d'une demande d'authentification avec un identifiant <uid0>,
    //si <uid0> se trouve être la partie droite d'un compte de balp <uid1.-.uid0>
    //et que <uid1> existe comme compte supportant authentification M2 alors utiliser le mdp de <uid1> pour <uid0>
    let logins = [];
    const srvname = this.extraitServeur(origin);
    const uidreduit = this.GetUidReduit(username);

    for (const serveur of MailServices.accounts.allServers) {

      if (("imap" == serveur.type || "pop3" == serveur.type) &&
        null != serveur.password && "" != serveur.password &&
        MSG_MELANIE2 == this.TestServeurMelanie2(serveur.hostName)) {

        //test sur uid reduit
        if (uidreduit == this.GetUidReduit(serveur.username)) {

          this.logMsg("searchLogins login.init srvname:" + srvname);
          let login = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);

          login.init(srvname, null, null, username, serveur.password, null, null);
          logins.push(login);
          //retourne le premier trouve
          break;

        } else {
          //mantis 4171
          const compos = serveur.username.split(/\.-\./);
          if (2 == compos.length) {
            const user = compos[0];
            const partage = compos[1];

            //ici pas uidreduit mais username presente
            if (partage == username) {
              for (const serveur of MailServices.accounts.allServers) {
                if (serveur &&
                  ("imap" == serveur.type || "pop3" == serveur.type) &&
                  null != serveur.password && "" != serveur.password &&
                  MSG_MELANIE2 == this.TestServeurMelanie2(serveur.hostName)) {

                  this.logMsg("searchLogins login.init srvname:" + srvname);
                  let login = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
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

    this.logMsg("searchLogins logins.length:" + logins.length);
    return logins;
  },

  // version melanie2 de storage-json.sys.mjs findLogins
  findLogins: function (origin, formSubmitURL, httpRealm) {

    let typeSrv = NON_MELANIE2;

    if (origin) {
      this.logMsg("findLogins origin:" + origin);
      typeSrv = this.TestServeurMelanie2(origin);
    }
    else {
      this.logMsg("findLogins formSubmitURL:" + formSubmitURL);
      typeSrv = this.TestServeurMelanie2(formSubmitURL);
    }

    if (NON_MELANIE2 == typeSrv) {
      return [];
    }

    //gestion pacome
    //origin : protocole://serveur
    let logins = [];



    if (MSG_MELANIE2 == typeSrv) {

      this.logMsg("findLogins recherche dans les comptes de messagerie");

      const _this = this;

      function addlogins(srv) {

        const nb = logins.length;
        let i = 0;
        for (; i < nb; i++) {
          if (logins[i].username == srv.username)
            break;
        }
        if (i == nb) {
          let password = srv.password;
          // Check cache
          if (_this._lastSavedPassword && _this.GetUidReduit(srv.username) == _this._lastSavedPassword.uid) {
            _this.logMsg("addlogins using _lastSavedPassword for " + srv.username);
            password = _this._lastSavedPassword.mdp;
          }

          if (null != password && "" != password) {
            let srvname;
            if (srv instanceof Ci.nsISmtpServer)
              srvname = srv.hostname;
            else
              srvname = srv.hostName;

            _this.logMsg("findLogins login.init srvname:" + srvname);

            const login = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
            login.init(srvname, null, null, srv.username, password, null, null);
            logins.push(login);
          }
        }
      };

      let parsedSrvName = this.extraitServeur(origin);

      // pop/imap
      for (const serveur of MailServices.accounts.allServers) {

        if ((serveur.type == "imap" || serveur.type == "pop3") &&
          this.isMelanie2Host(serveur.hostName) &&
          parsedSrvName == serveur.hostName) {

          addlogins(serveur);
        }
      }
      // smtp
      for (let serveur of MailServices.outgoingServer.servers) {

        if (serveur.type != "smtp") continue;

        serveur = serveur.QueryInterface(Ci.nsISmtpServer);

        if (this.isMelanie2Host(serveur.hostname) &&
          parsedSrvName == serveur.hostName)
          addlogins(serveur);
      }

      // Check Services.logins if origin is available
      if (origin) {
        try {
          // Chercher d'abord dans le realm unifié pacome-melanie2
          const pacomeUnifiedOrigin = "https://pacome.s2.m2.e2.rie.gouv.fr";
          const pacomeUnifiedRealm = "pacome-melanie2";
          let unifiedPacomeLogins = Services.logins.findLogins(pacomeUnifiedOrigin, null, pacomeUnifiedRealm);
          for (let login of unifiedPacomeLogins) {
            if (!logins.some(l => l.username == login.username && l.password == login.password)) {
              logins.push(login);
            }
          }

          // 1. Standard search (Wildcard/Specific Realm passed in arg) - FALLBACK ancien système
          let standardLogins = Services.logins.findLogins(origin, null, httpRealm);
          for (let login of standardLogins) {
            if (!logins.some(l => l.username == login.username && l.password == login.password)) {
              logins.push(login);
            }
          }

          let realmsToCheck = new Set();

          const collectRealm = (serveur) => {
            if (this.isMelanie2Host(serveur.hostName) || (serveur.hostname && this.isMelanie2Host(serveur.hostname))) {
              let srvHost = serveur.hostName || serveur.hostname;
              if (srvHost == parsedSrvName && serveur.username) {
                let r = this.GetUidReduit(serveur.username);
                if (r) realmsToCheck.add(r);
              }
            }
          };

          for (const s of MailServices.accounts.allServers) {
            if (s.type == "imap" || s.type == "pop3") collectRealm(s);
          }
          for (let s of MailServices.outgoingServer.servers) {
            if (s.type == "smtp") collectRealm(s.QueryInterface(Ci.nsISmtpServer));
          }

          for (let uRealm of realmsToCheck) {
            let oldUnifiedLogins = Services.logins.findLogins(origin, null, uRealm);
            for (let login of oldUnifiedLogins) {
              // Avoid duplicates
              if (!logins.some(l => l.username == login.username && l.password == login.password)) {
                logins.push(login);
              }
            }
          }

        } catch (ex) {
          this.logMsg("findLogins Services.logins error: " + ex);
        }
      }

    } else if (APP_MELANIE2 == typeSrv) {

      //v3.4 - cas agenda : rechercher uid
      if (formSubmitURL && "" != formSubmitURL) {

        this.logMsg("findLogins recherche dans agenda");

        const uid = this.GetUidAgenda(formSubmitURL);

        if (uid && "" != uid) {

          //rechercher compte mail
          for (const serveur of MailServices.accounts.allServers) {

            if (serveur.username == uid &&
              (serveur.type == "imap" || serveur.type == "pop3") &&
              this.isMelanie2Host(serveur.hostName)) {

              let password = serveur.password;
              if (this._lastSavedPassword && this.GetUidReduit(serveur.username) == this._lastSavedPassword.uid) {
                password = this._lastSavedPassword.mdp;
              }

              if (password && "" != password) {
                const login = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
                login.init(origin, null, null, uid, password, null, null);
                logins.push(login);
              }

              return logins;
            }
          }
        }
      }

      this.logMsg("findLogins prendre compte principal");

      const compte = this.GetComptePrincipal();
      if (null == compte || null == compte.incomingServer ||
        null == compte.incomingServer.password || "" == compte.incomingServer.password) {

        return logins;
      }
      const login = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);

      login.init(origin, null, null, this.GetUidReduit(compte.incomingServer.username),
        compte.incomingServer.password, null, null);
      logins.push(login);
    }

    this.logMsg("findLogins logins.length:" + logins.length);
    if (logins.length > 0) {
      this.logMsg("findLogins found login for user: " + logins[0].username);
    }
    return logins;
  },


  //Modification du mot de passe pour les comptes Pacome
  // pour tous les comptes Pacome sur la base de uid réduit identique
  // si mdp null => mot de passe réinitialise.
  modifyMdpPacome: function (uid, mdp, saveToManager = true, realm = null) {

    this.logMsg("modifyMdpPacome uid:" + uid + " saveToManager:" + saveToManager + " realm:" + realm);


    const uidReduit = this.GetUidReduit(uid);

    // Cache the password immediately
    this._lastSavedPassword = {
      uid: uidReduit,
      username: uid,
      mdp: mdp,
      time: Date.now()
    };

    // Deduplication set: "origin|realm|username"
    const processedLogins = new Set();

    // Helper to request save only if not processed
    const requestSave = (origin, realm, username, mdp) => {
      const key = origin + "|" + (realm || "NULL") + "|" + username;
      if (!processedLogins.has(key)) {
        processedLogins.add(key);
        this.saveLoginAsync(origin, realm, username, mdp);
      } else {
        this.logMsg("modifyMdpPacome skipping duplicate save for key: " + key);
      }
    };

    // Mise à jour en mémoire des serveurs entrants
    for (const serveur of MailServices.accounts.allServers) {
      if ((serveur.type == "imap" || serveur.type == "pop3") &&
        this.isMelanie2Host(serveur.hostName)) {
        const uid2 = this.GetUidReduit(serveur.username);
        if (uidReduit != uid2) continue;
        this.logMsg("modifyMdpPacome mise à jour mot de passe serveur entrant pour:" + serveur.username);
        serveur.password = mdp;
      }
    }

    // Mise à jour en mémoire des serveurs sortants
    for (let serveur of MailServices.outgoingServer.servers) {
      if (serveur.type != "smtp") continue;
      serveur = serveur.QueryInterface(Ci.nsISmtpServer);
      if (this.isMelanie2Host(serveur.hostname)) {
        const uid2 = this.GetUidReduit(serveur.username);
        if (uidReduit != uid2) continue;
        this.logMsg("modifyMdpPacome mise à jour mot de passe serveur sortant pour:" + serveur.username);
        serveur.password = mdp;
      }
    }

    if (mdp && saveToManager) {
      // REALM UNIFIÉ PACOME : 1 seule entrée pour IMAP/SMTP/CalDAV
      // (au lieu de 4 entrées séparées par protocole)
      const pacomeOrigin = "https://pacome.s2.m2.e2.rie.gouv.fr";
      const pacomeRealm = "pacome-melanie2";
      this.logMsg("modifyMdpPacome saving to unified Pacome realm for: " + uidReduit);
      requestSave(pacomeOrigin, pacomeRealm, uidReduit, mdp);
    }

    // FILELINK: Save to dedicated realm (always, regardless of checkbox)
    // This ensures Filelink Nextcloud extension can work even if user doesn't save email password
    if (mdp) {
      this.logMsg("modifyMdpPacome saving to filelink realm for: " + uid);
      const filelinkOrigin = "https://bnum.din.gouv.fr";
      const filelinkRealm = "filelink-nextcloud-melanie2";
      requestSave(filelinkOrigin, filelinkRealm, uid, mdp);
    }
  },

  // Helper to asynchronously save login
  saveLoginAsync: function (origin, realm, username, mdp) {
    this.logMsg("saveLoginAsync origin:" + origin + " username:" + username);
    try {
      // findLogins is typically synchronous
      let logins = Services.logins.findLogins(origin, null, realm);

      let found = false;
      for (let login of logins) {
        if (login.username == username) {
          found = true;
          if (login.password != mdp) {
            this.logMsg("saveLoginAsync updating existing login");
            let newLogin = login.clone();
            newLogin.password = mdp;
            // Trying modifyLoginAsync, capturing error if it doesn't exist
            if (Services.logins.modifyLoginAsync) {
              Services.logins.modifyLoginAsync(login, newLogin).then(() => {
              }).catch(e => {
                this.logMsg("saveLoginAsync modifyLoginAsync error: " + e);
                console.error("PacomeAuthUtils saveLoginAsync modifyLoginAsync error:", e);
              });
            } else {
              // Fallback attempt: remove then add (if modifyLogin is missing)
              this.logMsg("saveLoginAsync modifyLoginAsync missing, using remove+addAsync");
              Services.logins.removeLogin(login);
              Services.logins.addLoginAsync(newLogin);
            }
          } else {
            this.logMsg("saveLoginAsync login already exists and matches");
          }
          break;
        }
      }

      if (!found) {
        this.logMsg("saveLoginAsync creating new login");
        let newLogin = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
        // Fix: realm must be non-null (empty string for wildcard/none)
        newLogin.init(origin, null, realm || "", username, mdp, null, null);
        Services.logins.addLoginAsync(newLogin).then(() => {
        }).catch(e => {
          // Robustness: Ignore "This login already exists" error, as it implies race condition success or pre-existence
          if (e.message && e.message.includes("This login already exists")) {
            this.logMsg("saveLoginAsync addLoginAsync race condition ignored: " + e);
            return;
          } else if (e.result == Cr.NS_ERROR_FAILURE) {
            // Sometimes error message is not propagated, but result code is failure.
            // We assume duplicate/race here too if it failed to add.
            this.logMsg("saveLoginAsync addLoginAsync failed (possibly exists): " + e);
            return;
          }
          this.logMsg("saveLoginAsync addLoginAsync error: " + e);
          console.error("PacomeAuthUtils saveLoginAsync addLoginAsync error:", e);
        });
      }
    } catch (e) {
      this.logMsg("saveLoginAsync error: " + e);
      console.error("PacomeAuthUtils saveLoginAsync error:", e);
    }
  },

  removeAllLogins: function () {
    this.logMsg("removeAllLogins");

    //serveurs entrants
    for (const serveur of MailServices.accounts.allServers) {
      if ((serveur.type == "imap" || serveur.type == "pop3") &&
        this.isMelanie2Host(serveur.hostName)) {

        this.logMsg("removeAllLogins reinitialisation mot de passe serveur entrant pour:" + serveur.username);
        serveur.password = null;
      }
    }

    //serveurs sortants
    for (const serveur of MailServices.outgoingServer.servers) {

      if (serveur.type != "smtp") continue;

      serveur = serveur.QueryInterface(Ci.nsISmtpServer);

      if (this.isMelanie2Host(serveur.hostname)) {

        this.logMsg("removeAllLogins reinitialisation mot de passe serveur sortant pour:" + serveur.username);
        serveur.password = null;
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
    // Services.console.logStringMessage("PACOME_DEBUG: " + msg);
  },

}
PacomeAuthUtils.Init();