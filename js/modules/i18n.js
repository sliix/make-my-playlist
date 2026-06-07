
export const translations = {
  en: {
    // Header
    "header.title": "MakeMyPlaylist",
    "header.logoAlt": "MakeMyPlaylist Logo",
    "service.apple": "Apple Music",
    "service.spotify": "Spotify",
    "service.status.connected": "Connected",
    "service.status.disconnected": "Disconnected",
    "service.action.setActive": "Set Active",
    "service.action.connect": "Connect",
    "service.action.disconnect": "Disconnect",
    "service.prefixLabel": "Service: ",
    "service.none": "None",

    // Import Playlist Card
    "card.import.title": "Import Existing Playlist",
    "card.import.desc": "Select one of your existing library playlists to load its songs and details.",
    "card.import.btnFetch": "Fetch My Playlists",
    "card.import.btnFetchLoading": "Fetching playlists...",
    "card.import.selectLabel": "Select Playlist",
    "card.import.selectDefault": "Choose a playlist...",
    "card.import.btnLoad": "Load Playlist Songs",
    "card.import.btnLoadLoading": "Loading tracks...",

    // Playlist Details Card
    "card.details.title": "1. Playlist Details",
    "card.details.nameLabel": "Playlist Name",
    "card.details.namePlaceholder": "My Awesome Playlist",
    "card.details.descLabel": "Description",
    "card.details.descPlaceholder": "Created with MakeMyPlaylist",
    "card.details.publicTitle": "Public Playlist",
    "card.details.publicDesc": "Make this playlist visible to other users.",

    // Input Songs Card
    "card.input.title": "2. Input Songs or Describe Your Playlist",
    "card.input.desc": "Paste your song list below, with each song on a new line (e.g., \"Artist - Title\" or \"Title by Artist\"), or describe your playlist in natural language (e.g., \"80s Israeli music\"). The system will automatically detect the input style.",
    "card.input.placeholder": "Examples:\n1. Daft Punk - Get Lucky\nBillie Eilish - Bad Guy\nBohemian Rhapsody by Queen (1975)\nBlinding Lights - The Weeknd\nStay - Justin Bieber & The Kid LAROI",
    "card.input.appendTitle": "Append results",
    "card.input.appendDesc": "Add new matches to your current list instead of overwriting.",
    "card.input.btnSearch": "Search Catalog",
    "card.input.btnSearchAnalyzing": "Analyzing prompt...",
    "card.input.btnSearchSearching": "Searching Catalog...",

    // Playlist Items Card
    "card.items.title": "Track List",
    "card.items.btnApproveAll": "Check/Uncheck All",
    "card.items.emptyTitle": "No Songs Analyzed Yet",
    "card.items.emptyDesc": "Paste a list of songs on the left and click \"Search Catalog\" to fetch matches from your active music service.",
    "card.items.progressLabel": "Searching {service} Catalog ({completed}/{total})...",
    "card.items.progressLLM": "Sending prompt to AI parser...",

    // Track Card
    "track.versionLabel": "Version / Match Options",
    "track.refineLabel": "Refine Search",
    "track.refinePlaceholder": "Artist Song Title",
    "track.btnRequery": "Re-query",
    "track.btnRequerying": "...",
    "track.queryLabel": "Query",
    "track.explicit": "Explicit",
    "track.noMatch": "No Match Found",
    "track.tryRefining": "Try refining your search",
    "track.alternativesDefault": "No options available",
    "track.counter": "{approved}/{total} selected",

    // Global Actions & Reset
    "action.reset": "Reset",
    "action.resetLabel": "Reset Editor",
    "action.createPlaylist": "Create Playlist",
    "action.exportPlaylist": "Export Playlist",

    // Modals
    "modal.export.title": "Export Options",
    "modal.export.desc": "Would you like to overwrite the existing playlist or create a new one?",
    "modal.export.btnUpdate": "Update Existing Playlist",
    "modal.export.btnCreate": "Create New Playlist",
    "modal.name.title": "Playlist Name",
    "modal.name.desc": "Please enter a custom, unique playlist name before creating the playlist:",
    "modal.name.placeholder": "e.g., My Summer Playlist 2026",
    "modal.name.btnSave": "Save & Export",
    "modal.name.btnCancel": "Cancel",
    "modal.connect.title": "Connect to a Music Service",
    "modal.connect.desc": "To export playlists or load playlists from your library, you need to connect to a music service.",

    // Toasts & Alerts
    "alert.resetConfirm": "Are you sure you want to clear the editor? This will erase the current song list, playlist settings, and all search results.",
    "alert.resetSuccess": "Editor cleared successfully!",
    "alert.loadSuccess": "Successfully loaded {count} songs and updated track list!",
    "alert.noSongsInPlaylist": "This playlist has no songs.",
    "alert.loadFailed": "Could not load playlist songs: {error}",
    "alert.emptyInput": "Please paste or write a list of songs first.",
    "alert.emptyPrompt": "Please enter a prompt describing your playlist.",
    "alert.noNewSongs": "No new or unique songs found to add to the list.",
    "alert.toastUpdated": "Track list updated (no new searches needed).",
    "alert.noMatchesFound": "No new matching songs found on {service} for this request. Try different keywords.",
    "alert.customNameRequired": "Please enter a custom, unique playlist name.",
    "alert.updateFailed": "Could not update playlist: {error}",
    "alert.createFailed": "Could not create playlist: {error}",
    "alert.successPlaylistCreated": "Playlist created successfully!",
    "alert.successPlaylistUpdated": "Playlist updated successfully!",
    "alert.musicKitUnavailable": "Apple Music is not configured or unavailable. Please refresh the page.",
    "alert.approveAtLeastOne": "Please approve at least one matched song to create/export a playlist.",
    "alert.noPlaylistsFound": "No playlists found in your {service} library.",
    "alert.loadPlaylistsFailed": "Could not load playlists: {error}",
    "alert.authFailed": "Music service authentication cancelled or failed.",
    "alert.successPlaylistCreatedExtended": "Playlist \"{name}\" created successfully with {count} songs!",
    "alert.successAppended": "Successfully appended {count} new songs to the playlist!",
    "alert.appleMusicEditLimitWarning": "Note: Apple Music API does not support editing playlist name/description via web app.",
    "alert.playlistUpToDate": "Playlist is up-to-date (no new songs to append).",
    "alert.appleMusicLimitWarning": "Note: Playlist name/description changes cannot be saved due to Apple Music API limits.",
    "alert.playlistsLoaded": "Playlists loaded successfully!",
    "alert.importedFrom": "Imported from library playlist: {name}",
    "alert.serviceUnavailable": "The service is not available right now. Please try refreshing the page or try again later.",
    "alert.spotifyConnected": "Connected to Spotify successfully!",
    "alert.appleConnected": "Connected to Apple Music successfully!",
    "alert.appleAuthFailed": "Could not authorize Apple Music account.",
    "alert.appleDisconnected": "Disconnected from Apple Music.",
    "alert.spotifyDisconnected": "Disconnected from Spotify.",
    "alert.serviceSwitched": "Switched active service to {service}.",
    "card.items.updatingText": "Updating...",

    // Badges
    "badge.listMode": "Song List Mode",
    "badge.naturalMode": "Natural Language Mode",
    "badge.manualOverride": "Manual Override",
    "badge.resetToAuto": "(Reset to Auto)",
    "badge.switchToAI": "Switch to AI mode",
    "badge.switchToList": "Switch to List mode",
    "badge.listExplanation": "We detected a list of specific tracks to search and match.",
    "badge.listExplanationManual": "Matching specific tracks.",
    "badge.aiExplanation": "We detected a request to build a custom playlist with AI.",
    "badge.aiExplanationManual": "AI will build a playlist based on your prompt.",

    // Service Names
    "serviceName.apple": "Apple Music",
    "serviceName.spotify": "Spotify"
  },
  he: {
    // Header
    "header.title": "MakeMyPlaylist",
    "header.logoAlt": "לוגו MakeMyPlaylist",
    "service.apple": "אפל מיוזיק",
    "service.spotify": "ספוטיפיי",
    "service.status.connected": "מחובר",
    "service.status.disconnected": "מנותק",
    "service.action.setActive": "הגדר כפעיל",
    "service.action.connect": "התחבר",
    "service.action.disconnect": "התנתק",
    "service.prefixLabel": "שירות: ",
    "service.none": "ללא",

    // Import Playlist Card
    "card.import.title": "יבוא פלייליסט קיים",
    "card.import.desc": "בחרו פלייליסט קיים מהספרייה שלכם כדי לטעון את השירים והפרטים שלו.",
    "card.import.btnFetch": "טען את הפלייליסטים שלי",
    "card.import.btnFetchLoading": "טוען פלייליסטים...",
    "card.import.selectLabel": "בחר פלייליסט",
    "card.import.selectDefault": "בחרו פלייליסט...",
    "card.import.btnLoad": "טען שירים מהפלייליסט",
    "card.import.btnLoadLoading": "טוען שירים...",

    // Playlist Details Card
    "card.details.title": "1. פרטי הפלייליסט",
    "card.details.nameLabel": "שם הפלייליסט",
    "card.details.namePlaceholder": "הפלייליסט המגניב שלי",
    "card.details.descLabel": "תיאור",
    "card.details.descPlaceholder": "נוצר באמצעות MakeMyPlaylist",
    "card.details.publicTitle": "פלייליסט ציבורי",
    "card.details.publicDesc": "הצג פלייליסט זה למשתמשים אחרים.",

    // Input Songs Card
    "card.input.title": "2. הכניסו שירים או תארו את הפלייליסט שלכם",
    "card.input.desc": "הדביקו את רשימת השירים שלכם למטה, כל שיר בשורה חדשה (לדוגמה: \"אמן - שם השיר\" או \"שם השיר של אמן\"), או תארו את הפלייליסט שלכם בשפה חופשית (לדוגמה: \"מוזיקה ישראלית משנות השמונים\"). המערכת תזהה אוטומטית את סגנון הקלט.",
    "card.input.placeholder": "דוגמאות:\n1. Daft Punk - Get Lucky\nBillie Eilish - Bad Guy\nBohemian Rhapsody by Queen (1975)\nBlinding Lights - The Weeknd\nStay - Justin Bieber & The Kid LAROI",
    "card.input.appendTitle": "הוסף לקיים",
    "card.input.appendDesc": "הוסיפו התאמות חדשות לרשימה הנוכחית שלכם במקום לדרוס אותה.",
    "card.input.btnSearch": "חיפוש בקטלוג",
    "card.input.btnSearchAnalyzing": "מנתח הנחיה...",
    "card.input.btnSearchSearching": "מחפש בקטלוג...",

    // Playlist Items Card
    "card.items.title": "רשימת שירים",
    "card.items.btnApproveAll": "סמן/בטל סימון להכל",
    "card.items.emptyTitle": "אין שירים עדיין",
    "card.items.emptyDesc": "הדבק רשימת שירים מימין ולחץ על \"חפש בקטלוג\" כדי למשוך התאמות משירות המוזיקה הפעיל שלך.",
    "card.items.progressLabel": "מחפש בקטלוג של {service} ({completed}/{total})...",
    "card.items.progressLLM": "שולח הנחיה למנתח ה-AI...",

    // Track Card
    "track.versionLabel": "גרסאות / אפשרויות התאמה",
    "track.refineLabel": "עדן חיפוש",
    "track.refinePlaceholder": "אמן שם השיר",
    "track.btnRequery": "חפש מחדש",
    "track.btnRequerying": "...",
    "track.queryLabel": "שאילתה",
    "track.explicit": "יחיד",
    "track.noMatch": "לא נמצאה התאמה",
    "track.tryRefining": "נסו לעדן את החיפוש שלכם",
    "track.alternativesDefault": "אין אפשרויות זמינות",
    "track.counter": "נבחרו {approved}/{total}",

    // Global Actions & Reset
    "action.reset": "איפוס",
    "action.resetLabel": "איפוס העורך",
    "action.createPlaylist": "יצירת פלייליסט",
    "action.exportPlaylist": "ייצוא פלייליסט",

    // Modals
    "modal.export.title": "אפשרויות ייצוא",
    "modal.export.desc": "האם תרצו לעדכן את הפלייליסט הקיים או ליצור פלייליסט חדש?",
    "modal.export.btnUpdate": "עדכון פלייליסט קיים",
    "modal.export.btnCreate": "יצירת פלייליסט חדש",
    "modal.name.title": "שם הפלייליסט",
    "modal.name.desc": "אנא הזינו שם פלייליסט מותאם וייחודי לפני יצירת הפלייליסט:",
    "modal.name.placeholder": "לדוגמה: הפלייליסט הקיצי שלי 2026",
    "modal.name.btnSave": "שמירה וייצוא",
    "modal.name.btnCancel": "ביטול",
    "modal.connect.title": "התחברות לשירות מוזיקה",
    "modal.connect.desc": "כדי לייצא פלייליסטים או לטעון פלייליסטים מהספרייה שלך, עליך להתחבר לשירות מוזיקה.",

    // Toasts & Alerts
    "alert.resetConfirm": "האם אתם בטוחים שברצונכם לאפס את העורך? פעולה זו תמחק את רשימת השירים הנוכחית, הגדרות הפלייליסט וכל תוצאות החיפוש.",
    "alert.resetSuccess": "העורך אופס בהצלחה!",
    "alert.loadSuccess": "נטענו בהצלחה {count} שירים ורשימת השירים עודכנה!",
    "alert.noSongsInPlaylist": "בפלייליסט זה אין שירים.",
    "alert.loadFailed": "לא ניתן לטעון שירים מהפלייליסט: {error}",
    "alert.emptyInput": "אנא הדביקו או כתבו רשימת שירים תחילה.",
    "alert.emptyPrompt": "אנא הזינו תיאור לחיפוש הפלייליסט שלכם.",
    "alert.noNewSongs": "לא נמצאו שירים חדשים או ייחודיים להוספה לרשימה.",
    "alert.toastUpdated": "רשימת השירים עודכנה (לא נדרשו חיפושים חדשים).",
    "alert.noMatchesFound": "לא נמצאו שירים חדשים התואמים לביקוש זה ב-{service}. נסו מילות מפתח אחרות.",
    "alert.customNameRequired": "אנא הזינו שם פלייליסט ייחודי ומותאם אישית.",
    "alert.updateFailed": "עדכון הפלייליסט נכשל: {error}",
    "alert.createFailed": "יצירת הפלייליסט נכשלה: {error}",
    "alert.successPlaylistCreated": "הפלייליסט נוצר בהצלחה!",
    "alert.successPlaylistUpdated": "הפלייליסט עודכן בהצלחה!",
    "alert.musicKitUnavailable": "חיבור ה-Apple Music אינו זמין. אנא רענן את העמוד.",
    "alert.approveAtLeastOne": "אנא אשר לפחות שיר אחד מתאים כדי ליצור או לייצא פלייליסט.",
    "alert.noPlaylistsFound": "לא נמצאו פלייליסטים בספריית ה-{service} שלך.",
    "alert.loadPlaylistsFailed": "לא ניתן לטעון פלייליסטים: {error}",
    "alert.authFailed": "אימות שירות המוזיקה בוטל או נכשל.",
    "alert.successPlaylistCreatedExtended": "הפלייליסט \"{name}\" נוצר בהצלחה עם {count} שירים!",
    "alert.successAppended": "נוספו בהצלחה {count} שירים חדשים לפלייליסט!",
    "alert.appleMusicEditLimitWarning": "הערה: ה-API של Apple Music אינו תומך בעריכת שם או תיאור הפלייליסט דרך אפליקציית האינטרנט.",
    "alert.playlistUpToDate": "הפלייליסט מעודכן (אין שירים חדשים להוספה).",
    "alert.appleMusicLimitWarning": "הערה: לא ניתן לשמור שינויים בשם או בתיאור הפלייליסט עקב מגבלות ה-API של Apple Music.",
    "alert.playlistsLoaded": "הפלייליסטים נטענו בהצלחה!",
    "alert.importedFrom": "יובא מפלייליסט הספרייה: {name}",
    "alert.serviceUnavailable": "השירות אינו זמין כעת. אנא נסו לרענן את העמוד או לנסות שוב מאוחר יותר.",
    "alert.spotifyConnected": "התחברתם לספוטיפיי בהצלחה!",
    "alert.appleConnected": "התחברתם ל-Apple Music בהצלחה!",
    "alert.appleAuthFailed": "לא ניתן היה לאמת את חשבון Apple Music.",
    "alert.appleDisconnected": "נותקתם מ-Apple Music.",
    "alert.spotifyDisconnected": "נותקתם מספוטיפיי.",
    "alert.serviceSwitched": "השירות הפעיל שונה ל-{service}.",
    "card.items.updatingText": "מעדכן...",

    // Badges
    "badge.listMode": "מצב רשימת שירים",
    "badge.naturalMode": "מצב שפה חופשית",
    "badge.manualOverride": "עקיפה ידנית",
    "badge.resetToAuto": "(אפס לאוטומטי)",
    "badge.switchToAI": "עבור למצב AI",
    "badge.switchToList": "עבור למצב רשימה",
    "badge.listExplanation": "זיהינו רשימה של שירים ספציפיים לחיפוש והתאמה.",
    "badge.listExplanationManual": "מתאים שירים ספציפיים.",
    "badge.aiExplanation": "זיהינו בקשה לבניית פלייליסט מותאם אישית בעזרת AI.",
    "badge.aiExplanationManual": "ה-AI יבנה פלייליסט בהתבסס על ההנחיה שלך.",

    // Service Names
    "serviceName.apple": "אפל מיוזיק",
    "serviceName.spotify": "ספוטיפיי"
  }
};

