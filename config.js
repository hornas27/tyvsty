// Firebase config projektu tyvsty (osobní Google účet).
// Tyhle hodnoty nejsou tajné heslo – data chrání pravidla ve Firestore (přístup jen pro přihlášeného vlastníka).
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyBFw7jngvBkmNg8DRbzzda4ThI12ljJLd0",
  authDomain: "tyvsty-aa163.firebaseapp.com",
  projectId: "tyvsty-aa163",
  storageBucket: "tyvsty-aa163.firebasestorage.app",
  messagingSenderId: "1006050490144",
  appId: "1:1006050490144:web:88671c224ec3be8ab70945"
};

// reCAPTCHA (Fraud Defense) site key pro App Check – chrání Gemini proti zneužití.
window.RECAPTCHA_SITE_KEY = "6LclWRkuAAAAADuf4ax5nIaEoClE4glYoqNz2UZT";

// Google Kalendář: OAuth klient (veřejné ID, ne heslo). Povolený jen pro hornas27.github.io a jen pro tvůj účet.
window.GCAL_CLIENT_ID = "1006050490144-okg2cr3p9vurlshojg96bsdjkji7n5qs.apps.googleusercontent.com";
