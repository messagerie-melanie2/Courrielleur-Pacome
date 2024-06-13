/* classe pour gérer le document de paramétrage Pacome */


const EXPORTED_SYMBOLS = ["PacomeDoc"];


const { Services } = ChromeUtils.import("resource:///modules/Services.jsm");


/* constantes des actions de parametrage */
const PACOME_ACTION_PARAM     ="param";
const PACOME_ACTION_IGNORE    ="ignore";
const PACOME_ACTION_SUPPRIME  ="supprime";
const PACOME_ACTION_PRESERVE  ="preserve";
const PACOME_ACTION_MAJ       ="maj";


class PacomeDoc {

	constructor(documentXML){

		this._documentParam=documentXML;
	}


	// retourne les elements UI des boites
	GetBoitesUI(visibles=true){

		return this.GetElemsUI("compte", visibles);
	}

	// retourne les parametrages d'une boite
	GetParamsBoite(uid, confid){

		let boites=this._documentParam.querySelectorAll("comptes > compte");
		for (let i=0;i<boites.length;i++){
			let boite=boites[i];
			if (boite.getAttribute("uid")==uid && boite.getAttribute("confid")==confid)
				return boite;
		}
		return null;
	}


	// retourne les elements UI des agendas
	GetAgendasUI(visibles=true){

		return this.GetElemsUI("agenda", visibles);
	}

	// retourne les parametrages d'un agenda
	GetParamsAgenda(url){

		let agendas=this._documentParam.querySelectorAll("agendas > agenda");
		for (let i=0;i<agendas.length;i++){
			let agenda=agendas[i];
			if (agenda.getAttribute("url")==url)
				return agenda;
		}
		return null;

	}

	// retourne les elements UI des flux
	GetFluxUI(visibles=true){

		return this.GetElemsUI("compteflux", visibles);
	}

	// retourne les parametrages d'un compte flux
	GetParamsFlux(libelle){

		let flux=this._documentParam.querySelectorAll("comptes_flux > compteflux");
		for (let i=0;i<flux.length;i++){
			let compteflux=flux[i];
			if (compteflux.getAttribute("libelle")==libelle)
				return compteflux;
		}
		return null;
	}

	// retourne l'element UI application
	GetAppliUI(visibles=true){

		if (visibles)
			return this._documentParam.querySelector("pacome_ui > application[visible=\"true\"]");
		else
			return this._documentParam.querySelector("pacome_ui > application[visible=\"false\"]");
	}

	// retourne le paramétrage application
	GetParamsAppli(){

		return this._documentParam.querySelector("pacome > preferences");
	}

	// retourne les paramétrages annuaire
	GetParamsAnnuaire(){

		return this._documentParam.querySelector("pacome > annuaires > annuaire");
	}


	// retourne l'element UI proxy
	GetProxyUI(visibles=true){

		if (visibles)
			return this._documentParam.querySelector("pacome_ui > proxy[visible=\"true\"]");
		else
			return this._documentParam.querySelector("pacome_ui > proxy[visible=\"false\"]");
	}

	// retourne le paramétrage application
	GetParamsProxy(){

		return this._documentParam.querySelector("pacome > proxy");
	}


	GetElemsUI(type, visibles=true){

		if (visibles)
			return this._documentParam.querySelectorAll("pacome_ui > "+type+"[visible=\"true\"]");
		else
			return this._documentParam.querySelectorAll("pacome_ui > "+type+"[visible=\"false\"]");
	}

	// nombre de mises à jour visibles ou non dans le document _documentParam
	// type: compte/agenda/autres
	GetNbMajByType(type, visible=true) {

		return this.GetElemsUI(type, visible).length;
	}

	// retourne le choix par défaut d'une liste de choix (choix_ui)
	// elem_ui :  element qui contient choix_ui
	GetChoixDefaut(elem_ui){

		return elem_ui.querySelector("choix_ui > choix[defaut=\"true\"]");
	}

}
