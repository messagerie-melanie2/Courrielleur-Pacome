/* Module de synchronisation des étiquettes Courrielleur
   Adaptation de cm2tags.jsm pour Thunderbird 115+ (ES Modules)

   Format des données échangées avec le service (JSON) :
   -------------------------------------------------------
   Envoi (config client) :
     {
       "etiquettes": [ { "key":"", "tag":"", "color":"", "ordinal":"" }, ... ],
       "boites":     [ "<uid>", ... ],           // identifiant principal en premier
       "partages":   [ "<balp>:<key>", ... ],     // étiquettes partagées
       "synchro":    {                            // dernier état reçu du serveur
         "etiquettes": [...],
         "partages":   [...]
       }
     }

   Réception (config serveur) :
     {
       "etiquettes":  [ { "key":"", "tag":"", "color":"", "ordinal":"" }, ... ],
       "partages":    [ "<balp>:<key>", ... ],
       "droitsbalp":  [ "<uid>", ... ]
     }
*/

const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
const { FileUtils } = ChromeUtils.importESModule("resource:///modules/FileUtils.sys.mjs");

const { PacomeUtils } = ChromeUtils.importESModule("resource:///modules/pacome/pacomeUtils.mjs");
const { PacomeAuthUtils } = ChromeUtils.importESModule("resource:///modules/pacome/pacomeAuthUtils.mjs");


// URL par défaut du service de synchronisation des étiquettes
export const PACOME_TAGS_SERVICE_URL = "https://pacome.s2.m2.e2.rie.gouv.fr/pacometags.php";

// Préférence : URL du service (surcharge la valeur par défaut)
export const PACOME_TAGS_PREF_SERVICE = "extensions.pacome.etiquettes.service";

// Préférence : activation de la synchronisation automatique au démarrage
export const PACOME_TAGS_PREF_MAJAUTO = "extensions.pacome.etiquettes.majauto";

// Préférence : liste des étiquettes partagées (format "<balp>:<key>,...")
export const PACOME_TAGS_PREF_PARTAGES = "extensions.pacome.etiquettes.partages";

// Nom du fichier de cache dans le profil utilisateur
const PACOME_TAGS_FICHIER = "pacome-tags.json";

// Étiquettes Thunderbird natives — non modifiables par le serveur
const ETIQUETTES_DEFAUT = ["$label1", "$label2", "$label3", "$label4", "$label5"];


