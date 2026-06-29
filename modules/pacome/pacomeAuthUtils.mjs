/*
  Module pacome - fonctions utilitaires pour l'authentification
*/


const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

const { PacomeUtils, PACOME_SEP_UID, PACOME_URL_VERIFMDP } = ChromeUtils.importESModule("resource:///modules/pacome/pacomeUtils.mjs");

// Monkey-patch de ImapIncomingServer pour convertir trash_folder_name en MUTF-7 lors de la lecture interne par Thunderbird
try {
  const { ImapIncomingServer } = ChromeUtils.import("resource:///modules/ImapIncomingServer.jsm");
  if (ImapIncomingServer && ImapIncomingServer.prototype) {
    Object.defineProperty(ImapIncomingServer.prototype, "trashFolderName", {
      get() {
        let name = this.getUnicharValue("trash_folder_name") || "Trash";
        if (name && name !== "Trash" && /[^\x00-\x7F]/.test(name)) {
          try {
            const Cc = globalThis.Cc || Components.classes;
            const Ci = globalThis.Ci || Components.interfaces;
            const charsetManager = Cc["@mozilla.org/charset-converter-manager;1"]
              .getService(Ci.nsICharsetConverterManager);
            name = charsetManager.unicodeToMutf7(name);
          } catch (e) {
            // En cas d'erreur de conversion, conserver la valeur originale
          }
        }
        return name;
      },
      configurable: true,
      enumerable: true
    });
    Services.console.logStringMessage("[Pacome] Monkey-patch de ImapIncomingServer.prototype.trashFolderName appliqué avec succès.");
  }
} catch (exPatch) {
  Services.console.logStringMessage("[Pacome] Erreur lors de l'application du monkey-patch sur ImapIncomingServer : " + exPatch);
}


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
  _authRetryCount: {},
  _verificationEnCours: false,

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

    // Observer les échecs d'authentification IMAP silencieux
    // Thunderbird émet ces notifications quand l'auth IMAP échoue sans rappeler promptPassword
    if (!this._imapAuthObserver) {
      this._imapAuthObserver = {
        observe(subject, topic, data) {
          Services.console.logStringMessage("[Pacome] Init observer topic:" + topic + " data:" + data);
          try {
            // subject est un nsIMsgIncomingServer
            const server = subject.QueryInterface(Ci.nsIMsgIncomingServer);
            const host = server.hostName;
            Services.console.logStringMessage("[Pacome] Init observer IMAP auth failure host:" + host + " user:" + server.username);

            if (PacomeAuthUtils.TestServeurMelanie2(host) == NON_MELANIE2) return;

            // Réinitialiser le mot de passe en mémoire pour forcer un nouveau prompt
            server.password = null;

            // Afficher le dialog Pacome
            const uid = PacomeAuthUtils.GetUidReduit(server.username);
            Services.console.logStringMessage("[Pacome] Init observer → ouverture dialog Pacome pour uid:" + uid);
            const mdp = {};
            const checkBox = {};
            const res = PacomeAuthUtils.PromptPacomeMdp(null, uid, mdp, checkBox);
            Services.console.logStringMessage("[Pacome] Init observer PromptPacomeMdp résultat:" + res
              + " checkBox.value=" + checkBox.value + " (type:" + typeof checkBox.value + ")");
            if (res == 1 && mdp.value) {
              const saveToManager = !!checkBox.value;
              Services.console.logStringMessage("[Pacome] Init observer modifyMdpPacome saveToManager:" + saveToManager);
              PacomeAuthUtils.modifyMdpPacome(uid, mdp.value, saveToManager);
            }
          } catch (e) {
            Services.console.logStringMessage("[Pacome] Init observer erreur:" + e);
          }
        }
      };

      // Topics possibles selon la version de Thunderbird
      for (const topic of [
        "imap-autologin-failed", "mail:imap-autologin-failed", "autologin-failed",
        "mail:loginFailed", "imap:loginFailed", "msgDBView:msgAdded"
      ]) {
        try {
          Services.obs.addObserver(this._imapAuthObserver, topic);
          Services.console.logStringMessage("[Pacome] Init observer enregistré pour topic:" + topic);
        } catch (e) { /* topic non supporté */ }
      }

      // Listener de dossier via nsIMsgMailSession pour catcher les erreurs IMAP
      try {
        const folderListener = {
          onFolderAdded(folder) {
            try {
              const Cc = globalThis.Cc || Components.classes;
              const Ci = globalThis.Ci || Components.interfaces;
              // On ne traite pas le dossier racine car il ne supporte pas d'abonnement (subscribed = true lèverait NS_ERROR_XPC_CANT_MODIFY_PROP_ON_WN)
              if (folder && folder.parent && folder.server && folder.server.type == "imap" && PacomeAuthUtils.TestServeurMelanie2(folder.server.hostName) != NON_MELANIE2) {
                Services.console.logStringMessage("[Pacome] folderListener.onFolderAdded: " + folder.URI);
                
                // Rétablir la corbeille si le dossier ajouté correspond à la corbeille paramétrée
				// (Nécessaire pour empêcher Thunderbird140+ de retomber dans la pref par défaut Trash)
                const trashFolderUri = folder.server.getStringValue("trash_folder");
                if (trashFolderUri) {
                  let match = false;
                  try {
                    match = (decodeURIComponent(folder.URI).toLowerCase() == decodeURIComponent(trashFolderUri).toLowerCase());
                  } catch (e) {
                    match = (folder.URI.toLowerCase() == trashFolderUri.toLowerCase());
                  }
                  if (match) {
                    PacomeAuthUtils.retablitCorbeille(folder.server);
                  }
                }

                if (!folder.subscribed) {
                  Services.console.logStringMessage("[Pacome] folderListener.onFolderAdded: forçage de l'abonnement pour " + folder.URI);
                  folder.subscribed = true;
                  const specialNames = ["sent", "drafts", "trash", "templates", "archives", "junk", "corbeille", "brouillons", "envoyés", "envoyes"];
                  if (specialNames.includes(folder.name.toLowerCase())) {
                    Services.console.logStringMessage("[Pacome] folderListener.onFolderAdded : appel setSpecialFolders suite à l'ajout de " + folder.name);
                    MailServices.accounts.setSpecialFolders();
                  }
                }
              }
            } catch (ex) {
              Services.console.logStringMessage("[Pacome] folderListener.onFolderAdded erreur: " + ex);
            }
          },
          onMessageAdded() { },
          onFolderRemoved() { },
          onMessageRemoved() { },
          onFolderPropertyChanged() { },
          onFolderIntPropertyChanged(folder, property, oldValue, newValue) { },
          onFolderBoolPropertyChanged() { },
          onFolderUnicharPropertyChanged() { },
          onFolderPropertyFlagChanged() { },
          onFolderEvent(folder, event) {
            // Log tous les événements pour identifier celui de l'échec d'auth
            Services.console.logStringMessage("[Pacome] folderListener.onFolderEvent event:" + event
              + " folder:" + (folder ? folder.URI : "null"));

            if (event == "FolderLoaded" && folder && folder.URI.toLowerCase().endsWith("/inbox")) {
              try {
                const Cc = globalThis.Cc || Components.classes;
                const Ci = globalThis.Ci || Components.interfaces;
                const server = folder.server;
                if (server && server.type == "imap" && PacomeAuthUtils.TestServeurMelanie2(server.hostName) != NON_MELANIE2) {
                  const imapSrv = server.QueryInterface(Ci.nsIImapIncomingServer);
                  
                  // Tenter de rétablir la corbeille dès la connexion
                  PacomeAuthUtils.retablitCorbeille(server);

                  if (!imapSrv.hasDiscoveredFolders) {
                    Services.console.logStringMessage("[Pacome] folderListener : FolderLoaded INBOX détecté sans découverte → planification de la découverte");
                    
                    if (PacomeAuthUtils._discoveryTimer) {
                      PacomeAuthUtils._discoveryTimer.cancel();
                    }
                    PacomeAuthUtils._discoveryTimer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
                    PacomeAuthUtils._discoveryTimer.initWithCallback({
                      notify: (timer) => {
                        try {
                          Services.console.logStringMessage("[Pacome] folderListener : début de la découverte distante...");

                          const rootFolder = imapSrv.rootMsgFolder;
                          const mainWin = Services.wm.getMostRecentWindow("mail:3pane");
                          const msgWin = mainWin ? mainWin.msgWindow : null;

                          // Création d'un listener pour finaliser la découverte à la fin des requêtes IMAP
                          const urlListener = {
                            OnStartRunningUrl(url) {},
                            OnStopRunningUrl(url, status) {
                              Services.console.logStringMessage("[Pacome] folderListener : découverte terminée avec statut : " + status);
                              try {
                                imapSrv.hasDiscoveredFolders = true;
                                imapSrv.discoveryDone();
                                
                                // Rétablir la corbeille après la découverte complète des dossiers distants
                                PacomeAuthUtils.retablitCorbeille(server);
                                
                                MailServices.accounts.setSpecialFolders();
                                Services.console.logStringMessage("[Pacome] folderListener : discoveryDone exécuté après découverte");
                              } catch (e) {
                                Services.console.logStringMessage("[Pacome] folderListener : erreur lors de discoveryDone : " + e);
                              }
                            },
                            QueryInterface: ChromeUtils.generateQI(["nsIUrlListener"])
                          };

                          // Déclenchement de la découverte via les commandes distantes LSUB/LIST
                          MailServices.imap.discoverAllAndSubscribedFolders(rootFolder, urlListener, msgWin);

                        } catch (ex) {
                          Services.console.logStringMessage("[Pacome] folderListener : erreur lors du déclenchement de la découverte : " + ex);
                        } finally {
                          PacomeAuthUtils._discoveryTimer = null;
                        }
                      }
                    }, 1500, Ci.nsITimer.TYPE_ONE_SHOT);
                  }
                }
              } catch (e) {
                Services.console.logStringMessage("[Pacome] folderListener exception lors du traitement FolderLoaded: " + e);
              }
            }

            // Événements connus pour l'échec d'auth IMAP dans Thunderbird
            const authFailEvents = ["ImapLoginFailed", "LoginFailed", "autologin-failed"];
            if (!authFailEvents.includes(event)) return;

            try {
              const server = folder.server;
              if (!server) return;
              const host = server.hostName;
              Services.console.logStringMessage("[Pacome] folderListener auth failure détecté host:" + host);

              if (PacomeAuthUtils.TestServeurMelanie2(host) == NON_MELANIE2) return;

              // Réinitialiser le mot de passe en mémoire
              server.password = null;

              const uid = PacomeAuthUtils.GetUidReduit(server.username);
              Services.console.logStringMessage("[Pacome] folderListener → ouverture dialog Pacome pour uid:" + uid);
              const mdp = {};
              const checkBox = {};
              const res = PacomeAuthUtils.PromptPacomeMdp(null, uid, mdp, checkBox);
              Services.console.logStringMessage("[Pacome] folderListener PromptPacomeMdp résultat:" + res
                + " checkBox.value=" + checkBox.value + " (type:" + typeof checkBox.value + ")");
              if (res == 1 && mdp.value) {
                const saveToManager = !!checkBox.value;
                Services.console.logStringMessage("[Pacome] folderListener modifyMdpPacome saveToManager:" + saveToManager);
                PacomeAuthUtils.modifyMdpPacome(uid, mdp.value, saveToManager);
              }
            } catch (e) {
              Services.console.logStringMessage("[Pacome] folderListener erreur:" + e);
            }
          }

        };
        MailServices.mailSession.AddFolderListener(folderListener, Ci.nsIFolderListener.all);
        Services.console.logStringMessage("[Pacome] Init folderListener enregistré");
      } catch (e) {
        Services.console.logStringMessage("[Pacome] Init folderListener erreur:" + e);
      }
    }
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

      // Consulter le gestionnaire Pacome uniquement (realm unifié).
      // On NE cherche PAS dans les logins natifs Thunderbird (standardLogins)
      // ni dans d'anciens realms (realmsToCheck) : Thunderbird persiste
      // server.password nativement, ce qui provoquerait des sauvegardes non
      // souhaitées et des utilisations silencieuses de mdp périmés au démarrage.
      if (origin) {
        try {
          const pacomeUnifiedOrigin = "https://pacome.s2.m2.e2.rie.gouv.fr";
          const pacomeUnifiedRealm = "pacome-melanie2";
          let unifiedPacomeLogins = Services.logins.findLogins(pacomeUnifiedOrigin, null, pacomeUnifiedRealm);
          for (let login of unifiedPacomeLogins) {
            if (!logins.some(l => l.username == login.username && l.password == login.password)) {
              logins.push(login);
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

    this.logMsg("modifyMdpPacome uid:" + uid
      + " saveToManager:" + saveToManager
      + " (type:" + typeof saveToManager + ")"
      + " realm:" + realm);


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
    // (nsIMsgIncomingServer.password est un setter en mémoire uniquement — pas de persistance sur disque)
    for (const serveur of MailServices.accounts.allServers) {
      if ((serveur.type == "imap" || serveur.type == "pop3") &&
        this.isMelanie2Host(serveur.hostName)) {
        const uid2 = this.GetUidReduit(serveur.username);
        if (uidReduit != uid2) continue;
        this.logMsg("modifyMdpPacome mise à jour mot de passe serveur entrant pour:" + serveur.username);
        serveur.password = mdp;
      }
    }

    // Mise à jour des serveurs sortants (même logique : setter en mémoire)
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

  // Vérification du mot de passe en arrière-plan lorsque le login est déjà stocké.
  // Envoie une requête au serveur Pacome et agit selon la réponse :
  // - code 0 : OK, rien à faire
  // - code 0xFFFF : le mot de passe doit changer -> ouverture boîte BNUM
  // - code 49 + GRILLED : mot de passe expiré -> ouverture boîte BNUM + hors ligne + suppression mdp
  // - code 49 (autre) : mot de passe invalide -> suppression mdp stocké
  // - erreur réseau : ignorée silencieusement
  verifierMdpEnArrierePlan(uid, mdp) {

    this.logMsg("verifierMdpEnArrierePlan uid:" + uid);

    if (!uid || !mdp) return;
    if (Services.io.offline) return;

    // Garde-fou : une seule vérification à la fois.
    // promptAuth (IMAP) et promptPassword (SMTP) peuvent l'appeler simultanément
    // au démarrage → sans ce garde, deux requêtes partiraient en parallèle et la
    // boîte "mot de passe doit changer" apparaîtrait deux fois.
    if (this._verificationEnCours) {
      this.logMsg("verifierMdpEnArrierePlan déjà en cours → ignoré");
      return;
    }
    this._verificationEnCours = true;

    const url = Services.prefs.getCharPref(PACOME_URL_VERIFMDP, "");
    if (url == "") {
      this.logMsg("verifierMdpEnArrierePlan url serveur non definie");
      this._verificationEnCours = false;
      return;
    }

    const httpRequest = new XMLHttpRequest();

    let param = "op=verifmdp&uid=" + encodeURIComponent(uid);
    param += "&mdp=" + encodeURIComponent(mdp);
    param += "&extver=" + encodeURIComponent(PacomeUtils.version);
    param += "&cm2ver=140.2.1.8";
    param += "&org=";

    const _this = this;
    // Capturer le mdp au moment du lancement.
    // Si l'utilisateur change son mdp pendant la requête (via le dialogue Pacome),
    // la réponse sera périmée : on doit l'ignorer pour ne pas effacer le nouveau mdp.
    const mdpAuLancement = mdp;

    httpRequest.onreadystatechange = function () {
      if (httpRequest.readyState != 4) return;

      // Vérifier si le mdp a changé depuis le lancement (race condition :
      // promptAuth pouvait encore avoir l'ancien mdp quand la verif a démarré,
      // puis l'utilisateur a saisi un nouveau mdp via la boîte Pacome).
      if (_this._lastSavedPassword && _this._lastSavedPassword.mdp !== mdpAuLancement) {
        _this.logMsg("verifierMdpEnArrierePlan résultat périmé (mdp changé entre-temps) → ignoré");
        _this._verificationEnCours = false;
        return;
      }

      let statut = 0;
      try {
        statut = httpRequest.status;
      } catch (ex) {
        try {
          let req = httpRequest.channel.QueryInterface(Components.interfaces.nsIRequest);
          statut = req.status;
        } catch (ex2) { }
      }

      _this.logMsg("verifierMdpEnArrierePlan statut:" + statut);

      if (statut != 200) {
        // Erreur réseau ou serveur -> ignorer silencieusement
        _this.logMsg("verifierMdpEnArrierePlan erreur serveur statut:" + statut);
        _this._verificationEnCours = false;
        return;
      }

      const reponse = httpRequest.responseText;
      _this.logMsg("verifierMdpEnArrierePlan reponse:'" + reponse + "'");

      // Analyser la réponse : code=XX;message=YY;...
      let code = -1;
      let message = "";

      const tab = reponse.split(";");
      if (tab.length > 0) {
        let res = tab[0].split("=");
        if (res[0] == "code") code = res[1];
      }
      if (tab.length > 1) {
        let res = tab[1].split("=");
        if (res[0] == "message") message = res[1];
      }

      _this.logMsg("verifierMdpEnArrierePlan code:" + code + " message:" + message);

      // Libérer le verrou dans tous les cas (le bloc finally est simulé par
      // un reset systématique avant chaque return)

      // Cas mot de passe valide
      if (0 == code) {
        _this.logMsg("verifierMdpEnArrierePlan mot de passe valide");
        _this._verificationEnCours = false;
        return;
      }

      // Cas mot de passe valide mais doit changer (0xFFFF)
      if (0xFFFF == code) {
        _this.logMsg("verifierMdpEnArrierePlan mot de passe doit changer");

        let aParent = Services.wm.getMostRecentWindow("mail:3pane");
        if (aParent) {
          let argchg = Array();
          argchg["uid"] = uid;
          argchg["mineqpassworddoitchanger"] = message || "Merci de changer votre mot de passe au plus vite.";
          // Libérer le verrou avant l'ouverture du dialogue (modal bloquant)
          _this._verificationEnCours = false;
          aParent.openDialog("chrome://pacome/content/pacomechgmdp.xhtml", "", "chrome,modal,centerscreen,titlebar", argchg);
        } else {
          _this._verificationEnCours = false;
        }
        return;
      }

      // Cas mot de passe non valide (code 49)
      if (49 == code) {

        // Cas GRILLED : mot de passe expiré
        if (message.startsWith("GRILLED : ")) {
          _this.logMsg("verifierMdpEnArrierePlan mot de passe expire (GRILLED)");

          let aParent = Services.wm.getMostRecentWindow("mail:3pane");
          if (aParent) {
            let msgUser = message.substr(10);
            let argchg = Array();
            argchg["uid"] = uid;
            argchg["mineqpassworddoitchanger"] = msgUser;
            // Libérer le verrou avant le dialogue
            _this._verificationEnCours = false;
            aParent.openDialog("chrome://pacome/content/pacomechgmdp.xhtml", "", "chrome,modal,centerscreen,titlebar", argchg);
          } else {
            _this._verificationEnCours = false;
          }

          // Supprimer le mdp stocké et passer hors ligne
          _this.removeAllLogins();
          PacomeUtils.passerHorsLigne();
          return;
        }

        // Autre code 49 : mdp invalide -> supprimer le mdp stocké
        _this.logMsg("verifierMdpEnArrierePlan mot de passe invalide (code 49) - suppression mdp stocke");
        _this._verificationEnCours = false;
        _this.removeAllLogins();
        return;
      }

      // Autres codes : ignorer
      _this.logMsg("verifierMdpEnArrierePlan code non gere:" + code);
      _this._verificationEnCours = false;
    };

    httpRequest.open("POST", url, true, null, null);
    httpRequest.setRequestHeader("Content-Type", "application/x-www-form-urlencoded;charset=ISO-8859-1");
    httpRequest.send(param);
  },

  // Interception de l'échec d'authentification SMTP pour les serveurs Mélanie2.
  // Ouvre le dialogue Pacome au lieu d'afficher le message d'erreur générique.
  // Retourne 0 (réessayer) si l'utilisateur a saisi un mot de passe,
  //          1 (annuler) si l'utilisateur a annulé.
  promptSmtpAuthFailed(smtpServer) {

    this.logMsg("promptSmtpAuthFailed hostname:" + smtpServer.hostname
      + " username:" + smtpServer.username);

    const uid = this.GetUidReduit(smtpServer.username);
    const mdp = {};
    const checkBox = { value: false };

    const res = this.PromptPacomeMdp(null, uid, mdp, checkBox);

    this.logMsg("promptSmtpAuthFailed PromptPacomeMdp res:" + res
      + " mdp:" + (mdp.value ? "(fourni)" : "(vide)"));

    if (res && mdp.value) {
      const saveToManager = !!checkBox.value;
      this.logMsg("promptSmtpAuthFailed modifyMdpPacome saveToManager:" + saveToManager);
      this.modifyMdpPacome(uid, mdp.value, saveToManager);
      return 0; // retry
    }

    return 1; // cancel
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
    for (let serveur of MailServices.outgoingServer.servers) {

      if (serveur.type != "smtp") continue;

      serveur = serveur.QueryInterface(Ci.nsISmtpServer);

      if (this.isMelanie2Host(serveur.hostname)) {

        this.logMsg("removeAllLogins reinitialisation mot de passe serveur sortant pour:" + serveur.username);
        serveur.password = null;
      }
    }

    // Vider le cache _lastSavedPassword pour éviter qu'il ne fournisse
    // un mdp périmé à findLogins lors de la prochaine connexion
    this._lastSavedPassword = null;

    // Supprimer les entrées du gestionnaire de mots de passe Pacome unifié.
    // CRITIQUE : sans ce nettoyage, au prochain démarrage findLogins retrouve
    // l'ancien mdp invalide depuis le login manager, le retourne silencieusement
    // à IMAP/SMTP, attend l'échec réseau (~10s), puis ouvre le dialogue.
    // En supprimant les entrées ici, le prochain promptAuth/promptPassword ne trouve
    // rien → ouvre le dialogue Pacome immédiatement.
    try {
      const pacomeOrigin = "https://pacome.s2.m2.e2.rie.gouv.fr";
      const pacomeRealm = "pacome-melanie2";
      const logins = Services.logins.findLogins(pacomeOrigin, null, pacomeRealm);
      for (const login of logins) {
        this.logMsg("removeAllLogins suppression login manager: " + login.username);
        Services.logins.removeLogin(login);
      }
    } catch (ex) {
      this.logMsg("removeAllLogins erreur suppression login manager: " + ex);
    }
  },

  retablitCorbeille(server) {
    try {
      const Cc = globalThis.Cc || Components.classes;
      const Ci = globalThis.Ci || Components.interfaces;

      const trashFolderUri = server.getStringValue("trash_folder");
      this.logMsg("retablitCorbeille server=" + server.key + " trash_folder=" + trashFolderUri);
      if (!trashFolderUri) return;

      const match = trashFolderUri.match(/^imap:\/\/[^\/]+\/(.+)$/);
      if (!match) return;

      const expectedTrashNameMutf7 = match[1];

      // Conversion de MUTF-7 en Unicode/UTF-8 pour la préférence trash_folder_name
      let expectedTrashNameUtf8 = expectedTrashNameMutf7;
      try {
        const charsetManager = Cc["@mozilla.org/charset-converter-manager;1"]
          .getService(Ci.nsICharsetConverterManager);
        expectedTrashNameUtf8 = charsetManager.mutf7ToUnicode(expectedTrashNameMutf7);
      } catch (exConvert) {
        Services.console.logStringMessage("[Pacome] Erreur conversion mutf7ToUnicode: " + exConvert);
      }

      const currentTrashName = server.getStringValue("trash_folder_name");

      if (currentTrashName != expectedTrashNameUtf8) {
        Services.console.logStringMessage("[Pacome] Rétablissement de trash_folder_name (UTF-8) pour " + server.key + " : " + expectedTrashNameUtf8 + " (était: " + currentTrashName + ")");

        // 1. Mettre à jour la préférence (en UTF-8)
        const prefName = "mail.server." + server.key + ".trash_folder_name";
        Services.prefs.setStringPref(prefName, expectedTrashNameUtf8);

        // 2. Trouver le dossier physique et lui assigner le drapeau Trash
        try {
          const trashFolder = server.rootMsgFolder.getChildWithURI(trashFolderUri, true, false);
          if (trashFolder) {
            trashFolder.setFlag(Ci.nsMsgFolderFlags.Trash);
            Services.console.logStringMessage("[Pacome] Drapeau Corbeille assigné à : " + trashFolder.URI);
          }
        } catch (e) {
          Services.console.logStringMessage("[Pacome] Impossible d'assigner le drapeau Corbeille sur le dossier physique: " + e);
        }

        // 3. Notifier l'account manager pour mettre à jour l'affichage
        MailServices.accounts.setSpecialFolders();
        Services.prefs.savePrefFile(null);
      }
    } catch (ex) {
      Services.console.logStringMessage("[Pacome] Erreur lors du rétablissement de la corbeille : " + ex);
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