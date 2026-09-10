/* fichier pour la gestion des mises à jour pacome
*/

const { PacomeDoc } = ChromeUtils.importESModule("resource:///modules/pacome/pacomeDoc.mjs");
const { PacomeUtils, PACOME_LOGS_MAJ, PACOME_PREF_PARAM_AUTH } = ChromeUtils.importESModule("resource:///modules/pacome/pacomeUtils.mjs");
const { PacomeParam } = ChromeUtils.importESModule("resource:///modules/pacome/pacomeParam.mjs");
const { PacomeAuthUtils } = ChromeUtils.importESModule("resource:///modules/pacome/pacomeAuthUtils.mjs");
const { PacomeTagsSync, PACOME_TAGS_PREF_MAJAUTO } = ChromeUtils.importESModule("resource:///modules/pacome/pacomeTagsSync.mjs");


var PacomeMaj = {

	// instance PacomeDoc (document de paramétrage)
	_docPacome: null,

	Init() {
		const self = this;
		const observer = {
			observe: function (subject, topic, data) {
				if (topic === "mail-startup-done") {
					Services.obs.removeObserver(observer, "mail-startup-done");
					Services.console.logStringMessage("[Pacome] mail-startup-done détecté, lancement de la maj et synchro des étiquettes (délai 5s)");
					// Délai pour ne pas ralentir l'ouverture de la fenêtre principale
					setTimeout(() => {
						self.RechercheMaj();
						self.SynchroEtiquettes();
					}, 5000);
				}
			}
		};
		try {
			Services.obs.addObserver(observer, "mail-startup-done");
			Services.console.logStringMessage("[Pacome] Init observer enregistré pour topic:mail-startup-done dans pacomeMaj.js");
		} catch (e) {
			Services.console.logStringMessage("[Pacome] Erreur Init observer pacomeMaj: " + e);
		}
	},

	/* Recherche de mise à jour
		si maj afficher assistant pacome
	*/
	RechercheMaj() {

		this.logMsgDebug("pacomeRechercheMaj");

		if (Services.io.offline) return;

		try {

			// tester si aucun compte (a priori appelé avec 1 compte)
			const uids = PacomeParam.ListeIdentifiants();
			if (null == uids || 0 == uids.length) {
				this.EcritLog("aucun compte", "");
				return;
			}

			// document de configuration
			const config = PacomeParam.GetConfigClient(uids.join(";"));

			if (null == config) {
				this.EcritLog("Erreur de configuration client", "");
				return;
			}

			this.EcritLog("Configuration client", config);

			// requête au serveur pacome
			PacomeUtils.ClearErreurEx();
			this.logMsgDebug("pacomeRechercheMaj envoie de la requete au serveur");
			this.EcritLog("Envoie de la requete au serveur", "");

			let creds = null;
			if (Services.prefs.getBoolPref(PACOME_PREF_PARAM_AUTH, false)) {
				// si compte principal avec mdp => utiliser
				const compte = PacomeAuthUtils.GetComptePrincipal();
				if (compte && compte.incomingServer.username && compte.incomingServer.password) {
					creds = {};
					creds.uid = PacomeAuthUtils.GetUidReduit(compte.incomingServer.username);
					creds.mdp = compte.incomingServer.password;
				}
			}

			const res = PacomeUtils.RequeteParametrage(config, this.ReceptionReponse, true, creds);

			// si erreur : log message
			if (!res) {
				this.EcritLog("Erreur", "Code erreur :" + PacomeUtils._codeErreur, PacomeUtils._msgErreur);
			}

		} catch (ex) {
			this.logMsgDebug("pacomeRechercheMaj exception:" + ex);
		}

	},

	// fonction de rappel pour la requete de paramétrage
	// si succès determiner si au moins une mise à jour (ajout/maj/suppression)
	ReceptionReponse(statut, responseXML) {

		PacomeMaj.logMsgDebug("ReceptionReponse statut:" + statut);

		PacomeMaj.EcritLog("Réponse de la requête", "statut:" + statut);

		if (statut == 200) {

			PacomeMaj.logMsgDebug("ReceptionReponse succès de la requete");

			const res = PacomeUtils.AnalyseErreurDoc(responseXML);

			if (res) {

				PacomeMaj._docPacome = new PacomeDoc(responseXML);

				// tester si au moins un changement dans le paramétage (ajout/maj/suppression)
				// et visible (hors maj silencieuse)
				const nb = PacomeMaj.GetNbMajVisibles();
				PacomeMaj.logMsgDebug("ReceptionReponse nb visibles:" + nb);

				if (nb > 0) {
					// afficher mises à jour
					PacomeMaj.AffichePacome();
				}
				else {
					PacomeMaj.EcritLog("Aucune mise à jour visible", "");
				}

				const nbnon = PacomeMaj.GetNbMajNonVisibles();
				PacomeMaj.logMsgDebug("ReceptionReponse nb non visibles:" + nbnon);
				if (nbnon > 0) {
					// traiter mises à jour silencieuses
					PacomeParam.MajSilence(responseXML);
				}
				else {
					PacomeMaj.EcritLog("Aucune mise à jour silencieuse", "");
				}

				return;
			}
		}

		//erreur
		PacomeMaj.logMsgDebug("ReceptionReponse Code erreur :" + PacomeUtils._codeErreur + " - message:" + PacomeUtils._msgErreur);
		PacomeMaj.EcritLog("Erreur", "Code erreur :" + PacomeUtils._codeErreur + " - message:" + PacomeUtils._msgErreur);
	},

	// synchronisation des étiquettes du serveur
	// tentative : numéro de l'essai en cours (0 = premier appel)
	SynchroEtiquettes(tentative = 0) {
		Services.console.logStringMessage("[Pacome] SynchroEtiquettes démarrée (tentative " + tentative + ")");
		if (Services.io.offline) {
			Services.console.logStringMessage("[Pacome] SynchroEtiquettes : offline ignoré");
			return;
		}

		const majauto = Services.prefs.getBoolPref(PACOME_TAGS_PREF_MAJAUTO, true);
		if (!majauto) {
			Services.console.logStringMessage("[Pacome] SynchroEtiquettes : majauto false ignoré");
			return;
		}

		let creds = null;
		try {
			const compte = PacomeAuthUtils.GetComptePrincipal();
			if (compte && compte.incomingServer.username && compte.incomingServer.password) {
				creds = {
					uid: PacomeAuthUtils.GetUidReduit(compte.incomingServer.username),
					mdp: compte.incomingServer.password
				};
				Services.console.logStringMessage("[Pacome] SynchroEtiquettes : credentials trouvés pour " + creds.uid);
			} else {
				Services.console.logStringMessage("[Pacome] SynchroEtiquettes : mot de passe non disponible (tentative " + tentative + "/3)");
			}
		} catch (ex) {
			Services.console.logStringMessage("[Pacome] Erreur lecture creds SynchroEtiquettes: " + ex);
		}

		// Bug #2 : si les credentials ne sont pas encore disponibles au démarrage
		// (mot de passe pas encore chargé en mémoire), programmer un retry sous 15s.
		// On effectue au maximum 3 nouvelles tentatives.
		const MAX_TENTATIVES = 3;
		const DELAI_RETRY_MS = 15000;
		if (null === creds && tentative < MAX_TENTATIVES) {
			Services.console.logStringMessage("[Pacome] SynchroEtiquettes : retry dans " + (DELAI_RETRY_MS / 1000) + "s");
			const self = this;
			setTimeout(() => self.SynchroEtiquettes(tentative + 1), DELAI_RETRY_MS);
			return;
		}

		if (null === creds) {
			Services.console.logStringMessage("[Pacome] SynchroEtiquettes : credentials toujours absents après " + MAX_TENTATIVES + " tentatives — synchro annulée");
		}

		this.EcritLog("Synchronisation des étiquettes", "");

		PacomeTagsSync.Synchronise(function (result) {
			Services.console.logStringMessage("[Pacome] Résultat synchro étiquettes: " + JSON.stringify(result));
			if (0 !== result.code) {
				Services.console.logStringMessage("[Pacome] Erreur synchro étiquettes: " + result.erreur);
			}
		}, creds);
	},

	// calcule le nombre de mises à jour visibles dans le document de paramétrage pacome
	GetNbMajVisibles() {

		let nb = this._docPacome.GetNbMajByType("compte");
		nb += this._docPacome.GetNbMajByType("agenda");
		nb += this._docPacome.GetNbMajByType("compteflux");
		nb += this._docPacome.GetNbMajByType("application");
		nb += this._docPacome.GetNbMajByType("proxy");

		return nb;
	},

	// calcule le nombre de mises à jour non visibles dans le document de paramétrage pacome
	GetNbMajNonVisibles() {

		let nb = this._docPacome.GetNbMajByType("compte", false);
		nb += this._docPacome.GetNbMajByType("agenda", false);
		nb += this._docPacome.GetNbMajByType("compteflux", false);
		nb += this._docPacome.GetNbMajByType("application", false);
		nb += this._docPacome.GetNbMajByType("proxy", false);

		return nb;
	},


	// affichage de l'assistant pacome en mode maj
	AffichePacome() {

		PacomeMaj.logMsgDebug("AffichePacome");

		let args = {};
		args.docPacome = this._docPacome;
		args.mode = "maj";

		window.openDialog("chrome://pacome/content/pacomeCompte.xhtml", PacomeUtils.MessageFromId("PageMajComptesTitre"),
			"chrome,modal,titlebar,centerscreen,resizable=no", args);
	},


	logMsgDebug(msg) {

		PacomeUtils.logMsgDebug("PacomeMaj " + msg);
	},

	EcritLog(message, donnees) {

		this.logMsgDebug(message + " - " + donnees);

		PacomeUtils.EcritLog(PACOME_LOGS_MAJ, message, donnees);
	}
}

