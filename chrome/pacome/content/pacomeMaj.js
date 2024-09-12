/* fichier pour la gestion des mises à jour pacome
*/

const { PacomeDoc } = ChromeUtils.importESModule("resource:///modules/pacome/pacomeDoc.mjs");
const { PacomeUtils, PACOME_LOGS_MAJ, PACOME_PREF_PARAM_AUTH } = ChromeUtils.importESModule("resource:///modules/pacome/pacomeUtils.mjs");
const { PacomeParam } = ChromeUtils.importESModule("resource:///modules/pacome/pacomeParam.mjs");
const { PacomeAuthUtils } = ChromeUtils.importESModule("resource:///modules/pacome/pacomeAuthUtils.mjs");


var PacomeMaj = {

	// instance PacomeDoc (document de paramétrage)
	_docPacome: null,


	/* Recherche de mise à jour
		si maj afficher assistant pacome
	*/
	RechercheMaj() {

		this.logMsgDebug("pacomeRechercheMaj");

		if (Services.io.offline) return;

		try{

			// tester si aucun compte (a priori appelé avec 1 compte)
			const uids=PacomeParam.ListeIdentifiants();
			if (null==uids || 0==uids.length) {
				this.EcritLog("aucun compte", "");
				return;
			}

			// document de configuration
			const config=PacomeParam.GetConfigClient(uids.join(";"));

			if (null==config){
				this.EcritLog("Erreur de configuration client", "");
				return;
			}

			this.EcritLog("Configuration client", config);

			// requête au serveur pacome
			PacomeUtils.ClearErreurEx();
			this.logMsgDebug("pacomeRechercheMaj envoie de la requete au serveur");
			this.EcritLog("Envoie de la requete au serveur", "");
      
      let creds=null;
      if (Services.prefs.getBoolPref(PACOME_PREF_PARAM_AUTH, false)){
        // si compte principal avec mdp => utiliser
        const compte=PacomeAuthUtils.GetComptePrincipal();
        if (compte && compte.incomingServer.username && compte.incomingServer.password){
          creds={};
          creds.uid=PacomeAuthUtils.GetUidReduit(compte.incomingServer.username);
          creds.mdp=compte.incomingServer.password;
        }
      }

			const res=PacomeUtils.RequeteParametrage(config, this.ReceptionReponse, true, creds);

			// si erreur : log message
			if (!res) {
				this.EcritLog("Erreur", "Code erreur :"+PacomeUtils._codeErreur, PacomeUtils._msgErreur);
			}

		} catch(ex) {
			this.logMsgDebug("pacomeRechercheMaj exception:"+ex);
		}

	},

	// fonction de rappel pour la requete de paramétrage
	// si succès determiner si au moins une mise à jour (ajout/maj/suppression)
	ReceptionReponse(statut, responseXML) {

		PacomeMaj.logMsgDebug("ReceptionReponse statut:"+statut);

		PacomeMaj.EcritLog("Réponse de la requête", "statut:"+statut);

		if (statut==200) {

			PacomeMaj.logMsgDebug("ReceptionReponse succès de la requete");

			const res=PacomeUtils.AnalyseErreurDoc(responseXML);

			if (res) {

				PacomeMaj._docPacome=new PacomeDoc(responseXML);

				// tester si au moins un changement dans le paramétage (ajout/maj/suppression)
				// et visible (hors maj silencieuse)
				const nb=PacomeMaj.GetNbMajVisibles();
				PacomeMaj.logMsgDebug("ReceptionReponse nb visibles:"+nb);

				if (nb>0){
					// afficher mises à jour
					PacomeMaj.AffichePacome();
				}
				else{
					PacomeMaj.EcritLog("Aucune mise à jour visible", "");
				}

				const nbnon=PacomeMaj.GetNbMajNonVisibles();
				PacomeMaj.logMsgDebug("ReceptionReponse nb non visibles:"+nbnon);
				if (nbnon>0){
					// traiter mises à jour silencieuses
					PacomeParam.MajSilence(responseXML);
				}
				else{
					PacomeMaj.EcritLog("Aucune mise à jour silencieuse", "");
				}

				return;
			}
		}

		//erreur
		PacomeMaj.logMsgDebug("ReceptionReponse Code erreur :"+PacomeUtils._codeErreur+" - message:"+PacomeUtils._msgErreur);
		PacomeMaj.EcritLog("Erreur", "Code erreur :"+PacomeUtils._codeErreur+" - message:"+PacomeUtils._msgErreur);
	},

	// calcule le nombre de mises à jour visibles dans le document de paramétrage pacome
	GetNbMajVisibles() {

		let nb=this._docPacome.GetNbMajByType("compte");
		nb+=this._docPacome.GetNbMajByType("agenda");
		nb+=this._docPacome.GetNbMajByType("compteflux");
		nb+=this._docPacome.GetNbMajByType("application");
		nb+=this._docPacome.GetNbMajByType("proxy");

		return nb;
	},

	// calcule le nombre de mises à jour non visibles dans le document de paramétrage pacome
	GetNbMajNonVisibles() {

		let nb=this._docPacome.GetNbMajByType("compte", false);
		nb+=this._docPacome.GetNbMajByType("agenda", false);
		nb+=this._docPacome.GetNbMajByType("compteflux", false);
		nb+=this._docPacome.GetNbMajByType("application", false);
		nb+=this._docPacome.GetNbMajByType("proxy", false);

		return nb;
	},


	// affichage de l'assistant pacome en mode maj
	AffichePacome(){

		PacomeMaj.logMsgDebug("AffichePacome");

		let args={};
		args.docPacome=this._docPacome;
		args.mode="maj";

		window.openDialog("chrome://pacome/content/pacomeCompte.xhtml", PacomeUtils.MessageFromId("PageMajComptesTitre"),
											"chrome,modal,titlebar,centerscreen,resizable=no", args);
	},


	logMsgDebug(msg) {

		PacomeUtils.logMsgDebug("PacomeMaj "+msg);
	},

	EcritLog(message, donnees) {

		this.logMsgDebug(message+" - "+donnees);

		PacomeUtils.EcritLog(PACOME_LOGS_MAJ, message, donnees);
	}
}
