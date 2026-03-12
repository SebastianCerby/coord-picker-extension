// Open popup.html as a full tab instead of a popup window.
// This avoids HiDPI coordinate distortion in Chrome extension popups.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
});