export const PacomeTagsSync = {

  // -----------------------------------------------------------------------
  // Logs
  // -----------------------------------------------------------------------

  _log(msg) {
    PacomeUtils.PacomeTrace("[TagsSync] " + msg);
    Services.console.logStringMessage("[Pacome] TagsSync: " + msg);
  },

  // -----------------------------------------------------------------------
  // Liste des boites configurées via Pacome
  // Retourne un tableau d'UIDs réduits, le compte principal en premier.
  // -----------------------------------------------------------------------
  ListeBoites() {

    const boites = [];

    for (const serveur of MailServices.accounts.allServers) {
      // Bug #1 : getStringValue() retourne "" (et non null) quand la préférence
      // est absente — la vérification doit porter sur une chaîne non vide.
      const confid = serveur.getStringValue("pacome.confid") ?? "";
      if (("imap" === serveur.type || "pop3" === serveur.type) &&
        "" !== confid) {
        // Pour les BALP (username contenant ".-.", ex. "uid1.-.balp_nom"), conserver l'UID
        // complet afin que le serveur les reconnaisse comme BALP (il cherche ".-." dans l'uid).
        // Pour les BALI, réduire l'UID normalement.
        const uid = serveur.username.includes(".-.")
          ? serveur.username
          : PacomeAuthUtils.GetUidReduit(serveur.username);
        boites.push(uid);
      }
    }

    if (0 === boites.length) return boites;

    // Placer le compte principal en premier
    try {
      const principal = MailServices.accounts.defaultAccount;
      if (principal && principal.incomingServer) {
        const uidPrincipal = PacomeAuthUtils.GetUidReduit(principal.incomingServer.username);
        if (boites[0] !== uidPrincipal) {
          boites.sort((a, b) => {
            if (a === uidPrincipal) return -1;
            if (b === uidPrincipal) return 1;
            return 0;
          });
        }
      }
    } catch (ex) {
      this._log("ListeBoites exception tri: " + ex);
    }

    this._log("ListeBoites: " + JSON.stringify(boites));
    return boites;
  },

  // -----------------------------------------------------------------------
  // Lit la liste des partages depuis la préférence
  // -----------------------------------------------------------------------
  _getPartages() {
    const val = Services.prefs.getCharPref(PACOME_TAGS_PREF_PARTAGES, "");
    if ("" === val) return [];
    // Vérification format "balp:key" (présence d'un séparateur ":")
    if (-1 === val.indexOf(":")) {
      // Ancien format incompatible — réinitialiser
      Services.prefs.setCharPref(PACOME_TAGS_PREF_PARTAGES, "");
      return [];
    }
    return val.split(",").filter(s => s.length > 0);
  },

  // -----------------------------------------------------------------------
  // Construit la configuration client à envoyer au service
  // -----------------------------------------------------------------------
  ConfigClient() {

    try {
      const config = {};

      // Étiquettes locales courantes
      config.etiquettes = MailServices.tags.getAllTags({});
      this._log("ConfigClient etiquettes locales: " + config.etiquettes.length);

      // Liste des boites
      config.boites = this.ListeBoites();
      if (0 === config.boites.length) {
        this._log("ConfigClient aucune boite configurée");
        return null;
      }

      // Partages locaux
      config.partages = this._getPartages();

      // Dernier état synchronisé (pour diff côté serveur)
      const synchro = this.LitConfig();
      config.synchro = {};
      config.synchro.etiquettes = (synchro && synchro.etiquettes) ? synchro.etiquettes : [];
      config.synchro.partages = (synchro && synchro.partages) ? synchro.partages : [];

      return config;

    } catch (ex) {
      this._log("ConfigClient exception: " + ex);
      return null;
    }
  },

  // -----------------------------------------------------------------------
  // Applique la configuration retournée par le service
  // strConfigService : chaîne JSON de la réponse du service
  // Retourne 0 si succès, -1 si erreur
  // -----------------------------------------------------------------------
  MajConfig(strConfigService) {

    this._log("MajConfig");

    let configService;
    try {
      configService = JSON.parse(strConfigService);
    } catch (ex) {
      this._log("MajConfig erreur parse JSON: " + ex);
      return -1;
    }

    if (!configService || !configService.etiquettes) {
      this._log("MajConfig format de réponse invalide");
      return -1;
    }

    // Étiquettes locales actuelles
    const etiquettesLocales = MailServices.tags.getAllTags({});

    // Clés retournées par le serveur (pour la détection des suppressions)
    const clesServeur = new Set(configService.etiquettes.map(e => e.key));

    // Mise à jour des étiquettes existantes ou ajout des nouvelles (libellé et/ou couleur)
    for (const srv of configService.etiquettes) {
      let presentLoc = false;
      for (const loc of etiquettesLocales) {
        if (srv.key === loc.key) {
          presentLoc = true;
          if (srv.tag !== loc.tag) {
            this._log("MajConfig màj libellé: " + srv.key + " => " + srv.tag);
            MailServices.tags.setTagForKey(srv.key, srv.tag);
          }
          if (srv.color !== loc.color) {
            this._log("MajConfig màj couleur: " + srv.key + " => " + srv.color);
            MailServices.tags.setColorForKey(srv.key, srv.color);
          }
          break;
        }
      }

      // L'étiquette du serveur n'existe pas localement : on l'ajoute
      if (!presentLoc) {
        this._log("MajConfig ajout nouvelle étiquette: " + srv.key + " (" + srv.tag + ")");
        try {
          MailServices.tags.addTagForKey(srv.key, srv.tag, srv.color, srv.ordinal || "");
        } catch (ex) {
          this._log("MajConfig exception addTagForKey: " + ex);
        }
      }
    }

    // Bug #4 : supprimer les étiquettes locales absentes de la réponse serveur
    // (hors étiquettes natives Thunderbird non gérées par Pacome)
    for (const loc of etiquettesLocales) {
      if (!clesServeur.has(loc.key) && !this.EstEtiquetteDefaut(loc.key)) {
        this._log("MajConfig suppression étiquette disparue: " + loc.key + " (" + loc.tag + ")");
        try {
          MailServices.tags.deleteKey(loc.key);
        } catch (ex) {
          this._log("MajConfig exception deleteKey: " + ex);
        }
      }
    }

    // Mise à jour des partages
    if (configService.partages) {
      Services.prefs.setCharPref(PACOME_TAGS_PREF_PARTAGES,
        configService.partages.join(","));
    }

    Services.prefs.savePrefFile(null);
    return 0;
  },

  // -----------------------------------------------------------------------
  // Sauvegarde la configuration reçue du service dans pacome-tags.json
  // config : objet JSON (réponse du service)
  // Retourne 0 si succès, -1 si erreur
  // -----------------------------------------------------------------------
  SauveConfig(config) {

    try {
      const donnees = JSON.stringify({
        etiquettes: config.etiquettes || [],
        partages: config.partages || [],
        droitsbalp: config.droitsbalp || [],
      });

      const fichier = Services.dirsvc.get("ProfD", Ci.nsIFile);
      fichier.append(PACOME_TAGS_FICHIER);

      if (!fichier.exists()) {
        fichier.create(Ci.nsIFile.NORMAL_FILE_TYPE, FileUtils.PERMS_FILE);
      }

      const outStream = Cc["@mozilla.org/network/file-output-stream;1"]
        .createInstance(Ci.nsIFileOutputStream);
      outStream.init(fichier,
        FileUtils.MODE_WRONLY | FileUtils.MODE_CREATE | FileUtils.MODE_TRUNCATE,
        FileUtils.PERMS_FILE, 0);

      const converter = Cc["@mozilla.org/intl/converter-output-stream;1"]
        .createInstance(Ci.nsIConverterOutputStream);
      converter.init(outStream, "UTF-8", 0, 0);
      converter.writeString(donnees);
      converter.close();

      this._log("SauveConfig succès");
      return 0;

    } catch (ex) {
      this._log("SauveConfig exception: " + ex);
      return -1;
    }
  },

  // -----------------------------------------------------------------------
  // Lit la configuration mémorisée dans pacome-tags.json
  // Retourne un objet { etiquettes, partages, droitsbalp } ou null si erreur
  // -----------------------------------------------------------------------
  LitConfig() {

    try {
      const fichier = Services.dirsvc.get("ProfD", Ci.nsIFile);
      fichier.append(PACOME_TAGS_FICHIER);

      if (!fichier.exists()) {
        this._log("LitConfig fichier absent");
        return { etiquettes: [], partages: [], droitsbalp: [] };
      }

      const inStream = Cc["@mozilla.org/network/file-input-stream;1"]
        .createInstance(Ci.nsIFileInputStream);
      inStream.init(fichier, -1, 0, 0);

      const converter = Cc["@mozilla.org/intl/converter-input-stream;1"]
        .createInstance(Ci.nsIConverterInputStream);
      converter.init(inStream, "UTF-8", 0, 0);

      let configStr = "";
      const str = {};
      let read = 0;
      do {
        read = converter.readString(0xffffffff, str);
        configStr += str.value;
      } while (read !== 0);
      converter.close();

      const config = JSON.parse(configStr);

      if (config && config.etiquettes && config.partages) {
        this._log("LitConfig succès");
        return config;
      }

      this._log("LitConfig format non reconnu, retour vide");
      return { etiquettes: [], partages: [], droitsbalp: [] };

    } catch (ex) {
      this._log("LitConfig exception: " + ex);
      return null;
    }
  },

  // -----------------------------------------------------------------------
  // Point d'entrée principal de la synchronisation
  // fncRappel(result) : callback avec result.code (0=succès) et result.erreur
  // creds : {uid, mdp} optionnels pour authentification Basic
  // -----------------------------------------------------------------------
  Synchronise(fncRappel, creds = null) {

    this._log("Synchronise début");
    PacomeUtils.EcritLog("TAGS_SYNC", "Début de la synchronisation des étiquettes", "");

    // Construction de la config client
    const configClient = this.ConfigClient();
    if (null === configClient) {
      this._log("Synchronise erreur config client");
      PacomeUtils.EcritLog("TAGS_SYNC", "Erreur de configuration client", "");
      if (fncRappel) fncRappel({ code: -1, erreur: "Erreur de configuration client" });
      return;
    }

    // Aucune boite → pas de synchro
    if (0 === configClient.boites.length) {
      this._log("Synchronise aucune boite paramétrée");
      PacomeUtils.EcritLog("TAGS_SYNC", "Aucune boite configurée, synchronisation ignorée", "");
      if (fncRappel) fncRappel({ code: -1, erreur: "Aucune boite configured" });
      return;
    }

    const strConfig = JSON.stringify(configClient);
    this._log("Synchronise config: " + strConfig);

    // Callback interne à la réponse du service
    const _this = this;
    function reponseService(result, strConfigService) {

      _this._log("Synchronise reponseService code: " + result.code);

      if (200 !== result.code) {
        PacomeUtils.EcritLog("TAGS_SYNC", "Erreur du service", result.erreur);
        if (fncRappel) fncRappel(result);
        return;
      }

      // Appliquer la configuration reçue
      const res = _this.MajConfig(strConfigService);
      if (0 !== res) {
        PacomeUtils.EcritLog("TAGS_SYNC", "Erreur de mise à jour locale", "");
        if (fncRappel) fncRappel({ code: -1, erreur: "Erreur de mise à jour des étiquettes" });
        return;
      }

      // Sauvegarder pour la prochaine synchro
      const configService = JSON.parse(strConfigService);
      _this.SauveConfig(configService);

      PacomeUtils.EcritLog("TAGS_SYNC", "Synchronisation réussie", "");
      _this._log("Synchronise succès");
      if (fncRappel) fncRappel({ code: 0, erreur: "" });
    }

    this._RequeteService(strConfig, reponseService, creds);
  },

  // -----------------------------------------------------------------------
  // Envoi de la requête HTTP POST vers le service
  // strConfig : chaîne JSON de la configuration client
  // fncRappel(result, strReponse)
  // creds : identifiants d'authentification
  // -----------------------------------------------------------------------
  _RequeteService(strConfig, fncRappel, creds = null) {

    let url = PACOME_TAGS_SERVICE_URL;
    try {
      const urlPref = Services.prefs.getCharPref(PACOME_TAGS_PREF_SERVICE, "");
      if (urlPref !== "") url = urlPref;
    } catch (ex) { /* préférence absente, on garde l'URL par défaut */ }

    this._log("_RequeteService url: " + url);
    PacomeUtils.EcritLog("TAGS_SYNC", "Requête vers le service", url);

    const httpRequest = new XMLHttpRequest();
    httpRequest.open("POST", url, true);

    httpRequest.setRequestHeader("Accept-Charset", "UTF-8");
    httpRequest.setRequestHeader("Content-Type", "application/json");

    if (creds && creds.uid && creds.mdp) {
      httpRequest.setRequestHeader("Authorization", "Basic " + btoa(creds.uid + ":" + creds.mdp));
    }

    httpRequest.onload = function (aEvt) {
      const request = aEvt.target;
      const statut = request.status;

      if (200 === statut) {
        const contentType = request.getResponseHeader("Content-Type");
        if (null != contentType &&
          null != httpRequest.responseText &&
          0 < httpRequest.responseText.length &&
          0 === contentType.indexOf("application/json")) {
          if (fncRappel) fncRappel({ code: statut, erreur: "" }, httpRequest.responseText);
          return;
        }
      }

      // Bug #3 : log explicite pour les erreurs d'authentification
      if (401 === statut) {
        Services.console.logStringMessage("[Pacome] TagsSync: le service a retourné 401 Non autorisé."
          + " Vérifier que les credentials sont bien transmis (mot de passe disponible au moment de la synchro).");
      }

      // Erreur HTTP ou mauvais Content-Type
      if (fncRappel) fncRappel({ code: statut, erreur: request.statusText }, null);
    };

    httpRequest.onerror = function (aEvt) {
      const request = aEvt.target;
      const statut = request.status;
      const erreur = (0 === statut) ? "Erreur réseau lors de la synchronisation"
        : request.statusText;
      if (fncRappel) fncRappel({ code: (0 === statut) ? -1 : statut, erreur }, null);
    };

    this._log("_RequeteService envoi");
    httpRequest.send(strConfig);
  },

  // -----------------------------------------------------------------------
  // Teste si une clé est une étiquette Thunderbird native (non modifiable)
  // -----------------------------------------------------------------------
  EstEtiquetteDefaut(cle) {
    return ETIQUETTES_DEFAUT.includes(cle);
  },
};
