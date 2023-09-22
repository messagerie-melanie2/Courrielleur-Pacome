/*
  Module OIDC - fonctions utilitaires pour l'authentification OpenIDConnect
*/
const scriptName = "oidcAuthUtils.jsm";

try
{
  console.log(`[${scriptName}] Trying to load resources...`);
  //
  ChromeUtils.import("resource://gre/modules/Services.jsm");
  ChromeUtils.import("resource://gre/modules/ExtensionParent.jsm");
  //
  console.log(`[${scriptName}] Resources loaded !`);
}
catch(ex)
{
  console.log(`[${scriptName}] Error while loading resources !`);
  //
  console.log(ex.name, " - ", ex.message);
  console.log(ex);
}

/* globals  ExtensionParent, MozXULElement, Services */

const EXPORTED_SYMBOLS = ["TbbbbConfig","TbbbbUtils"];

// // TODO
// // TODO
// //préférence serveur pacomemdp2 d'authentification OIDC
// const PACOME_PREF_URLOIDC="pacome.urloidc";
// // TODO
// //url de la page de d'authentification OIDC
// //odifiable par la préférence "pacome.urloidc"
// // const PACOME_URL_VERIFMDP="https://localhost.e2.rie.gouv.fr/pacomeoidc.php";
// const PACOME_URL_VERIFMDP="https://pacome.s2.m2.e2.rie.gouv.fr/pacomeoidc.php";
// // TODO
// // TODO

/**
 * config.js
 *
 * This file is part of the Thunderbird BigBlueButton extension
 *
 * @author Thomas Payen <thomas.payen@apitech.fr>
 *
 * @licence EUPL (https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12)
 */
var TbbbbConfig = {

    SSO_READY: false,

    /**
     * SSO URL for token
     */
    // SSO_URL: 'https://localhost.s2.m2.e2.rie.gouv.fr/pacomeoidc.php',
    SSO_URL: 'https://pacome.s2.m2.e2.rie.gouv.fr/pacomeoidc.php',

    /**
     * Log DEBUG in console
     */
    DEBUG: true,

    /**
     * Log TRACE in console
     */
    TRACE: true
}; // TbbbbUtils

/**
 * utils.js
 *
 * This file is part of the Thunderbird BigBlueButton extension
 *
 * @author Thomas Payen <thomas.payen@apitech.fr>
 *
 * @licence EUPL (https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12)
 */
var TbbbbUtils = {
    _token: undefined,

    launchSSO(callback)
    {
        this.userAuthService(false, callback);
    },

    // callbackSSO()
    // {

    // },

    /**
     * Send user authentication to SSO and retrieve credentials cookie
     *
     * @param {boolean} force Force the prompt password and don't use saved password
     * @returns
     */
    userAuthService(force = false, callback)
    {
        TbbbbConfig.DEBUG && console.debug("[userAuthService] Déclenchement");

        // #7754 - Rev, prise en charge de l'expiration
        if(false)//TbbbbUtils._token)
        {
            // Job already done
            TbbbbConfig.DEBUG && console.debug("[userAuthService] Pas besoin de lancer l'authentification SSO (Jeton déjà présent).");
        }
        else
        {
            TbbbbConfig.DEBUG && console.debug("[userAuthService] Lancement de l'authentification SSO...");

            try
            {
                TbbbbConfig.DEBUG && console.debug("[userAuthService] Ouverture du navigateur vers PacomeOIDC pour connexion Cerbere ...");
                let newuri=Services.io.newURI(TbbbbConfig.SSO_URL, null, null);
                let extproc=Components.classes["@mozilla.org/uriloader/external-protocol-service;1"].getService(Components.interfaces.nsIExternalProtocolService);
                extproc.loadURI(newuri, null);
            }
            catch (ex)
            {
                TbbbbConfig.DEBUG && console.debug("[userAuthService] Erreur d'ouverture d'URL externe");
                console.error(ex);
            }
        }
    }
}; // TbbbbUtils