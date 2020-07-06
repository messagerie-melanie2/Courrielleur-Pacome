
function cm2ExecPacome(aWizCallback){

  PacomeTrace("cm2ExecPacome depuis compose");

  let dummyMsgWindow=Components.classes["@mozilla.org/messenger/msgwindow;1"]
                       .createInstance(Components.interfaces.nsIMsgWindow);

  setTimeout(PacomeAfficheAssistant, 0, dummyMsgWindow, aWizCallback);
}