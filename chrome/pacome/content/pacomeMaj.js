/* fichier pour la gestion des mises à jour pacome
*/

var { PacomeUtils } = ChromeUtils.import("resource:///modules/pacome/pacomeUtils.jsm");
var { PacomeParam } = ChromeUtils.import("resource:///modules/pacome/pacomeParam.jsm");


const PACOME_LOGS_MAJ="MISE_A_JOUR";


var PacomeMaj = {
	
	// document de paramétrage du serveur pacome
	_documentParam:null,
	
	
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
			this.logMsgDebug("pacomeRechercheMaj configuration client:"+config);
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

				PacomeMaj._documentParam=responseXML;
				
				// tester si au moins un changement dans le paramétage (ajout/maj/suppression)
				// et visible (hors maj silencieuse)
				let nb=PacomeMaj.GetNbMajVisibles();
				PacomeMaj.logMsgDebug("ReceptionReponse nb visibles:"+nb);

				if (nb>0){
					// afficher mises à jour
					PacomeMaj.AffichePacome();
				}

				return;
			}
		}

		//erreur
		PacomeMaj.logMsgDebug("ReceptionReponse Code erreur :"+PacomeUtils._codeErreur+" - message:"+PacomeUtils._msgErreur);
		PacomeMaj.EcritLog("Erreur", "Code erreur :"+PacomeUtils._codeErreur+" - message:"+PacomeUtils._msgErreur);
	},
	
	// calcule le nombre de mises à jour visibles dans le document _documentParam
	GetNbMajVisibles() {
		
		let pacomeui=this._documentParam.getElementsByTagName("pacome_ui");
		if (null==pacomeui || 0==pacomeui.length){
			return 0;
		}
		pacomeui=pacomeui[0];
		
		let nb=this.GetNbMajTypeVisibles(pacomeui, "compte");
		nb+=this.GetNbMajTypeVisibles(pacomeui, "agenda");
		nb+=this.GetNbMajTypeVisibles(pacomeui, "compteflux");
		nb+=this.GetNbMajTypeVisibles(pacomeui, "application");
		nb+=this.GetNbMajTypeVisibles(pacomeui, "proxy");
		
		return nb;
	},

	// nombre de mises à jour visibles dans le document _documentParam
	// type: compte/agenda/autres
	GetNbMajTypeVisibles(pacomeui, type) {
	
		let nb=0;
		let types=pacomeui.getElementsByTagName(type);
		if (null==types || 0==types.length) {
			return 0;
		}
	
		for (let i=0;null!=types && i<types.length;i++){
			if ("true"==types[i].getAttribute("visible"))
				nb++;			
		}
		PacomeMaj.logMsgDebug("GetNbMajTypeVisibles type:"+type+" - nb:"+nb);
		return nb;
	},
	
	// affichage de l'assistant pacome en mode maj
	AffichePacome(){
		
		PacomeMaj.logMsgDebug("AffichePacome");
		
		let args={};
		args.documentParam=this._documentParam;
		args.mode="maj";
		
		window.openDialog("chrome://pacome/content/pacomeCompte.xhtml", PacomeUtils.MessageFromId("PageMajComptesTitre"),
											"chrome,modal,titlebar,centerscreen,resizable=no", args);
	},
	


	logMsgDebug(msg) {

		PacomeUtils.logMsgDebug("PacomeMaj "+msg);
	},

	EcritLog(message, donnees) {

		PacomeUtils.EcritLog(PACOME_LOGS_MAJ, message, donnees);
	}
}
