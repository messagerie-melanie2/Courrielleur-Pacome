/* Pacome : avertissement changement de mot de passe (code serveur 0xFFFF) */

const PACOME_URL_CHGMDP = "https://mel.din.developpement-durable.gouv.fr";

window.addEventListener("load", () => {

    try {
        const args = window.arguments && window.arguments[0];
        if (args) {
            const msg = args.mineqpassworddoitchanger;
            if (msg && msg !== "") {
                document.getElementById("pacomechgmdp-message").textContent = msg;
            }
        }
    } catch (e) { /* conserver le message par défaut en cas d'erreur */ }

});


function OuvrirEtFermer() {
    try {
        // Ouvrir l'URL dans un onglet Thunderbird
        const win = Services.wm.getMostRecentWindow("mail:3pane");
        if (win && win.openTrustedLinkIn) {
            win.openTrustedLinkIn(PACOME_URL_CHGMDP, "tab");
        } else {
            // Fallback : navigateur système
            const uri = Services.io.newURI(PACOME_URL_CHGMDP);
            Cc["@mozilla.org/uriloader/external-protocol-service;1"]
                .getService(Ci.nsIExternalProtocolService)
                .loadURI(uri);
        }
    } catch (e) { /* ne pas bloquer la fermeture */ }

    window.close();
}