export function getLocale() {
  const stored = localStorage.getItem('makemyplaylist_lang');
  if (stored === 'he' || stored === 'en') {
    return stored;
  }
  // Detect fallback
  const browserLang = navigator.language || navigator.userLanguage || '';
  if (browserLang.toLowerCase().startsWith('he')) {
    return 'he';
  }
  return 'en';
}

export function setLocale(lang) {
  if (lang === 'he' || lang === 'en') {
    localStorage.setItem('makemyplaylist_lang', lang);
    applyTranslations();
  }
}

export function t(key, params = {}) {
  const lang = getLocale();
  let text = translations[lang][key] || translations['en'][key] || key;

  // Replace placeholders e.g., {count}
  Object.keys(params).forEach(p => {
    text = text.replace(new RegExp(`{${p}}`, 'g'), params[p]);
  });

  return text;
}

export function applyTranslations() {
  const lang = getLocale();
  const dir = lang === 'he' ? 'rtl' : 'ltr';

  // Set HTML attributes
  document.documentElement.setAttribute('lang', lang);
  document.documentElement.setAttribute('dir', dir);
  if (dir === 'rtl') {
    document.body.classList.add('rtl');
  } else {
    document.body.classList.remove('rtl');
  }

  // Update static elements with data-i18n
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const translation = t(key);
    if (translation !== key) {
      // Preserve inner HTML or sub-icons if they have SVGs
      const icon = el.querySelector('.icon, .logo-icon, .chevron-icon');
      if (icon) {
        // Find text node and replace it, or reconstruct
        const textSpan = el.querySelector('span:not(.icon):not(.logo-icon):not(.chevron-icon):not(.active-service-icon)');
        if (textSpan) {
          textSpan.textContent = translation;
        } else {
          // If no specific span, keep the icon structure
          el.innerHTML = '';
          el.appendChild(icon);
          const textNode = document.createTextNode(' ' + translation);
          el.appendChild(textNode);
        }
      } else {
        el.textContent = translation;
      }
    }
  });

  // Update input placeholders with data-i18n-placeholder
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.setAttribute('placeholder', t(key));
  });

  // Update current language flag in switcher button if present
  const currentLangFlag = document.getElementById('current-lang-flag');
  if (currentLangFlag) {
    currentLangFlag.textContent = lang === 'he' ? '🇮🇱' : '🇺🇸';
  }
}
