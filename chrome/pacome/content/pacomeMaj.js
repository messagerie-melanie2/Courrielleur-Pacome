/* fichier pour la gestion des mises à jour pacome
*/

const { PacomeUtils } = ChromeUtils.import("resource:///modules/pacome/pacomeUtils.jsm");
const { PacomeParam } = ChromeUtils.import("resource:///modules/pacome/pacomeParam.jsm");

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

const pdoc = {};
XPCOMUtils.defineLazyModuleGetters(pdoc, {
  PacomeDoc: "resource:///modules/pacome/pacomeDoc.jsm"
});

const PACOME_LOGS_MAJ="MISE_A_JOUR";


var PacomeMaj = {

	// instance PacomeDoc (document de paramétrage)
	_docPacome: null,


	/* Recherche de mise à jour
		si maj afficher assistant pacome
	*/
	RechercheMaj() {

		this.logMsgDebug("pacomeRechercheMaj");

		try{

			// tester si aucun compte (a priori appelé avec 1 compte)
			let uids=PacomeParam.ListeIdentifiants();
			if (null==uids || 0==uids.length) {
				this.EcritLog("aucun compte", "");
				return false;
			}

			// document de configuration
			let config=PacomeParam.GetConfigClient(uids.join(";"));

			this.EcritLog("Configuration client", config);

			// requête au serveur pacome
			PacomeUtils.ClearErreurEx();
			this.logMsgDebug("pacomeRechercheMaj envoie de la requete au serveur");
			this.EcritLog("Envoie de la requete au serveur", "");
			let res=PacomeUtils.RequeteParametrage(config, this.ReceptionReponse, true);

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

			let res=PacomeUtils.AnalyseErreurDoc(responseXML);

			if (res) {

				PacomeMaj._docPacome=new pdoc.PacomeDoc(responseXML);

				// tester si au moins un changement dans le paramétage (ajout/maj/suppression)
				// et visible (hors maj silencieuse)
				let nb=PacomeMaj.GetNbMajVisibles();
				PacomeMaj.logMsgDebug("ReceptionReponse nb visibles:"+nb);

				if (nb>0){
					// afficher mises à jour
					PacomeMaj.AffichePacome();
				}

				nb=PacomeMaj.GetNbMajNonVisibles();
				PacomeMaj.logMsgDebug("ReceptionReponse nb non visibles:"+nb);
				if (nb>0){
					// traiter mises à jour silencieuses
					PacomeParam.MajSilence(responseXML);
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
