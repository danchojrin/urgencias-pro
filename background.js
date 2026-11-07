// Al pulsar el icono se abre (o se enfoca) la app en una pestaña completa.
chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL("app.html");
  const abiertas = await chrome.tabs.query({ url });
  if (abiertas.length) {
    await chrome.tabs.update(abiertas[0].id, { active: true });
    await chrome.windows.update(abiertas[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
});