PacomeMaj.Init();

// Interception de l'Account Hub pour router la création de compte messagerie vers Pacome
(function hookAccountHub() {
	if (typeof window === "undefined") {
		return;
	}

	function setupHook() {
		// 1. Neutraliser switchToMailTab() au démarrage lorsque l'assistant Pacome est en cours d'affichage
		if (typeof window.switchToMailTab === "function") {
			const origSwitchToMailTab = window.switchToMailTab;
			window.switchToMailTab = function () {
				const tabmail = document.getElementById("tabmail");
				// Ne pas forcer le retour sur le tab 0 si l'onglet Pacome est ouvert/actif
				for (const tab of (tabmail?.tabInfo || [])) {
					if (tab._isPacomeTab ||
					    tab.urlbar?.value?.includes("pacomeCompte.xhtml") ||
					    tab.browser?.currentURI?.spec?.includes("pacomeCompte.xhtml") ||
					    (tab.mode?.name === "contentTab" && tab.title?.toLowerCase().includes("pacome"))) {
						Services.console.logStringMessage("[Pacome] switchToMailTab neutralisé car l'assistant Pacome est ouvert");
						return;
					}
				}
				return origSwitchToMailTab.apply(this, arguments);
			};
		}

		// 2. Interception openAccountHub
		const origOpenAccountHub = window.openAccountHub;

		window.openAccountHub = async function (type) {
			// Si la demande concerne un compte mail (ou non spécifié comme au premier démarrage)
			if (!type || type === "MAIL") {
				Services.console.logStringMessage("[Pacome] Interception openAccountHub -> ouverture assistant Pacome");
				const tabmail = document.getElementById("tabmail");
				if (tabmail) {
					// Si l'onglet Pacome est déjà ouvert, basculer dessus
					for (let i = 0; i < tabmail.tabInfo.length; i++) {
						const tab = tabmail.tabInfo[i];
						if (tab._isPacomeTab ||
						    tab.urlbar?.value?.includes("pacomeCompte.xhtml") ||
						    tab.browser?.currentURI?.spec?.includes("pacomeCompte.xhtml")) {
							tabmail.switchToTab(i);
							return;
						}
					}
					const newTab = tabmail.openTab("contentTab", {
						url: "chrome://pacome/content/pacomeCompte.xhtml",
						linkHandler: null,
						background: false,
					});
					if (newTab) {
						newTab._isPacomeTab = true;
						tabmail.switchToTab(newTab);
						// S'assurer que le focus reste sur l'onglet après les callbacks asynchrones du démarrage
						setTimeout(() => {
							try {
								if (newTab && !newTab.closing) {
									tabmail.switchToTab(newTab);
								}
							} catch (e) {}
						}, 100);
						setTimeout(() => {
							try {
								if (newTab && !newTab.closing) {
									tabmail.switchToTab(newTab);
								}
							} catch (e) {}
						}, 300);
					}
					return;
				}

				// Fallback si tabmail n'est pas disponible : ouverture en dialogue
				window.openDialog(
					"chrome://pacome/content/pacomeCompte.xhtml",
					"_blank",
					"chrome,modal,titlebar,centerscreen,resizable=yes"
				);
				return;
			}

			// Pour les autres types (ADDRESS_BOOK, CALENDAR, CHAT, etc.), déléguer à l'Account Hub natif
			if (typeof origOpenAccountHub === "function") {
				return origOpenAccountHub(type);
			}
		};

		Services.console.logStringMessage("[Pacome] Hook openAccountHub et switchToMailTab installés avec succès.");
	}

	if (document.readyState === "loading") {
		window.addEventListener("DOMContentLoaded", setupHook, { once: true });
	} else {
		setupHook();
	}
})();

